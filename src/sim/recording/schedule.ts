/**
 * A soldier's recorded schedule ([E1]): all of its segments flattened into one sorted list of
 * waypoints, plus its actions indexed by tick. Derived from a `SoldierRecord`, immutable, never
 * part of world state (snapshots don't need it: it's rebuilt from the records).
 */
import type { RecordedAction, SoldierRecord, Waypoint } from '../../contracts/mission';
import { quantizeFacing, quantizePosition } from '../../contracts/quantize';
import type { Tick } from '../core/time';
import { wrapAngle } from '../core/vec';

export interface Schedule {
  readonly id: string;
  readonly ordinal: number;
  readonly spawnPointId: string;
  /** First recorded tick: the soldier's first pose (spawn pose for a new soldier). */
  readonly spawnTick: Tick;
  /** Last recorded tick (inclusive). After it, an alive echo turns static ([D4]). */
  readonly endTick: Tick;
  readonly waypoints: readonly Waypoint[];
  /** True when there's exactly one waypoint per tick (the lossless case, [E7]): O(1) lookup. */
  readonly perTick: boolean;
  readonly actionsByTick: ReadonlyMap<Tick, readonly RecordedAction[]>;
}

/** Throws if the record breaks the contract (sorted waypoints, contiguous segments). */
export function validateRecord(rec: SoldierRecord): void {
  if (rec.segments.length === 0) throw new Error(`${rec.id}: record has no segments`);
  if (rec.segments[0]!.startTick !== rec.spawnTick) {
    throw new Error(`${rec.id}: spawnTick must equal segments[0].startTick`);
  }
  rec.segments.forEach((seg, i) => {
    const first = seg.waypoints[0];
    const last = seg.waypoints[seg.waypoints.length - 1];
    if (!first || !last || first.t !== seg.startTick || last.t !== seg.endTick) {
      throw new Error(`${rec.id}: segment ${i} waypoints must span [startTick, endTick]`);
    }
    for (let k = 1; k < seg.waypoints.length; k++) {
      if (seg.waypoints[k]!.t <= seg.waypoints[k - 1]!.t) {
        throw new Error(`${rec.id}: segment ${i} waypoints must be strictly increasing in t`);
      }
    }
    const next = rec.segments[i + 1];
    if (next && next.startTick !== seg.endTick + 1) {
      throw new Error(`${rec.id}: segments ${i} and ${i + 1} are not contiguous`);
    }
  });
}

export function buildSchedule(rec: SoldierRecord): Schedule {
  validateRecord(rec);
  const waypoints: Waypoint[] = [];
  const actionsByTick = new Map<Tick, RecordedAction[]>();
  for (const seg of rec.segments) {
    for (const w of seg.waypoints) waypoints.push(w);
    for (const a of seg.actions) {
      const list = actionsByTick.get(a.t);
      if (list) list.push(a);
      else actionsByTick.set(a.t, [a]);
    }
  }
  const spawnTick = waypoints[0]!.t;
  const endTick = waypoints[waypoints.length - 1]!.t;
  return {
    id: rec.id,
    ordinal: rec.ordinal,
    spawnPointId: rec.spawnPointId,
    spawnTick,
    endTick,
    waypoints,
    perTick: waypoints.length === endTick - spawnTick + 1,
    actionsByTick,
  };
}

/**
 * Where the schedule says the soldier is at tick t (clamped to the recorded extent). Between
 * sparse waypoints (PHASE06-a thinning) it interpolates linearly and re-quantizes.
 */
export function poseAt(s: Schedule, t: Tick): Waypoint {
  const wps = s.waypoints;
  if (t <= s.spawnTick) return wps[0]!;
  if (t >= s.endTick) return wps[wps.length - 1]!;
  if (s.perTick) return wps[t - s.spawnTick]!;
  let lo = 0;
  let hi = wps.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (wps[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = wps[lo]!;
  const b = wps[hi]!;
  if (a.t === t) return a;
  const k = (t - a.t) / (b.t - a.t);
  return {
    t,
    x: quantizePosition(a.x + (b.x - a.x) * k),
    y: quantizePosition(a.y + (b.y - a.y) * k),
    facing: quantizeFacing(a.facing + wrapAngle(b.facing - a.facing) * k),
  };
}
