/**
 * PHASE05-a: capture points ([D10]–[D12]), forward spawns ([D8], [D9], [D26]) and the flag
 * objective ([D17]). Mechanics on a tiny arena; causality scenarios on mission-02.
 */
import { describe, expect, it } from 'vitest';
import { MISSION_02 } from '../../content/maps/mission-02';
import { DEFAULT_TUNING, withTuning } from '../../content/tuning';
import { SnapshotStore } from '../attempt/snapshots';
import { outcomeHash } from '../attempt/outcome-hash';
import { secondsToTicks } from '../core/time';
import { CAPTURE_FULL, captureRatePerTick, decayPerTick } from '../entities/capture-point';
import { createWorld, getSoldier, getView, spawnSoldier, step, type World } from '../sim';
import { borderWalls, type MapDef } from '../world/map';
import { isSpawnPointOpen } from '../world/spawn-points';
import { playLife } from '../scenarios/lives';
import {
  OUTPOST_TO_HQ,
  ROAD_CAPTURE_OUTPOST,
  ROAD_CAPTURE_OUTPOST_SLOW,
  outpostOurs,
} from '../scenarios/mission-02';
import { ROAD_TO_HIGHWAY } from '../scenarios/mission-01';
import type { ScriptStep } from '../scenarios/driver';

const T = DEFAULT_TUNING;
const STAGE_TICKS_1 = secondsToTicks(T.capture.stageSeconds);

const ARENA: MapDef = {
  id: 'capture-arena',
  nameKey: 'map.testRange.name',
  width: 1200,
  height: 800,
  walls: borderWalls(1200, 800),
  water: [],
  spawnPoints: [
    { id: 'west', nameKey: 'spawn.west', position: { x: 100, y: 400 }, facing: 0, kind: 'initial' },
    {
      id: 'fwd',
      nameKey: 'spawn.west',
      position: { x: 600, y: 400 },
      facing: 0,
      kind: 'capture',
      capturePointId: 'cp',
    },
  ],
  capturePoints: [{ id: 'cp', nameKey: 'capture.gallery.name', position: { x: 600, y: 400 } }],
};

const FLAG_ARENA: MapDef = {
  ...ARENA,
  id: 'flag-arena',
  capturePoints: [{ ...ARENA.capturePoints![0]!, objective: true }],
};

const cp = (w: World) => w.state.capturePoints[0]!;
const run = (w: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(w, new Map());
};
const putSoldiers = (w: World, n: number, opts = {}) => {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    ids.push(
      spawnSoldier(w, 'west', { position: { x: 590 + i * 6, y: 400 + (i % 2) * 8 }, ...opts }),
    );
  }
  return ids;
};
/** Ticks until the point leaves its current stage (or `max`). */
const ticksToNextStage = (w: World, max = 5000) => {
  const s0 = cp(w).stage;
  for (let i = 1; i <= max; i++) {
    step(w, new Map());
    if (cp(w).stage !== s0) return i;
  }
  return Infinity;
};

