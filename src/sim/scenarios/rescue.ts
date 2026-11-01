/**
 * The X → rescue → O → resume chain on mission-01 (PHASE03-a acceptance), shared by the scenario
 * tests and `npm run sim -- --scenario rescue`.
 *
 * 1. S1 (road, 0:00) crosses the highway, waits, then walks down the road into the turret: X.
 * 2. S2 (road, 0:02) stops out of the turret's range and shoots it before S1 gets there, then
 *    holds position. Replaying, S1 survives to the end of its recording: O.
 * 3. S1 resumes from its O with a 5 s lead-in, then walks into the compound and takes the depot.
 */
import { MISSION_01 } from '../../content/maps/mission-01';
import type { Tuning } from '../../content/tuning';
import type { AttemptObservation, SoldierRecord } from '../../contracts/mission';
import { SnapshotStore } from '../attempt/snapshots';
import { secondsToTicks } from '../core/time';
import { recordedTo } from '../recording/records';
import type { ScriptStep } from './driver';
import { playLife, type LifeResult } from './lives';
import { DESTROY_DEPOT, ROAD_TO_HIGHWAY, TURRET, turretDestroyed } from './mission-01';

/** S1's first life: dawdles past the highway, then walks the road into the turret. */
export const S1_ROAD_SLOW: ScriptStep[] = [
  ...ROAD_TO_HIGHWAY,
  { kind: 'wait', ticks: secondsToTicks(10), label: 'dawdle' },
  { kind: 'moveTo', to: { x: 5500, y: 1300 }, label: 'down the road' },
];

/** S2: snipes the turret from out of its range, then holds. */
export const S2_SNIPE_AND_HOLD: ScriptStep[] = [
  ...ROAD_TO_HIGHWAY,
  { kind: 'moveTo', to: { x: 4000, y: 1300 }, label: 'just outside turret range' },
  { kind: 'shoot', at: TURRET, until: turretDestroyed, label: 'shoot the turret' },
  { kind: 'wait', ticks: secondsToTicks(20), label: 'hold' },
];

/** S1 after its O: into the compound, destroy the depot. */
export const S1_AFTER_O: ScriptStep[] = [...DESTROY_DEPOT];

export const LEAD_IN_TICKS = secondsToTicks(5); // [D5]

export interface RescueChain {
  lives: LifeResult[];
  records: SoldierRecord[];
  observations: AttemptObservation[];
}

export function runRescueChain(tuning: Tuning): RescueChain {
  const snapshots = new SnapshotStore();
  const base = { map: MISSION_01, tuning, snapshots };
  const a1 = playLife({
    ...base,
    records: [],
    attempt: 1,
    live: { mode: 'new', soldierId: 'S1', spawnPointId: 'road', entryTick: 0 },
    steps: S1_ROAD_SLOW,
  });
  const a2 = playLife({
    ...base,
    records: a1.records,
    attempt: 2,
    live: { mode: 'new', soldierId: 'S2', spawnPointId: 'road', entryTick: secondsToTicks(2) },
    steps: S2_SNIPE_AND_HOLD,
    fromTick: 0,
  });
  const s1 = a2.records.find((r) => r.id === 'S1')!;
  const oTick = recordedTo(s1);
  const a3 = playLife({
    ...base,
    records: a2.records,
    attempt: 3,
    live: { mode: 'resume', soldierId: 'S1', controlFromTick: oTick },
    steps: S1_AFTER_O,
    fromTick: oTick - LEAD_IN_TICKS,
  });
  const lives = [a1, a2, a3];
  return { lives, records: a3.records, observations: lives.map((l) => l.observation) };
}
