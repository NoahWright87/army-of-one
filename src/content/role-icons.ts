/**
 * Tactical role silhouettes on a shared 16 × 16 grid in `currentColor`.
 * Kept as native vectors for crisp campaign, deployment and in-world UI at every scale.
 */
import type { RoleId } from '../contracts/mission';

const ICONS: Record<RoleId, string> = {
  // A single rifle bullet, pointing up.
  rifleman:
    '<path d="M8 1c1.7 1.6 2.4 3.4 2.4 5.4V12H5.6V6.4C5.6 4.4 6.3 2.6 8 1z"/><path d="M5 12.8h6v2H5z" opacity=".55"/>',
  // A frag grenade: round body, safety lever on top.
  grenadier:
    '<path fill-rule="evenodd" d="M3 8a5 5 0 0110 0v2a5 5 0 01-10 0zm2.5-1v1h5V7zm0 3v1h5v-1z"/><rect x="6" y="2" width="4" height="2.5" rx=".5"/><path d="M10 3h2l1 5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  // A short ammo belt: three bullets side by side.
  gunner:
    '<path d="M1 9h14v3H1z" opacity=".4"/><path d="M3.5 2c1 1 1.4 2.4 1.4 3.6V14H2.1V5.6C2.1 4.4 2.5 3 3.5 2zM8 2c1 1 1.4 2.4 1.4 3.6V14H6.6V5.6C6.6 4.4 7 3 8 2zM12.5 2c1 1 1.4 2.4 1.4 3.6V14h-2.8V5.6c0-1.2.4-2.6 1.4-3.6z"/>',
  // A scope reticle: ring and crosshair.
  sniper:
    '<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 0.8v4.4M8 10.8v4.4M0.8 8h4.4M10.8 8h4.4" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="1"/>',
  // A riot shield.
  shield:
    '<path fill-rule="evenodd" d="M8 1l6 2.2v4.6c0 3.6-2.6 6-6 7.2-3.4-1.2-6-3.6-6-7.2V3.2zM5 4.8v1.8h6V4.8z"/>',
  // A shotgun shell: red hull, brass base.
  shotgun:
    '<path d="M5 1.5h6v1.6H5z" opacity=".55"/><rect x="5" y="4" width="6" height="6.5" rx=".4"/><rect x="4.3" y="11.2" width="7.4" height="3.3" rx=".6" opacity=".65"/>',
  // A rocket: nose, body, fins.
  bazooka:
    '<path d="M8 .8c1.7 1.5 2.3 3.3 2.3 5.2v5H5.7V6C5.7 4.1 6.3 2.3 8 .8z"/><path d="M5.7 8.5L3 12.5v2l2.7-1.5zM10.3 8.5l2.7 4v2l-2.7-1.5z"/>',
  // Overhead gun truck: cab, open bed, ring mount and wheels.
  truck:
    '<rect x="2" y="3" width="2" height="3" rx=".5"/><rect x="12" y="3" width="2" height="3" rx=".5"/><rect x="2" y="11" width="2" height="3" rx=".5"/><rect x="12" y="11" width="2" height="3" rx=".5"/><path fill-rule="evenodd" d="M4 1h8v14H4zm1.5 6v6.5h5V7zM5.5 3v1.5h5V3z"/><circle cx="8" cy="10" r="1.4"/><path d="M8 10V5.5" stroke="currentColor" stroke-width="1.3"/>',
  // Overhead tank: twin tracks, hull, turret and long cannon.
  tank: '<rect x="1" y="4" width="3" height="11" rx="1" opacity=".65"/><rect x="12" y="4" width="3" height="11" rx="1" opacity=".65"/><path d="M4.8 4h6.4l.8 2v8H4V6z"/><rect x="5.8" y="6" width="4.4" height="4.5" rx="1" opacity=".55"/><path d="M8 8V.7" stroke="currentColor" stroke-width="1.8"/>',
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
