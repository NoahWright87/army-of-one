/**
 * A chain of short scripted "bot" lives on mission-01, alternating Road and Beach with [D7] entry
 * clocks, each attempt starting from the nearest snapshot before its 5 s lead-in. Used by the
 * 20-attempt test and `npm run sim -- --scenario chain`.
 */
import { MISSION_01 } from '../../content/maps/mission-01';
import type { Tuning } from '../../content/tuning';
import type { SoldierRecord } from '../../contracts/mission';
import { SnapshotStore } from '../attempt/snapshots';
import { secondsToTicks } from '../core/time';
import { nextSoldierId } from '../recording/records';
import type { ScriptStep } from './driver';
import { playLife, type LifeResult } from './lives';

export interface BotChain {
  records: SoldierRecord[];
  lives: LifeResult[];
  snapshots: SnapshotStore;
  /** Ticks simulated across all attempts. */
  ticks: number;
}

export function runBotChain(tuning: Tuning, attempts = 20): BotChain {
  const snapshots = new SnapshotStore();
  let records: SoldierRecord[] = [];
  const counts: Record<string, number> = {};
  const lives: LifeResult[] = [];
  let ticks = 0;
  for (let i = 0; i < attempts; i++) {
    const point = MISSION_01.spawnPoints[i % MISSION_01.spawnPoints.length]!;
    const n = counts[point.id] ?? 0;
    counts[point.id] = n + 1;
    const entryTick = n * secondsToTicks(2); // [D7]
    const p = point.position;
    const life = playLife({
      map: MISSION_01,
      tuning,
      records,
      attempt: i + 1,
      live: { mode: 'new', soldierId: nextSoldierId(records), spawnPointId: point.id, entryTick },
      steps: [
        { kind: 'moveTo', to: { x: p.x + 200 + (i % 5) * 30, y: p.y - 150 - (i % 3) * 40 } },
        { kind: 'wait', ticks: 60 },
      ],
      fromTick: Math.max(0, entryTick - secondsToTicks(5)),
      snapshots,
    });
    ticks += life.ticks;
    records = life.records;
    lives.push(life);
  }
  return { records, lives, snapshots, ticks };
}

/**
 * `n` soldiers, each recorded alone (no echoes, so it's quick), marching long routes from both
 * spawn points with [D7] entry clocks: a busy battlefield for benchmarking echo playback.
 */
export function recordMarchers(tuning: Tuning, n = 20): SoldierRecord[] {
  let records: SoldierRecord[] = [];
  const counts: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const point = MISSION_01.spawnPoints[i % MISSION_01.spawnPoints.length]!;
    const k = counts[point.id] ?? 0;
    counts[point.id] = k + 1;
    const off = (k % 5) * 24;
    const steps: ScriptStep[] =
      point.id === 'road'
        ? [
            { kind: 'moveTo', to: { x: 1990, y: 1440 + off } },
            { kind: 'moveTo', to: { x: 1500, y: 3800 } },
          ]
        : [
            { kind: 'moveTo', to: { x: 4900, y: 3700 + off } },
            { kind: 'moveTo', to: { x: 2600, y: 3900 } },
          ];
    const id = `S${i + 1}`;
    const life = playLife({
      map: MISSION_01,
      tuning,
      records: [],
      attempt: i + 1,
      live: {
        mode: 'new',
        soldierId: id,
        spawnPointId: point.id,
        entryTick: k * secondsToTicks(2),
      },
      steps,
    });
    records = [...records, life.records[0]!];
  }
  return records;
}
