/**
 * (07-c) Guns with spread and recoil ([D39]), and the Machine Gunner's mount ([D40]).
 *
 * Every shot goes out at a random angle within ± the gun's current spread:
 *   spread = baseSpread + movingSpread × moveFrac + recoil
 * Each shot adds `kick` to the shooter's recoil (capped); recoil recovers every tick. The random
 * offset is a hash of (shooter, tick) ([E10]), and the recording stores the final angle, so echoes
 * fire exactly the original shots without re-rolling anything.
 *
 * MG mount: standing still (no movement input, didn't move) right next to non-solid cover fills
 * the mount over `mg.mountSeconds`. Mounted and aiming across that cover, the MG uses its
 * `mounted` spread numbers. Moving, or leaving the cover, unmounts at once.
 */
import type { GunSpread, Tuning } from '../../content/tuning';
import { roleDef } from '../../content/roles';
import { hash01 } from '../core/hash';
import { DT, secondsToTicks } from '../core/time';
import { fromAngle, type Vec2 } from '../core/vec';
import { isEligible, type SoldierInput, type SoldierState } from '../entities/soldier';
import type { World } from '../state';
import { rayRect } from '../world/collision';
import { canFireOver, distanceToRect, type CoverPiece } from '../world/cover';
import { fireShot, type ShotResult } from './shots';

export type GunKind = 'rifle' | 'mg';

/** The gun a soldier's role carries, or null (the Grenadier throws instead). */
export function gunOf(s: SoldierState): GunKind | null {
  const w = roleDef(s.roleId).weapon;
  return w === 'rifle' || w === 'mg' ? w : null;
}

function gunTuning(t: Tuning, gun: GunKind) {
  return gun === 'mg' ? t.mg : t.rifle;
}

/** Recoil recovers every tick, firing or not. */
export function recoverRecoil(recoil: number, stats: GunSpread): number {
  return Math.max(0, recoil - stats.recoveryPerSecond * DT);
}

/** ± spread (radians) for these stats, movement share and recoil. */
export function spreadOf(stats: GunSpread, moveFrac: number, recoil: number): number {
  return stats.baseSpread + stats.movingSpread * moveFrac + Math.min(recoil, stats.maxRecoil);
}

/** Deterministic offset within ± spread for one shot ([E10]). */
export function spreadOffset(key: string, spread: number): number {
  return spread > 0 ? (hash01(key) * 2 - 1) * spread : 0;
}

// ---------- MG mount ----------

/** Ticks to mount the MG. */
export function mountTicksNeeded(t: Tuning): number {
  return Math.max(1, secondsToTicks(t.mg.mountSeconds));
}

/** The cover piece a soldier at `p` could brace on: the nearest it can fire over (ties by id). */
export function braceCover(world: World, p: Vec2): CoverPiece | null {
  let best: CoverPiece | null = null;
  let bestD = Infinity;
  for (const c of world.cover) {
    if (!canFireOver(p, c, c.bullet, world.tuning)) continue;
    const d = distanceToRect(p, c.rect);
    if (d < bestD || (d === bestD && best && c.id < best.id)) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** Mounted (fully set up) on cover? */
export function isMounted(world: World, s: SoldierState): boolean {
  return s.braceId !== null && s.mountTicks >= mountTicksNeeded(world.tuning);
}

/** Mounted and aiming across the braced cover: the MG's mounted bonus applies. */
export function mountBonus(world: World, s: SoldierState, aim: number): boolean {
  if (!isMounted(world, s)) return false;
  const piece = world.cover.find((c) => c.id === s.braceId);
  if (!piece) return false;
  const t = rayRect(s, fromAngle(aim), piece.rect);
  return t !== null && t <= world.tuning.mg.braceReach;
}

/** One tick of mounting for an MG soldier: still + next to cover fills it, anything else resets. */
function stepMount(world: World, s: SoldierState, input: SoldierInput): void {
  const still = input.move.x === 0 && input.move.y === 0 && s.moveFrac === 0;
  const cover = still ? braceCover(world, s) : null;
  if (!cover) {
    s.mountTicks = 0;
    s.braceId = null;
    return;
  }
  if (s.braceId !== cover.id) {
    s.braceId = cover.id;
    s.mountTicks = 0;
  }
  s.mountTicks = Math.min(s.mountTicks + 1, mountTicksNeeded(world.tuning));
}

/** The spread numbers in effect for this soldier's gun, aiming at `aim`. */
export function effectiveSpread(
  world: World,
  s: SoldierState,
  gun: GunKind,
  aim: number,
): GunSpread {
  const g = gunTuning(world.tuning, gun);
  if (gun === 'mg' && mountBonus(world, s, aim)) return { ...g, ...world.tuning.mg.mounted };
  return g;
}

/** Current ± spread (radians) of a soldier's weapon at `aim`: what the reticle shows ([D39]). */
export function currentSpread(world: World, s: SoldierState, aim: number): number {
  const gun = gunOf(s);
  if (!gun) return world.tuning.grenade.movingSpread * s.moveFrac;
  return spreadOf(effectiveSpread(world, s, gun, aim), s.moveFrac, s.recoil);
}

// ---------- firing ----------

/**
 * Fires a soldier's gun from `from` at exactly `angle` (no spread here). THE way soldier shots
 * enter the sim: live fire passes its spread-rolled angle, echoes pass the recorded one ([E1]).
 */
export function fireGun(
  world: World,
  shooterId: string,
  from: Vec2,
  angle: number,
  gun: GunKind = 'rifle',
): ShotResult {
  const g = gunTuning(world.tuning, gun);
  return fireShot(world, {
    by: shooterId,
    team: 'player',
    from: { x: from.x, y: from.y },
    angle,
    range: g.range,
    damage: g.damage,
    cause: gun,
  });
}

/** Gun cooldown in ticks. */
export function gunCooldownTicks(t: Tuning, gun: GunKind): number {
  return Math.max(1, secondsToTicks(gunTuning(t, gun).cooldownSeconds));
}

/**
 * Live-fire wrapper: if the gun is off cooldown, rolls the spread, fires, and adds recoil.
 * Returns null if it couldn't fire.
 */
export function trySoldierFire(world: World, s: SoldierState, aim: number): ShotResult | null {
  const gun = gunOf(s) ?? 'rifle';
  if (!isEligible(s) || world.state.tick < s.nextFireTick) return null;
  const stats = effectiveSpread(world, s, gun, aim);
  const spread = spreadOf(stats, s.moveFrac, s.recoil);
  const angle = aim + spreadOffset(`${s.id}@${world.state.tick}:aim`, spread);
  s.nextFireTick = world.state.tick + gunCooldownTicks(world.tuning, gun);
  s.recoil = Math.min(stats.maxRecoil, s.recoil + stats.kick);
  return fireGun(world, s.id, s, angle, gun);
}

/** One live tick of a gun-carrying soldier: recoil recovery, MG mount, then fire if held. */
export function stepGunner(world: World, s: SoldierState, input: SoldierInput, gun: GunKind): void {
  s.recoil = recoverRecoil(s.recoil, gunTuning(world.tuning, gun));
  if (gun === 'mg') stepMount(world, s, input);
  if (input.fire) trySoldierFire(world, s, input.aim);
}
