/**
 * (PHASE13-b) Rotating and flipping blocks ([D82]): 8 orientations. Orientation `o` is
 * `rot + 4 * flip`: first mirror left↔right if `flip`, then turn `rot` quarter turns clockwise.
 * Edge tags are palindromes ([D81]), so an edge never needs reversing.
 */
import { BLOCK_CELLS } from '../content/ground';
import {
  isRectItem,
  type BlockDef,
  type BlockItem,
  type CellPoint,
  type CellRect,
  type Side,
} from './block';

export type Orientation = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const ORIENTATIONS: readonly Orientation[] = [0, 1, 2, 3, 4, 5, 6, 7];

const N = BLOCK_CELLS;

/** A block point (cells, continuous) under orientation `o`. */
export function orientPoint([x, y]: CellPoint, o: Orientation): CellPoint {
  let px = o >= 4 ? N - x : x;
  let py = y;
  for (let i = 0; i < o % 4; i++) [px, py] = [N - py, px];
  return [px, py];
}

/** Facing in degrees (clockwise from east) under orientation `o`. */
export function orientFacing(deg: number, o: Orientation): number {
  let d = o >= 4 ? 180 - deg : deg;
  d += 90 * (o % 4);
  return ((d % 360) + 360) % 360;
}

export function orientRect([x, y, w, h]: CellRect, o: Orientation): CellRect {
  const [ax, ay] = orientPoint([x, y], o);
  const [bx, by] = orientPoint([x + w, y + h], o);
  return [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)];
}

/** Which side ends up where: the tag on side `s` of the result. */
export function orientEdges(edges: BlockDef['edges'], o: Orientation): BlockDef['edges'] {
  let e = o >= 4 ? { ...edges, e: edges.w, w: edges.e } : { ...edges };
  for (let i = 0; i < o % 4; i++) e = { n: e.w, e: e.n, s: e.e, w: e.s };
  return e as Record<Side, BlockDef['edges']['n']>;
}

export function orientBlock(block: BlockDef, o: Orientation): BlockDef {
  if (o === 0) return block;
  const ground = Array.from({ length: N }, () => new Array<string>(N).fill('G'));
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const [x, y] = orientPoint([c + 0.5, r + 0.5], o);
      ground[Math.floor(y)]![Math.floor(x)] = block.ground[r]![c]!;
    }
  }
  const items = block.items.map((it): BlockItem => {
    if (isRectItem(it)) return { ...it, rect: orientRect(it.rect, o) };
    const at = orientPoint(it.at, o);
    return 'facing' in it ? { ...it, at, facing: orientFacing(it.facing, o) } : { ...it, at };
  });
  return {
    ...block,
    edges: orientEdges(block.edges, o),
    ground: ground.map((r) => r.join('')),
    items,
  };
}

/**
 * Blocks with the same edges up to rotation and flipping share a layout ([D83]: the library
 * groups by it). The key is the smallest "n/e/s/w" over the 8 orientations.
 */
export function edgeLayout(edges: BlockDef['edges']): { key: string; edges: BlockDef['edges'] } {
  let best: { key: string; edges: BlockDef['edges'] } | null = null;
  for (const o of ORIENTATIONS) {
    const e = orientEdges(edges, o);
    const key = `${e.n}/${e.e}/${e.s}/${e.w}`;
    if (!best || key < best.key) best = { key, edges: e };
  }
  return best!;
}
