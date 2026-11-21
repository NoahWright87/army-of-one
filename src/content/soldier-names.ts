/**
 * Soldiers' names and ranks (PLACEHOLDER copy). Every soldier gets a surname and a rank that
 * suits their role, picked from their id, so the same soldier keeps the same name every time
 * they appear (live, as an echo, in a replay).
 *
 * Speech lines use them as variables: `{name}` "Ramirez", `{rank}` "Sergeant", `{rankShort}`
 * "Sarge", `{rankAbbr}` "Sgt.", `{full}` "Sgt. Ramirez"; about someone else (who died, who saved
 * you) the same with a `their` prefix: `{theirName}`, `{theirRankShort}`, … Lookups ignore case,
 * so `{RankShort}` works too.
 *
 * Plain data + pure functions (no randomness: everything is hashed from the id).
 */
import type { RoleId } from '../contracts/mission';

export interface Rank {
  full: string;
  abbr: string;
  /** What soldiers call each other in a hurry. */
  short: string;
}

export const RANKS = {
  pvt: { full: 'Private', abbr: 'Pvt.', short: 'Private' },
  spc: { full: 'Specialist', abbr: 'Spc.', short: 'Spec' },
  cpl: { full: 'Corporal', abbr: 'Cpl.', short: 'Corp' },
  sgt: { full: 'Sergeant', abbr: 'Sgt.', short: 'Sarge' },
  ssg: { full: 'Staff Sergeant', abbr: 'SSgt.', short: 'Sarge' },
  lt: { full: 'Lieutenant', abbr: 'Lt.', short: 'LT' },
  cpt: { full: 'Captain', abbr: 'Capt.', short: "Cap'n" },
} as const satisfies Record<string, Rank>;

export type RankId = keyof typeof RANKS;

/** Ranks each role is drawn from (repeats weight the pick), like a real unit's make-up. */
export const ROLE_RANKS: Record<RoleId, readonly RankId[]> = {
  rifleman: ['pvt', 'pvt', 'pvt', 'spc', 'cpl'],
  grenadier: ['pvt', 'spc', 'cpl'],
  gunner: ['cpl', 'cpl', 'sgt'],
  sniper: ['spc', 'sgt'],
  shield: ['sgt', 'ssg'],
  shotgun: ['pvt', 'cpl'],
  bazooka: ['spc', 'cpl'],
  truck: ['cpl', 'sgt'],
  tank: ['sgt', 'lt', 'cpt'],
};

export const SURNAMES = [
  'Ramirez', 'Johnson', 'Okafor', 'Novak', 'Kowalski', 'Nguyen', 'Murphy', 'Haddad', 'Silva',
  'Tanaka', 'Becker', 'Duarte', 'Ivanova', 'Brooks', 'Mensah', 'Rossi', 'Lindqvist', 'Park',
  'Delgado', 'Fischer', "O'Neil", 'Castillo', 'Abara', 'Dubois', 'Yilmaz', 'Petrov', 'Hughes',
  'Santos', 'Kim', 'Moreau', 'Walsh', 'Adeyemi', 'Kaur', 'Jensen', 'Morales', 'Byrne', 'Sato',
  'Marsh', 'Vargas', 'Horvat', 'Quinn', 'Mbeki', 'Larsen', 'Reyes', 'Costa', 'Hale', 'Diaz',
  'Kovac', 'Price', 'Ortiz', 'Shah', 'Wolfe', 'Doyle', 'Reid', 'Chavez', 'Ito', 'Baker',
  'Stone', 'Banks', 'Cruz',
] as const; // prettier-ignore

export interface SoldierIdentity {
  name: string;
  rank: Rank;
}

/** FNV-1a: a stable 32-bit hash of a string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The name and rank of a soldier. `salt` lets a mission shuffle the roster (default none). */
export function soldierIdentity(
  id: string,
  roleId: RoleId = 'rifleman',
  salt = '',
): SoldierIdentity {
  const h = hashString(salt + '|' + id);
  const ranks = ROLE_RANKS[roleId] ?? ROLE_RANKS.rifleman;
  const rankId = ranks[(h >>> 16) % ranks.length]!;
  return { name: SURNAMES[h % SURNAMES.length]!, rank: RANKS[rankId] };
}

/** Variables for speech lines (see the module comment). */
export function identityVars(
  self: SoldierIdentity,
  them?: SoldierIdentity,
): Record<string, string> {
  const out: Record<string, string> = {
    name: self.name,
    rank: self.rank.full,
    rankShort: self.rank.short,
    rankAbbr: self.rank.abbr,
    full: `${self.rank.abbr} ${self.name}`,
  };
  if (them) {
    out.theirName = them.name;
    out.theirRank = them.rank.full;
    out.theirRankShort = them.rank.short;
    out.theirRankAbbr = them.rank.abbr;
    out.theirFull = `${them.rank.abbr} ${them.name}`;
  }
  return out;
}

/** Fills `{var}` slots, ignoring case. Unknown slots stay visible. */
export function fillVars(
  template: string,
  vars: Readonly<Record<string, string | number>>,
): string {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) lower[k.toLowerCase()] = String(v);
  return template.replace(/\{(\w+)\}/g, (m, k: string) => lower[k.toLowerCase()] ?? m);
}
