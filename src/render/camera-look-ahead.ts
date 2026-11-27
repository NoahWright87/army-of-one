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
import { CAMERA, type ClassLook } from '../content/camera';
import type { Vec2 } from '../sim/core/vec';

export type LookAheadMode = 'off' | 'up' | 'aim' | 'upAim';

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

// ---- (PHASE18) Look reach and scope zoom ([D158]) -------------------------------------------

export interface LookState {
  /** The weapon's range (world units). */
  range: number;
  look: ClassLook;
  still: boolean;
  braced: boolean;
  /** Mounted / set up (Machine Gunner on cover, Sniper rifle up). */
  setUp: boolean;
  /**
   * (PHASE20) Zoomed in only while steady: prone, braced or deployed ([D160]). Absent: it zooms
   * (so older callers keep working); the battle always says.
   */
  scope?: boolean;
  /** (PHASE20) Braced on cover: the direction across it; the camera leans that way ([D160]). */
  braceAim?: number;
  /** Aim direction (radians) and how far out the cursor is (absent: touch / auto-aim). */
  aim: number;
  aimDistance?: number;
  /** The view in screen px, and the zoom before any scope zoom. */
  viewW: number;
  viewH: number;
  baseZoom: number;
}

/** How far this soldier can look right now (world units). */
export function lookReach(
  s: Pick<LookState, 'range' | 'look' | 'still' | 'braced' | 'setUp'>,
): number {
  let r = Math.max(CAMERA.minReach, s.range * s.look.reach);
  if (s.still) r *= 1 + CAMERA.stillBonus;
  if (s.braced) r *= 1 + CAMERA.braceBonus;
  if (s.setUp) r *= s.look.setUp;
  return r;
}

/**
 * Where the camera looks from the soldier (world units) and its zoom. Aiming further out pans
 * toward the aim until the screen's edge reaches the look reach; the last stretch zooms in up to
 * the class's `maxZoom`. Driven by the cursor's distance, it settles where you point: the cursor
 * at the screen's edge looks as far as you can.
 */
export function lookView(s: LookState): { offset: Vec2; zoom: number; reach: number } {
  const reach = lookReach(s);
  const out =
    s.aimDistance === undefined
      ? CAMERA.defaultAim
      : Math.max(0, Math.min(1, s.aimDistance / reach));
  const z = Math.max(0, Math.min(1, (out - CAMERA.zoomFrom) / (1 - CAMERA.zoomFrom)));
  const maxZoom = s.scope === false ? 1 : s.look.maxZoom;
  const zoom = s.baseZoom * (1 + (maxZoom - 1) * z * z * (3 - 2 * z));
  // Half the view along the aim (world units at this zoom).
  const c = Math.abs(Math.cos(s.aim));
  const sn = Math.abs(Math.sin(s.aim));
  const half = (c * s.viewW + sn * s.viewH) / 2 / zoom;
  const pan = Math.min(out * Math.max(0, reach - half), half * s.look.maxPan);
  const offset = { x: Math.cos(s.aim) * pan, y: Math.sin(s.aim) * pan };
  // (PHASE20) Braced: lean toward the cover's far side, the way you'd be shooting ([D160]).
  if (s.braceAim !== undefined) {
    const lean = CAMERA.braceShift * Math.max(0, Math.cos(s.aim - s.braceAim));
    offset.x += Math.cos(s.braceAim) * lean;
    offset.y += Math.sin(s.braceAim) * lean;
  }
  // Both the aim point and the soldier stay on screen, on each axis: the aim within
  // `aimOnScreen` of the half-view, the soldier within `meOnScreen`. Where they can't both fit
  // (aiming far across a phone's narrow side), zoom out just enough.
  const aimAt = Math.min(s.aimDistance ?? out * reach, reach * CAMERA.maxAimShare);
  // A scope (the Sniper) may leave the shooter behind; everyone else keeps themselves in view.
  if (!s.look.keepInView) {
    const hx = (s.viewW / 2 / zoom) * CAMERA.aimOnScreen;
    const hy = (s.viewH / 2 / zoom) * CAMERA.aimOnScreen;
    const ax0 = Math.cos(s.aim) * aimAt;
    const ay0 = Math.sin(s.aim) * aimAt;
    offset.x = Math.min(Math.max(offset.x, ax0 - hx), ax0 + hx);
    offset.y = Math.min(Math.max(offset.y, ay0 - hy), ay0 + hy);
    return { offset, zoom, reach };
  }
  const ax = Math.cos(s.aim) * aimAt;
  const ay = Math.sin(s.aim) * aimAt;
  const span = CAMERA.aimOnScreen + CAMERA.meOnScreen;
  const fit = (view: number, a: number) =>
    Math.abs(a) > 1 ? (view / 2) * (span / Math.abs(a)) : Infinity;
  const z2 = Math.min(zoom, fit(s.viewW, ax), fit(s.viewH, ay));
  const win = (view: number, a: number, o: number) => {
    const half2 = view / 2 / z2;
    const lo = Math.max(a - half2 * CAMERA.aimOnScreen, -half2 * CAMERA.meOnScreen);
    const hi = Math.min(a + half2 * CAMERA.aimOnScreen, half2 * CAMERA.meOnScreen);
    return Math.min(Math.max(o, lo), Math.max(lo, hi));
  };
  offset.x = win(s.viewW, ax, offset.x);
  offset.y = win(s.viewH, ay, offset.y);
  return { offset, zoom: z2, reach };
}

