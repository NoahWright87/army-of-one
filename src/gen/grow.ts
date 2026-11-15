/**
 * (PHASE13) Growing a board of blocks from both ends ([D101], [D102]).
 *
 * 1. The enemy HQ goes in the top row and the player's start in the bottom row (blocks marked
 *    with those roles; otherwise the likeliest stand-ins).
 * 2. Then the two sides take turns (the enemy `grow.enemyShare` of them): each fills one empty
 *    cell next to its own blocks (the one
 *    touching the most placed blocks first), with a block, in one of its 8 orientations, whose
 *    edges match every placed neighbour tile for tile ([D101]). Concrete spreads from the HQ,
 *    grass from the start; in the middle they need transition blocks to meet.
 * 3. If no block matches every neighbour, the one matching the most sides is used and logged.
 *
 * `connect` then cuts a path where the map has none: water becomes a bridge, rocks a pass,
 * walls a breach ([D102]). The search prefers open ground, so it only cuts where it must.
 *
 * Pure and deterministic: same blocks and seed → same board.
 */
import { BLOCK_CELLS, GROUND, isGroundKind, type GroundKind } from '../content/ground';
import { BLOCK_TUNING } from '../content/tuning';
import { nextFloat, type RngState } from '../sim/core/rng';
import { isRectItem, type BlockDef, type Side } from './block';
import { EdgeMatcher, OPPOSITE, SIDE_LIST, sidePassable, sideProfiles } from './edges';
import { ORIENTATIONS, orientBlock, type Orientation } from './transform';

/** A block placed on the board. */
export interface GrownCell {
  block: BlockDef;
  o: Orientation;
  /** Turned and flipped, with any cuts painted in: what's actually played. */
  placed: BlockDef;
  edges: Record<Side, string>;
  fit: 'exact' | 'loose';
  side: 'enemy' | 'player';
}

interface Candidate {
  block: BlockDef;
  o: Orientation;
  placed: BlockDef;
  edges: Record<Side, string>;
}

/** Every block in every orientation, with its edges read once. */
export class Palette {
  readonly all: Candidate[];
  readonly starts: Candidate[];
  readonly hqs: Candidate[];
  readonly fill: Candidate[];
  readonly matcher = new EdgeMatcher();

  constructor(pool: readonly BlockDef[]) {
    this.all = pool.flatMap((block) =>
      ORIENTATIONS.map((o) => {
        const placed = orientBlock(block, o);
        return { block, o, placed, edges: sideProfiles(placed) };
      }),
    );
    const hasObjective = (b: BlockDef) => b.items.some((i) => i.kind === 'objective');
    const marked = (role: 'start' | 'hq') => this.all.filter((c) => c.block.role === role);
    this.hqs = marked('hq').length ? marked('hq') : this.all.filter((c) => hasObjective(c.block));
    // A start must open to the south (where the player comes in).
    const starts = marked('start').length ? marked('start') : this.all;
    this.starts = starts.filter((c) => sidePassable(c.edges.s));
    this.fill = this.all.filter((c) => !c.block.role);
    if (this.fill.length === 0) this.fill = this.all;
  }
}

export interface GrowOptions {
  rows: number;
  cols: number;
  /** The enemy side's share of the turns (default `BLOCK_TUNING.grow.enemyShare`). */
  enemyShare?: number;
}

