/**
 * A chain of short scripted "bot" lives on mission-03 "Breach", cycling through its three initial
 * spawn points with [D7] entry clocks, each attempt starting from the nearest snapshot before its
 * 5 s lead-in. Used by the 20-attempt test and `npm run sim -- --scenario chain`.
 */
import { M3, MISSION_03 } from '../../content/maps/mission-03';
import type { Tuning } from '../../content/tuning';
import type { SoldierRecord } from '../../contracts/mission';
import { SnapshotStore } from '../attempt/snapshots';
import { secondsToTicks } from '../core/time';
import { nextSoldierId } from '../recording/records';
import type { ScriptStep } from './driver';
import { playLife, type LifeResult } from './lives';

const INITIAL = MISSION_03.spawnPoints.filter((s) => s.kind === 'initial');

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
    const point = INITIAL[i % INITIAL.length]!;
    const n = counts[point.id] ?? 0;
    counts[point.id] = n + 1;
    const entryTick = n * secondsToTicks(2); // [D7]
    const p = point.position;
    const life = playLife({
      map: MISSION_03,
      tuning,
      records,
      attempt: i + 1,
      live: { mode: 'new', soldierId: nextSoldierId(records), spawnPointId: point.id, entryTick },
      // A short shuffle near the spawn, out of the first turret line's range: everyone lives
      // to the end of their script, so every lane ends in an O.
      steps: [
        { kind: 'moveTo', to: { x: p.x + 120 - (i % 5) * 60, y: p.y - 40 - (i % 3) * 40 } },
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
 * `n` soldiers, each recorded alone (no echoes, so it's quick), marching long routes across the
 * bottom of the map (below the first turret line) with [D7] entry clocks: a busy battlefield
 * for benchmarking echo playback.
 */
export function recordMarchers(tuning: Tuning, n = 20): SoldierRecord[] {
  let records: SoldierRecord[] = [];
  const counts: Record<string, number> = {};
  const low = M3.spawnY + 100;
  const high = M3.lineCoverY + 150;
  for (let i = 0; i < n; i++) {
    const point = INITIAL[i % INITIAL.length]!;
    const k = counts[point.id] ?? 0;
    counts[point.id] = k + 1;
    const off = (k % 5) * 24;
    const steps: ScriptStep[] =
      point.position.x < MISSION_03.width / 2
        ? [
            { kind: 'moveTo', to: { x: 1450, y: high + off } },
            { kind: 'moveTo', to: { x: 150, y: low } },
          ]
        : [
            { kind: 'moveTo', to: { x: 150, y: high + off } },
            { kind: 'moveTo', to: { x: 1450, y: low } },
          ];
    const id = `S${i + 1}`;
    const life = playLife({
      map: MISSION_03,
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