// ---- (aim test) Look by where the aim point is ON SCREEN --------------------------------------
//
// `lookView` is driven by the aim's distance in the world, and that distance comes from the
// cursor's world point under the *current* camera. The camera moving toward the aim moves the
// world under a still cursor, which moves the aim further out, which moves the camera again: the
// reticle creeps with the hand still. Here the camera depends only on where the cursor (or
// finger) sits on the screen (top-down shooter style: cursor halfway to the edge, camera halfway
// to its furthest), so a still hand is a still camera and a still aim point.

export interface ScreenLookState extends Omit<LookState, 'aim' | 'aimDistance'> {
  /** The aim point on screen relative to the centre, each axis −1 (left/top edge) … 1. */
  u: Vec2;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Camera offset from the soldier and zoom for an aim point at `u` on screen. */
export function screenLookView(s: ScreenLookState): { offset: Vec2; zoom: number; reach: number } {
  const reach = lookReach(s);
  const ux = clamp(s.u.x, -1, 1);
  const uy = clamp(s.u.y, -1, 1);
  const out = Math.min(1, Math.hypot(ux, uy));
  const z = clamp((out - CAMERA.zoomFrom) / (1 - CAMERA.zoomFrom), 0, 1);
  const maxZoom = s.scope === false ? 1 : s.look.maxZoom;
  const zoom = s.baseZoom * (1 + (maxZoom - 1) * z * z * (3 - 2 * z));
  const hx = s.viewW / 2 / zoom;
  const hy = s.viewH / 2 / zoom;
  // At the screen's edge the aim point reaches the look reach (the camera pans the rest); the
  // soldier stays on screen unless this class has a scope that may leave them behind.
  const cap = s.look.keepInView ? Math.min(s.look.maxPan, CAMERA.meOnScreen) : s.look.maxPan;
  const panX = Math.min(Math.max(0, reach - hx), hx * cap);
  const panY = Math.min(Math.max(0, reach - hy), hy * cap);
  const offset = { x: ux * panX, y: uy * panY };
  if (s.braceAim !== undefined) {
    const aim = Math.atan2(offset.y + uy * hy, offset.x + ux * hx);
    const lean = CAMERA.braceShift * Math.max(0, Math.cos(aim - s.braceAim));
    offset.x += Math.cos(s.braceAim) * lean;
    offset.y += Math.sin(s.braceAim) * lean;
  }
  return { offset, zoom, reach };
}

/** Where a camera centred on `c` really sits once kept inside the map (Phaser's camera bounds). */
export function clampCameraCentre(
  c: Vec2,
  zoom: number,
  viewW: number,
  viewH: number,
  mapW: number,
  mapH: number,
): Vec2 {
  const axis = (v: number, view: number, size: number) => {
    const half = view / 2 / zoom;
    return size <= half * 2 ? size / 2 : clamp(v, half, size - half);
  };
  return { x: axis(c.x, viewW, mapW), y: axis(c.y, viewH, mapH) };
}

/**
 * The world point a screen point (canvas px) aims at once the camera has settled where that same
 * screen point sends it. A pure function of the hand and the soldier: it never chases the camera.
 */
export function screenAimWorld(
  pos: Vec2,
  s: Omit<ScreenLookState, 'u'>,
  px: number,
  py: number,
  mapW: number,
  mapH: number,
): Vec2 {
  const u = { x: (px - s.viewW / 2) / (s.viewW / 2), y: (py - s.viewH / 2) / (s.viewH / 2) };
  const v = screenLookView({ ...s, u });
  const c = clampCameraCentre(
    { x: pos.x + v.offset.x, y: pos.y + v.offset.y },
    v.zoom,
    s.viewW,
    s.viewH,
    mapW,
    mapH,
  );
  return { x: c.x + (px - s.viewW / 2) / v.zoom, y: c.y + (py - s.viewH / 2) / v.zoom };
}

/** Phones: the zoom that keeps at least `CAMERA.minHalfView` world units on the short half-screen. */
export function phoneFitZoom(cssW: number, cssH: number): number {
  return Math.min(1, Math.min(cssW, cssH) / 2 / CAMERA.minHalfView);
}
