/**
 * (07-c) Frag grenades ([D37]). A thrown grenade is a little 2.5D body: x/y on the map plus a
 * height z. It flies in an arc, bounces off the ground and off walls and cover, rolls to a stop,
 * and explodes when its fuse runs out: a small central blast plus a ring of fragments that fly
 * like bullets (and roll against cover like bullets). Everyone is hurt, own soldiers included.
 *
 * Cover against grenades uses its `lobbed` number ([D32]): an airborne grenade entering a cover
 * piece is stopped (bounces off) with that probability, rolled once per contact with a hash, so
 * replays agree. A rolling grenade (on the ground) is always stopped by cover. Cover the thrower
 * stands right next to is ignored until the grenade first lands (they throw over it).
 *
 * Deterministic: plain float math in a fixed order, no randomness beyond hashed rolls.
 */
import { compareIds, allocateId } from '../core/ids';
import { hash01 } from '../core/hash';
import { DT, secondsToTicks } from '../core/time';
import { distanceSq, type Vec2 } from '../core/vec';
import {
  damageCharge,
  damageObjective,
  damageSoldier,
  damageTurret,
  damageVehicle,
  detonateMine,
} from '../combat/damage';
import { fireShot } from '../combat/shots';
import { emit, type World } from '../state';
import { dynamicBlockers } from '../world/blockers';
import { circleOverlapsRect } from '../world/collision';
import { blastCover, canFireOver, coverStops, standingCover } from '../world/cover';
import type { Rect } from '../world/map';
import { objectiveRadius } from './objective';
import { isEligible } from './soldier';
import { laneInfo, vehicleRect } from './traffic';

export interface GrenadeEntity {
  id: string;
  /** Who threw it (credited for kills, including friendly ones). */
  by: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fuseTicks: number;
  /** Still in its first flight (before the first landing): the thrower's cover is ignored. */
  firstFlight: boolean;
  /** Cover ids the thrower threw over (ignored during the first flight). */
  thrownOver: string[];
  /** Cover ids it's passing through right now (an airborne roll said "over"). */
  passing: string[];
  /** Contacts so far: part of each roll's key, so repeated contacts roll afresh. */
  contacts: number;
}

/** Grenades in flight (`state.grenades`), sorted by id. */
export function liveGrenades(world: World): GrenadeEntity[] {
  return (world.state.grenades ??= []);
}

/**
 * Throws a grenade from `from` toward `angle`, aiming to first land `distance` away. Called by
 * live throws and by echoes replaying a recorded throw ([E1]). Emits `grenadeThrown`.
 */
export function throwGrenade(
  world: World,
  by: string,
  from: Vec2,
  angle: number,
  distance: number,
): GrenadeEntity {
  const gt = world.tuning.grenade;
  const st = world.state;
  const id = allocateId(st.ids, 'G');
  const d = Math.max(0, distance);
  const flight = d / gt.throwSpeed;
  const g: GrenadeEntity = {
    id,
    by,
    x: from.x,
    y: from.y,
    z: 0,
    vx: Math.cos(angle) * gt.throwSpeed,
    vy: Math.sin(angle) * gt.throwSpeed,
    vz: (gt.gravity * flight) / 2,
    fuseTicks: Math.max(1, secondsToTicks(gt.fuseSeconds)),
    firstFlight: true,
    thrownOver: standingCover(world)
      .filter((c) => canFireOver(from, c, c.lobbed, world.tuning))
      .map((c) => c.id),
    passing: [],
    contacts: 0,
  };
  const list = liveGrenades(world);
  list.push(g);
  list.sort((a, b) => compareIds(a.id, b.id));
  emit(world, {
    kind: 'grenadeThrown',
    tick: st.tick,
    id,
    by,
    fromX: from.x,
    fromY: from.y,
    angle,
    distance: d,
  });
  return g;
}

interface Obstacle {
  rect: Rect;
  /** Cover id (rolled against `lobbed`), or undefined for solid geometry. */
  coverId?: string;
  lobbed: number;
}

