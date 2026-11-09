import type { Tuning } from '../../content/tuning';
import { compareIds } from '../core/ids';
import { DT, secondsToTicks } from '../core/time';
import { angleBetween, distanceSq, wrapAngle } from '../core/vec';
import { fireShot, hasLineOfSight } from '../combat/shots';
import { emit, type World } from '../state';
import type { TurretDef } from '../world/map';
import { isOurEligible, type SoldierState } from './soldier';
import { simPerf } from '../perf';
import { dynamicBlockers, type Blocker } from '../world/blockers';
import { seesThroughCover, standingCover } from '../world/cover';
import { recoverRecoil, spreadOf, spreadOffset } from '../combat/guns';

export type TurretMode = 'idle' | 'tracking' | 'windup' | 'destroyed';

export interface TurretEntity {
  id: string;
  aim: number;
  mode: TurretMode;
  hp: number;
  /** Locked target while winding up; the last tracked target otherwise. */
  targetId: string | null;
  /** Ticks left in the current wind-up. */
  windupTicks: number;
  /** Ticks left before the next wind-up may start. */
  cooldownTicks: number;
  /** (07-c) Recoil, radians of extra spread ([D39]). Optional for older snapshots. */
  recoil?: number;
}

export function createTurrets(defs: readonly TurretDef[], tuning: Tuning): TurretEntity[] {
  return defs.map((d) => ({
    id: d.id,
    aim: d.facing,
    mode: 'idle',
    hp: tuning.turret.maxHp,
    targetId: null,
    windupTicks: 0,
    cooldownTicks: 0,
  }));
}

/** Can this turret see and reach this soldier right now? */
function canEngage(
  world: World,
  def: TurretDef,
  s: SoldierState,
  blockers?: readonly Blocker[],
): boolean {
  if (!isOurEligible(s)) return false; // (07-d) turrets are on the enemy side
  const r = world.tuning.turret.range;
  if (distanceSq(def.position, s) > r * r) return false;
  // (07-c) Partial cover cuts how far the turret sees past it ([D33]).
  if (!seesThroughCover(standingCover(world), def.position, s, r, world.tuning)) return false;
  return hasLineOfSight(world, def.position, s, 'enemy', def.id, blockers);
}

/** Nearest engageable soldier; ties broken by id. */
export function chooseTurretTarget(
  world: World,
  def: TurretDef,
  blockers?: readonly Blocker[],
): SoldierState | null {
  let best: SoldierState | null = null;
  let bestD = Infinity;
  for (const s of world.state.soldiers) {
    if (!canEngage(world, def, s, blockers)) continue;
    const d = distanceSq(def.position, s);
    if (d < bestD || (d === bestD && best && compareIds(s.id, best.id) < 0)) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

function rotateToward(t: TurretEntity, desired: number, maxStep: number): number {
  const diff = wrapAngle(desired - t.aim);
  const stepAngle = Math.max(-maxStep, Math.min(maxStep, diff));
  t.aim = wrapAngle(t.aim + stepAngle);
  return Math.abs(wrapAngle(desired - t.aim));
}

/**
 * idle → tracking (nearest eligible soldier in range with LOS; rotate toward it) → windup (a
 * telegraph, target locked) → hitscan shot → cooldown → … If the locked target breaks LOS, leaves
 * range or dies during the wind-up, the shot is cancelled. (07-c) Shots spread by the turret's
 * recoil ([D39]); at the default timings it recovers fully between shots, so they stay exact.
 */
export function stepTurrets(world: World): void {
  const tt = world.tuning.turret;
  const defs = world.map.turrets ?? [];
  const maxTurn = tt.turnRate * DT;
  world.state.turrets.forEach((t, i) => {
    if (t.mode === 'destroyed') return;
    const def = defs[i]!;
    if (t.cooldownTicks > 0) t.cooldownTicks -= 1;
    if (t.recoil) t.recoil = recoverRecoil(t.recoil, tt);
    // (05-b) Turret shots only ever damage soldiers, which never block anything, so the blocker
    // list can't change during this turret's step: compute it once for all its LOS rays.
    const blockers = simPerf.turretBlockerCache ? dynamicBlockers(world) : undefined;

    if (t.mode === 'windup') {
      const target = world.state.soldiers.find((s) => s.id === t.targetId);
      if (!target || !canEngage(world, def, target, blockers)) {
        t.mode = 'tracking';
        t.targetId = null;
        t.windupTicks = 0;
      } else {
        const desired = angleBetween(def.position, target);
        if (tt.trackDuringWindup) rotateToward(t, desired, maxTurn);
        t.windupTicks -= 1;
        if (t.windupTicks <= 0) {
          const aimed = tt.trackDuringWindup ? desired : t.aim;
          t.aim = aimed;
          // (07-c) Turrets have spread and recoil too ([D39]).
          const spread = spreadOf(tt, 0, t.recoil ?? 0);
          const angle = aimed + spreadOffset(`${t.id}@${world.state.tick}:aim`, spread);
          t.recoil = Math.min(tt.maxRecoil, (t.recoil ?? 0) + tt.kick);
          fireShot(world, {
            by: t.id,
            team: 'enemy',
            from: def.position,
            angle,
            range: tt.range,
            damage: tt.damage,
            cause: 'turret',
          });
          t.mode = 'tracking';
          t.cooldownTicks = secondsToTicks(tt.cooldownSeconds);
        }
        return;
      }
    }

    const target = chooseTurretTarget(world, def, blockers);
    if (!target) {
      t.mode = 'idle';
      t.targetId = null;
      return;
    }
    t.mode = 'tracking';
    t.targetId = target.id;
    const remaining = rotateToward(t, angleBetween(def.position, target), maxTurn);
    if (remaining <= tt.aimTolerance && t.cooldownTicks === 0) {
      t.mode = 'windup';
      t.windupTicks = Math.max(1, secondsToTicks(tt.windupSeconds));
      emit(world, { kind: 'turretWindup', tick: world.state.tick, id: t.id, targetId: target.id });
    }
  });
}
