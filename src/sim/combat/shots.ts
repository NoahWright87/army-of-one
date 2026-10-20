import { secondsToTicks } from '../core/time';
import { distance, fromAngle, type Vec2 } from '../core/vec';
import { objectiveRadius } from '../entities/objective';
import { isEligible, type SoldierState } from '../entities/soldier';
import { laneInfo, vehicleRect } from '../entities/traffic';
import { emit, type World } from '../state';
import { dynamicBlockers } from '../world/blockers';
import { rayCircle, rayRect } from '../world/collision';
import {
  damageCharge,
  damageObjective,
  damageSoldier,
  damageTurret,
  damageVehicle,
  detonateMine,
} from './damage';

/**
 * Who a shot belongs to. All soldiers are 'player'; turrets are 'enemy'. A shot passes through its
 * own side ([D13]: no friendly fire), so player shots never touch soldiers and turret shots never
 * touch turrets, mines or charges.
 */
export type Team = 'player' | 'enemy';

/** What a ray stopped on. `index` points into the matching `world.state` array. */
export type RayTarget =
  | { kind: 'wall' }
  | { kind: 'cover'; id: string }
  | {
      kind: 'soldier' | 'turret' | 'mine' | 'vehicle' | 'objective' | 'charge';
      id: string;
      index: number;
    };

export interface RayHit {
  /** Distance travelled; equals the range if nothing was hit. */
  distance: number;
  target: RayTarget | null;
}

export interface RayOptions {
  /** Entity the ray starts inside (e.g. the firing turret). */
  ignoreId?: string;
  /** Line-of-sight checks look past soldiers. */
  ignoreSoldiers?: boolean;
}

/**
 * Casts a ray and returns the first thing it hits. Candidates are tested in a fixed order and the
 * strictly nearest wins, so ties resolve deterministically. Water never stops shots.
 */
export function castRay(
  world: World,
  from: Vec2,
  angle: number,
  range: number,
  team: Team,
  opts: RayOptions = {},
): RayHit {
  const { map, state: st, tuning } = world;
  const dir = fromAngle(angle);
  let best = range;
  let target: RayTarget | null = null;
  const consider = (t: number | null, tgt: RayTarget) => {
    if (t !== null && t < best) {
      best = t;
      target = tgt;
    }
  };

  for (const w of map.walls) consider(rayRect(from, dir, w), { kind: 'wall' });
  for (const b of dynamicBlockers(world)) {
    if (b.blocksShots && b.id !== opts.ignoreId) {
      consider(rayRect(from, dir, b.rect), { kind: 'cover', id: b.id });
    }
  }

  const lanes = (map.trafficLanes ?? []).map((d) => laneInfo(d, tuning));
  st.vehicles.forEach((v, index) => {
    if (v.state === 'wreck') return; // wrecks are cover (above) or nothing
    consider(rayRect(from, dir, vehicleRect(v, lanes[v.lane]!)), {
      kind: 'vehicle',
      id: v.id,
      index,
    });
  });
  (map.objectives ?? []).forEach((def, index) => {
    if (st.objectives[index]!.destroyed) return;
    const r = objectiveRadius(def, tuning);
    consider(rayCircle(from, dir, def.position, r), { kind: 'objective', id: def.id, index });
  });

  if (team === 'player') {
    (map.turrets ?? []).forEach((def, index) => {
      if (st.turrets[index]!.mode === 'destroyed' || def.id === opts.ignoreId) return;
      const t = rayCircle(from, dir, def.position, tuning.turret.radius);
      consider(t, { kind: 'turret', id: def.id, index });
    });
    (map.mines ?? []).forEach((def, index) => {
      if (st.mines[index]!.state === 'detonated') return;
      const t = rayCircle(from, dir, def.position, tuning.mine.radius);
      consider(t, { kind: 'mine', id: def.id, index });
    });
    (map.bridges ?? []).forEach((def, index) => {
      if (!def.charge || st.bridges[index]!.state === 'destroyed') return;
      const t = rayCircle(from, dir, def.charge, tuning.bridge.chargeRadius);
      consider(t, { kind: 'charge', id: def.id, index });
    });
  } else if (!opts.ignoreSoldiers) {
    st.soldiers.forEach((s, index) => {
      if (!isEligible(s) || s.id === opts.ignoreId) return;
      const t = rayCircle(from, dir, s, tuning.soldier.hitboxRadius);
      consider(t, { kind: 'soldier', id: s.id, index });
    });
  }
  return { distance: best, target };
}

