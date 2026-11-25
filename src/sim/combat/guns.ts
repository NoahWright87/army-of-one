/**
 * (07-c) Guns with spread and recoil ([D39]), and the Machine Gunner's mount ([D40]).
 *
 * Every shot goes out at a random angle within ± the gun's current spread:
 *   spread = baseSpread + movingSpread × moveFrac + recoil
 * Each shot adds `kick` to the shooter's recoil (capped); recoil recovers every tick. The random
 * offset is a hash of (shooter, tick) ([E10]), and the recording stores the final angle, so echoes
 * fire exactly the original shots without re-rolling anything.
 *
 * Stances (PHASE20, [D160]): a soldier steadies itself by choice. Braced on cover (any class),
 * Prone (Sniper) and Deployed (Machine Gunner) take a moment (no firing meanwhile) and then
 * tighten spread and recoil and lengthen range, the most when firing across cover ([D40]). With
 * `autoStance` (the AI, scripts, or the player's choice) the old automatic behaviour does the
 * choosing: stand still by cover (a Sniper: anywhere) and you settle in; move and you let go.
 * The range bonus follows the shooter's stance, which recordings carry, so echoes replay it.
 * Shotgun ([D61]): each pellet is its own shot, at its own hashed angle, and is recorded as one.
 */
import type { GunSpread, Tuning } from '../../content/tuning';
import type { StanceId } from '../../contracts/mission';
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
import { moveCircle, rayRect } from '../world/collision';
import { currentSolids } from '../world/blockers';
import { canFireOver, distanceToRect, standingCover } from '../world/cover';
import { trenchAt, trenchExitDistance } from '../world/concealment';
import type { Rect } from '../world/map';
import { fireShot, type ShotResult } from './shots';

export type GunKind = 'rifle' | 'mg' | 'pistol' | 'sniper' | 'shotgun';

/**
 * The gun a soldier fires right now, or null (the Grenadier throws, the Bazooka launches). A
 * Sniper fires its rifle, or its pistol while that's the one out ([D59], [D160]).
 */
