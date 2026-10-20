import type { Tuning } from '../../content/tuning';
import { allocateId } from '../core/ids';
import { DT, secondsToTicks, type Tick } from '../core/time';
import type { Vec2 } from '../core/vec';
import { damageSoldier } from '../combat/damage';
import type { World, WorldState } from '../state';
import { circleOverlapsRect, rectsOverlap } from '../world/collision';
import type { Rect, TrafficLaneDef } from '../world/map';
import { isEligible } from './soldier';

/** 'stopped': halted behind a wreck (solid, harmless, still shootable). */
export type VehicleMode = 'moving' | 'stopped' | 'wreck';

export interface VehicleEntity {
  id: string;
  /** Index into `map.trafficLanes`. */
  lane: number;
  /** Center position. */
  x: number;
  y: number;
  state: VehicleMode;
  hp: number;
}

/** Derived per-lane constants. */
export interface LaneInfo {
  from: Vec2;
  /** Unit direction (axis-aligned). */
  dir: Vec2;
  length: number;
  /** Units per tick. */
  stepPerTick: number;
  intervalTicks: number;
  offsetTicks: number;
  /** Vehicle AABB size. */
  w: number;
  h: number;
  heading: number;
}

export function laneInfo(def: TrafficLaneDef, tuning: Tuning): LaneInfo {
  const dx = def.to.x - def.from.x;
  const dy = def.to.y - def.from.y;
  if (dx !== 0 && dy !== 0) throw new Error(`Traffic lane ${def.id} must be axis-aligned`);
  const length = Math.abs(dx) + Math.abs(dy);
  if (length === 0) throw new Error(`Traffic lane ${def.id} has zero length`);
  const dir = { x: Math.sign(dx), y: Math.sign(dy) };
  const vt = tuning.vehicle;
  const horizontal = dir.x !== 0;
  return {
    from: def.from,
    dir,
    length,
    stepPerTick: (def.speed ?? vt.speed) * DT,
    intervalTicks: Math.max(1, secondsToTicks(def.intervalSeconds ?? vt.intervalSeconds)),
    offsetTicks: secondsToTicks(def.offsetSeconds ?? 0),
    w: horizontal ? vt.length : vt.width,
    h: horizontal ? vt.width : vt.length,
    heading: Math.atan2(dir.y, dir.x),
  };
}

export function vehicleRect(v: Vec2, info: LaneInfo): Rect {
  return { x: v.x - info.w / 2, y: v.y - info.h / 2, w: info.w, h: info.h };
}

/** Distance travelled along the lane. */
function along(v: { x: number; y: number }, info: LaneInfo): number {
  return (v.x - info.from.x) * info.dir.x + (v.y - info.from.y) * info.dir.y;
}

function placeVehicle(
  st: WorldState,
  lane: number,
  info: LaneInfo,
  travelled: number,
  tuning: Tuning,
) {
  st.vehicles.push({
    id: allocateId(st.ids, 'V'),
    lane,
    x: info.from.x + info.dir.x * travelled,
    y: info.from.y + info.dir.y * travelled,
    state: 'moving',
    hp: tuning.vehicle.maxHp,
  });
}

/** Spawn times are `offset + m × interval`: m ≥ 0 normally, any integer m with `prewarm`. */
function isScheduled(info: LaneInfo, t: Tick, prewarm: boolean): boolean {
  if (!prewarm && t < info.offsetTicks) return false;
  return (t - info.offsetTicks) % info.intervalTicks === 0;
}

/**
 * Vehicles that exist at tick 0: the one scheduled exactly at tick 0 and, with `prewarm`, every
 * earlier one still on the road (as if the schedule had always been running). Oldest first, so
 * ids within a lane run front to back.
 */
export function initialVehicles(world: World): void {
  const st = world.state;
  const prewarm = world.tuning.vehicle.prewarm;
  (world.map.trafficLanes ?? []).forEach((def, lane) => {
    const info = laneInfo(def, world.tuning);
    const times: Tick[] = [];
    if (prewarm) {
      // Latest schedule time ≤ 0, then back one interval at a time while still on the road.
      const mMax = Math.floor(-info.offsetTicks / info.intervalTicks);
      for (let m = mMax; ; m--) {
        const t = info.offsetTicks + m * info.intervalTicks;
        if (-t * info.stepPerTick > info.length) break;
        times.push(t);
      }
    } else if (info.offsetTicks === 0) {
      times.push(0);
    }
    for (let k = times.length - 1; k >= 0; k--) {
      placeVehicle(st, lane, info, -times[k]! * info.stepPerTick, world.tuning);
    }
  });
}

/** Moves vehicles, stops them behind blockers, removes ones past the lane end, spawns new ones. */
export function stepTraffic(world: World): void {
  const st = world.state;
  const vt = world.tuning.vehicle;
  const lanes = (world.map.trafficLanes ?? []).map((d) => laneInfo(d, world.tuning));

  // Move in id order. Within a lane, older vehicles are further along, so a vehicle that stops
  // this tick is already in place when the one behind it is processed.
  for (const v of st.vehicles) {
    if (v.state !== 'moving') continue;
    const info = lanes[v.lane]!;
    let move = info.stepPerTick;
    if (vt.blockedBehavior === 'stop') {
      const me = along(v, info);
      let gap = Infinity;
      for (const o of st.vehicles) {
        if (o.lane !== v.lane || o.state === 'moving') continue;
        const ahead = along(o, info) - me;
        if (ahead > 0) gap = Math.min(gap, ahead - vt.length);
      }
      if (gap - move < vt.stopGap) {
        move = Math.max(0, gap - vt.stopGap);
        v.state = 'stopped';
      }
    }
    v.x += info.dir.x * move;
    v.y += info.dir.y * move;
  }
  st.vehicles = st.vehicles.filter((v) => along(v, lanes[v.lane]!) <= lanes[v.lane]!.length);

  // Spawn on schedule, unless a halted vehicle is sitting on the spawn spot.
  lanes.forEach((info, lane) => {
    if (!isScheduled(info, st.tick, vt.prewarm)) return;
    const spawnRect = vehicleRect(info.from, info);
    const blocked = st.vehicles.some(
      (o) =>
        o.lane === lane && o.state !== 'moving' && rectsOverlap(vehicleRect(o, info), spawnRect),
    );
    if (!blocked) placeVehicle(st, lane, info, 0, world.tuning);
  });

  // Moving vehicles kill on contact.
  const r = world.tuning.soldier.hitboxRadius;
  for (const v of st.vehicles) {
    if (v.state !== 'moving') continue;
    const rect = vehicleRect(v, lanes[v.lane]!);
    for (const s of st.soldiers) {
      if (isEligible(s) && circleOverlapsRect(s, r, rect)) {
        damageSoldier(world, s, vt.contactDamage, v.id, 'vehicle');
      }
    }
  }
}
