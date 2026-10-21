/**
 * Army-scale benchmark (PHASE05-b).
 *
 *   npm run bench -- --map mission-01 --echoes 25,50,100,200,400
 *
 * Builds a mission from N bot lives (`src/sim/bots/`) through chained attempts, so the truth is
 * real, then for each checkpoint N reports:
 * - build: wall time and ticks/s of the chained attempts that produced the army;
 * - live: a new bot deployed like a player would (nearest snapshot ≤ its lead-in, fast-forward,
 *   lead-in, life) among the N echoes: sim ms per tick (mean, p95, max) while it plays, and how
 *   many echoes were alive meanwhile;
 * - resolve: a full background pass ([D23]) from tick 0 over the whole battle: ticks/s and
 *   ms/tick (mean, p95), plus the peak number of alive echoes;
 * - snapshots: count and structured-clone bytes of the snapshot cache ([E4]);
 * - save: encoded mission size (03-c codec on the real recordings + lanes), raw and gzipped.
 *
 * Flags: --seed <n> (army seed, default 1), --life <lo,hi> (bot life seconds, default 30,100),
 * --naive (turn every PHASE05-b optimization off, for before/after numbers), --json <file>,
 * --profile-only (just build the largest army; pair with `node --cpu-prof`).
 */
import { writeFileSync } from 'node:fs';
import { serialize } from 'node:v8';
import { gzipSync } from 'node:zlib';
import { MISSION_01 } from '../src/content/maps/mission-01';
import { TEST_RANGE } from '../src/content/maps/test-range';
import { DEFAULT_TUNING } from '../src/content/tuning';
import type { MissionState, SoldierRecord } from '../src/contracts/mission';
import { MissionSaver } from '../src/persistence/mission-store';
import { MemoryStore } from '../src/persistence/storage';
import { Attempt } from '../src/sim/attempt/attempt';
import type { SnapshotStore } from '../src/sim/attempt/snapshots';
import { ArmyBuilder, kindCounts } from '../src/sim/bots/army';
import { createBotDriver, planBot } from '../src/sim/bots/bot';
import { secondsToTicks } from '../src/sim/core/time';
import { setSimPerf, SIM_PERF_OFF } from '../src/sim/perf';
import { nextSoldierId, recordedTo } from '../src/sim/recording/records';
import type { MapDef } from '../src/sim/world/map';
import { applyObservation } from '../src/timeline/truth';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const now = () => Number(process.hrtime.bigint()) / 1e6;

const MAPS: Record<string, MapDef> = { 'mission-01': MISSION_01, 'test-range': TEST_RANGE };
const map = MAPS[arg('map', 'mission-01')];
if (!map) {
  console.error(`Unknown map. Maps: ${Object.keys(MAPS).join(', ')}`);
  process.exit(1);
}
const checkpoints = arg('echoes', '25,50,100,200,400')
  .split(',')
  .map(Number)
  .filter((n) => n > 0)
  .sort((a, b) => a - b);
const seed = Number(arg('seed', '1'));
const life = arg('life', '30,100').split(',').map(Number) as [number, number];
const naive = flag('naive');
if (naive) setSimPerf(SIM_PERF_OFF);
const tuning = DEFAULT_TUNING;

function stats(xs: number[]): { mean: number; p95: number; max: number } {
  if (!xs.length) return { mean: 0, p95: 0, max: 0 };
  const sorted = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { mean, p95: sorted[Math.floor(sorted.length * 0.95)]!, max: sorted[sorted.length - 1]! };
}

const aliveEchoes = (a: Attempt) =>
  a.world.state.soldiers.reduce(
    (n, s) => n + (s.alive && s.interactive && s.id !== a.liveSoldierId ? 1 : 0),
    0,
  );

/** A new bot deployed among the army the way the game deploys a player. */
function liveAttempt(records: SoldierRecord[], snapshots: SnapshotStore, attemptNo: number) {
  const point = map!.spawnPoints[attemptNo % map!.spawnPoints.length]!;
  const used = records.filter((r) => r.spawnPointId === point.id).length;
  const entryTick = used * secondsToTicks(tuning.spawn.intervalSeconds);
  const leadIn = Math.max(0, entryTick - secondsToTicks(tuning.spawn.leadInSeconds));
  const t0 = now();
  const snap = snapshots.nearestValidSnapshot(leadIn);
  const a = new Attempt({
    map: map!,
    tuning,
    soldiers: records,
    attempt: attemptNo,
    from: snap ? { kind: 'snapshot', snapshot: snap } : { kind: 'start' },
    live: { mode: 'new', soldierId: nextSoldierId(records), spawnPointId: point.id, entryTick },
    snapshots,
  });
  a.runHeadless(leadIn);
  const ffMs = now() - t0;
  const ffTicks = a.tick - (snap?.tick ?? 0);
  const plan = planBot({
    map: map!,
    tuning,
    kind: 'route',
    seed: 0xbe9c + attemptNo,
    spawnPointId: point.id,
    lifeSeconds: [60, 60],
  });
  const driver = createBotDriver(plan);
  const ms: number[] = [];
  const alive: number[] = [];
  while (!a.isOver()) {
    const me = a.liveSoldier();
    const input = a.inControl && me?.alive ? driver.input(a.world, me) : undefined;
    if (input === null) break;
    const s = now();
    a.step(input ?? undefined);
    ms.push(now() - s);
    alive.push(aliveEchoes(a));
  }
  a.abandon();
  return {
    entryTick,
    ffMs,
    ffTicks,
    ticks: ms.length,
    ms: stats(ms),
    aliveMean: alive.length ? alive.reduce((x, y) => x + y, 0) / alive.length : 0,
    alivePeak: Math.max(0, ...alive),
  };
}

