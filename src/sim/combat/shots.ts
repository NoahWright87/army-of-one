import { distance, fromAngle, type Vec2 } from '../core/vec';
import { objectiveRadius } from '../entities/objective';
import { hitRadiusOf, isEligible, teamOf, type SoldierState } from '../entities/soldier';
import { laneInfo, vehicleRect } from '../entities/traffic';
import { emit, type World } from '../state';
import { dynamicBlockers, type Blocker } from '../world/blockers';
import { rayCircle, rayRect } from '../world/collision';
import { coverCrossings, coverStops, damageCover, standingCover } from '../world/cover';
import { markFired, trenchAt, trenchExitDistance } from '../world/concealment';
import { rectContains } from '../world/map';
import { hash01 } from '../core/hash';
import { allocateId } from '../core/ids';
import type { ShotWeapon } from '../../contracts/mission';
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
  /** Original launch position, even when casting one segment of a flying bullet. */
  bulletOrigin?: Vec2;
  /** (07-c) Default true: ignore cover the origin can fire over. Fragments pass false. */
  fireOver?: boolean;
  /**
   * (PHASE18) Judge fire-over from here instead of the ray's start: a flying bullet's shooter.
   * (Before, only a bullet's first tick of flight fired over: a gunner braced on sandbags shot
   * into them as soon as the bullet was a tick out.)
   */
  fireOverFrom?: Vec2;
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
    for (const c of coverCrossings(
      standingCover(world),
      from,
      dir,
      best,
      tuning,
      'bullet',
      opts.fireOver,
      opts.fireOverFrom,
    )) {
      if (c.distance >= best) break;
      if (coverStops(opts.coverKey, c.piece.id, c.piece.bullet)) {
        consider(c.distance, { kind: 'cover', id: c.piece.id });
        break;
      }
    }
  }
  if (opts.coverKey !== undefined && opts.bulletOrigin) {
    for (const { id, kind, rect } of map.concealment ?? []) {
      if (kind !== 'bush' || rectContains(rect, opts.bulletOrigin)) continue;
      const entry = rayRect(from, dir, rect);
      if (
        entry !== null &&
        entry < best &&
        coverStops(opts.coverKey, id, tuning.concealment.bush.bullet)
      ) {
        consider(entry, { kind: 'cover', id });
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
      const t = rayCircle(from, dir, s, hitRadiusOf(tuning, s));
      if (t === null || t >= best) return;
      if (opts.bulletOrigin && opts.coverKey !== undefined && !s.drive) {
        const trench = trenchAt(map.concealment, s);
        if (
          trench &&
          !shotInsideTrench(world, s, opts.bulletOrigin) &&
          coverStops(opts.coverKey, `trench:${trench.id}:${s.id}`, tuning.concealment.trench.dodge)
        )
          return;
      }
      consider(t, { kind: 'soldier', id: s.id, index });
    });
  }
  return { distance: best, target };
}

function shotInsideTrench(world: World, target: Vec2, origin: Vec2): boolean {
  const areas = world.map.concealment;
  if (!trenchAt(areas, origin)) return false;
  const d = Math.hypot(origin.x - target.x, origin.y - target.y);
  return (
    d === 0 ||
    trenchExitDistance(
      areas,
      target,
      {
        x: (origin.x - target.x) / d,
        y: (origin.y - target.y) / d,
      },
      d,
    ) >= d
  );
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
  /** (PHASE12-a) The soldier weapon that fired it (goes into `shotFired`, for recordings). */
  weapon?: ShotWeapon;
  /** (PHASE12-b) Damage kind for armor pierce (default `cause`). */
  damageKind?: string;
  /** (PHASE12-a) Damage falls off linearly to this share at full range (the shotgun, [D61]). */
  falloffTo?: number;
  /**
   * (PHASE17) A bullet that flies at this speed (units/s) instead of a hitscan ([D145]): the
   * shot is announced now (`shotFired` with `flying`), and hits when the bullet gets there.
   */
  speed?: number;
  /**
   * (PHASE17) Past `range` a bullet keeps going but slows by this share per second
   * (exponentially) and its damage drops with its speed ([D146]); 0/absent: it stops at range.
   */
  drag?: number;
  /** (PHASE17) It lands when its speed falls below this share of `speed` ([D146]). */
  minSpeedShare?: number;
}

