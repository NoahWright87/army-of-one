/**
 * (PHASE12-a) The Bazooka's rockets ([D62]). A rocket flies straight at `rocket.speed`, passing
 * through its own side, and explodes on the first thing it hits (a wall, cover that stops it, an
 * enemy soldier, a vehicle, a turret …) or at the end of its range. The blast hurts every soldier
 * in it, our own included, and wrecks vehicles.
 *
 * Launched by live fire (`weapons.ts`) and by echoes replaying a recorded launch ([E1]): the
 * recording stores the launch angle as a `shot` action with `gun: 'rocket'`.
 */
import { allocateId, compareIds } from '../core/ids';
import { DT } from '../core/time';
import { distanceSq, fromAngle, type Vec2 } from '../core/vec';
import { castRay, type Team } from '../combat/shots';
import {
  damageCharge,
  damageObjective,
  damageSoldier,
  damageTurret,
  damageVehicle,
  detonateMine,
} from '../combat/damage';
import { emit, type World } from '../state';
import { circleOverlapsRect } from '../world/collision';
import { objectiveRadius } from './objective';
import { isEligible } from './soldier';
import { laneInfo, vehicleRect } from './traffic';

export interface RocketEntity {
  id: string;
  /** Who launched it (credited for kills, including friendly ones). */
  by: string;
  team: 'player' | 'enemy';
  x: number;
  y: number;
  angle: number;
  travelled: number;
}

/** Rockets in flight (`state.rockets`), sorted by id. */
export function liveRockets(world: World): RocketEntity[] {
  return (world.state.rockets ??= []);
}

/** Launches a rocket from `from` at exactly `angle` (no spread here). Emits `rocketLaunched`. */
export function launchRocket(
  world: World,
  by: string,
  from: Vec2,
  angle: number,
  team: 'player' | 'enemy' = 'player',
): RocketEntity {
  const st = world.state;
  const r: RocketEntity = {
    id: allocateId(st.ids, 'R'),
    by,
    team,
    x: from.x,
    y: from.y,
    angle,
    travelled: 0,
  };
  const list = liveRockets(world);
  list.push(r);
  list.sort((a, b) => compareIds(a.id, b.id));
  emit(world, {
    kind: 'rocketLaunched',
    tick: st.tick,
    id: r.id,
    by,
    fromX: from.x,
    fromY: from.y,
    angle,
  });
  return r;
}

/** One tick for every rocket in flight (id order): fly, and explode on a hit or at full range. */
export function stepRockets(world: World): void {
  const list = world.state.rockets;
  if (!list || list.length === 0) return;
  const rt = world.tuning.rocket;
  const done: { r: RocketEntity; at: Vec2; directId?: string }[] = [];
  for (const r of list) {
    const step = Math.min(rt.speed * DT, Math.max(0, rt.range - r.travelled));
    const hit = castRay(world, r, r.angle, step, r.team as Team, {
      ignoreId: r.by,
      coverKey: `${r.id}@${world.state.tick}`,
      // Like a shot, the first stretch passes cover the shooter fires over; later ones don't.
      fireOver: r.travelled === 0,
    });
    const d = fromAngle(r.angle, hit.distance);
    const at = { x: r.x + d.x, y: r.y + d.y };
    r.x = at.x;
    r.y = at.y;
    r.travelled += hit.distance;
    if (hit.target) {
      const tgt = hit.target as { kind: string; id?: string };
      done.push({ r, at, ...(tgt.kind === 'soldier' && tgt.id ? { directId: tgt.id } : {}) });
    } else if (r.travelled >= rt.range - 1e-6) {
      done.push({ r, at });
    }
  }
  if (done.length === 0) return;
  const gone = new Set(done.map((x) => x.r.id));
  world.state.rockets = list.filter((r) => !gone.has(r.id));
  for (const x of done) explode(world, x.r, x.at, x.directId);
}

function explode(world: World, r: RocketEntity, c: Vec2, directId?: string): void {
  const { map, state: st, tuning } = world;
  const rt = tuning.rocket;
  emit(world, {
    kind: 'rocketExploded',
    tick: st.tick,
    id: r.id,
    by: r.by,
    x: c.x,
    y: c.y,
    radius: rt.blastRadius,
  });
  if (directId) {
    const s = st.soldiers.find((x) => x.id === directId);
    if (s) damageSoldier(world, s, rt.directDamage, r.by, 'rocket', c);
  }
  // The blast hurts everyone in it: friendly fire ([D62]).
  const r2 = rt.blastRadius * rt.blastRadius;
  for (const s of st.soldiers) {
    if (isEligible(s) && distanceSq(s, c) <= r2) {
      damageSoldier(world, s, rt.blastDamage, r.by, 'rocket', c);
    }
  }
  const within = (p: Vec2, extra: number) => distanceSq(p, c) <= (rt.blastRadius + extra) ** 2;
  const lanes = (map.trafficLanes ?? []).map((d) => laneInfo(d, tuning));
  st.vehicles.forEach((v, i) => {
    if (circleOverlapsRect(c, rt.blastRadius, vehicleRect(v, lanes[v.lane]!))) {
      damageVehicle(world, i, rt.vehicleDamage, r.by);
    }
  });
  (map.objectives ?? []).forEach((def, i) => {
    if (within(def.position, objectiveRadius(def, tuning))) {
      damageObjective(world, i, rt.hazardDamage, r.by);
    }
  });
  // Turrets, mines and bridge charges are the enemy's: only our rockets damage them.
  if (r.team !== 'player') return;
  (map.turrets ?? []).forEach((def, i) => {
    if (within(def.position, tuning.turret.radius)) damageTurret(world, i, rt.hazardDamage, r.by);
  });
  (map.bridges ?? []).forEach((def, i) => {
    if (def.charge && within(def.charge, tuning.bridge.chargeRadius)) {
      damageCharge(world, i, rt.hazardDamage, r.by);
    }
  });
  (map.mines ?? []).forEach((def, i) => {
    if (within(def.position, tuning.mine.radius)) detonateMine(world, i, r.by);
  });
}
