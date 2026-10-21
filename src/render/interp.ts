/**
 * Interpolation helpers for drawing between two sim ticks ([E6]). The renderer keeps the
 * previous and current WorldView and blends with the fixed stepper's alpha.
 */
import type { Vec2 } from '../sim/core/vec';

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Shortest-arc angle interpolation (radians). */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function indexById<T extends { id: string }>(list: readonly T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const e of list) m.set(e.id, e);
  return m;
}

/** Positions further apart than this between two ticks are teleports: snap instead of blend. */
export const SNAP_DISTANCE = 96;

export function interpPos(
  prev: { x: number; y: number } | undefined,
  cur: { x: number; y: number },
  t: number,
  snap = SNAP_DISTANCE,
): Vec2 {
  if (!prev) return { x: cur.x, y: cur.y };
  const dx = cur.x - prev.x;
  const dy = cur.y - prev.y;
  if (dx * dx + dy * dy > snap * snap) return { x: cur.x, y: cur.y };
  return { x: prev.x + dx * t, y: prev.y + dy * t };
}

/**
 * Frame-rate independent exponential camera follow. `smoothing` in [0, 1): 0 snaps; 0.9 means
 * "keep 90% of the remaining distance every 1/60 s".
 */
export function smoothFollow(current: Vec2, target: Vec2, smoothing: number, dtMs: number): Vec2 {
  if (smoothing <= 0) return { x: target.x, y: target.y };
  const keep = Math.pow(Math.min(0.999, smoothing), dtMs / (1000 / 60));
  return {
    x: target.x + (current.x - target.x) * keep,
    y: target.y + (current.y - target.y) * keep,
  };
}

/** Distance from point p to segment ab. */
export function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}
