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
import { isEligible, type SoldierInput, type SoldierState } from '../entities/soldier';
import { throwGrenade } from '../entities/grenade';
import type { World } from '../state';
import { movingAimOffset } from './shots';
import { gunOf, stepGunner } from './guns';

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

/** Wind-up progress 0..1 for the view (0 when not winding up). */
export function windupProgress(world: World, s: SoldierState, aimDistance?: number): number {
  if (s.windupTicks <= 0) return 0;
  const d = aimDistance ?? s.windupAim;
  return Math.min(1, s.windupTicks / windupTicksFor(world, d));
}

/** Applies one tick of a live soldier's fire input. */
export function soldierAttack(world: World, s: SoldierState, input: SoldierInput): void {
  // (07-e) Sprinting: no firing, and a wind-up just holds ([D49]).
  if (s.sprinting) input = { ...input, fire: s.windupTicks > 0 };
  const gun = gunOf(s);
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
