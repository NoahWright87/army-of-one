/** Presentation only: weapon silhouettes and fixed-grid one-shot impacts. */
export const PROJECTILE_ART = {
  pellet: {
    key: 'projectile_pellet',
    file: 'projectiles/pellet.png',
    width: 64,
    height: 32,
    displayWidth: 9,
  },
  pistol: {
    key: 'projectile_pistol',
    file: 'projectiles/pistol.png',
    width: 96,
    height: 32,
    displayWidth: 16,
  },
  rifle: {
    key: 'projectile_rifle',
    file: 'projectiles/rifle.png',
    width: 128,
    height: 32,
    displayWidth: 24,
  },
  rocket: {
    key: 'projectile_rocket',
    file: 'projectiles/rocket.png',
    width: 192,
    height: 64,
    displayWidth: 38,
  },
  grenade: {
    key: 'projectile_grenade',
    file: 'projectiles/grenade.png',
    width: 64,
    height: 64,
    displayWidth: 12,
  },
} as const;
export type ProjectileArt = keyof typeof PROJECTILE_ART;

/** Older saved views have no weapon metadata; keep the rifle as their fallback. */
export function bulletArt(weapon?: string): 'pellet' | 'pistol' | 'rifle' {
  return weapon === 'shotgun' ? 'pellet' : weapon === 'pistol' ? 'pistol' : 'rifle';
}

export const IMPACT_SHEET = {
  key: 'fx_impact',
  file: 'effects/impact.png',
  frameWidth: 128,
  frameHeight: 128,
  columns: 6,
  rows: 4,
  frameRate: 36,
} as const;
export const impactAnimationKey = (row: number): string => `${IMPACT_SHEET.key}_row_${row}`;
export function impactFrames(row: number): number[] {
  if (!Number.isInteger(row) || row < 0 || row >= IMPACT_SHEET.rows)
    throw new Error(`Invalid impact row: ${row}`);
  return Array.from({ length: IMPACT_SHEET.columns }, (_, i) => row * IMPACT_SHEET.columns + i);
}
/** Stable presentation variation, independent of simulation RNG. Even rows dust; odd rows metal. */
export function impactRow(x: number, y: number, metal = false): number {
  const hash = (Math.imul(Math.round(x), 31) ^ Math.imul(Math.round(y), 17)) >>> 0;
  return (hash % 2) * 2 + (metal ? 1 : 0);
}