/** (PHASE17) A bullet in flight ([D145]): its shot's parameters, where it is, how far it went. */
export interface BulletEntity {
  id: string;
  shot: ShotParams;
  x: number;
  y: number;
  travelled: number;
  /** (PHASE17) Its speed now (absent: the shot's full speed) ([D146]). */
  v?: number;
  /** (PHASE17) Soldiers it already whizzed past (one near-miss alert each). */
  passed?: string[];
}

/** (PHASE17) How close a bullet passes to count as shooting at someone ([D146]). */
export const NEAR_MISS_RADIUS = 70;

export interface ShotResult {
  hitX: number;
  hitY: number;
  hitId?: string;
}

/** Resolves one hitscan shot: ray cast, `shotFired` event, then damage to an opposing target. */
export function fireShot(world: World, p: ShotParams): ShotResult {
  if (!p.silent) markFired(world, p.by);
  // (PHASE17) A flying bullet ([D145]): announced now, resolved when it hits.
  if (p.speed && p.speed > 0) {
    const st = world.state;
    const end = fromAngle(p.angle, p.range);
    if (!p.silent)
      emit(world, {
        kind: 'shotFired',
        tick: st.tick,
        by: p.by,
        fromX: p.from.x,
        fromY: p.from.y,
        angle: p.angle,
        hitX: p.from.x + end.x,
        hitY: p.from.y + end.y,
        flying: true,
        ...(p.weapon !== undefined ? { weapon: p.weapon } : {}),
      });
    const list = (st.bullets ??= []);
    list.push({
      id: allocateId(st.ids, 'B'),
      shot: {
        ...p,
        from: { x: p.from.x, y: p.from.y },
        coverKey: p.coverKey ?? `${p.by}@${st.tick}`,
      },
      x: p.from.x,
      y: p.from.y,
      travelled: 0,
    });
    return { hitX: p.from.x + end.x, hitY: p.from.y + end.y };
  }
  const hit = castRay(world, p.from, p.angle, p.range, p.team, {
    ignoreId: p.ignoreId ?? p.by,
    coverKey: p.coverKey ?? `${p.by}@${world.state.tick}`,
    ...(p.damageKind !== 'fragment' ? { bulletOrigin: p.from } : {}),
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
      ...(p.weapon !== undefined ? { weapon: p.weapon } : {}),
    });
  if (tgt) applyShotHit(world, p, tgt, hit.distance);
  return result;
}

