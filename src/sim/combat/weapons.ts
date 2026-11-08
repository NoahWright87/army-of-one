/**
 * (07-c) What a live soldier's fire input does, by role ([D36]): the Rifleman and Machine Gunner
 * fire their guns (`guns.ts`);
 * the Grenadier holds fire to wind up a throw and releases to throw ([D37]).
 *
 * Wind-up: the time needed grows with the aimed distance (`windupBaseSeconds +
 * windupSecondsPerUnit × distance`). Releasing early throws a matching share of the aimed
 * distance. Moving scatters the throw (angle and distance), like it spreads rifle shots ([D35]).
 * The recording stores the throw's final angle and distance, so echoes replay the same throw.
 */
import { hash01 } from '../core/hash';
import { secondsToTicks } from '../core/time';
import { roleDef } from '../../content/roles';
import { isEligible, teamOf, type SoldierInput, type SoldierState } from '../entities/soldier';
import { launchRocket } from '../entities/rocket';
import { throwGrenade } from '../entities/grenade';
import type { World } from '../state';
import { movingAimOffset } from './shots';
import { gunOf, spreadOf, spreadOffset, stepGunner } from './guns';

/** Aimed throw distance, clamped to the grenade's range (default: a mid-range throw). */
export function aimedThrowDistance(world: World, input: SoldierInput): number {
  const gt = world.tuning.grenade;
  const d = input.aimDistance ?? (gt.minRange + gt.maxRange) / 2;
  return Math.max(gt.minRange, Math.min(gt.maxRange, d));
}

/** Ticks of wind-up a full throw to `distance` takes. */
export function windupTicksFor(world: World, distance: number): number {
  const gt = world.tuning.grenade;
  return Math.max(1, secondsToTicks(gt.windupBaseSeconds + gt.windupSecondsPerUnit * distance));
}

/** (PHASE12-a) Ticks the Bazooka aims before a launch ([D62]). */
export function rocketAimTicks(world: World): number {
  return Math.max(1, secondsToTicks(world.tuning.rocket.aimSeconds));
}

/** Wind-up progress 0..1 for the view (0 when not winding up). */
export function windupProgress(world: World, s: SoldierState, aimDistance?: number): number {
  if (s.windupTicks <= 0) return 0;
  if (roleDef(s.roleId).weapon === 'rocket')
    return Math.min(1, s.windupTicks / rocketAimTicks(world));
  const d = aimDistance ?? s.windupAim;
  return Math.min(1, s.windupTicks / windupTicksFor(world, d));
}

/** Applies one tick of a live soldier's fire input. */
export function soldierAttack(world: World, s: SoldierState, input: SoldierInput): void {
  // (PHASE12-a) The Bazooka: aim, then launch ([D62]).
  if (roleDef(s.roleId).weapon === 'rocket') {
    stepBazooka(world, s, input);
    return;
  }
  // (07-e) Sprinting: no firing, and a wind-up just holds ([D49]).
  if (s.sprinting) input = { ...input, fire: s.windupTicks > 0 };
  const gun = gunOf(s, world.tuning);
  if (gun) {
    stepGunner(world, s, input, gun);
    return;
  }
  if (!isEligible(s)) return;
  const aimDist = aimedThrowDistance(world, input);
  s.windupAim = aimDist;
  if (input.fire) {
    if (world.state.tick >= s.nextFireTick) {
      s.windupTicks = Math.min(s.windupTicks + 1, windupTicksFor(world, aimDist));
    }
    return;
  }
  if (s.windupTicks <= 0) return;
  // Released: throw.
  const gt = world.tuning.grenade;
  const share = Math.min(1, s.windupTicks / windupTicksFor(world, aimDist));
  s.windupTicks = 0;
  const angle = input.aim + movingAimOffset(world, s, 'throw', gt.movingSpread);
  const distScatter =
    (hash01(`${s.id}@${world.state.tick}:throwDist`) * 2 - 1) *
    gt.movingDistanceSpread *
    s.moveFrac;
  const distance = Math.max(0, aimDist * share * (1 + distScatter));
  throwGrenade(world, s.id, s, angle, distance);
  s.nextFireTick = world.state.tick + Math.max(1, secondsToTicks(gt.cooldownSeconds));
}

/**
 * (PHASE12-a) One live tick of a Bazooka ([D62]): holding fire (off cooldown, not sprinting)
 * aims for `rocket.aimSeconds`, then the rocket launches at the aim plus the rolled spread.
 * Releasing early, or sprinting, cancels the aim.
 */
function stepBazooka(world: World, s: SoldierState, input: SoldierInput): void {
  if (!isEligible(s)) return;
  const tick = world.state.tick;
  if (!input.fire || s.sprinting || tick < s.nextFireTick) {
    s.windupTicks = 0;
    return;
  }
  s.windupTicks += 1;
  if (s.windupTicks < rocketAimTicks(world)) return;
  s.windupTicks = 0;
  const rt = world.tuning.rocket;
  const angle = input.aim + spreadOffset(`${s.id}@${tick}:aim`, spreadOf(rt, s.moveFrac, 0));
  launchRocket(world, s.id, s, angle, teamOf(s) === 'enemy' ? 'enemy' : 'player');
  s.nextFireTick = tick + Math.max(1, secondsToTicks(rt.cooldownSeconds));
}