/** First entry of the segment p → p + v into rect r: t in [0, 1] and the hit axis. */
function sweep(p: Vec2, v: Vec2, r: Rect): { t: number; axis: 'x' | 'y' } | null {
  let tMin = 0;
  let tMax = 1;
  let axis: 'x' | 'y' | null = null;
  for (const [ax, o, d, lo, hi] of [
    ['x', p.x, v.x, r.x, r.x + r.w],
    ['y', p.y, v.y, r.y, r.y + r.h],
  ] as const) {
    if (d === 0) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tMin) {
      tMin = t1;
      axis = ax;
    }
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  // Starting inside (axis null) isn't a contact: it's passing through or stuck; let it out.
  if (axis === null) return null;
  return { t: tMin, axis };
}

function obstacles(world: World): Obstacle[] {
  const { map } = world;
  const out: Obstacle[] = map.walls.map((rect) => ({ rect, lobbed: 1 }));
  for (const c of standingCover(world)) out.push({ rect: c.rect, coverId: c.id, lobbed: c.lobbed });
  const standing = new Set([
    ...(map.turrets ?? []).map((t) => t.id),
    ...(map.objectives ?? []).map((o) => o.id),
  ]);
  // Closed gates, wrecks, live turrets and objectives: things that stand up off the ground.
  for (const b of dynamicBlockers(world)) {
    if (b.blocksShots || standing.has(b.id)) out.push({ rect: b.rect, lobbed: 1 });
  }
  return out;
}

/** Moves one grenade one tick: gravity, ground bounce/roll, wall and cover bounces. */
function moveGrenade(world: World, g: GrenadeEntity, obs: readonly Obstacle[]): void {
  const gt = world.tuning.grenade;
  // Vertical.
  if (g.z > 0 || g.vz > 0) {
    g.vz -= gt.gravity * DT;
    g.z += g.vz * DT;
    if (g.z <= 0) {
      g.z = 0;
      g.firstFlight = false;
      if (-g.vz > gt.minBounceSpeed) {
        g.vz = -g.vz * gt.groundRestitution;
        g.vx *= gt.groundFriction;
        g.vy *= gt.groundFriction;
      } else {
        g.vz = 0;
      }
    }
  }
  const airborne = g.z > gt.groundedHeight;
  if (!airborne && g.z === 0 && g.vz === 0) {
    // Rolling: friction.
    const speed = Math.hypot(g.vx, g.vy);
    if (speed > 0) {
      const next = Math.max(0, speed - gt.rollDeceleration * DT);
      g.vx *= next / speed;
      g.vy *= next / speed;
    }
  }

  // Horizontal, with up to a few contacts per tick.
  g.passing = g.passing.filter((id) => {
    const o = obs.find((x) => x.coverId === id);
    return !!o && circleOverlapsRect(g, 0.5, o.rect);
  });
  let remaining = 1;
  for (let iter = 0; iter < 3 && remaining > 0; iter++) {
    const v = { x: g.vx * DT * remaining, y: g.vy * DT * remaining };
    if (v.x === 0 && v.y === 0) break;
    let best: { t: number; axis: 'x' | 'y'; o: Obstacle } | null = null;
    for (const o of obs) {
      if (o.coverId !== undefined) {
        if (g.passing.includes(o.coverId)) continue;
        if (g.firstFlight && g.thrownOver.includes(o.coverId)) continue;
      }
      const hit = sweep(g, v, o.rect);
      if (hit && (!best || hit.t < best.t)) best = { ...hit, o };
    }
    if (!best) {
      g.x += v.x;
      g.y += v.y;
      break;
    }
    const o = best.o;
    if (o.coverId !== undefined && g.z > gt.groundedHeight) {
      g.contacts += 1;
      if (!coverStops(`${g.id}#${g.contacts}`, o.coverId, o.lobbed)) {
        g.passing.push(o.coverId); // over it (or through the window): no bounce
        continue;
      }
    }
    // Bounce: stop just short of the contact and reflect the velocity on the hit axis.
    const t = Math.max(0, best.t - 1e-3);
    g.x += v.x * t;
    g.y += v.y * t;
    remaining *= 1 - t;
    if (best.axis === 'x') {
      g.vx = -g.vx * gt.wallRestitution;
      g.vy *= gt.wallSlide;
    } else {
      g.vy = -g.vy * gt.wallRestitution;
      g.vx *= gt.wallSlide;
    }
    emit(world, { kind: 'grenadeBounced', tick: world.state.tick, id: g.id, x: g.x, y: g.y });
  }
}

