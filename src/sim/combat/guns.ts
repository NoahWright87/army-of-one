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
 *
 * (PHASE12-a) Sniper set-up ([D59]): standing still fills the set-up over `sniper.setupSeconds`
 * with or without cover (the same `mountTicks`), and swaps the pistol for the rifle. Set up next
 * to non-solid cover and firing across it: spread × `coverSpreadMultiplier`, range ×
 * `coverRangeMultiplier`. The range bonus is worked out from the shooter's position and angle,
 * so an echo replaying the shot gets the same range.
 * Shotgun ([D61]): each pellet is its own shot, at its own hashed angle, and is recorded as one.
 */
import type { GunSpread, Tuning } from '../../content/tuning';
import { roleDef } from '../../content/roles';
import { hash01 } from '../core/hash';
import { DT, secondsToTicks } from '../core/time';
import { fromAngle, type Vec2 } from '../core/vec';
import {
  isEligible,
  teamOf,
  type SoldierInput,
  type SoldierState,
  type SoldierTeam,
} from '../entities/soldier';
import type { World } from '../state';
import { rayRect } from '../world/collision';
import { canFireOver, distanceToRect, standingCover, type CoverPiece } from '../world/cover';
import { fireShot, type ShotResult } from './shots';

export type GunKind = 'rifle' | 'mg' | 'pistol' | 'sniper' | 'shotgun';

/**
 * The gun a soldier fires right now, or null (the Grenadier throws, the Bazooka launches). A
 * Sniper fires its pistol until it's set up ([D59]); without `tuning` it counts as not set up.
 */
export function gunOf(s: SoldierState, tuning?: Tuning): GunKind | null {
  const w = roleDef(s.roleId).weapon;
  if (w === 'sniper') return tuning && isSetUp(tuning, s) ? 'sniper' : 'pistol';
  return w === 'rifle' || w === 'mg' || w === 'pistol' || w === 'shotgun' ? w : null;
}

interface GunStats extends GunSpread {
  damage: number;
  range: number;
  cooldownSeconds: number;
}