export function growBoard(
  palette: Palette,
  opts: GrowOptions,
  rng: RngState,
): { grid: GrownCell[][]; warnings: string[] } {
  const { rows, cols } = opts;
  const grid: (GrownCell | null)[][] = Array.from({ length: rows }, () =>
    new Array<GrownCell | null>(cols).fill(null),
  );
  const warnings: string[] = [];
  const m = palette.matcher;
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(nextFloat(rng) * xs.length)]!;
  const middle = (n: number) =>
    Math.floor(n / 2) + (n > 2 ? Math.floor(nextFloat(rng) * 3) - 1 : 0);

  const neighbours = (r: number, c: number) =>
    SIDE_LIST.flatMap((side) => {
      const [nr, nc] = step(r, c, side);
      const cell = grid[nr]?.[nc];
      return cell ? [{ side, cell }] : [];
    });

  const place = (r: number, c: number, from: readonly Candidate[], side: GrownCell['side']) => {
    const near = neighbours(r, c);
    const score = (cand: Candidate) =>
      near.reduce(
        (n, { side: sd, cell }) => n + (m.match(cand.edges[sd], cell.edges[OPPOSITE[sd]]) ? 1 : 0),
        0,
      );
    let best: Candidate[] = [];
    let bestScore = -1;
    for (const cand of from) {
      const sc = score(cand);
      if (sc > bestScore) {
        bestScore = sc;
        best = [cand];
      } else if (sc === bestScore) best.push(cand);
    }
    // Each fitting block equally likely, then one of its fitting orientations.
    const blocks = [...new Set(best.map((b) => b.block))];
    const block = pick(blocks);
    const chosen = pick(best.filter((b) => b.block === block));
    const exact = bestScore === near.length;
    if (!exact) warnings.push(`row ${r} col ${c}: no block matches all ${near.length} neighbours`);
    grid[r]![c] = { ...chosen, fit: exact ? 'exact' : 'loose', side };
  };

  // 1. The two ends.
  place(0, middle(cols), palette.hqs.length ? palette.hqs : palette.all, 'enemy');
  place(rows - 1, middle(cols), palette.starts.length ? palette.starts : palette.all, 'player');

  // 2. Take turns growing from each end.
  const frontier = (side: GrownCell['side']) => {
    const out: { r: number; c: number; placed: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r]![c]) continue;
        const near = neighbours(r, c);
        if (near.some((n) => n.cell.side === side)) out.push({ r, c, placed: near.length });
      }
    }
    return out;
  };
  // Turns: the enemy side takes `enemyShare` of them (spread evenly), the player side the rest.
  const share = opts.enemyShare ?? BLOCK_TUNING.grow.enemyShare;
  let owed = 0;
  let turn: GrownCell['side'] = 'enemy';
  for (let left = rows * cols - 2; left > 0;) {
    let cells = frontier(turn);
    if (cells.length === 0) {
      turn = turn === 'enemy' ? 'player' : 'enemy';
      cells = frontier(turn);
      if (cells.length === 0) break;
    }
    const most = Math.max(...cells.map((x) => x.placed));
    const next = pick(cells.filter((x) => x.placed === most));
    place(next.r, next.c, palette.fill, turn);
    left--;
    owed += share;
    if (owed >= 1) {
      owed -= 1;
      turn = 'enemy';
    } else turn = 'player';
  }
  return { grid: grid as GrownCell[][], warnings };
}

function step(r: number, c: number, side: Side): [number, number] {
  return side === 'n'
    ? [r - 1, c]
    : side === 's'
      ? [r + 1, c]
      : side === 'e'
        ? [r, c + 1]
        : [r, c - 1];
}

// ---------------------------------------------------------------------------------------------
// Cutting a path ([D102])

/** What a cut turns an obstacle tile into. */
const CUT_TO: Partial<Record<GroundKind, GroundKind>> = { W: 'B', K: 'D', X: 'C' };
/** How much more crossing an obstacle costs than walking a tile (so cuts are a last resort). */
const CUT_COST = 40;

/**
 * Makes sure you can walk from the `from` tiles to one of the `to` tiles across this grid of
 * blocks, cutting a path 3 tiles wide through water, rocks or walls where there's no way round.
 * Mutates the cells' `placed` blocks (and drops placed walls or cover on cut tiles). Returns the
 * tiles cut, as [row, col] of the whole grid's tiles.
 */
