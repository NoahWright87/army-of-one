/**
 * PHASE03-a scenario runners for the sim CLI:
 *   npm run sim -- --scenario rescue   # X → rescue → O → resume chain; prints each observation
 *   npm run sim -- --scenario breach-rescue   # (06-a) the same story on mission-03
 *   npm run sim -- --scenario chain    # 20 scripted bot attempts with snapshots; ticks/sec
 *   npm run sim -- --scenario bench    # 20 marching echoes replayed headless from 0:00; ticks/sec
 * Flags: --echoes <n> (bench/chain size), --json (print full observations).
 */
import { MISSION_01 } from '../src/content/maps/mission-01';
import { DEFAULT_TUNING } from '../src/content/tuning';
import type { AttemptObservation, LaneFate } from '../src/contracts/mission';
import { Attempt } from '../src/sim/attempt/attempt';
import { formatBattleTime } from '../src/sim/core/time';
import { recordedTo } from '../src/sim/recording/records';
import { recordMarchers, runBotChain } from '../src/sim/scenarios/chain';
import { runRescueChain } from '../src/sim/scenarios/rescue';
import { runBreachRescueChain } from '../src/sim/scenarios/mission-03';

const time = (t: number) => `${formatBattleTime(t)} [${t}]`;

function fate(f: LaneFate): string {
  switch (f.kind) {
    case 'alive':
      return 'alive';
    case 'died':
      return `X died ${time(f.tick)} (${f.cause})`;
    case 'static':
      return `O static ${time(f.tick)}`;
    case 'interrupted':
      return `! interrupted ${time(f.tick)} (${f.reason})`;
    case 'neverSpawned':
      return `never spawned (${f.reason})`;
  }
}

export function printObservation(o: AttemptObservation, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(o, null, 2));
    return;
  }
  const live = o.live
    ? ` live=${o.live.soldierId} (${o.live.mode}, control from ${time(o.live.controlFromTick)})`
    : '';
  console.log(
    `${o.kind} #${o.attempt}: ${time(o.fromTick)} → ${time(o.toTick)}${live} end=${o.endReason}`,
  );
  for (const [id, f] of Object.entries(o.lanes)) console.log(`  lane ${id}: ${fate(f)}`);
  for (const m of o.markers) {
    if (m.kind === 'damaged') continue;
    console.log(`  ${time(m.tick)} ${m.soldierId} ${m.kind}${m.refId ? ` ${m.refId}` : ''}`);
  }
  if (o.missionComplete) {
    console.log(
      `  mission complete ${time(o.missionComplete.tick)} by ${o.missionComplete.bySoldierId}`,
    );
  }
}

const now = () => Number(process.hrtime.bigint()) / 1e6;

export function runEchoScenario(name: string, opts: { json: boolean; echoes: number }): void {
  const t = DEFAULT_TUNING;
  if (name === 'rescue' || name === 'breach-rescue') {
    const start = now();
    const chain = name === 'rescue' ? runRescueChain(t) : runBreachRescueChain(t);
    const ms = now() - start;
    chain.lives.forEach((l) => {
      printObservation(l.observation, opts.json);
      if (l.liveSegment) {
        const s = l.liveSegment;
        console.log(
          `  segment ${time(s.startTick)} → ${time(s.endTick)} (${s.waypoints.length} waypoints, ${s.actions.length} actions, ${s.endReason})`,
        );
      }
    });
    const ticks = chain.lives.reduce((n, l) => n + l.ticks, 0);
    console.log(
      `---\n${ticks} ticks in ${ms.toFixed(1)} ms (${Math.round(ticks / (ms / 1000))} ticks/s)`,
    );
    return;
  }
  if (name === 'chain') {
    const start = now();
    const chain = runBotChain(t, opts.echoes);
    const ms = now() - start;
    for (const l of chain.lives) {
      const o = l.observation;
      console.log(
        `attempt #${o.attempt} ${o.live?.soldierId} ${time(o.fromTick)} → ${time(o.toTick)} (${l.ticks} ticks, ${Object.keys(o.lanes).length} lanes)`,
      );
    }
    console.log(
      `---\n${opts.echoes} attempts, ${chain.ticks} ticks in ${ms.toFixed(1)} ms (${Math.round(chain.ticks / (ms / 1000))} ticks/s), ${chain.snapshots.size} snapshots`,
    );
    return;
  }
  if (name === 'bench') {
    const records = recordMarchers(t, opts.echoes);
    const end = Math.max(...records.map(recordedTo));
    const a = new Attempt({
      map: MISSION_01,
      tuning: t,
      soldiers: records,
      attempt: 99,
      from: { kind: 'start' },
      live: null,
    });
    const start = now();
    a.runHeadless(end + 1);
    const ms = now() - start;
    const o = a.finish().observation;
    const staticCount = Object.values(o.lanes).filter((f) => f.kind === 'static').length;
    console.log(
      `${records.length} echoes, ${a.tick} ticks from 0:00 in ${ms.toFixed(1)} ms: ${Math.round(a.tick / (ms / 1000))} ticks/s (${staticCount} reached their O)`,
    );
    return;
  }
  console.error(`Unknown scenario ${name}. Scenarios: rescue, chain, bench`);
  process.exit(1);
}
