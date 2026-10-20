import type { Vec2 } from '../core/vec';
import type { Rect } from './map';

/** Penetration resolution for a circle against an AABB. Returns the push-out vector (0,0 if none). */
export function circleRectPush(center: Vec2, radius: number, r: Rect): Vec2 {
  const cx = Math.max(r.x, Math.min(center.x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(center.y, r.y + r.h));
  const dx = center.x - cx;
  const dy = center.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > 0) {
    if (d2 >= radius * radius) return { x: 0, y: 0 };
    const d = Math.sqrt(d2);
    const push = radius - d;
    return { x: (dx / d) * push, y: (dy / d) * push };
  }
  // Center is inside the rect: push out along the axis of least penetration.
  const left = center.x - r.x + radius;
  const right = r.x + r.w - center.x + radius;
  const top = center.y - r.y + radius;
  const bottom = r.y + r.h - center.y + radius;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: -left, y: 0 };
  if (m === right) return { x: right, y: 0 };
  if (m === top) return { x: 0, y: -top };
  return { x: 0, y: bottom };
}

export function circleOverlapsRect(center: Vec2, radius: number, r: Rect): boolean {
  const cx = Math.max(r.x, Math.min(center.x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(center.y, r.y + r.h));
  const dx = center.x - cx;
  const dy = center.y - cy;
  return dx * dx + dy * dy < radius * radius;
}

export function circlesOverlap(a: Vec2, ra: number, b: Vec2, rb: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = ra + rb;
  return dx * dx + dy * dy < r * r;
}

/**
 * Moves a circle by `delta`, sliding along any solid rects. Sub-steps so fast movers can't tunnel
 * through thin walls. Deterministic: rects are resolved in array order.
 */
export function moveCircle(
  start: Vec2,
  delta: Vec2,
  radius: number,
  solids: readonly Rect[],
): Vec2 {
  const dist = Math.hypot(delta.x, delta.y);
  const steps = Math.max(1, Math.ceil(dist / (radius * 0.5)));
  let x = start.x;
  let y = start.y;
  for (let s = 0; s < steps; s++) {
    x += delta.x / steps;
    y += delta.y / steps;
    // Two passes handle corners where resolving one rect pushes into another.
    for (let pass = 0; pass < 2; pass++) {
      for (const r of solids) {
        const p = circleRectPush({ x, y }, radius, r);
        x += p.x;
        y += p.y;
      }
    }
  }
  return { x, y };
}

/**
 * Distance along a ray (origin `o`, unit direction `d`) to where it enters `r`, or null if it
 * misses. A ray starting inside the rect hits at 0.
 */
export function rayRect(o: Vec2, d: Vec2, r: Rect): number | null {
  let tMin = 0;
  let tMax = Infinity;
  const axes: [number, number, number, number][] = [
    [o.x, d.x, r.x, r.x + r.w],
    [o.y, d.y, r.y, r.y + r.h],
  ];
  for (const [p, dir, lo, hi] of axes) {
    if (dir === 0) {
      if (p < lo || p > hi) return null;
      continue;
    }
    let t1 = (lo - p) / dir;
    let t2 = (hi - p) / dir;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

/** Distance along a ray to where it enters a circle, or null. Starting inside hits at 0. */
export function rayCircle(o: Vec2, d: Vec2, c: Vec2, radius: number): number | null {
  const fx = o.x - c.x;
  const fy = o.y - c.y;
  const cc = fx * fx + fy * fy - radius * radius;
  if (cc <= 0) return 0;
  const b = fx * d.x + fy * d.y;
  if (b > 0) return null; // pointing away
  const disc = b * b - cc;
  if (disc < 0) return null;
  return -b - Math.sqrt(disc);
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
