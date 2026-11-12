/**
 * PLACEHOLDER role icons (PHASE12-c), drawn as tiny inline SVG on a 16 × 16 grid in
 * `currentColor`. The owner will supply real icons; each entry's comment is the replacement
 * brief. To swap one: replace its path data (or turn this into an <image> of a manifest asset).
 */
import type { RoleId } from '../contracts/mission';

const ICONS: Record<RoleId, string> = {
  // A single rifle bullet, pointing up.
  rifleman:
    '<path d="M8 1.5c1.6 1.4 2.2 3.2 2.2 5v6H5.8v-6c0-1.8.6-3.6 2.2-5z"/><rect x="5.3" y="12.5" width="5.4" height="2" rx=".4"/>',
  // A frag grenade: round body, safety lever on top.
  grenadier:
    '<circle cx="8" cy="9.5" r="5"/><rect x="6" y="2.5" width="4" height="2.6" rx=".6"/><path d="M10 3.6l3-1.4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  // A short ammo belt: three bullets side by side.
  gunner:
    '<path d="M3.5 4c1 .9 1.4 2 1.4 3.2v6.3H2.1V7.2c0-1.2.4-2.3 1.4-3.2zM8 4c1 .9 1.4 2 1.4 3.2v6.3H6.6V7.2C6.6 6 7 4.9 8 4zM12.5 4c1 .9 1.4 2 1.4 3.2v6.3h-2.8V7.2c0-1.2.4-2.3 1.4-3.2z"/>',
  // A scope reticle: ring and crosshair.
  sniper:
    '<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 0.8v4.4M8 10.8v4.4M0.8 8h4.4M10.8 8h4.4" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="1"/>',
  // A riot shield.
  shield: '<path d="M8 1l6 2.2v4.6c0 3.6-2.6 6-6 7.2-3.4-1.2-6-3.6-6-7.2V3.2z"/>',
  // A shotgun shell: red hull, brass base.
  shotgun:
    '<rect x="5" y="1.5" width="6" height="9" rx="1"/><rect x="4.3" y="10.5" width="7.4" height="4" rx=".6" opacity=".65"/>',
  // A rocket: nose, body, fins.
  bazooka:
    '<path d="M8 .8c1.7 1.5 2.3 3.3 2.3 5.2v5H5.7V6C5.7 4.1 6.3 2.3 8 .8z"/><path d="M5.7 8.5L3 12.5v2l2.7-1.5zM10.3 8.5l2.7 4v2l-2.7-1.5z"/>',
  // A gun truck from the side: cab, bed, gun, wheels.
  truck:
    '<rect x="1" y="7" width="9" height="4" rx=".6"/><path d="M10 6.2h3l2 2.6V11h-5z"/><circle cx="4" cy="12.4" r="1.7"/><circle cx="12" cy="12.4" r="1.7"/><path d="M4 7V5.2h4" stroke="currentColor" stroke-width="1.3" fill="none"/>',
  // A tank from the side: hull, turret, barrel, tracks.
  tank: '<rect x="1" y="9" width="14" height="4.5" rx="2.2"/><rect x="4" y="5.5" width="7" height="3.5" rx="1"/><path d="M11 6.8h4.4" stroke="currentColor" stroke-width="1.6"/>',
};

/** An icon as an <svg> element string, `size` px square. */
export function roleIconSvg(roleId: RoleId | undefined, size = 16, cls = 'rs-ricon'): string {
  return (
    `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">` +
    ICONS[roleId ?? 'rifleman'] +
    `</svg>`
  );
}

/** The same icon as a <g> inside an existing SVG, scaled to `size` px at (x, y). */
export function roleIconG(roleId: RoleId | undefined, x: number, y: number, size: number): string {
  const s = size / 16;
  return `<g class="rs-ricon" transform="translate(${x} ${y}) scale(${s})">${ICONS[roleId ?? 'rifleman']}</g>`;
}

/**
 * A standalone SVG document of an icon (for turning into a texture): `px` square, filled with
 * `color`, with a dark outline so it reads on any soldier colour.
 */
export function roleIconDocument(roleId: RoleId, px: number, color: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="-1 -1 18 18" ` +
    `fill="${color}" color="${color}" stroke="#101418" stroke-width="0.9" paint-order="stroke">` +
    ICONS[roleId] +
    `</svg>`
  );
}

/** Every role that has an icon. */
export const ICON_ROLES = Object.keys(ICONS) as RoleId[];
