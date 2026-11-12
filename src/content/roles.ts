import type { RoleId } from '../contracts/mission';
import type { StringKey } from './strings';

/**
 * (07-c) Soldier roles ([D36]), (PHASE12-a) Sniper, Shield, Shotgunner, Bazooka ([D59]–[D62]): picked per new soldier on the respawn screen. No limits on how
 * many of each; every role has a spawn cost. The Rifleman is free ([D18]: you can always
 * throw another soldier in); the others are paid for from the mission's money (PHASE11).
 */
export interface RoleDef {
  id: RoleId;
  /** Key into strings.ts. */
  nameKey: StringKey;
  /** Key into strings.ts: one line for the picker. */
  blurbKey: StringKey;
  /** Spawn cost, spent at the soldier's spawn tick ([D36], [D51]). */
  cost: number;
  /**
   * What the fire button does. (PHASE12-a) 'sniper': a pistol, or the rifle once set up
   * ([D59]); 'pistol': the Shield's sidearm ([D60]); 'shotgun' ([D61]); 'rocket' ([D62]).
   */
  weapon: 'rifle' | 'grenade' | 'mg' | 'sniper' | 'pistol' | 'shotgun' | 'rocket' | 'shell';
  /** (PHASE12-b) A vehicle you drive ([D55], [D63]): its driving numbers are `tuning.drive.*`. */
  vehicle?: 'truck' | 'tank';
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
    cost: 30, // TUNE [D51]
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
    cost: 50, // TUNE [D51] (owner's example: a $50 Machine Gunner)
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
  // (PHASE12-a) [D59]–[D62]. Costs are first guesses ([D51]).
  {
    id: 'sniper',
    nameKey: 'role.sniper',
    blurbKey: 'role.sniper.blurb',
    cost: 40, // TUNE
    weapon: 'sniper',
    ai: {
      coverPreference: 0.8, // TUNE: likes cover (it steadies the rifle further)
      preferredRange: 0.85, // TUNE: fights from far away
      aggression: 0.15, // TUNE
      bravery: 1.5, // TUNE
      retreatHp: 0.45, // TUNE
      leash: 350, // TUNE
      burstTolerance: 1, // TUNE
      threat: 1.3, // TUNE
    },
  },
  {
    id: 'shield',
    nameKey: 'role.shield',
    blurbKey: 'role.shield.blurb',
    cost: 35, // TUNE
    weapon: 'pistol',
    ai: {
      coverPreference: 0.1, // TUNE: it is the cover
      preferredRange: 0.5, // TUNE
      aggression: 0.5, // TUNE
      bravery: 4, // TUNE: holds the line
      retreatHp: 0.2, // TUNE
      leash: 320, // TUNE: stays with its squad
      burstTolerance: 1.5, // TUNE
      threat: 0.7, // TUNE
    },
  },
  {
    id: 'shotgun',
    nameKey: 'role.shotgun',
    blurbKey: 'role.shotgun.blurb',
    cost: 30, // TUNE
    weapon: 'shotgun',
    ai: {
      coverPreference: 0.3, // TUNE
      preferredRange: 0.6, // TUNE: closes in
      aggression: 0.85, // TUNE
      bravery: 3, // TUNE
      retreatHp: 0.25, // TUNE
      leash: 700, // TUNE: chases
      burstTolerance: 3, // TUNE: the spread is the point
      threat: 1.2, // TUNE
    },
  },
  {
    id: 'bazooka',
    nameKey: 'role.bazooka',
    blurbKey: 'role.bazooka.blurb',
    cost: 60, // TUNE
    weapon: 'rocket',
    ai: {
      coverPreference: 0.7, // TUNE
      preferredRange: 0.8, // TUNE
      aggression: 0.3, // TUNE
      bravery: 2, // TUNE
      retreatHp: 0.35, // TUNE
      leash: 450, // TUNE
      burstTolerance: 4, // TUNE
      threat: 1.5, // TUNE: scary for vehicles later
    },
  },
  // (PHASE12-b) Vehicles ([D63]): very expensive, very powerful.
  {
    id: 'truck',
    nameKey: 'role.truck',
    blurbKey: 'role.truck.blurb',
    cost: 120, // TUNE
    weapon: 'mg',
    vehicle: 'truck',
    ai: {
      coverPreference: 0, // TUNE
      preferredRange: 0.7, // TUNE
      aggression: 0.7, // TUNE
      bravery: 4, // TUNE
      retreatHp: 0.2, // TUNE
      leash: 900, // TUNE
      burstTolerance: 2, // TUNE
      threat: 3, // TUNE
    },
  },
  {
    id: 'tank',
    nameKey: 'role.tank',
    blurbKey: 'role.tank.blurb',
    cost: 250, // TUNE
    weapon: 'shell',
    vehicle: 'tank',
    ai: {
      coverPreference: 0, // TUNE
      preferredRange: 0.75, // TUNE
      aggression: 0.5, // TUNE
      bravery: 8, // TUNE
      retreatHp: 0.15, // TUNE
      leash: 800, // TUNE
      burstTolerance: 4, // TUNE
      threat: 6, // TUNE: scary ([D46])
    },
  },
];

export function roleDef(id: RoleId | undefined): RoleDef {
  return ROLES.find((r) => r.id === id) ?? ROLES[0]!;
}

export function isRoleId(v: unknown): v is RoleId {
  return ROLES.some((r) => r.id === v);
}
