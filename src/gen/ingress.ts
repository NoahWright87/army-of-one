/**
 * (PHASE16) Capture points at natural ingress points ([D130]): every so far along the way from a
 * level's entries, the best nearby tile for a forward spawn. Roads score best, then corners and
 * edges of buildings and walls, then clearings; the middle of a field only when nothing else is
 * near. Pure and deterministic.
 */
import { GROUND, isGroundKind } from '../content/ground';
import type { Rect } from '../sim/world/map';

export interface IngressInput {
  w: number;
  h: number;
  /** Ground per tile row (the map's `ground.rows`). */
  rows: readonly string[];
  /** Tiles that are this level's own ground. */
  own: (x: number, y: number) => boolean;
  /** Steps from the entries over own ground per tile (-1: not reached). */
  far: ArrayLike<number>;
  /** Walls (map units) besides solid ground, e.g. buildings. */
  walls: readonly Rect[];
  cellSize: number;
  /** Capture points already placed, in tiles ([y, x]): new ones keep away from them. */
  existing: readonly [number, number][];
  /** A point every this many steps from the entries. */
  every: number;
  /** No new point within this many tiles of another. */
  keepAway: number;
  /** None within this many steps of the far end (the exits are there). */
  endMargin: number;
}

/** The tiles ([y, x]) for new capture points, nearest the entries first. */
export function ingressPoints(o: IngressInput): [number, number][] {
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
  // Off the map's edge counts as open: the edge isn't a building to take cover at.
  const isSolid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && !!solid[y * w + x];

  /** How good a tile is for a capture point (-1: unusable). */
  const score = (x: number, y: number): number => {
    if (!o.own(x, y) || isSolid(x, y) || (o.far[y * w + x] ?? -1) < 0) return -1;
    // Room to stand: the four neighbours are open too.
    if (isSolid(x + 1, y) || isSolid(x - 1, y) || isSolid(x, y + 1) || isSolid(x, y - 1)) return -1;
    let s = 0;
    if (o.rows[y]![x] === 'R' || o.rows[y]![x] === 'B') s += 3;
    // Solid within two tiles, by direction: two perpendicular sides = a corner.
    const near = (dx: number, dy: number) =>
      isSolid(x + dx, y + dy) || isSolid(x + 2 * dx, y + 2 * dy);
    const e = near(1, 0);
    const wst = near(-1, 0);
    const n = near(0, -1);
    const so = near(0, 1);
    // Diagonally off a building's outside corner: solid near, but not straight across.
    let diag = false;
    for (let dy = -2; dy <= 2 && !diag; dy++) {
      for (let dx = -2; dx <= 2; dx++) if (dx && dy && isSolid(x + dx, y + dy)) diag = true;
    }
    const axis = e || wst || n || so;
    if (((e || wst) && (n || so)) || (!axis && diag)) s += 2;
    else if (axis) s += 1.5;
    else {
      // A clearing: nothing solid within three tiles.
      let open = true;
      for (let dy = -3; dy <= 3 && open; dy++) {
        for (let dx = -3; dx <= 3; dx++) if (isSolid(x + dx, y + dy)) open = false;
      }
      if (open) s += 1;
    }
    return s;
  };

  let maxFar = 0;
  for (let i = 0; i < w * h; i++) maxFar = Math.max(maxFar, o.far[i] ?? -1);
  const taken: [number, number][] = [...o.existing];
  const out: [number, number][] = [];
  const band = Math.max(2, Math.floor(o.every / 3));
  for (let k = 1; k * o.every <= maxFar - o.endMargin; k++) {
    const target = k * o.every;
    let best: { x: number; y: number; s: number; d: number } | null = null;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const f = o.far[y * w + x] ?? -1;
        const d = Math.abs(f - target);
        if (f < 0 || d > band) continue;
        if (taken.some(([ty, tx]) => (tx - x) ** 2 + (ty - y) ** 2 < o.keepAway ** 2)) continue;
        const s = score(x, y);
        if (s < 0) continue;
        // Best score, then nearest the target distance, then reading order (deterministic).
        if (!best || s > best.s || (s === best.s && d < best.d)) best = { x, y, s, d };
      }
    }
    if (best) {
      taken.push([best.y, best.x]);
      out.push([best.y, best.x]);
    }
  }
  return out;
}
