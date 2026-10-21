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
