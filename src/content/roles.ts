import type { RoleId } from '../contracts/mission';
import type { StringKey } from './strings';

/**
 * (07-c) Soldier roles ([D36]): picked per new soldier on the respawn screen. No limits on how
 * many of each; every role has a spawn cost. The Rifleman is free; the others will cost
 * something once costs are balanced (all 0 for now, and nothing spends them yet).
 */
export interface RoleDef {
  id: RoleId;
  /** Key into strings.ts. */
  nameKey: StringKey;
  /** Key into strings.ts: one line for the picker. */
  blurbKey: StringKey;
  /** Spawn cost. Placeholder: nothing spends it yet ([D36]). */
  cost: number;
  /** What the fire button does. */
  weapon: 'rifle' | 'grenade' | 'mg';
  /** (07-d) How an AI soldier of this role behaves ([D46]). */
  ai: AiProfile;
}

/**
 * (07-d) AI personality ([D46]): the same brain runs for every role; these numbers change what
 * it prefers. All TUNE.
 */
export interface AiProfile {
  /** How much it wants cover when there's a fight (0..1). */
  coverPreference: number;
  /** Fights from this share of its weapon's range. */
  preferredRange: number;
  /** Advancing vs holding (0..1). */
  aggression: number;
  /** Danger tolerance: retreats when visible enemy threat ÷ its side's threat exceeds this. */
  bravery: number;
  /** Retreats below this share of max HP. */
  retreatHp: number;
  /** How far from its post it will chase, world units. */
  leash: number;
  /** Fires while its spread at the target is within this many target hitbox radii. */
  burstTolerance: number;
  /** Threat this unit poses to the other side (others' danger sums). */
  threat: number;
}

export const DEFAULT_ROLE: RoleId = 'rifleman';

export const ROLES: readonly RoleDef[] = [
  {
    id: 'rifleman',
    nameKey: 'role.rifleman',
    blurbKey: 'role.rifleman.blurb',
    cost: 0,
    weapon: 'rifle',
    ai: {
      coverPreference: 0.5, // TUNE
      preferredRange: 0.75, // TUNE
      aggression: 0.55, // TUNE
      bravery: 2.5, // TUNE
      retreatHp: 0.35, // TUNE
      leash: 650, // TUNE
      burstTolerance: 1.2, // TUNE
      threat: 1, // TUNE
    },
  },
  {
    id: 'grenadier',
    nameKey: 'role.grenadier',
    blurbKey: 'role.grenadier.blurb',
    cost: 0, // TUNE: the costs get balanced later
    weapon: 'grenade',
    ai: {
      coverPreference: 0.6, // TUNE
      preferredRange: 0.8, // TUNE
      aggression: 0.45, // TUNE
      bravery: 2, // TUNE
      retreatHp: 0.4, // TUNE
      leash: 550, // TUNE
      burstTolerance: 1,
      threat: 1, // TUNE
    },
  },
  {
    id: 'gunner',
    nameKey: 'role.gunner',
    blurbKey: 'role.gunner.blurb',
    cost: 0, // TUNE: the costs get balanced later
    weapon: 'mg',
    ai: {
      coverPreference: 0.95, // TUNE: seeks cover, then mounts
      preferredRange: 0.9, // TUNE
      aggression: 0.2, // TUNE: holds a position
      bravery: 3, // TUNE
      retreatHp: 0.25, // TUNE
      leash: 380, // TUNE
      burstTolerance: 1.8, // TUNE: long bursts (tight when mounted)
      threat: 1.5, // TUNE
    },
  },
];

export function roleDef(id: RoleId | undefined): RoleDef {
  return ROLES.find((r) => r.id === id) ?? ROLES[0]!;
}

export function isRoleId(v: unknown): v is RoleId {
  return ROLES.some((r) => r.id === v);
}