describe('capture point mechanics', () => {
  it('one soldier lowers the enemy flag in stageSeconds; more soldiers are faster', () => {
    const counts = [1, 2, 3, 6, 9];
    const times = counts.map((n) => {
      const w = createWorld(ARENA, T);
      putSoldiers(w, n);
      return ticksToNextStage(w);
    });
    expect(times[0]).toBeGreaterThanOrEqual(STAGE_TICKS_1);
    expect(times[0]).toBeLessThanOrEqual(STAGE_TICKS_1 + 1);
    for (let i = 1; i < 4; i++) expect(times[i]!).toBeLessThan(times[i - 1]!);
    // Capped at maxContributors (6): a ninth soldier adds nothing.
    expect(times[4]).toBe(times[3]);
    expect(captureRatePerTick(2, T) / captureRatePerTick(1, T)).toBeCloseTo(2 ** 0.6, 2);
    expect(captureRatePerTick(0, T)).toBe(0);
  });

  it('enemy → neutral → ours, with events; ours stays ours', () => {
    const w = createWorld(ARENA, T);
    const [id] = putSoldiers(w, 1);
    const events = [];
    for (let i = 0; i < 2 * STAGE_TICKS_1 + 10; i++) events.push(...step(w, new Map()));
    const changes = events.filter((e) => e.kind === 'captureStageChanged');
    expect(changes.map((e) => e.kind === 'captureStageChanged' && e.stage)).toEqual([
      'neutral',
      'ours',
    ]);
    expect(changes[1]).toMatchObject({ id: 'cp', contributors: [id] });
    expect(events.some((e) => e.kind === 'captureProgress' && e.contributors === 1)).toBe(true);
    expect(cp(w).capturedTick).toBe(changes[1]!.tick);
    expect(isSpawnPointOpen(w, 'fwd', w.state.tick)).toBe(true);
    getSoldier(w, id!)!.x = 100;
    run(w, 600);
    expect(cp(w).stage).toBe('ours');
    const v = getView(w).capturePoints[0]!;
    expect(v).toMatchObject({ stage: 'ours', contributors: [], spawnPointIds: ['fwd'] });
  });

  it('decay accelerates: a brief step-out costs little, ~3 s empty drains a 90% bar', () => {
    const lost = (ticks: number) => {
      let sum = 0;
      for (let i = 1; i <= ticks; i++) sum += decayPerTick(i, T);
      return sum / CAPTURE_FULL;
    };
    expect(lost(30)).toBeLessThan(0.04);
    expect(lost(60)).toBeLessThan(0.1);
    expect(lost(180)).toBeGreaterThan(0.85);
    expect(lost(180)).toBeLessThan(0.97);
    // Per-tick decay grows with time empty, and is much faster than one soldier capturing late on.
    expect(decayPerTick(120, T)).toBeGreaterThan(decayPerTick(30, T));
    expect(decayPerTick(150, T)).toBeGreaterThan(2 * captureRatePerTick(1, T));
  });

  it('in the world: step-out keeps most progress, staying out drains to 0', () => {
    const w = createWorld(ARENA, T);
    const [id] = putSoldiers(w, 1);
    const s = getSoldier(w, id!)!;
    run(w, Math.round(STAGE_TICKS_1 * 0.9));
    const p0 = cp(w).progress;
    expect(p0 / CAPTURE_FULL).toBeGreaterThan(0.85);
    s.x = 100;
    run(w, 20);
    expect(cp(w).progress).toBeGreaterThan(p0 * 0.97);
    expect(cp(w).emptyTicks).toBe(20);
    s.x = 600; // back in: decay resets, capture resumes
    run(w, 1);
    expect(cp(w).emptyTicks).toBe(0);
    s.x = 100;
    run(w, 200);
    expect(cp(w).progress).toBe(0);
    expect(cp(w).stage).toBe('enemy');
  });

  it('stage boundaries lock in: neutral never decays back to enemy', () => {
    const w = createWorld(ARENA, T);
    const [id] = putSoldiers(w, 1);
    ticksToNextStage(w);
    expect(cp(w).stage).toBe('neutral');
    run(w, 60);
    expect(cp(w).progress).toBeGreaterThan(0);
    getSoldier(w, id!)!.x = 100;
    run(w, 600);
    expect(cp(w)).toMatchObject({ stage: 'neutral', progress: 0 });
  });

  it('statics and the dead do not contribute; echoes do', () => {
    const w = createWorld(ARENA, T);
    putSoldiers(w, 1, { controllable: false, interactive: false });
    run(w, 30);
    expect(cp(w).progress).toBe(0);
    const [echo] = putSoldiers(w, 1, { controllable: false, kinematic: true });
    run(w, 30);
    expect(cp(w).contributors).toEqual([echo]);
    getSoldier(w, echo!)!.alive = false;
    run(w, 1);
    expect(cp(w).contributors).toEqual([]);
  });

  it('flag objective: the mission completes when the flag point is ours ([D17])', () => {
    const w = createWorld(FLAG_ARENA, T);
    const [id] = putSoldiers(w, 1);
    run(w, 2 * STAGE_TICKS_1 + 5);
    expect(w.state.missionComplete).toEqual({ tick: cp(w).capturedTick, by: id });
    // A capture point without the flag flag never completes anything.
    const w2 = createWorld(ARENA, T);
    putSoldiers(w2, 1);
    run(w2, 2 * STAGE_TICKS_1 + 5);
    expect(w2.state.missionComplete).toBeNull();
  });

  it('capture tuning is honored (stageSeconds)', () => {
    const fast = withTuning(T, { capture: { stageSeconds: 1 } });
    const w = createWorld(ARENA, fast);
    putSoldiers(w, 1);
    expect(ticksToNextStage(w)).toBeLessThanOrEqual(61);
  });
});

// ---------- mission-02: echoes, forward spawns, causality ----------

const TUNING = DEFAULT_TUNING;
const outpostTick = (w: World) => w.state.capturePoints[0]!.capturedTick;

/** S3 on mission-02: waits west of the chasm and blows the road bridge under S1. */
const blowBridgeUnderS1: ScriptStep[] = [
  ...ROAD_TO_HIGHWAY,
  { kind: 'moveTo', to: { x: 2900, y: 1260 }, label: 'west of the chasm' },
  {
    kind: 'waitUntil',
    until: (w) => {
      const s = getSoldier(w, 'S1');
      return !!s && s.alive && s.x > 3215 && s.x < 3300 && s.y > 1200 && s.y < 1400;
    },
    label: 'S1 on the bridge',
  },
  {
    kind: 'shoot',
    at: MISSION_02.bridges![0]!.charge!,
    until: (w) => w.state.bridges[0]!.state === 'destroyed',
  },
  { kind: 'wait', ticks: 30 },
];

