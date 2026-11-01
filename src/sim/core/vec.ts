/**
 * 2D vectors as plain data.
 *
 * Coordinate convention: world units (1 unit = 1 px at zoom 1), +x right, +y DOWN (screen space).
 * Angles are radians from +x; because +y is down, positive angles rotate CLOCKWISE on screen.
 * This matches Math.atan2(dy, dx) and Phaser's rotation, so no conversion is ever needed.
 */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const ZERO: Vec2 = Object.freeze({ x: 0, y: 0 });

export const vec = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const lengthSq = (a: Vec2): number => a.x * a.x + a.y * a.y;
export const length = (a: Vec2): number => Math.sqrt(lengthSq(a));
export const distanceSq = (a: Vec2, b: Vec2): number => lengthSq(sub(a, b));
export const distance = (a: Vec2, b: Vec2): number => Math.sqrt(distanceSq(a, b));

export function normalize(a: Vec2): Vec2 {
  const len = length(a);
  return len === 0 ? ZERO : { x: a.x / len, y: a.y / len };
}

/** Clamps the vector's length to at most `max`. */
export function clampLength(a: Vec2, max: number): Vec2 {
  const len = length(a);
  return len > max && len > 0 ? scale(a, max / len) : a;
}

export const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);
export const angleBetween = (from: Vec2, to: Vec2): number => angleOf(sub(to, from));
export const fromAngle = (radians: number, len = 1): Vec2 => ({
  x: Math.cos(radians) * len,
  y: Math.sin(radians) * len,
});

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Wraps an angle into (-π, π]. */
export function wrapAngle(radians: number): number {
  let a = radians % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  if (a > Math.PI) a -= 2 * Math.PI;
  return a;
}
