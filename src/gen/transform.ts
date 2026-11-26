/**
 * (PHASE13-b) Rotating and flipping blocks ([D82]): 8 orientations. Orientation `o` is
 * `rot + 4 * flip`: first mirror left↔right if `flip`, then turn `rot` quarter turns clockwise.
 * Edges are just the turned tiles ([D101]), so nothing else needs turning.
 */
import { BLOCK_CELLS } from '../content/ground';
import { isRectItem, type BlockDef, type BlockItem, type CellPoint, type CellRect } from './block';

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

export function orientBlock(block: BlockDef, o: Orientation): BlockDef {
  if (o === 0) return block;
  const turnRows = (rows: readonly string[]) => {
    const turned = Array.from({ length: N }, () => new Array<string>(N));

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const [x, y] = orientPoint([c + 0.5, r + 0.5], o);
        turned[Math.floor(y)]![Math.floor(x)] = rows[r]![c]!;
      }
    }
    return turned.map((r) => r.join(''));
  };
  const items = block.items.map((it): BlockItem => {
    if (it.kind === 'ladder') {
      // Its ends are fractions of its rect: turn them with it.
      const rect = orientRect(it.rect, o);
      const [x, y, w, h] = it.rect;
      const end = ([fx, fy]: CellPoint): CellPoint => {
        const [px, py] = orientPoint([x + fx * w, y + fy * h], o);
        return [(px - rect[0]) / rect[2], (py - rect[1]) / rect[3]];
      };
      return { ...it, rect, bottom: end(it.bottom), top: end(it.top) };
    }
    if (isRectItem(it)) return { ...it, rect: orientRect(it.rect, o) };
    const at = orientPoint(it.at, o);
    return 'facing' in it ? { ...it, at, facing: orientFacing(it.facing, o) } : { ...it, at };
  });
  return {
    ...block,
    ground: turnRows(block.ground),
    ...(block.mist ? { mist: turnRows(block.mist) } : {}),
    items,
  };
}