/** A shot's (or a bullet's, PHASE17) effect on what it hit, `dist` from where it was fired. */
function applyShotHit(
  world: World,
  p: ShotParams,
  tgt: RayTarget,
  dist: number,
  /** (PHASE17) A spent bullet's share of its damage ([D146]). */
  scale = 1,
): void {
  if (tgt.kind === 'wall') return;
  const damage =
    (p.falloffTo !== undefined && p.range > 0
      ? p.damage * (1 - (1 - p.falloffTo) * Math.min(1, dist / p.range))
      : p.damage) * scale;
  // (PHASE12-b) Cover that stops a shot takes the hit ([Q40]); gates and wrecks ignore it.
  if (tgt.kind === 'cover') {
    damageCover(world, tgt.id, damage, p.damageKind ?? p.cause, p.by);
    return;
  }
  if (tgt.kind === 'soldier') {
    damageSoldier(
      world,
      world.state.soldiers[tgt.index]!,
      damage,
      p.by,
      p.cause,
      p.from,
      p.damageKind ?? p.cause,
    );
    return;
  }
  if (p.team === 'enemy') return;
  switch (tgt.kind) {
    case 'turret':
      damageTurret(world, tgt.index, damage, p.by);
      break;
    case 'mine':
      detonateMine(world, tgt.index, p.by);
      break;
    case 'vehicle':
      damageVehicle(world, tgt.index, damage, p.by);
      break;
    case 'objective':
      damageObjective(world, tgt.index, damage, p.by);
      break;
    case 'charge':
      damageCharge(world, tgt.index, damage, p.by);
      break;
  }
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

/**
 * (PHASE17) One tick for every bullet in flight (id order, [D145], [D146]). Up to its range it
 * flies at full speed with full damage; past it, it slows (`drag`, exponentially) and does damage
 * in proportion to its speed, until it's below `minSpeedShare` of full and lands
 * (`bulletStopped` with `landed`). It passes its own side, fires over the shooter's adjacent
 * cover on the first stretch only, and hits the first thing in the way. Passing close to an
 * enemy soldier tells them they're being shot at (`nearMiss`).
 */
export function stepBullets(world: World): void {
  const list = world.state.bullets;
  if (!list || list.length === 0) return;
  const st = world.state;
  const keep: BulletEntity[] = [];
  for (const b of list) {
    const p = b.shot;
    const full = p.speed ?? 0;
    const v = b.v ?? full;
    const scale = full > 0 ? v / full : 1;
    const drag = p.drag ?? 0;
    // Without drag a bullet stops at its range, as before.
    const stepLen = drag > 0 ? v / 60 : Math.min(v / 60, Math.max(0, p.range - b.travelled));
    const x0 = b.x;
    const y0 = b.y;
    const hit = castRay(world, b, p.angle, stepLen, p.team, {
      ignoreId: p.ignoreId ?? p.by,
      coverKey: p.coverKey!,
      ...(p.damageKind !== 'fragment' ? { bulletOrigin: p.from } : {}),
      ...(p.fireOver === false ? { fireOver: false } : { fireOverFrom: p.from }),
    });
    const d = fromAngle(p.angle, hit.distance);
    b.x += d.x;
    b.y += d.y;
    b.travelled += hit.distance;
    const tgt = hit.target as RayTarget | null;
    const hitId = tgt && 'id' in tgt ? tgt.id : undefined;
    nearMisses(world, b, x0, y0, hitId);
    if (tgt) {
      applyShotHit(world, p, tgt, b.travelled, scale);
      emit(world, { kind: 'bulletStopped', tick: st.tick, by: p.by, x: b.x, y: b.y });
      continue;
    }
    if (drag > 0) {
      if (b.travelled > p.range) b.v = v * Math.exp(-drag / 60);
      const spent = (b.v ?? full) < full * (p.minSpeedShare ?? 0.3);
      // A safety cap on distance, whatever the tuning.
      if (spent || b.travelled > p.range * 6) {
        emit(world, {
          kind: 'bulletStopped',
          tick: st.tick,
          by: p.by,
          x: b.x,
          y: b.y,
          landed: true,
        });
        continue;
      }
      keep.push(b);
    } else if (b.travelled < p.range - 1e-6) keep.push(b);
  }
  world.state.bullets = keep;
}

/** (PHASE17) Enemy soldiers this bullet just whizzed past (not the one it hit) ([D146]). */
function nearMisses(world: World, b: BulletEntity, x0: number, y0: number, hitId?: string): void {
  const team = b.shot.team;
  const r2 = NEAR_MISS_RADIUS * NEAR_MISS_RADIUS;
  const sx = b.x - x0;
  const sy = b.y - y0;
  const len2 = sx * sx + sy * sy;
  for (const s of world.state.soldiers) {
    if (!s.ai || !isEligible(s) || s.id === hitId || teamOf(s) === team) continue;
    if (b.passed?.includes(s.id)) continue;
    const k = len2 > 0 ? Math.max(0, Math.min(1, ((s.x - x0) * sx + (s.y - y0) * sy) / len2)) : 0;
    const dx = x0 + sx * k - s.x;
    const dy = y0 + sy * k - s.y;
    if (dx * dx + dy * dy > r2) continue;
    (b.passed ??= []).push(s.id);
    emit(world, {
      kind: 'nearMiss',
      tick: world.state.tick,
      target: s.id,
      by: b.shot.by,
      fromX: b.shot.from.x,
      fromY: b.shot.from.y,
    });
  }
}