export function gunOf(s: SoldierState, _tuning?: Tuning): GunKind | null {
  const w = roleDef(s.roleId).weapon;
  if (w === 'sniper') return s.sidearm ? 'pistol' : 'sniper';
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

/** (PHASE17) The arena's per-fight salt for spread rolls ([D142]); '' everywhere else. */
export function spreadSalt(world: World): string {
  return world.map.aiSeed !== undefined ? `${world.map.aiSeed}/` : '';
}

/** Deterministic offset within ± spread for one shot ([E10]). */
export function spreadOffset(key: string, spread: number): number {
  return spread > 0 ? (hash01(key) * 2 - 1) * spread : 0;
}

// ---------- stances ----------

/** The stance this class takes when it isn't told which (what its `mountTicksNeeded` means). */
function ownStance(role?: SoldierState['roleId']): StanceId {
  const w = roleDef(role).weapon;
  return w === 'sniper' ? 'prone' : w === 'mg' ? 'deployed' : 'braced';
}

/**
 * Ticks to settle into a stance (PHASE20: per class and stance, [D160]): braced (default
 * `brace.seconds`, per class in `brace.secondsByRole`), prone (`sniper.setupSeconds`), deployed
 * (`mg.mountSeconds`). Without a stance: the class's own.
 */
export function mountTicksNeeded(
  t: Tuning,
  roleId?: SoldierState['roleId'],
  stance?: StanceId,
): number {
  const st = stance ?? ownStance(roleId);
  const secs =
    st === 'prone'
      ? t.sniper.setupSeconds
      : st === 'deployed'
        ? t.mg.mountSeconds
        : (t.brace.secondsByRole[roleId ?? 'rifleman'] ?? t.brace.seconds);
  return Math.max(1, secondsToTicks(secs));
}

/** (PHASE20) The stance this soldier has settled into (all the way), or undefined. */
export function settledStance(s: SoldierState): StanceId | undefined {
  return s.settled;
}

/** (PHASE12-a) A Sniper settled into a stance ([D59]): prone, or braced on cover. */
export function isSetUp(_t: Tuning, s: SoldierState): boolean {
  return roleDef(s.roleId).weapon === 'sniper' && s.settled !== undefined;
}

/**
 * (PHASE20) Can't fire right now: still settling into a stance, or swapping weapons. For every
 * class and weapon ([D160]).
 */
export function isSettling(world: World, s: SoldierState): boolean {
  if (s.stance !== undefined && s.settled === undefined) return true;
  return s.swapUntil !== undefined && world.state.tick < s.swapUntil;
}

/** Swap progress 0..1 while swapping weapons, else null. */
export function swapProgress(world: World, s: SoldierState): number | null {
  if (s.swapUntil === undefined || world.state.tick >= s.swapUntil) return null;
  const total = Math.max(1, secondsToTicks(world.tuning.stance.swapSeconds));
  return Math.max(0, Math.min(1, 1 - (s.swapUntil - world.state.tick) / total));
}

const CARDINALS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

interface BraceSurface {
  id: string;
  rect: Rect;
  rim?: true;
}

function aimsAcross(
  world: World,
  from: Vec2,
  angle: number,
  reach: number,
  piece: BraceSurface,
): boolean {
  const dir = fromAngle(angle);
  const distance = piece.rim
    ? trenchExitDistance(world.map.concealment, from, dir, reach)
    : rayRect(from, dir, piece.rect);
  return distance !== null && distance <= reach;
}

/**
 * (PHASE12-a) Firing from `from` at `angle` across non-solid cover right next to it (within
 * `reach` along the ray)? Position-based, so live shots and echoes agree.
 */
export function firesAcrossCover(world: World, from: Vec2, angle: number, reach: number): boolean {
  const piece = braceCover(world, from, { angle, reach });
  return piece !== null && aimsAcross(world, from, angle, reach, piece);
}

/** Find nearby cover. From inside a trench, prefer the cover the gun is aiming over. */
export function braceCover(
  world: World,
  p: Vec2,
  aim?: { angle: number; reach: number },
): BraceSurface | null {
  const trench = trenchAt(world.map.concealment, p);
  let best: BraceSurface | null = null;
  let bestDistance = Infinity;
  let bestAimed = false;
  const consider = (surface: BraceSurface, distance: number) => {
    const aimed = !!(trench && aim && aimsAcross(world, p, aim.angle, aim.reach, surface));
    if (
      !best ||
      (aimed && !bestAimed) ||
      (aimed === bestAimed &&
        (distance < bestDistance || (distance === bestDistance && surface.id < best.id)))
    ) {
      best = surface;
      bestDistance = distance;
      bestAimed = aimed;
    }
  };
  // Prefer actual cover in the line of fire even when the trench lip is closer.
  for (const cover of standingCover(world)) {
    if (canFireOver(p, cover, cover.bullet, world.tuning)) {
      consider(cover, distanceToRect(p, cover.rect));
    }
  }
  if (trench) {
    const limit = world.tuning.cover.fireOverDistance;
    const depth = Math.min(
      ...CARDINALS.map((dir) => trenchExitDistance(world.map.concealment, p, dir, limit)),
    );
    if (depth <= world.tuning.cover.fireOverDistance) {
      const rim = { id: trench.id, rect: trench.rect, rim: true } as const;
      // Sandbags may sit just beyond the lip. Retain them if they already give the bonus.
      if (!bestAimed) consider(rim, depth);
    }
  }
  return best;
}

function braceReach(tuning: Tuning, role: SoldierState['roleId']): number {
  const weapon = roleDef(role).weapon;
  if (weapon === 'sniper') return tuning.sniper.braceReach;
  if (weapon === 'mg') return tuning.mg.braceReach;
  return tuning.brace.reach;
}

/** Settled on cover (braced, or deployed on it): the soldier is snapped to it. */
export function isMounted(_world: World, s: SoldierState): boolean {
  return s.settled !== undefined && s.braceId !== null;
}

/** The cover piece (or trench rim) a soldier is braced on. */
function bracedPiece(world: World, s: SoldierState): BraceSurface | undefined {
  if (s.braceId === null) return undefined;
  const trench = trenchAt(world.map.concealment, s);
  return trench?.id === s.braceId
    ? { id: trench.id, rect: trench.rect, rim: true }
    : standingCover(world).find((c) => c.id === s.braceId);
}

/** Firing from `s` at `aim` across cover right by it. */
function acrossCover(world: World, s: SoldierState, aim: number): boolean {
  // Position and aim only (no `braceId`), so an echo agrees with its live self.
  return firesAcrossCover(world, s, aim, braceReach(world.tuning, s.roleId));
}

/**
 * (PHASE20) How much of the full stance bonus applies, 0..1 ([D160]): braced, only firing across
 * its cover (1); Prone, always a share (`stance.noCoverShare`); Deployed, the whole of it
 * across cover and a share where there's no cover at all. Covers spread, recoil and range.
 */
export function stanceBonus(world: World, s: SoldierState, aim: number): number {
  const st = s.settled;
  if (!st) return 0;
  const share = world.tuning.stance.noCoverShare;
  if (st === 'prone') return share.prone;
  const across = acrossCover(world, s, aim);
  if (st === 'braced') return across ? 1 : 0;
  // Deployed: across cover the whole bonus; by cover but aiming off it, none ([D40]); with no
  // cover at all, a share.
  if (across) return 1;
  return braceCover(world, s, { angle: aim, reach: braceReach(world.tuning, s.roleId) })
    ? 0
    : share.deployed;
}

/**
 * Settled and aiming across the braced cover: the full cover bonus applies ([D40], [D59]).
 */
export function mountBonus(world: World, s: SoldierState, aim: number): boolean {
  return stanceBonus(world, s, aim) >= 1;
}

/** The direction from the soldier across its cover (toward the cover's nearest point), if any. */
export function braceAim(world: World, s: SoldierState): number | null {
  const piece = bracedPiece(world, s);
  if (!piece) return null;
  const r = piece.rect;
  const px = Math.max(r.x, Math.min(r.x + r.w, s.x));
  const py = Math.max(r.y, Math.min(r.y + r.h, s.y));
  if (px === s.x && py === s.y) return null;
  return Math.atan2(py - s.y, px - s.x);
}

/**
 * (PHASE20) Slides a soldier braced on cover up to its edge ([D160]): `stance.snapSpeed` units a
 * second, never into a wall. Trench rims stay where they are.
 */
function snapToCover(world: World, s: SoldierState): void {
  const piece = bracedPiece(world, s);
  if (!piece || piece.rim) return;
  const r = piece.rect;
  const px = Math.max(r.x, Math.min(r.x + r.w, s.x));
  const py = Math.max(r.y, Math.min(r.y + r.h, s.y));
  const d = Math.hypot(px - s.x, py - s.y);
  const gap = world.tuning.soldier.wallRadius + world.tuning.stance.snapGap;
  if (d <= gap + 0.01) return;
  const step = Math.min(world.tuning.stance.snapSpeed * DT, d - gap);
  const next = moveCircle(
    s,
    { x: ((px - s.x) / d) * step, y: ((py - s.y) / d) * step },
    world.tuning.soldier.wallRadius,
    currentSolids(world),
  );
  s.x = next.x;
  s.y = next.y;
}

const standUp = (s: SoldierState): void => {
  delete s.stance;
  delete s.settled;
  s.mountTicks = 0;
  s.braceId = null;
};

/**
 * One tick of stance and weapon choice ([D40], [D59], [D158], PHASE20 [D160]).
 * - Manual (the player's default): a stance press settles into the class's stance (braced on
 *   cover; Deployed for the Machine Gunner, cover or not; Prone for the Sniper with no cover)
 *   or, in one, stands up. Moving lets go of a braced or deployed stance; sprinting of any;
 *   prone crawls.
 * - `autoStance`: standing still settles in by itself (cover, or a Sniper anywhere); moving
 *   lets go.
 * - A Sniper's pistol ↔ rifle swap: on the weapon button, or (`autoWeapon`) the rifle while
 *   settled and the pistol otherwise. A swap takes `stance.swapSeconds` without firing.
 */
export function stepStance(world: World, s: SoldierState, input: SoldierInput): void {
  const t = world.tuning;
  const w = roleDef(s.roleId).weapon;
  const first = s.swapHeld === undefined;
  const pressed = !!input.stance && !s.stanceHeld;
  const swapPressed = !!input.swap && !s.swapHeld;
  s.stanceHeld = !!input.stance;
  s.swapHeld = !!input.swap;
  if (s.trenchClimb || s.ladderClimb) {
    standUp(s);
    return;
  }
  const auto = input.autoStance ?? true;
  const walking = input.move.x !== 0 || input.move.y !== 0;
  const moving = walking || s.moveFrac > 0;
  const sprint = !!input.sprint && moving;
  const cover = braceCover(world, s, { angle: input.aim, reach: braceReach(t, s.roleId) });

  if (s.stance) {
    const letGo = auto ? sprint || moving : sprint || (s.stance !== 'prone' && walking) || pressed;
    if (letGo || (s.stance === 'braced' && !cover)) standUp(s);
  } else if (auto ? !moving : pressed) {
    const target: StanceId | undefined =
      w === 'mg' && (!auto || cover)
        ? 'deployed'
        : cover
          ? 'braced'
          : w === 'sniper'
            ? 'prone'
            : undefined;
    if (target) {
      s.stance = target;
      s.mountTicks = 0;
      s.braceId = target === 'prone' ? null : (cover?.id ?? null);
    }
  }

  if (s.stance) {
    const need = mountTicksNeeded(t, s.roleId, s.stance);
    s.mountTicks = Math.min(s.mountTicks + 1, need);
    if (s.stance === 'braced' && cover) s.braceId = cover.id;
    if (s.braceId !== null && !bracedPiece(world, s)) {
      if (s.stance === 'braced') standUp(s);
      else s.braceId = null;
    }
    if (s.stance && s.braceId !== null) snapToCover(world, s);
    if (s.stance && s.mountTicks >= need) s.settled = s.stance;
  }

  if (w === 'sniper') {
    const autoWeapon = input.autoWeapon ?? true;
    const want = autoWeapon ? s.settled === undefined : swapPressed !== !!s.sidearm;
    if (want !== !!s.sidearm) {
      if (want) s.sidearm = true;
      else delete s.sidearm;
      // The very first look at an auto soldier just picks the gun it should have.
      if (!(first && autoWeapon))
        s.swapUntil = world.state.tick + Math.max(1, secondsToTicks(t.stance.swapSeconds));
    }
  }
}

/** The spread numbers in effect for this soldier's gun, aiming at `aim`. */
export function effectiveSpread(
  world: World,
  s: SoldierState,
  gun: GunKind,
  aim: number,
): GunSpread {
  const g = gunTuning(world.tuning, gun);
  const share = stanceBonus(world, s, aim);
  if (share <= 0) return g;
  if (gun === 'mg') {
    const m = world.tuning.mg.mounted;
    const mix = (a: number, b: number) => a + (b - a) * share;
    return {
      ...g,
      baseSpread: mix(g.baseSpread, m.baseSpread),
      kick: mix(g.kick, m.kick),
      maxRecoil: mix(g.maxRecoil, m.maxRecoil),
    };
  }
  if (gun === 'sniper') {
    const m = 1 - share * (1 - world.tuning.sniper.coverSpreadMultiplier);
    return { ...g, baseSpread: g.baseSpread * m };
  }
  // (PHASE18) Braced on cover, any other gun ([D158]).
  const m = 1 - share * (1 - world.tuning.brace.spreadMultiplier);
  return { ...g, baseSpread: g.baseSpread * m, kick: g.kick * m };
}

/** Current ± spread (radians) of a soldier's weapon at `aim`: what the reticle shows ([D39]). */
export function currentSpread(world: World, s: SoldierState, aim: number): number {
  const gun = gunOf(s, world.tuning);
  if (!gun) {
    // (PHASE12-a) The Bazooka's rocket cone; (PHASE20) steadier braced.
    const w = roleDef(s.roleId).weapon;
    if (w === 'rocket' || w === 'shell') {
      return spreadOf(world.tuning[w], s.moveFrac, 0) * rocketSteadiness(world, s, aim);
    }
    return world.tuning.grenade.movingSpread * s.moveFrac;
  }
  return spreadOf(effectiveSpread(world, s, gun, aim), s.moveFrac, s.recoil);
}

/** (PHASE20) × the rocket cone: braced on cover tightens it like any gun's base spread. */
export function rocketSteadiness(world: World, s: SoldierState, aim: number): number {
  return 1 - stanceBonus(world, s, aim) * (1 - world.tuning.brace.spreadMultiplier);
}

/**
 * A gun's reach from `from` at `angle` (the Sniper's cover range bonus, [D59]; the Machine
 * Gunner's, PHASE18 [D158]). (PHASE20) Follows the shooter's stance ([D160]): the full bonus
 * across cover, a share prone or deployed without. With no `shooter`, the plain range.
 */
export function gunRange(
  world: World,
  gun: GunKind,
  from: Vec2,
  angle: number,
  shooter?: SoldierState,
): number {
  const t = world.tuning;
  const base = gunTuning(t, gun).range;
  if (!shooter || (gun !== 'sniper' && gun !== 'mg')) return base;
  const bonus = (gun === 'sniper' ? t.sniper : t.mg).coverRangeMultiplier - 1;
  return base * (1 + bonus * stanceBonus(world, { ...shooter, x: from.x, y: from.y }, angle));
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
  /** (PHASE20) The shooter, for its stance's range bonus ([D160]). */
  shooter?: SoldierState,
): ShotResult {
  const g = gunTuning(world.tuning, gun);
  return fireShot(world, {
    by: shooterId,
    team,
    from: { x: from.x, y: from.y },
    angle,
    range: gunRange(world, gun, from, angle, shooter),
    damage: g.damage,
    cause: gun,
    weapon: gun,
    ...(gun === 'shotgun' ? { falloffTo: world.tuning.shotgun.falloffTo } : {}),
    // (PHASE17) Bullets fly ([D145]).
    ...(world.tuning.bullets.enabled
      ? {
          speed: world.tuning.bullets.speed[gun],
          // (PHASE17) Past its range it slows and weakens, then lands ([D146]).
          drag: world.tuning.bullets.drag[gun],
          minSpeedShare: world.tuning.bullets.minSpeedShare,
        }
      : {}),
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
  const angle = aim + spreadOffset(`${spreadSalt(world)}${s.id}@${world.state.tick}:aim`, spread);
  s.nextFireTick = world.state.tick + gunCooldownTicks(world.tuning, gun);
  s.recoil = Math.min(stats.maxRecoil, s.recoil + stats.kick);
  if (gun !== 'shotgun') {
    return fireGun(world, s.id, s, angle, gun, teamOf(s), undefined, s);
  }
  // (PHASE12-a) Shotgun ([D61]): every pellet at its own hashed angle around the aim.
  const sg = world.tuning.shotgun;
  let last: ShotResult | null = null;
  for (let i = 0; i < Math.max(1, Math.floor(sg.pellets)); i++) {
    const a =
      angle +
      spreadOffset(`${spreadSalt(world)}${s.id}@${world.state.tick}:p${i}`, sg.pelletSpread);
    last = fireGun(world, s.id, s, a, gun, teamOf(s), i, s);
  }
  return last;
}

/** One live tick of a gun-carrying soldier: recoil recovery, then fire if held. */
export function stepGunner(world: World, s: SoldierState, input: SoldierInput, gun: GunKind): void {
  s.recoil = recoverRecoil(s.recoil, gunTuning(world.tuning, gun));
  if (input.fire) trySoldierFire(world, s, input.aim);
}

/** (PHASE12-b) The damage kind a soldier's attacks deal now (for armor-aware target choice). */
export function attackKind(s: SoldierState, tuning: Tuning): string {
  const w = roleDef(s.roleId).weapon;
  if (w === 'grenade' || w === 'rocket' || w === 'shell') return w;
  return gunOf(s, tuning) ?? 'rifle';
}
