/**
 * (PHASE12-b) One armor rule for everything that takes damage ([D70]):
 *
 *   damage taken = hit × (1 − max(0, armor from that direction − the weapon's pierce))
 *
 * Armor is a share (0..1) and can differ by direction: front / side / rear, relative to the
 * target's facing (a Shield's 135° front, a tank's weaker rear). Pierce is a share per damage
 * kind (a sniper 5 %, a rocket 50 %, being run over 100 %). No other special cases.
 *
 * Open for later: bullets through walls would be a wall's armor plus a pierce, through this same
 * function (the walls themselves can stay unbreakable).
 */
import type { Tuning } from '../../content/tuning';
import type { RoleId } from '../../contracts/mission';
import type { Vec2 } from '../core/vec';

export interface ArmorProfile {
  front: number;
  side: number;
  rear: number;
  /** Width of the front arc, degrees, centred on the facing. */
  frontArc: number;
  /** Width of the rear arc, degrees, centred opposite the facing. */
  rearArc: number;
}

export const NO_ARMOR: ArmorProfile = { front: 0, side: 0, rear: 0, frontArc: 0, rearArc: 0 };

/** The same armor all round. */
export function uniformArmor(a: number): ArmorProfile {
  return { front: a, side: a, rear: a, frontArc: 360, rearArc: 0 };
}

/** A unit's armor, by role (`tuning.armor.roles`). */
export function roleArmor(tuning: Tuning, roleId: RoleId | undefined): ArmorProfile {
  return tuning.armor.roles[roleId ?? 'rifleman'] ?? NO_ARMOR;
}

/** A damage kind's pierce (`tuning.armor.pierce`, default 0). */
export function pierceOf(tuning: Tuning, kind: string): number {
  return tuning.armor.pierce[kind] ?? 0;
}

/**
 * The armor facing a hit from `from` on a target at `at` facing `facing`. No source (contact,
 * a collapsing bridge): the side armor.
 */
export function armorFrom(profile: ArmorProfile, at: Vec2, facing: number, from?: Vec2): number {
  if (!from) return profile.side;
  const dx = from.x - at.x;
  const dy = from.y - at.y;
  if (dx === 0 && dy === 0) return profile.side;
  const diff = Math.abs(
    Math.atan2(Math.sin(Math.atan2(dy, dx) - facing), Math.cos(Math.atan2(dy, dx) - facing)),
  );
  const deg = (diff * 180) / Math.PI;
  if (deg <= profile.frontArc / 2) return profile.front;
  if (deg >= 180 - profile.rearArc / 2) return profile.rear;
  return profile.side;
}

/** The share of a hit that gets through `armor` for a weapon with `pierce`. */
export function throughArmor(armor: number, pierce: number): number {
  return 1 - Math.max(0, Math.min(1, armor - pierce));
}

/**
 * Roughly how much of a hit from a weapon of `kind` gets through a unit of `roleId` (its side
 * armor). For target choice: the AI and auto-aim prefer targets they can actually hurt.
 */
export function damageShare(tuning: Tuning, kind: string, roleId: RoleId | undefined): number {
  return throughArmor(roleArmor(tuning, roleId).side, pierceOf(tuning, kind));
}

/** Below this share a target is "not worth shooting" while a better one is in view. */
export const WORTH_SHOOTING = 0.2;
