/**
 * (07-c) What a live soldier's fire input does, by role ([D36]): the Rifleman and Machine Gunner
 * fire their guns (`guns.ts`);
 * the Grenadier holds fire to wind up a throw and releases to throw ([D37]).
 *
 * (PHASE18, [D159]) No wind-up: pressing fire throws at once, to the aimed distance; then it
 * reloads (`cooldownSeconds`). Holding fire throws again each time it's ready. Moving scatters
 * the throw (angle and distance), like it spreads rifle shots ([D35]).
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

/**
 * (PHASE18, [D159]) Reload progress 0..1 of a throw/launch weapon (Grenadier, Bazooka, tank
 * cannon) after it fires; null when ready (or not such a weapon).
 */
export function reloadProgress(world: World, s: SoldierState): number | null {
  const w = roleDef(s.roleId).weapon;
  if (w !== 'grenade' && w !== 'rocket' && w !== 'shell') return null;
  const left = s.nextFireTick - world.state.tick;
  if (left <= 0) return null;
  const total = Math.max(1, secondsToTicks(world.tuning[w].cooldownSeconds));
  return Math.max(0, Math.min(1, 1 - left / total));
}

/** Applies one tick of a live soldier's fire input. */
export function soldierAttack(world: World, s: SoldierState, input: SoldierInput): void {
  // (PHASE12-b) A vehicle fires where its turret points, not straight at the aim.
  if (s.drive) input = { ...input, aim: s.drive.turret };
  // (PHASE12-a) The Bazooka: aim, then launch ([D62]); (PHASE12-b) the tank's cannon too.
  const weapon = roleDef(s.roleId).weapon;
  if (weapon === 'rocket' || weapon === 'shell') {
    stepBazooka(world, s, input, weapon);
    return;
  }
  // (07-e) Sprinting: no firing ([D49]).
  if (s.sprinting) input = { ...input, fire: false };
  const gun = gunOf(s, world.tuning);
  if (gun) {
    stepGunner(world, s, input, gun);
    return;
  }
  if (!isEligible(s)) return;
  const aimDist = aimedThrowDistance(world, input);
  s.windupAim = aimDist;
  if (!input.fire || world.state.tick < s.nextFireTick) return;
  // (PHASE18, [D159]) Throw now; the reload comes after.
  const gt = world.tuning.grenade;
  const angle = input.aim + movingAimOffset(world, s, 'throw', gt.movingSpread);
  const distScatter =
    (hash01(`${s.id}@${world.state.tick}:throwDist`) * 2 - 1) *
    gt.movingDistanceSpread *
    s.moveFrac;
  const distance = Math.max(0, aimDist * (1 + distScatter));
  throwGrenade(world, s.id, s, angle, distance);
  s.nextFireTick = world.state.tick + Math.max(1, secondsToTicks(gt.cooldownSeconds));
}

/**
 * (PHASE12-a) One live tick of a Bazooka ([D62]) or tank cannon: fire (off cooldown, not
 * sprinting) launches at once, at the aim plus the rolled spread; then it reloads
 * (`cooldownSeconds`). (PHASE18, [D159]: no aiming wind-up before the shot.)
 */
function stepBazooka(
  world: World,
  s: SoldierState,
  input: SoldierInput,
  weapon: 'rocket' | 'shell',
): void {
  if (!isEligible(s)) return;
  const tick = world.state.tick;
  if (!input.fire || s.sprinting || tick < s.nextFireTick) return;
  const rt = world.tuning[weapon];
  const angle = input.aim + spreadOffset(`${s.id}@${tick}:aim`, spreadOf(rt, s.moveFrac, 0));
  launchRocket(world, s.id, s, angle, teamOf(s) === 'enemy' ? 'enemy' : 'player', weapon);
  s.nextFireTick = tick + Math.max(1, secondsToTicks(rt.cooldownSeconds));
}
