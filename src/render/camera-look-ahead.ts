/**
 * (06-a) Camera look-ahead: bias the camera toward what's ahead so you see the turrets before
 * they see you ([D27]: forward is up, [D28]). Pure; the battle scene adds the offset to the
 * follow target and the usual smoothing (`smoothFollow`) eases it in.
 *
 * Modes (setting `display.cameraLookAhead`):
 * - 'off': centred on the soldier.
 * - 'up': a fixed shift up the map (forward).
 * - 'aim': shifted toward where the soldier aims.
 * - 'upAim': forward, leaning half as far toward the aim (still forward when aiming back).
 */
import type { Vec2 } from '../sim/core/vec';

export type LookAheadMode = 'off' | 'up' | 'aim' | 'upAim';
export const LOOK_AHEAD_MODES: readonly LookAheadMode[] = ['off', 'up', 'aim', 'upAim'];

/**
 * How far the camera pans toward the cursor, as a share of the cursor's distance from the
 * soldier (capped at the look-ahead distance): aim close and the view stays centred.
 */
export const AIM_PAN = 0.5; // TUNE

/**
 * World-space offset from the soldier to the camera centre. `aim` is radians (0 = +x).
 * `aimDistance`: how far away the cursor is (absent: the full distance, e.g. touch or a
 * countdown looking along the soldier's facing).
 */
export function lookAheadOffset(
  mode: LookAheadMode | string,
  distance: number,
  aim: number,
  aimDistance?: number,
): Vec2 {
  const d = Math.max(0, distance);
  const up = { x: 0, y: -d };
  const reach = aimDistance === undefined ? d : Math.min(d, Math.max(0, aimDistance) * AIM_PAN);
  const toward = { x: Math.cos(aim) * reach, y: Math.sin(aim) * reach };
  switch (mode) {
    case 'up':
      return up;
    case 'aim':
      return toward;
    case 'upAim':
      return { x: up.x + toward.x / 2, y: up.y + toward.y / 2 };
    default:
      return { x: 0, y: 0 };
  }
}

/**
 * Caps the look-ahead to a fraction of the half-view so the soldier never leaves the screen
 * (at high zoom or on a small window).
 */
export function capLookAhead(offset: Vec2, halfViewW: number, halfViewH: number, frac = 0.8): Vec2 {
  const mx = Math.max(0, halfViewW * frac);
  const my = Math.max(0, halfViewH * frac);
  return {
    x: Math.max(-mx, Math.min(mx, offset.x)),
    y: Math.max(-my, Math.min(my, offset.y)),
  };
}
