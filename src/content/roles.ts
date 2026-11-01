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
  weapon: 'rifle' | 'grenade';
}

export const DEFAULT_ROLE: RoleId = 'rifleman';

export const ROLES: readonly RoleDef[] = [
  {
    id: 'rifleman',
    nameKey: 'role.rifleman',
    blurbKey: 'role.rifleman.blurb',
    cost: 0,
    weapon: 'rifle',
  },
  {
    id: 'grenadier',
    nameKey: 'role.grenadier',
    blurbKey: 'role.grenadier.blurb',
    cost: 0, // TUNE: the costs get balanced later
    weapon: 'grenade',
  },
];

export function roleDef(id: RoleId | undefined): RoleDef {
  return ROLES.find((r) => r.id === id) ?? ROLES[0]!;
}

export function isRoleId(v: unknown): v is RoleId {
  return ROLES.some((r) => r.id === v);
}