/** Blast + fragments at the grenade's position. */
function explode(world: World, g: GrenadeEntity): void {
  const { map, state: st, tuning } = world;
  const gt = tuning.grenade;
  const c = { x: g.x, y: g.y };
  const r2 = gt.blastRadius * gt.blastRadius;

  // Fragments first (a fixed ring with a per-grenade hashed rotation), then the blast, both
  // against the world as it was at the moment of the explosion.
  const n = Math.max(0, Math.floor(gt.fragments));
  const base = (hash01(`${g.id}:frag`) * 2 * Math.PI) / Math.max(1, n);
  const fragments: { angle: number; hitX: number; hitY: number }[] = [];
  for (let i = 0; i < n; i++) {
    const angle = base + (i * 2 * Math.PI) / n;
    const res = fireShot(world, {
      by: g.by,
      ignoreId: g.id,
      team: 'neutral',
      from: c,
      angle,
      range: gt.fragmentRange,
      damage: gt.fragmentDamage,
      cause: 'grenade',
      damageKind: 'fragment', // [D71]: shrapnel doesn't pierce
      coverKey: `${g.id}#f${i}`,
      fireOver: false,
      silent: true,
    });
    fragments.push({ angle, hitX: res.hitX, hitY: res.hitY });
  }
  emit(world, {
    kind: 'grenadeExploded',
    tick: st.tick,
    id: g.id,
    by: g.by,
    x: c.x,
    y: c.y,
    radius: gt.blastRadius,
    fragments,
  });

  for (const s of st.soldiers) {
    if (isEligible(s) && distanceSq(s, c) <= r2) {
      damageSoldier(world, s, gt.blastDamage, g.by, 'grenade', c);
    }
  }
  // (PHASE12-b) The blast damages breakable cover ([Q40]); the fragments hit it as shots.
  blastCover(world, c, gt.blastRadius, gt.blastDamage, 'grenade', g.by);
  const within = (p: Vec2, extra: number) => distanceSq(p, c) <= (gt.blastRadius + extra) ** 2;
  (map.turrets ?? []).forEach((def, i) => {
    if (within(def.position, tuning.turret.radius)) damageTurret(world, i, gt.hazardDamage, g.by);
  });
  const lanes = (map.trafficLanes ?? []).map((d) => laneInfo(d, tuning));
  st.vehicles.forEach((v, i) => {
    if (circleOverlapsRect(c, gt.blastRadius, vehicleRect(v, lanes[v.lane]!))) {
      damageVehicle(world, i, gt.hazardDamage, g.by);
    }
  });
  (map.objectives ?? []).forEach((def, i) => {
    if (within(def.position, objectiveRadius(def, tuning))) {
      damageObjective(world, i, gt.hazardDamage, g.by);
    }
  });
  (map.bridges ?? []).forEach((def, i) => {
    if (def.charge && within(def.charge, tuning.bridge.chargeRadius)) {
      damageCharge(world, i, gt.hazardDamage, g.by);
    }
  });
  (map.mines ?? []).forEach((def, i) => {
    if (within(def.position, tuning.mine.radius)) detonateMine(world, i, g.by);
  });
}

/** One tick for every grenade in flight (id order): move, then explode those whose fuse ran out. */
export function stepGrenades(world: World): void {
  const list = world.state.grenades;
  if (!list || list.length === 0) return;
  const obs = obstacles(world);
  for (const g of list) moveGrenade(world, g, obs);
  const done: GrenadeEntity[] = [];
  for (const g of list) {
    g.fuseTicks -= 1;
    if (g.fuseTicks <= 0) done.push(g);
  }
  if (done.length === 0) return;
  world.state.grenades = list.filter((g) => g.fuseTicks > 0);
  for (const g of done) explode(world, g);
}
