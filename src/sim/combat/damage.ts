import { secondsToTicks } from '../core/time';
import { distanceSq } from '../core/vec';
import { pushSoldiersOffBridge, soldiersOnBridge } from '../entities/bridge';
import { armMine } from '../entities/mine';
import { objectiveRadius } from '../entities/objective';
import { isEligible, type SoldierState } from '../entities/soldier';
import { laneInfo, vehicleRect } from '../entities/traffic';
import { emit, type World } from '../state';
import { circleOverlapsRect } from '../world/collision';

/**
 * Damage and deaths are always simulated, never replayed ([E3]). HP is floored at `minHp`
 * (lead-in invulnerability, [D5]): damage still applies, but a floored soldier can't die.
 */
export function damageSoldier(
  world: World,
  s: SoldierState,
  amount: number,
  by: string | undefined,
  cause: string,
): void {
  if (!isEligible(s) || amount <= 0) return;
  const before = s.hp;
  s.hp = Math.max(s.hp - amount, s.minHp, 0);
  const tick = world.state.tick;
  const applied = before - s.hp;
  if (applied > 0) {
    emit(world, { kind: 'damaged', tick, target: s.id, amount: applied, ...(by ? { by } : {}) });
  }
  if (s.hp <= 0) {
    s.alive = false;
    s.deathTick = tick;
    s.deathCause = cause;
    emit(world, { kind: 'soldierDied', tick, id: s.id, cause, ...(by ? { by } : {}) });
  }
}

export function damageTurret(world: World, index: number, amount: number, by: string): void {
  const t = world.state.turrets[index]!;
  if (t.mode === 'destroyed') return;
  t.hp = Math.max(0, t.hp - amount);
  emit(world, { kind: 'damaged', tick: world.state.tick, target: t.id, amount, by });
  if (t.hp === 0) {
    t.mode = 'destroyed';
    t.targetId = null;
    emit(world, { kind: 'hazardDestroyed', tick: world.state.tick, id: t.id, by });
  }
}

/** A destroyed vehicle stops where it is and becomes a wreck (blocks movement). */
export function damageVehicle(world: World, index: number, amount: number, by: string): void {
  const v = world.state.vehicles[index]!;
  if (v.state === 'wreck') return;
  v.hp = Math.max(0, v.hp - amount);
  emit(world, { kind: 'damaged', tick: world.state.tick, target: v.id, amount, by });
  if (v.hp === 0) {
    v.state = 'wreck';
    emit(world, { kind: 'hazardDestroyed', tick: world.state.tick, id: v.id, by });
  }
}

export function damageObjective(world: World, index: number, amount: number, by: string): void {
  const st = world.state;
  const o = st.objectives[index]!;
  if (o.destroyed) return;
  o.hp = Math.max(0, o.hp - amount);
  emit(world, { kind: 'damaged', tick: st.tick, target: o.id, amount, by });
  if (o.hp > 0) return;
  o.destroyed = true;
  emit(world, { kind: 'objectiveDestroyed', tick: st.tick, id: o.id, by });
  if (!st.missionComplete && st.objectives.every((x) => x.destroyed)) {
    st.missionComplete = { tick: st.tick, by };
  }
}

/** Shooting a destructible bridge's charge; at 0 HP the bridge collapses. */
export function damageCharge(world: World, index: number, amount: number, by: string): void {
  const b = world.state.bridges[index]!;
  if (b.state === 'destroyed' || b.chargeHp <= 0) return;
  b.chargeHp = Math.max(0, b.chargeHp - amount);
  emit(world, { kind: 'damaged', tick: world.state.tick, target: b.id, amount, by });
  if (b.chargeHp === 0) collapseBridge(world, index, by);
}

/** The bridge becomes impassable for good. Anyone on it dies (or, if HP-floored, is pushed off). */
export function collapseBridge(world: World, index: number, by: string): void {
  const def = world.map.bridges![index]!;
  const b = world.state.bridges[index]!;
  if (b.state === 'destroyed') return;
  b.state = 'destroyed';
  b.chargeHp = 0;
  emit(world, { kind: 'hazardDestroyed', tick: world.state.tick, id: b.id, by });
  emit(world, { kind: 'bridgeChanged', tick: world.state.tick, id: b.id, state: b.state });
  for (const i of soldiersOnBridge(world, def)) {
    const s = world.state.soldiers[i]!;
    damageSoldier(world, s, world.tuning.bridge.collapseDamage, b.id, 'bridgeCollapse');
  }
  pushSoldiersOffBridge(world, def);
}

/**
 * Blast: hurts soldiers within the radius, damages hazards/objectives (if enabled) and sets off
 * nearby mines after a short chain fuse. `by` is credited for hazard/objective damage (e.g. the
 * soldier who shot the mine); soldier deaths are credited to the mine itself.
 */
export function detonateMine(world: World, index: number, by: string): void {
  const { map, state: st, tuning } = world;
  const mt = tuning.mine;
  const m = st.mines[index]!;
  if (m.state === 'detonated') return;
  m.state = 'detonated';
  m.fuseTicks = 0;
  const c = map.mines![index]!.position;
  emit(world, {
    kind: 'mineDetonated',
    tick: st.tick,
    id: m.id,
    x: c.x,
    y: c.y,
    radius: mt.blastRadius,
  });

  const r2 = mt.blastRadius * mt.blastRadius;
  for (const s of st.soldiers) {
    if (isEligible(s) && distanceSq(s, c) <= r2)
      damageSoldier(world, s, mt.blastDamage, m.id, 'mine');
  }

  if (mt.damagesHazards) {
    const within = (p: { x: number; y: number }, extra: number) =>
      distanceSq(p, c) <= (mt.blastRadius + extra) ** 2;
    (map.turrets ?? []).forEach((def, i) => {
      if (within(def.position, tuning.turret.radius)) damageTurret(world, i, mt.hazardDamage, by);
    });
    const lanes = (map.trafficLanes ?? []).map((d) => laneInfo(d, tuning));
    st.vehicles.forEach((v, i) => {
      if (circleOverlapsRect(c, mt.blastRadius, vehicleRect(v, lanes[v.lane]!))) {
        damageVehicle(world, i, mt.hazardDamage, by);
      }
    });
    (map.objectives ?? []).forEach((def, i) => {
      if (within(def.position, objectiveRadius(def, tuning))) {
        damageObjective(world, i, mt.hazardDamage, by);
      }
    });
    (map.bridges ?? []).forEach((def, i) => {
      if (def.charge && within(def.charge, tuning.bridge.chargeRadius)) {
        damageCharge(world, i, mt.hazardDamage, by);
      }
    });
  }

  const chain = secondsToTicks(mt.chainFuseSeconds);
  (map.mines ?? []).forEach((def, i) => {
    if (i !== index && distanceSq(def.position, c) <= r2) armMine(st.mines[i]!, chain);
  });
}
