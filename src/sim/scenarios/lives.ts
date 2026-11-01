/**
 * Plays scripted lives through the PHASE03-a attempt runner: the multi-attempt counterpart of
 * `runScenario`. Shared by the echo scenario tests and `npm run sim -- --scenario rescue`.
 */
import type { Tuning } from '../../content/tuning';
import type { SoldierRecord } from '../../contracts/mission';
import { Attempt, type AttemptFrom, type AttemptResult, type LiveSpec } from '../attempt/attempt';
import type { SnapshotStore } from '../attempt/snapshots';
import { addSegment } from '../recording/records';
import { secondsToTicks, type Tick } from '../core/time';
import type { MapDef } from '../world/map';
import { createScriptDriver, type ScriptStep } from './driver';

export interface LifeParams {
  map: MapDef;
  tuning: Tuning;
  records: readonly SoldierRecord[];
  attempt: number;
  live: LiveSpec | null;
  /** What the live soldier does once in control. */
  steps?: readonly ScriptStep[];
  /** Start from the latest valid snapshot at or before this tick (default: start). */
  fromTick?: Tick;
  snapshots?: SnapshotStore;
  /** Hard stop (battle tick). Default 180 s. */
  maxTick?: Tick;
  /** Called after every tick (tests poke at the world here). */
  onTick?: (a: Attempt) => void;
}

export interface LifeResult extends AttemptResult {
  attempt: Attempt;
  /** Records with the live segment folded in. */
  records: SoldierRecord[];
  /** Ticks simulated. */
  ticks: number;
}

/**
 * Runs one attempt: lead-in, then the script as the live soldier's input. Ends when the attempt
 * is over (death, mission complete, history shifted), the script finishes ('suspended'), or
 * `maxTick` is reached ('suspended').
 */
export function playLife(p: LifeParams): LifeResult {
  let from: AttemptFrom = { kind: 'start' };
  if (p.fromTick !== undefined && p.snapshots) {
    const snap = p.snapshots.nearestValidSnapshot(p.fromTick);
    if (snap) from = { kind: 'snapshot', snapshot: snap };
  }
  const attempt = new Attempt({
    map: p.map,
    tuning: p.tuning,
    soldiers: p.records,
    attempt: p.attempt,
    from,
    live: p.live,
    ...(p.snapshots ? { snapshots: p.snapshots } : {}),
  });
  const driver = createScriptDriver(p.steps ?? [], `life ${p.live?.soldierId ?? 'none'}`);
  const maxTick = p.maxTick ?? secondsToTicks(180);
  const start = attempt.tick;
  while (!attempt.isOver() && attempt.tick < maxTick) {
    const me = attempt.liveSoldier();
    if (p.live && attempt.leadInTicksLeft() === 0 && me?.alive) {
      const input = driver.input(attempt.world, me);
      if (!input) break;
      attempt.step(input);
    } else {
      attempt.step();
    }
    p.onTick?.(attempt);
  }
  const res = attempt.finish();
  const records =
    p.live && res.liveSegment
      ? addSegment(
          p.records,
          {
            soldierId: p.live.soldierId,
            ...(p.live.mode === 'new' ? { spawnPointId: p.live.spawnPointId } : {}),
          },
          res.liveSegment,
        )
      : [...p.records];
  return { ...res, attempt, records, ticks: attempt.tick - start };
}