function gunTuning(t: Tuning, gun: GunKind): GunStats {
  switch (gun) {
    case 'mg':
      return t.mg;
    case 'pistol':
      return t.pistol;
    case 'sniper':
      return t.sniper;
    case 'shotgun':
      return { ...t.shotgun, damage: t.shotgun.pelletDamage };
    default:
      return t.rifle;
  }
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

/** Ticks to mount the MG, or (PHASE12-a) to set up a Sniper's rifle ([D59]). */
export function mountTicksNeeded(t: Tuning, roleId?: SoldierState['roleId']): number {
  const secs = roleDef(roleId).weapon === 'sniper' ? t.sniper.setupSeconds : t.mg.mountSeconds;
  return Math.max(1, secondsToTicks(secs));
}

/** (PHASE12-a) A Sniper with its rifle up ([D59]). */
export function isSetUp(t: Tuning, s: SoldierState): boolean {
  return roleDef(s.roleId).weapon === 'sniper' && s.mountTicks >= mountTicksNeeded(t, s.roleId);
}

/**
 * (PHASE12-a) Firing from `from` at `angle` across non-solid cover right next to it (within
 * `reach` along the ray)? Position-based, so live shots and echoes agree.
 */
export function firesAcrossCover(world: World, from: Vec2, angle: number, reach: number): boolean {
  const piece = braceCover(world, from);
  if (!piece) return false;
  const t = rayRect(from, fromAngle(angle), piece.rect);
  return t !== null && t <= reach;
}

/** The cover piece a soldier at `p` could brace on: the nearest it can fire over (ties by id). */
export function braceCover(world: World, p: Vec2): CoverPiece | null {
  let best: CoverPiece | null = null;
  let bestD = Infinity;
  for (const c of standingCover(world)) {
    if (!canFireOver(p, c, c.bullet, world.tuning)) continue;
    const d = distanceToRect(p, c.rect);
    if (d < bestD || (d === bestD && best && c.id < best.id)) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** Mounted (fully set up) on cover? (PHASE12-a) A Sniper: set up and braced on cover. */
export function isMounted(world: World, s: SoldierState): boolean {
  return s.braceId !== null && s.mountTicks >= mountTicksNeeded(world.tuning, s.roleId);
}

/**
 * Mounted and aiming across the braced cover: the MG's mounted bonus applies. (PHASE12-a) For
 * a Sniper, the cover bonus ([D59]).
 */
export function mountBonus(world: World, s: SoldierState, aim: number): boolean {
  if (!isMounted(world, s)) return false;
  const piece = standingCover(world).find((c) => c.id === s.braceId);
  if (!piece) return false;
  const reach =
    roleDef(s.roleId).weapon === 'sniper'
      ? world.tuning.sniper.braceReach
      : world.tuning.mg.braceReach;
  const t = rayRect(s, fromAngle(aim), piece.rect);
  return t !== null && t <= reach;
}

/**
 * One tick of mounting. MG: still + next to cover fills it, anything else resets. (PHASE12-a)
 * Sniper: still fills it with or without cover; `braceId` is the cover it's braced on, if any.
 */
function stepMount(world: World, s: SoldierState, input: SoldierInput): void {
  const still = input.move.x === 0 && input.move.y === 0 && s.moveFrac === 0;
  const sniper = roleDef(s.roleId).weapon === 'sniper';
  const cover = still ? braceCover(world, s) : null;
  if (sniper) {
    if (!still) {
      s.mountTicks = 0;
      s.braceId = null;
      return;
    }
    s.braceId = cover?.id ?? null;
    s.mountTicks = Math.min(s.mountTicks + 1, mountTicksNeeded(world.tuning, s.roleId));
    return;
  }
  if (!cover) {
    s.mountTicks = 0;
    s.braceId = null;
    return;
  }
  if (s.braceId !== cover.id) {
    s.braceId = cover.id;
    s.mountTicks = 0;
  }
  s.mountTicks = Math.min(s.mountTicks + 1, mountTicksNeeded(world.tuning, s.roleId));
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
  if (gun === 'sniper' && mountBonus(world, s, aim)) {
    return { ...g, baseSpread: g.baseSpread * world.tuning.sniper.coverSpreadMultiplier };
  }
  return g;
}

/** Current ± spread (radians) of a soldier's weapon at `aim`: what the reticle shows ([D39]). */
export function currentSpread(world: World, s: SoldierState, aim: number): number {
  const gun = gunOf(s, world.tuning);
  if (!gun) {
    // (PHASE12-a) The Bazooka's rocket cone.
    if (roleDef(s.roleId).weapon === 'rocket') return spreadOf(world.tuning.rocket, s.moveFrac, 0);
    return world.tuning.grenade.movingSpread * s.moveFrac;
  }
  return spreadOf(effectiveSpread(world, s, gun, aim), s.moveFrac, s.recoil);
}

/** (PHASE12-a) A gun's reach from `from` at `angle` (the Sniper's cover range bonus, [D59]). */
export function gunRange(world: World, gun: GunKind, from: Vec2, angle: number): number {
  const t = world.tuning;
  if (gun === 'sniper' && firesAcrossCover(world, from, angle, t.sniper.braceReach)) {
    return t.sniper.range * t.sniper.coverRangeMultiplier;
  }
  return gunTuning(t, gun).range;
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
  team: SoldierTeam = 'player',
  /** (PHASE12-a) Shotgun pellet index within the shot (cover roll key). */
  pellet?: number,
): ShotResult {
  const g = gunTuning(world.tuning, gun);
  return fireShot(world, {
    by: shooterId,
    team,
    from: { x: from.x, y: from.y },
    angle,
    range: gunRange(world, gun, from, angle),
    damage: g.damage,
    cause: gun,
    weapon: gun,
    ...(gun === 'shotgun' ? { falloffTo: world.tuning.shotgun.falloffTo } : {}),
    ...(pellet !== undefined ? { coverKey: `${shooterId}@${world.state.tick}:p${pellet}` } : {}),
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
  const gun = gunOf(s, world.tuning) ?? 'rifle';
  if (!isEligible(s) || world.state.tick < s.nextFireTick) return null;
  const stats = effectiveSpread(world, s, gun, aim);
  const spread = spreadOf(stats, s.moveFrac, s.recoil);
  const angle = aim + spreadOffset(`${s.id}@${world.state.tick}:aim`, spread);
  s.nextFireTick = world.state.tick + gunCooldownTicks(world.tuning, gun);
  s.recoil = Math.min(stats.maxRecoil, s.recoil + stats.kick);
  if (gun !== 'shotgun') return fireGun(world, s.id, s, angle, gun, teamOf(s));
  // (PHASE12-a) Shotgun ([D61]): every pellet at its own hashed angle around the aim.
  const sg = world.tuning.shotgun;
  let last: ShotResult | null = null;
  for (let i = 0; i < Math.max(1, Math.floor(sg.pellets)); i++) {
    const a = angle + spreadOffset(`${s.id}@${world.state.tick}:p${i}`, sg.pelletSpread);
    last = fireGun(world, s.id, s, a, gun, teamOf(s), i);
  }
  return last;
}

/** One live tick of a gun-carrying soldier: recoil recovery, MG mount, then fire if held. */
export function stepGunner(world: World, s: SoldierState, input: SoldierInput, gun: GunKind): void {
  s.recoil = recoverRecoil(s.recoil, gunTuning(world.tuning, gun));
  const w = roleDef(s.roleId).weapon;
  if (w === 'mg' || w === 'sniper') stepMount(world, s, input);
  // A Sniper that just set up fires its rifle on this very tick.
  const now = gunOf(s, world.tuning) ?? gun;
  if (now !== gun) s.recoil = recoverRecoil(s.recoil, gunTuning(world.tuning, now));
  if (input.fire) trySoldierFire(world, s, input.aim);
}