/** True if nothing but soldiers stands between `from` and `to` (for `team`'s shots). */
export function hasLineOfSight(
  world: World,
  from: Vec2,
  to: Vec2,
  team: Team,
  ignoreId?: string,
): boolean {
  const d = distance(from, to);
  if (d === 0) return true;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const hit = castRay(world, from, angle, d, team, { ignoreId, ignoreSoldiers: true });
  return hit.target === null;
}

export interface ShotParams {
  by: string;
  team: Team;
  from: Vec2;
  angle: number;
  range: number;
  damage: number;
  /** Death cause if this shot kills a soldier. */
  cause: string;
}

export interface ShotResult {
  hitX: number;
  hitY: number;
  hitId?: string;
}

/** Resolves one hitscan shot: ray cast, `shotFired` event, then damage to an opposing target. */
export function fireShot(world: World, p: ShotParams): ShotResult {
  const hit = castRay(world, p.from, p.angle, p.range, p.team, { ignoreId: p.by });
  const end = fromAngle(p.angle, hit.distance);
  const tgt = hit.target as RayTarget | null;
  const hitId = tgt && 'id' in tgt ? tgt.id : undefined;
  const result: ShotResult = { hitX: p.from.x + end.x, hitY: p.from.y + end.y, hitId };
  emit(world, {
    kind: 'shotFired',
    tick: world.state.tick,
    by: p.by,
    fromX: p.from.x,
    fromY: p.from.y,
    angle: p.angle,
    hitX: result.hitX,
    hitY: result.hitY,
    ...(hitId !== undefined ? { hitId } : {}),
  });
  if (!tgt || tgt.kind === 'wall' || tgt.kind === 'cover') return result;
  if (p.team === 'enemy') {
    if (tgt.kind === 'soldier') {
      damageSoldier(world, world.state.soldiers[tgt.index]!, p.damage, p.by, p.cause);
    }
    return result;
  }
  switch (tgt.kind) {
    case 'turret':
      damageTurret(world, tgt.index, p.damage, p.by);
      break;
    case 'mine':
      detonateMine(world, tgt.index, p.by);
      break;
    case 'vehicle':
      damageVehicle(world, tgt.index, p.damage, p.by);
      break;
    case 'objective':
      damageObjective(world, tgt.index, p.damage, p.by);
      break;
    case 'charge':
      damageCharge(world, tgt.index, p.damage, p.by);
      break;
  }
  return result;
}

/**
 * Fires the rifle from (x, y) at angle θ. This is THE way soldier shots enter the sim: the live
 * soldier's fire input calls it with its current position and aim, and echoes call it with a
 * recorded angle ([E1]). No cooldown check here (see `trySoldierFire`).
 */
export function fireRifle(world: World, shooterId: string, from: Vec2, angle: number): ShotResult {
  const rt = world.tuning.rifle;
  return fireShot(world, {
    by: shooterId,
    team: 'player',
    from: { x: from.x, y: from.y },
    angle,
    range: rt.range,
    damage: rt.damage,
    cause: 'rifle',
  });
}

/** Live-fire wrapper: fires from the soldier's position if its rifle is off cooldown. */
export function trySoldierFire(world: World, s: SoldierState, angle: number): ShotResult | null {
  if (!isEligible(s) || world.state.tick < s.nextFireTick) return null;
  s.nextFireTick =
    world.state.tick + Math.max(1, secondsToTicks(world.tuning.rifle.cooldownSeconds));
  return fireRifle(world, s.id, s, angle);
}