export function connect(
  grid: GrownCell[][],
  from: readonly [number, number][],
  to: readonly [number, number][],
): [number, number][] {
  const n = BLOCK_CELLS;
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const H = rows * n;
  const W = cols * n;
  const tile = (y: number, x: number) => grid[Math.floor(y / n)]![Math.floor(x / n)]!;
  const blockedByItem = new Uint8Array(W * H);
  for (let br = 0; br < rows; br++) {
    for (let bc = 0; bc < cols; bc++) {
      for (const it of grid[br]![bc]!.placed.items) {
        if (!isRectItem(it) || (it.kind !== 'wall' && it.kind !== 'cover')) continue;
        const [x, y, w, h] = it.rect;
        for (let yy = Math.floor(y); yy < Math.ceil(y + h); yy++) {
          for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx++) {
            if (xx >= 0 && yy >= 0 && xx < n && yy < n) {
              blockedByItem[(br * n + yy) * W + bc * n + xx] = 1;
            }
          }
        }
      }
    }
  }
  const ground = (y: number, x: number) => tile(y, x).placed.ground[y % n]![x % n]!;
  const open = (y: number, x: number) => {
    const g = ground(y, x);
    return isGroundKind(g) && GROUND[g].passable && !blockedByItem[y * W + x];
  };
  const cost = (y: number, x: number) => (open(y, x) ? 1 : CUT_COST);

  // Dijkstra over tiles (a small board: ~16k tiles), with a simple binary heap.
  const dist = new Float64Array(W * H).fill(Infinity);
  const prev = new Int32Array(W * H).fill(-1);
  const heap: [number, number][] = [];
  const push = (d: number, i: number) => {
    heap.push([d, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p]![0] <= heap[k]![0]) break;
      [heap[p], heap[k]] = [heap[k]!, heap[p]!];
      k = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const a = 2 * k + 1;
        const b = a + 1;
        let s = k;
        if (a < heap.length && heap[a]![0] < heap[s]![0]) s = a;
        if (b < heap.length && heap[b]![0] < heap[s]![0]) s = b;
        if (s === k) break;
        [heap[s], heap[k]] = [heap[k]!, heap[s]!];
        k = s;
      }
    }
    return top;
  };
  for (const [y, x] of from) {
    const i = y * W + x;
    const d = cost(y, x);
    if (d < dist[i]!) {
      dist[i] = d;
      push(d, i);
    }
  }
  const goal = new Set(to.map(([y, x]) => y * W + x));
  let end = -1;
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]!) continue;
    if (goal.has(i)) {
      end = i;
      break;
    }
    const y = Math.floor(i / W);
    const x = i % W;
    for (const [dy, dx] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const ny = y + dy;
      const nx = x + dx;
      if (ny < 0 || nx < 0 || ny >= H || nx >= W) continue;
      const j = ny * W + nx;
      const nd = d + cost(ny, nx);
      if (nd < dist[j]!) {
        dist[j] = nd;
        prev[j] = i;
        push(nd, j);
      }
    }
  }
  if (end < 0) return [];

  // Walk back, cutting every obstacle tile on the way (and its neighbours, for a 3-wide cut).
  const cut = new Set<number>();
  for (let i = end; i >= 0; i = prev[i]!) {
    const y = Math.floor(i / W);
    const x = i % W;
    if (open(y, x)) continue;
    for (const [dy, dx] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const ny = y + dy;
      const nx = x + dx;
      if (ny >= 0 && nx >= 0 && ny < H && nx < W && !open(ny, nx)) cut.add(ny * W + nx);
    }
  }
  const touched = new Map<GrownCell, { rows: string[][]; tiles: [number, number][] }>();
  for (const i of [...cut].sort((a, b) => a - b)) {
    const y = Math.floor(i / W);
    const x = i % W;
    const cell = tile(y, x);
    let t = touched.get(cell);
    if (!t) {
      t = { rows: cell.placed.ground.map((r) => [...r]), tiles: [] };
      touched.set(cell, t);
    }
    const g = t.rows[y % n]![x % n]! as GroundKind;
    t.rows[y % n]![x % n] = CUT_TO[g] ?? g;
    t.tiles.push([y % n, x % n]);
  }
  for (const [cell, t] of touched) {
    const hit = (it: BlockDef['items'][number]) => {
      if (!isRectItem(it) || (it.kind !== 'wall' && it.kind !== 'cover')) return false;
      const [x, y, w, h] = it.rect;
      return t.tiles.some(([ty, tx]) => tx + 1 > x && tx < x + w && ty + 1 > y && ty < y + h);
    };
    cell.placed = {
      ...cell.placed,
      ground: t.rows.map((r) => r.join('')),
      items: cell.placed.items.filter((it) => !hit(it)),
    };
  }
  return [...cut].sort((a, b) => a - b).map((i) => [Math.floor(i / W), i % W] as [number, number]);
}

/** Tiles of a grid's bottom row of tiles (where a level's attackers come in). */
export function bottomTiles(grid: GrownCell[][]): [number, number][] {
  const n = BLOCK_CELLS;
  const y = grid.length * n - 1;
  return Array.from({ length: (grid[0]?.length ?? 0) * n }, (_, x) => [y, x] as [number, number]);
}

/** Tiles of one block (row br, col bc) of a grid. */
export function blockTiles(br: number, bc: number): [number, number][] {
  const n = BLOCK_CELLS;
  const out: [number, number][] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out.push([br * n + y, bc * n + x]);
  return out;
}
