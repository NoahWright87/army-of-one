/**
 * (07-a) Camera director for the after-action replay ([D42]). Pure and unit-tested.
 *
 * Each frame it gets the points that matter (every alive soldier, plus recent key moments and,
 * near the end, the objective) and eases a camera (centre + zoom) toward a framing of all of
 * them. Easing is a critically damped spring (no overshoot, no jitter), with zoom eased in log
 * space. Zoom is clamped between "the whole map width" and "a few soldiers". Forward is up
 * ([D27]), so the framing leans a little upward.
 */
import type { Vec2 } from '../sim/core/vec';

export interface DirectorConfig {
  /** Viewport size in screen px. */
  viewW: number;
  viewH: number;
  /** Map size (world units): the widest framing shows the whole map width. */
  mapW: number;
  mapH: number;
  /** Closest zoom (screen px per world unit), e.g. a few soldiers on screen. */
  maxZoom: number;
  /** Padding around the framed points, world units. */
  padding: number;
  /** Spring stiffness (rad/s): higher follows faster. */
  omega: number;
  /** Share of the view height the framing leans up (forward). */
  lookUp: number;
  /** Screen px covered by overlays on each side (the framing uses what's left). */
  insets?: { top: number; right: number; bottom: number; left: number };
}

export const DEFAULT_DIRECTOR: Omit<DirectorConfig, 'viewW' | 'viewH' | 'mapW' | 'mapH'> = {
  maxZoom: 1.2,
  padding: 160,
  omega: 3,
  lookUp: 0.08,
};

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  vx: number;
  vy: number;
  /** Velocity of log(zoom). */
  vz: number;
}

/** The widest zoom allowed: the whole map width (or height, if that's tighter) fits. */
export function minZoom(c: DirectorConfig): number {
  return Math.min(c.viewW / c.mapW, c.viewH / Math.min(c.mapH, (c.mapW * c.viewH) / c.viewW));
}

/** Where the camera wants to be for these points (centre + zoom), before easing. */
export function framing(
  points: readonly Vec2[],
  c: DirectorConfig,
  fallback: Vec2,
): {
  x: number;
  y: number;
  zoom: number;
} {
  const zMin = Math.min(minZoom(c), c.maxZoom);
  if (points.length === 0) return { x: fallback.x, y: fallback.y, zoom: zMin };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const w = x1 - x0 + c.padding * 2;
  const h = y1 - y0 + c.padding * 2;
  const ins = c.insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  // The visible part of the screen (never less than a third of it).
  const vw = Math.max(c.viewW / 3, c.viewW - ins.left - ins.right);
  const vh = Math.max(c.viewH / 3, c.viewH - ins.top - ins.bottom);
  const zoom = Math.max(zMin, Math.min(c.maxZoom, Math.min(vw / w, vh / h)));
  const lean = (vh / zoom) * c.lookUp;
  // Put the points' centre at the visible area's centre.
  const offX = (ins.right - ins.left) / 2 / zoom;
  const offY = (ins.bottom - ins.top) / 2 / zoom;
  return clampToMap({ x: (x0 + x1) / 2 + offX, y: (y0 + y1) / 2 - lean + offY, zoom }, c);
}

/** Keeps the view inside the map where it can (centred on an axis the view is wider than). */
export function clampToMap(
  t: { x: number; y: number; zoom: number },
  c: DirectorConfig,
): { x: number; y: number; zoom: number } {
  const hw = c.viewW / t.zoom / 2;
  const hh = c.viewH / t.zoom / 2;
  const x = hw * 2 >= c.mapW ? c.mapW / 2 : Math.max(hw, Math.min(c.mapW - hw, t.x));
  const y = hh * 2 >= c.mapH ? c.mapH / 2 : Math.max(hh, Math.min(c.mapH - hh, t.y));
  return { x, y, zoom: t.zoom };
}

export function initialCamera(t: { x: number; y: number; zoom: number }): CameraState {
  return { x: t.x, y: t.y, zoom: t.zoom, vx: 0, vy: 0, vz: 0 };
}

/** Critically damped spring step toward `target`. Pure: returns the next state. */
export function stepCamera(
  cam: CameraState,
  target: { x: number; y: number; zoom: number },
  dtSeconds: number,
  omega: number,
): CameraState {
  // Sub-step long frames so a hitch never overshoots.
  const n = Math.max(1, Math.ceil(dtSeconds / (1 / 60)));
  const dt = dtSeconds / n;
  let { x, y, vx, vy, vz } = cam;
  let lz = Math.log(cam.zoom);
  const tlz = Math.log(target.zoom);
  const w2 = omega * omega;
  for (let i = 0; i < n; i++) {
    vx += (w2 * (target.x - x) - 2 * omega * vx) * dt;
    vy += (w2 * (target.y - y) - 2 * omega * vy) * dt;
    vz += (w2 * (tlz - lz) - 2 * omega * vz) * dt;
    x += vx * dt;
    y += vy * dt;
    lz += vz * dt;
  }
  return { x, y, zoom: Math.exp(lz), vx, vy, vz };
}

/** A key moment the camera includes in its framing for a while (death, capture, the win). */
export interface FocusMoment {
  x: number;
  y: number;
  /** Battle tick it happened. */
  tick: number;
}

/** Points to frame at `tick`: alive soldiers plus moments within `holdTicks` before it. */
export function framePoints(
  soldiers: readonly Vec2[],
  moments: readonly FocusMoment[],
  tick: number,
  holdTicks: number,
): Vec2[] {
  const out: Vec2[] = soldiers.slice();
  for (const m of moments) if (m.tick <= tick && tick - m.tick <= holdTicks) out.push(m);
  return out;
}
