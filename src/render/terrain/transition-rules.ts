/** Neighbour-aware terrain edges. Presentation only: no map/collision data is changed. */
import { isGroundKind, type GroundKind } from '../../content/ground';

/** Water under land; built surfaces and obstacles over natural ground. */
export const TERRAIN_LAYERS: readonly GroundKind[] = ['W', 'S', 'D', 'G', 'R', 'C', 'K', 'X', 'B'];
const rank = (kind: GroundKind) => TERRAIN_LAYERS.indexOf(kind);
export const NEIGHBOURS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;
export const N = 1,
  E = 2,
  S = 4,
  W = 8,
  NW = 16,
  NE = 32,
  SE = 64,
  SW = 128;
const CORNERS = [
  [NW, N, W],
  [NE, N, E],
  [SE, S, E],
  [SW, S, W],
] as const;
export type EdgeStyle = 'natural' | 'shore' | 'hard' | 'rock';

/** A diagonal contributes only when neither adjoining edge already covers that corner. */
export function canonicalMask(mask: number): number {
  let result = mask & 15;
  for (const [diagonal, a, b] of CORNERS)
    if (mask & diagonal && !(mask & (a | b))) result |= diagonal;
  return result;
}
export const TRANSITION_MASKS = [
  ...new Set(Array.from({ length: 256 }, (_, mask) => canonicalMask(mask))),
].sort((a, b) => a - b);
export function kindAt(rows: readonly string[], x: number, y: number): GroundKind | null {
  const kind = rows[y]?.[x];
  return kind !== undefined && isGroundKind(kind) ? kind : null;
}
export function edgeStyle(kind: GroundKind, under: GroundKind): EdgeStyle {
  if (kind === 'R' || kind === 'C' || kind === 'X' || kind === 'B') return 'hard';
  if (kind === 'K') return 'rock';
  return under === 'W' ? 'shore' : 'natural';
}
export interface TerrainEdge {
  kind: GroundKind;
  mask: number;
  style: EdgeStyle;
}
export function terrainEdges(rows: readonly string[], x: number, y: number): TerrainEdge[] {
  const under = kindAt(rows, x, y);
  if (!under) return [];
  const masks = new Map<GroundKind, number>();
  NEIGHBOURS.forEach(([dx, dy], i) => {
    const kind = kindAt(rows, x + dx, y + dy);
    if (kind && rank(kind) > rank(under)) masks.set(kind, (masks.get(kind) ?? 0) | (1 << i));
  });
  return [...masks]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([kind, mask]) => ({ kind, mask: canonicalMask(mask), style: edgeStyle(kind, under) }));
}

/** Signed distance inside the foreground fringe, in cell units. A narrow antialias edge,
 * rather than a broad colour gradient, cuts the actual neighbouring texture into the cell. */
export function transitionDistance(mask: number, x: number, y: number, style: EdgeStyle): number {
  const hard = style === 'hard';
  const width = hard ? 0.045 : style === 'rock' ? 0.14 : 0.19;
  const rough = hard
    ? 0
    : (Math.sin(x * Math.PI * 10) * Math.sin(y * Math.PI * 6) +
        Math.sin((x * 11 - y * 9) * Math.PI * 2) * 0.35) *
      0.012;
  const t = width + rough;
  let d = -1;
  if (mask & N) d = Math.max(d, t - y);
  if (mask & E) d = Math.max(d, t - (1 - x));
  if (mask & S) d = Math.max(d, t - (1 - y));
  if (mask & W) d = Math.max(d, t - x);
  for (const [diagonal, a, b] of CORNERS) {
    const cx = b === W ? x : 1 - x,
      cy = a === N ? y : 1 - y;
    if (mask & diagonal) d = Math.max(d, hard ? Math.min(t - cx, t - cy) : t - Math.hypot(cx, cy));
    if (!hard && mask & a && mask & b) {
      const r = width * 0.8;
      d = Math.max(d, Math.min(t + r - cx, t + r - cy, Math.hypot(cx - t - r, cy - t - r) - r));
    }
  }
  return d;
}

/** Terrain-derived collision rectangles are already drawn by the ground layer. Explicit
 * authored geometry still uses its own visual, even if only partly aligned to the grid. */
export function isPaintedRect(
  ground: { cellSize: number; rows: readonly string[] } | undefined,
  rect: { x: number; y: number; w: number; h: number },
  kinds: readonly GroundKind[],
): boolean {
  if (!ground) return false;
  const { cellSize: cs, rows } = ground;
  if (
    ![rect.x, rect.y, rect.w, rect.h].every((n) => Number.isInteger(n / cs)) ||
    rect.w <= 0 ||
    rect.h <= 0
  )
    return false;
  for (let y = rect.y / cs; y < (rect.y + rect.h) / cs; y++)
    for (let x = rect.x / cs; x < (rect.x + rect.w) / cs; x++) {
      const kind = kindAt(rows, x, y);
      if (!kind || !kinds.includes(kind)) return false;
    }
  return true;
}
