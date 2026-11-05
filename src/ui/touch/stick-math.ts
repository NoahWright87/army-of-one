/** (07-b) Pure virtual-stick math (unit-tested). */
import type { Vec2 } from '../../sim/core/vec';

export interface StickConfig {
  /** Thumb travel (px) for a full push. */
  radius: number;
  /** Share of `radius` ignored around the centre (0..1). */
  deadZone: number;
}

/**
 * Stick output for a thumb at `thumb` with the stick's origin at `origin`: each axis in [-1, 1],
 * length ≤ 1, zero inside the dead zone, and rescaled so it ramps from 0 at the dead-zone edge.
 */
export function stickVector(origin: Vec2, thumb: Vec2, cfg: StickConfig): Vec2 {
  const dx = thumb.x - origin.x;
  const dy = thumb.y - origin.y;
  const d = Math.hypot(dx, dy);
  const dead = cfg.radius * cfg.deadZone;
  if (d <= dead || d === 0) return { x: 0, y: 0 };
  const mag = Math.min(1, (d - dead) / (cfg.radius - dead));
  return { x: (dx / d) * mag, y: (dy / d) * mag };
}

/** Where to draw the knob: the thumb, clamped to the stick's radius. */
export function knobOffset(origin: Vec2, thumb: Vec2, radius: number): Vec2 {
  const dx = thumb.x - origin.x;
  const dy = thumb.y - origin.y;
  const d = Math.hypot(dx, dy);
  if (d <= radius) return { x: dx, y: dy };
  return { x: (dx / d) * radius, y: (dy / d) * radius };
}

/** (07-b) Touch-first device? Coarse primary pointer, or touch without any fine pointer. */
export function looksLikeTouch(env: {
  coarse: boolean;
  fine: boolean;
  maxTouchPoints: number;
}): boolean {
  return env.coarse || (env.maxTouchPoints > 0 && !env.fine);
}
