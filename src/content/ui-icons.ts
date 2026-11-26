/** Small interface emblems, kept as vectors to match the role icon system. */
export function helmetSvg(size = 20): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 12V9a7 7 0 0114 0v3l2 1v2H1v-2z" fill="currentColor" stroke="#181b18" stroke-width="1.2" stroke-linejoin="round"/><path d="M5 9a5 5 0 015-5M4 12h12" fill="none" stroke="#fff" opacity=".35" stroke-width="1.2" stroke-linecap="round"/></svg>`;
}

/**
 * (PHASE20, [D160]) Weapon silhouettes for the weapon icon, seen from the side with the muzzle
 * pointing up (so they stand along the right edge of the screen). Placeholder art: plain shapes
 * in one colour (`fill`), drawn tall and narrow in a 24 × 64 box. Replace with real silhouettes.
 */
export type WeaponIcon =
  'rifle' | 'mg' | 'pistol' | 'sniper' | 'shotgun' | 'grenade' | 'rocket' | 'cannon';

const WEAPON_PATHS: Record<WeaponIcon, string> = {
  rifle: 'M11 1h2v30h-2zM9 28h6v18H9zM15 34h4v9h-4zM8 44h8v6l-2 12H9l-1-12zM13 28h4v4h-4z',
  sniper: 'M11 0h2v14h-2zM11 14h2v28h-2zM8 12h8v14H8zM9 38h6v10H9zM8 46h8v6l-2 10H9l-1-10z',
  pistol: 'M9 12h6v22H9zM9 32h5v22l-5 2zM14 32h3v4h-3z',
  mg: 'M11 0h2v18h-2zM8 16h8v22H8zM6 36h12v14H6zM16 40h6v10h-6zM7 50h10v12H7zM4 24h4v2H4zM16 24h4v2h-4z',
  shotgun: 'M10 0h4v34h-4zM8 18h8v8H8zM9 32h6v14H9zM8 44h8v6l-2 12H9l-1-12z',
  grenade: 'M10 22h4v8h-4zM8 30h8l3 4v14a7 7 0 01-14 0V34zM14 18h6v4h-6z',
  rocket: 'M5 0h14v6H5zM8 6h8v40H8zM6 40h12v6H6zM17 20h4v8h-4zM10 46h4v14h-4z',
  cannon: 'M10 0h4v8h-4zM11 8h2v22h-2zM3 28h18v6l2 4v18l-2 4H3l-2-4V38l2-4z',
};

export function weaponSvg(kind: WeaponIcon, fill = 'currentColor', stroke = 'none'): string {
  const outline =
    stroke === 'none' ? '' : ` stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 64" aria-hidden="true"><path d="${WEAPON_PATHS[kind]}" fill="${fill}"${outline}/></svg>`;
}

/**
 * (PHASE20, [D160]) Stance silhouettes for the stance icon: a soldier seen from the side, drawn
 * as round-capped strokes and a head in `currentColor`, in a 40 × 40 box. Placeholder art.
 */
export type StanceIcon = 'standing' | 'braced' | 'prone' | 'deployed' | 'climbing' | 'sprinting';

const STANCE_SHAPES: Record<StanceIcon, string> = {
  standing:
    '<circle cx="20" cy="7" r="4" fill="currentColor"/><path d="M20 12v14M20 16l-6 8M20 16l6 7M20 26l-5 12M20 26l5 12"/>',
  braced:
    '<circle cx="15" cy="15" r="4" fill="currentColor"/><path d="M15 20v8M15 22l8 -3M15 28l-6 8M15 28l4 8"/><path d="M28 24h8v14h-8z" fill="currentColor" stroke="none"/>',
  prone:
    '<circle cx="9" cy="28" r="4" fill="currentColor"/><path d="M13 29h20M33 29l4 -3M18 29l8 -5M20 33l12 0"/>',
  deployed:
    '<circle cx="14" cy="11" r="4" fill="currentColor"/><path d="M14 16v10M14 26l-6 10M14 26l8 2l-2 8M14 18l9 4"/><path d="M26 22l8 -2M26 22l4 14M26 22l-2 14"/>',
  climbing:
    '<circle cx="22" cy="8" r="4" fill="currentColor"/><path d="M22 13l-2 12M22 15l6 -6M22 16l-6 -3M20 25l6 -3l2 10M20 25l-4 10"/><path d="M5 2v36M33 2v36M5 12h28M5 24h28M5 36h28" stroke-width="1.5" opacity=".5"/>',
  sprinting:
    '<circle cx="24" cy="8" r="4" fill="currentColor"/><path d="M22 13l-4 12M22 15l7 4M22 15l-8 1M18 25l8 4l3 8M18 25l-7 3l-6 6"/>',
};

export function stanceSvg(kind: StanceIcon): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${STANCE_SHAPES[kind]}</svg>`;
}
