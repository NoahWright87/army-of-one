/**
 * (PHASE17) A level's key position ([D139]): one prominent place you have to take besides the
 * exits. The best of: the middle of a wide open field (far from anything solid), the inner room
 * of a fortress (walled in on most sides), or a far corner. Always well away from the entries
 * and the exits. Pure and deterministic.
 */
import { GROUND, isGroundKind } from '../content/ground';
import type { Rect } from '../sim/world/map';

export interface KeyPositionInput {
  w: number;
  h: number;
  rows: readonly string[];
  own: (x: number, y: number) => boolean;
  /** Steps from the entries over own ground (-1: not reached). */
  far: ArrayLike<number>;
  walls: readonly Rect[];
  cellSize: number;
  /** Other capture points (exits, entries), [y, x] tiles: keep away from them. */
  avoid: readonly [number, number][];
  /** No closer than this many tiles to anything in `avoid`. */
  keepAway: number;
}

/** The key position's tile ([y, x]), or null if the level has no room for one. */
export function keyPosition(o: KeyPositionInput): [number, number] | null {
  const { w, h } = o;
  const solid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const g = o.rows[y]?.[x] ?? 'X';
      if (!isGroundKind(g) || !GROUND[g].passable) solid[y * w + x] = 1;
    }
  }
  const cs = o.cellSize;
  for (const r of o.walls) {
    const xa = Math.max(0, Math.floor(r.x / cs));
    const xb = Math.min(w - 1, Math.floor((r.x + r.w - 1) / cs));
    const ya = Math.max(0, Math.floor(r.y / cs));
    const yb = Math.min(h - 1, Math.floor((r.y + r.h - 1) / cs));
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) solid[y * w + x] = 1;
  }
  const isSolid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && !!solid[y * w + x];

  let maxFar = 0;
  for (let i = 0; i < w * h; i++) maxFar = Math.max(maxFar, o.far[i] ?? -1);
  if (maxFar <= 0) return null;

  let best: { x: number; y: number; s: number } | null = null;
  const R = 6;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const f = o.far[y * w + x] ?? -1;
      if (f < 0 || !o.own(x, y) || isSolid(x, y)) continue;
      if (o.avoid.some(([ay, ax]) => (ax - x) ** 2 + (ay - y) ** 2 < o.keepAway ** 2)) continue;
      // Room to stand.
      if (isSolid(x + 1, y) || isSolid(x - 1, y) || isSolid(x, y + 1) || isSolid(x, y - 1))
        continue;
      // Openness: distance (tiles) to the nearest solid, up to R.
      let open = R;
      for (let d = 1; d <= R && open === R; d++) {
        for (let k = -d; k <= d; k++) {
          if (
            isSolid(x + k, y - d) ||
            isSolid(x + k, y + d) ||
            isSolid(x - d, y + k) ||
            isSolid(x + d, y + k)
          ) {
            open = d - 1;
            break;
          }
        }
      }
      // Enclosure: directions (of 8) with a solid within R tiles: a fortress's inner room.
      let walled = 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ] as const) {
        for (let d = 1; d <= R; d++) {
          if (isSolid(x + dx * d, y + dy * d)) {
            walled++;
            break;
          }
        }
      }
      const depth = f / maxFar;
      const field = open / R; // 1: a wide open field
      const fortress = walled >= 7 ? 1 : 0; // walled in nearly all round
      const s = depth * 2 + Math.max(field * 1.5, fortress * 2);
      if (!best || s > best.s) best = { x, y, s };
    }
  }
  return best ? [best.y, best.x] : null;
}