/** A full background pass from tick 0 ([D23]). */
function resolvePass(records: SoldierRecord[], attemptNo: number) {
  const a = new Attempt({
    map: map!,
    tuning,
    soldiers: records,
    attempt: attemptNo,
    from: { kind: 'start' },
    live: null,
    kind: 'resolve',
  });
  const end = Math.max(...records.map(recordedTo));
  const ms: number[] = [];
  let peak = 0;
  const t0 = now();
  while (a.tick < end && !a.isOver()) {
    const s = now();
    a.step();
    ms.push(now() - s);
    peak = Math.max(peak, aliveEchoes(a));
  }
  const total = now() - t0;
  const snaps = a.snapshots;
  a.finish('resolved');
  return { ticks: ms.length, totalMs: total, ms: stats(ms), alivePeak: peak, snaps };
}

function snapshotBytes(store: SnapshotStore): { count: number; bytes: number } {
  let bytes = 0;
  let count = 0;
  for (const t of store.ticks()) {
    const s = store.nearestValidSnapshot(t)!;
    bytes += serialize(s).length;
    count++;
  }
  return { count, bytes };
}

async function saveSize(army: ArmyBuilder): Promise<{ raw: number; gzip: number; keys: number }> {
  let lanes: MissionState['lanes'] = [];
  army.observations.forEach((o, i) => {
    lanes = applyObservation(lanes, army.recordsAfter[i]!, o).lanes;
  });
  const state: MissionState = {
    schemaVersion: 1,
    missionId: map!.id,
    attemptCount: army.size,
    soldiers: army.records,
    lanes,
  };
  const store = new MemoryStore();
  await new MissionSaver(store, map!.id).save(state);
  let raw = 0;
  let gzip = 0;
  for (const [k, v] of store.data) {
    if (k.endsWith(':backup')) continue;
    raw += v.length;
    gzip += gzipSync(v).length;
  }
  return { raw, gzip, keys: store.data.size };
}

const fmt = (n: number, d = 3) => n.toFixed(d);
const kb = (b: number) => `${(b / 1024).toFixed(0)} KB`;

async function main(): Promise<void> {
  console.log(
    `bench map=${map!.id} seed=${seed} life=${life.join('-')}s mode=${naive ? 'naive' : 'optimized'} node=${process.version}`,
  );
  const army = new ArmyBuilder({ map: map!, tuning, seed, lifeSeconds: life });
  const plans: ReturnType<typeof planBot>[] = [];
  const rows: Record<string, unknown>[] = [];
  let buildMs = 0;
  for (const n of checkpoints) {
    const ticks0 = army.ticks;
    const t0 = now();
    army.growTo(n, (l) => plans.push(l.plan));
    const dt = now() - t0;
    buildMs += dt;
    const k = kindCounts(plans);
    console.log(
      `\n== ${n} echoes (route ${k.route}, hunter ${k.hunter}, idler ${k.idler}, crowd ${k.crowd})`,
    );
    console.log(
      `build   +${n - (rows.length ? (rows[rows.length - 1]!.echoes as number) : 0)} lives in ${fmt(dt / 1000, 1)} s, ${Math.round(((army.ticks - ticks0) / dt) * 1000)} ticks/s (total ${fmt(buildMs / 1000, 1)} s)`,
    );
    if (flag('profile-only')) continue;
    const last = army.observations[army.observations.length - 1]!;
    const fates: Record<string, number> = {};
    for (const f of Object.values(last.lanes)) fates[f.kind] = (fates[f.kind] ?? 0) + 1;
    console.log(`fates   (last attempt) ${JSON.stringify(fates)}`);

    const live = liveAttempt(army.records, army.snapshots, n + 1);
    console.log(
      `live    entry ${fmt(live.entryTick / 60, 0)} s, fast-forward ${live.ffTicks} ticks in ${fmt(live.ffMs, 0)} ms; ${live.ticks} ticks: mean ${fmt(live.ms.mean)} ms, p95 ${fmt(live.ms.p95)} ms, max ${fmt(live.ms.max, 2)} ms; alive echoes mean ${fmt(live.aliveMean, 0)}, peak ${live.alivePeak}`,
    );
    const res = resolvePass(army.records, n + 2);
    console.log(
      `resolve ${res.ticks} ticks in ${fmt(res.totalMs, 0)} ms (${Math.round((res.ticks / res.totalMs) * 1000)} ticks/s): mean ${fmt(res.ms.mean)} ms, p95 ${fmt(res.ms.p95)} ms, max ${fmt(res.ms.max, 2)} ms; peak alive echoes ${res.alivePeak}`,
    );
    const snaps = snapshotBytes(army.snapshots);
    console.log(
      `snaps   ${snaps.count} valid snapshots, ${kb(snaps.bytes)} (${kb(snaps.bytes / Math.max(1, snaps.count))} each)`,
    );
    const save = await saveSize(army);
    console.log(`save    ${kb(save.raw)} raw, ${kb(save.gzip)} gzipped, ${save.keys} keys`);
    rows.push({
      echoes: n,
      kinds: k,
      buildSeconds: dt / 1000,
      live,
      resolve: { ...res, snaps: undefined },
      snapshots: snaps,
      save,
    });
  }
  const out = arg('json', '');
  if (out) {
    writeFileSync(
      out,
      JSON.stringify(
        { map: map!.id, seed, life, mode: naive ? 'naive' : 'optimized', rows },
        null,
        2,
      ),
    );
    console.log(`\nwrote ${out}`);
  }
}

void main();