describe('mission-02: forward capture and causality', () => {
  it('echoes re-capture deterministically in replay', () => {
    const snapshots = new SnapshotStore();
    const a1 = playLife({
      map: MISSION_02,
      tuning: TUNING,
      records: [],
      attempt: 1,
      snapshots,
      live: { mode: 'new', soldierId: 'S1', spawnPointId: 'road', entryTick: 0 },
      steps: ROAD_CAPTURE_OUTPOST,
    });
    const t1 = outpostTick(a1.attempt.world);
    expect(t1).not.toBeNull();
    expect(a1.observation.captures!.map((c) => c.stage)).toEqual(['neutral', 'ours']);
    expect(a1.observation.captures![1]).toMatchObject({
      pointId: 'cp-outpost',
      tick: t1,
      by: ['S1'],
    });
    expect(a1.observation.markers.some((m) => m.kind === 'capture' && m.soldierId === 'S1')).toBe(
      true,
    );
    // Replay with no live soldier, twice: same capture tick, same hash.
    const hashes = [0, 1].map(() => {
      const r = playLife({
        map: MISSION_02,
        tuning: TUNING,
        records: a1.records,
        attempt: 2,
        live: null,
        maxTick: t1! + 10,
      });
      expect(outpostTick(r.attempt.world)).toBe(t1);
      return outcomeHash(r.attempt.world.state);
    });
    expect(hashes[0]).toBe(hashes[1]);
  });

  it('forward spawn: deploy at the outpost at its capture tick, finish at the HQ flag', () => {
    const snapshots = new SnapshotStore();
    const base = { map: MISSION_02, tuning: TUNING, snapshots };
    const a1 = playLife({
      ...base,
      records: [],
      attempt: 1,
      live: { mode: 'new', soldierId: 'S1', spawnPointId: 'road', entryTick: 0 },
      steps: ROAD_CAPTURE_OUTPOST,
    });
    const t1 = outpostTick(a1.attempt.world)!;
    const a2 = playLife({
      ...base,
      records: a1.records,
      attempt: 2,
      fromTick: t1 - secondsToTicks(5),
      live: { mode: 'new', soldierId: 'S2', spawnPointId: 'outpost', entryTick: t1 },
      steps: OUTPOST_TO_HQ,
      maxTick: secondsToTicks(240),
    });
    expect(a2.historyShifted).toBeNull();
    const s2 = a2.records.find((r) => r.id === 'S2')!;
    expect(s2.spawnTick).toBe(t1);
    expect(a2.observation.missionComplete?.bySoldierId).toBe('S2');
  });

  it('captor killed earlier → outpost soldier never spawns; re-capturing in time brings them back', () => {
    const snapshots = new SnapshotStore();
    const base = { map: MISSION_02, tuning: TUNING, snapshots };
    // 1. S1 dawdles, then captures the outpost.
    const a1 = playLife({
      ...base,
      records: [],
      attempt: 1,
      live: { mode: 'new', soldierId: 'S1', spawnPointId: 'road', entryTick: 0 },
      steps: [...ROAD_CAPTURE_OUTPOST_SLOW, { kind: 'wait', ticks: 60 }],
    });
    const t1 = outpostTick(a1.attempt.world)!;
    expect(t1).toBeGreaterThan(0);
    // 2. S2 enters at the outpost when it opens and holds there.
    const a2 = playLife({
      ...base,
      records: a1.records,
      attempt: 2,
      fromTick: t1 - secondsToTicks(5),
      live: { mode: 'new', soldierId: 'S2', spawnPointId: 'outpost', entryTick: t1 },
      steps: [{ kind: 'wait', ticks: 120 }],
    });
    expect(a2.historyShifted).toBeNull();
    // 3. S3 (road, 0:02) blows the bridge under S1: S1 dies before capturing.
    const a3 = playLife({
      ...base,
      records: a2.records,
      attempt: 3,
      live: { mode: 'new', soldierId: 'S3', spawnPointId: 'road', entryTick: secondsToTicks(2) },
      steps: [...blowBridgeUnderS1, { kind: 'wait', ticks: 100_000 }],
      maxTick: t1 + 60,
    });
    expect(a3.observation.lanes['S1']!.kind).toBe('died');
    expect(outpostTick(a3.attempt.world)).toBeNull();
    expect(a3.observation.lanes['S2']).toEqual({ kind: 'neverSpawned', reason: 'spawnPointLost' });
    expect((a3.observation.captures ?? []).some((c) => c.stage === 'ours')).toBe(false);
    // 4. S4 (road, 0:04) rushes the outpost before S3 blows the bridge: captured before S2's
    //    spawn tick, so S2 spawns and replays again.
    const a4 = playLife({
      ...base,
      records: a3.records,
      attempt: 4,
      live: { mode: 'new', soldierId: 'S4', spawnPointId: 'road', entryTick: secondsToTicks(4) },
      steps: [...ROAD_CAPTURE_OUTPOST, { kind: 'wait', ticks: 100_000 }],
      maxTick: t1 + 120,
    });
    const t4 = outpostTick(a4.attempt.world);
    expect(t4).not.toBeNull();
    expect(t4!).toBeLessThanOrEqual(t1);
    expect(a4.observation.lanes['S2']!.kind).not.toBe('neverSpawned');
    expect(getSoldier(a4.attempt.world, 'S2')?.alive).toBe(true);
    expect(outpostOurs(a4.attempt.world)).toBe(true);
  });
});
