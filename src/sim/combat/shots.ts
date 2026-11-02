import { distance, fromAngle, type Vec2 } from '../core/vec';
import { objectiveRadius } from '../entities/objective';
import { isEligible, teamOf, type SoldierState } from '../entities/soldier';
import { laneInfo, vehicleRect } from '../entities/traffic';
import { emit, type World } from '../state';
import { dynamicBlockers, type Blocker } from '../world/blockers';
import { rayCircle, rayRect } from '../world/collision';
import { coverCrossings, coverStops } from '../world/cover';
import { hash01 } from '../core/hash';
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
export type Team = 'player' | 'enemy' | 'neutral';
/* (07-c) 'neutral' shots (grenade fragments) hit everyone: soldiers and enemy targets alike. */

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
  /**
   * (05-b) The current `dynamicBlockers(world)`, when the caller knows they can't have changed
   * since it computed them (e.g. within one turret step). Default: computed here.
   */
  blockers?: readonly Blocker[];
  /**
   * (07-c) Roll partial cover ([D32]) with this key (e.g. "S3@512"): each cover piece crossed
   * stops the ray with probability `bullet`. Without a key, partial cover is see-through
   * (sight past cover is `seesThroughCover`'s job).
   */
  coverKey?: string;
  /** (07-c) Default true: ignore cover the origin can fire over. Fragments pass false. */
  fireOver?: boolean;
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
  if (opts.coverKey !== undefined) {
    for (const c of coverCrossings(world.cover, from, dir, best, tuning, 'bullet', opts.fireOver)) {
      if (c.distance >= best) break;
      if (coverStops(opts.coverKey, c.piece.id, c.piece.bullet)) {
        consider(c.distance, { kind: 'cover', id: c.piece.id });
        break;
      }
    }
  }
  for (const b of opts.blockers ?? dynamicBlockers(world)) {
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

  if (team !== 'enemy') {
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
  }
  if (!opts.ignoreSoldiers) {
    // (07-d) Soldiers of the other team ([D44]); neutral rays (fragments) hit everyone.
    st.soldiers.forEach((s, index) => {
      if (!isEligible(s) || s.id === opts.ignoreId) return;
      if (team !== 'neutral' && teamOf(s) === team) return;
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
  blockers?: readonly Blocker[],
): boolean {
  const d = distance(from, to);
  if (d === 0) return true;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const hit = castRay(world, from, angle, d, team, {
    ignoreId,
    ignoreSoldiers: true,
    ...(blockers ? { blockers } : {}),
  });
  return hit.target === null;
}

export interface ShotParams {
  by: string;
  /** (07-c) Entity the ray starts inside and passes (default `by`, the shooter). */
  ignoreId?: string;
  team: Team;
  from: Vec2;
  angle: number;
  range: number;
  damage: number;
  /** Death cause if this shot kills a soldier. */
  cause: string;
  /** (07-c) Cover roll key; default `${by}@${tick}`. Must be unique per shot within a tick. */
  coverKey?: string;
  /** (07-c) Default true: the shooter fires over cover right next to it. */
  fireOver?: boolean;
  /** (07-c) Don't emit `shotFired` (fragments emit their own event). */
  silent?: boolean;
}

export interface ShotResult {
  hitX: number;
  hitY: number;
  hitId?: string;
}

/** Resolves one hitscan shot: ray cast, `shotFired` event, then damage to an opposing target. */
export function fireShot(world: World, p: ShotParams): ShotResult {
  const hit = castRay(world, p.from, p.angle, p.range, p.team, {
    ignoreId: p.ignoreId ?? p.by,
    coverKey: p.coverKey ?? `${p.by}@${world.state.tick}`,
    ...(p.fireOver === false ? { fireOver: false } : {}),
  });
  const end = fromAngle(p.angle, hit.distance);
  const tgt = hit.target as RayTarget | null;
  const hitId = tgt && 'id' in tgt ? tgt.id : undefined;
  const result: ShotResult = { hitX: p.from.x + end.x, hitY: p.from.y + end.y, hitId };
  if (!p.silent)
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
  if (tgt.kind === 'soldier') {
    damageSoldier(world, world.state.soldiers[tgt.index]!, p.damage, p.by, p.cause);
    return result;
  }
  if (p.team === 'enemy') return result;
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
 * recorded angle ([E1]). No cooldown check here. (07-c) Same as `fireGun(…, 'rifle')`.
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

/**
 * (07-c) A deterministic offset within ± (fullSpread × how much the soldier moved) ([D35]):
 * used for the Grenadier's throw scatter. Guns use `guns.ts` (spread + recoil).
 */
export function movingAimOffset(
  world: World,
  s: SoldierState,
  salt: string,
  fullSpread: number,
): number {
  const spread = fullSpread * s.moveFrac;
  if (spread <= 0) return 0;
  return (hash01(`${s.id}@${world.state.tick}:${salt}`) * 2 - 1) * spread;
}
