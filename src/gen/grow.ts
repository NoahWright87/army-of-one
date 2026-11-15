/**
 * (PHASE13) Growing a board of blocks from both ends ([D101], [D102]).
 *
 * 1. The enemy HQ goes in the top row and the player's start in the bottom row (blocks marked
 *    with those roles; otherwise the likeliest stand-ins).
 * 2. Then the two sides take turns (the enemy `grow.enemyShare` of them): each fills one empty
 *    cell next to its own blocks (the one with the fewest blocks that could fit first), with a
 *    block, in one of its 8 orientations, whose edges match every placed neighbour tile for
 *    tile ([D101]) and that leaves every empty neighbour something that fits (look-ahead).
 *    Concrete spreads from the HQ, grass from the start; in the middle they need transition
 *    blocks to meet.
 * 3. A cell nothing fits clears the neighbours boxing it in and they grow again (a few tries
 *    per cell). Only then is the block whose edge tiles agree best used, and logged.
 * 4. Fit is judged at the end, seam by seam.
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
import { EdgeMatcher, edgesMatch, OPPOSITE, SIDE_LIST, sidePassable, sideProfiles } from './edges';
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
  const m = palette.matcher;
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(nextFloat(rng) * xs.length)]!;
  const middle = (n: number) =>
    Math.floor(n / 2) + (n > 2 ? Math.floor(nextFloat(rng) * 3) - 1 : 0);

  // Candidate sets as bitsets over the fill palette, so look-ahead is cheap.
  const fill = palette.fill;
  const words = (fill.length + 31) >>> 5;
  const wantCache = new Map<string, Uint32Array>();
  /** Fill candidates whose `side` edge matches `edge` (a neighbour's edge on that side). */
  const want = (side: Side, edge: string): Uint32Array => {
    const key = `${side}|${edge}`;
    let set = wantCache.get(key);
    if (!set) {
      set = new Uint32Array(words);
      for (let i = 0; i < fill.length; i++) {
        if (m.match(fill[i]!.edges[side], edge)) set[i >>> 5]! |= 1 << (i & 31);
      }
      wantCache.set(key, set);
    }
    return set;
  };
  const all = new Uint32Array(words);
  for (let i = 0; i < fill.length; i++) all[i >>> 5]! |= 1 << (i & 31);

  const neighbours = (r: number, c: number) =>
    SIDE_LIST.flatMap((side) => {
      const [nr, nc] = step(r, c, side);
      const cell = grid[nr]?.[nc];
      return cell ? [{ side, cell }] : [];
    });
  const emptyNeighbours = (r: number, c: number) =>
    SIDE_LIST.flatMap((side) => {
      const [nr, nc] = step(r, c, side);
      return nr >= 0 && nc >= 0 && nr < rows && nc < cols && !grid[nr]![nc]
        ? [{ side, r: nr, c: nc }]
        : [];
    });
  /** Fill candidates that match every placed neighbour of (r, c). */
  const domain = (r: number, c: number): Uint32Array => {
    const d = all.slice();
    for (const { side, cell } of neighbours(r, c)) {
      const w = want(side, cell.edges[OPPOSITE[side]]);
      for (let k = 0; k < words; k++) d[k]! &= w[k]!;
    }
    return d;
  };
  const members = (d: Uint32Array) => {
    const out: number[] = [];
    for (let i = 0; i < fill.length; i++) if (d[i >>> 5]! & (1 << (i & 31))) out.push(i);
    return out;
  };
  const size = (d: Uint32Array) => {
    let n = 0;
    for (let k = 0; k < words; k++) {
      let x = d[k]!;
      while (x) {
        x &= x - 1;
        n++;
      }
    }
    return n;
  };
  const overlaps = (a: Uint32Array, b: Uint32Array) => {
    for (let k = 0; k < words; k++) if (a[k]! & b[k]!) return true;
    return false;
  };

  const set = (r: number, c: number, cand: Candidate, side: GrownCell['side']) => {
    grid[r]![c] = { ...cand, fit: 'exact', side };
  };
  /** Each fitting block equally likely, then one of its fitting orientations. */
  const choose = (cands: readonly Candidate[]): Candidate => {
    const block = pick([...new Set(cands.map((x) => x.block))]);
    return pick(cands.filter((x) => x.block === block));
  };

  // 1. The two ends (never cleared by repairs).
  const anchors = new Set<string>();
  const anchor = (r: number, c: number, from: readonly Candidate[], side: GrownCell['side']) => {
    set(r, c, choose(from), side);
    anchors.add(`${r},${c}`);
  };
  anchor(0, middle(cols), palette.hqs.length ? palette.hqs : palette.all, 'enemy');
  anchor(rows - 1, middle(cols), palette.starts.length ? palette.starts : palette.all, 'player');

  /**
   * Fills (r, c): a block matching every placed neighbour and leaving every empty neighbour
   * something that fits ([D101]). False at a dead end (nothing matches the neighbours).
   */
  const fillCell = (r: number, c: number, side: GrownCell['side']): boolean => {
    const ids = members(domain(r, c));
    if (ids.length === 0) return false;
    const around = emptyNeighbours(r, c).map((e) => ({ ...e, d: domain(e.r, e.c) }));
    const safe = ids.filter((i) =>
      around.every((e) => overlaps(e.d, want(OPPOSITE[e.side], fill[i]!.edges[e.side]))),
    );
    set(r, c, choose((safe.length ? safe : ids).map((i) => fill[i]!)), side);
    return true;
  };

  /** Last resort: the block whose edge tiles agree best with the neighbours, tile for tile. */
  const fallback = (r: number, c: number, side: GrownCell['side']) => {
    const near = neighbours(r, c);
    let best: Candidate[] = [];
    let bestScore = -1;
    for (const cand of fill) {
      let sc = 0;
      for (const { side: sd, cell } of near) {
        sc += tileAgreement(cand.edges[sd], cell.edges[OPPOSITE[sd]]);
      }
      if (sc > bestScore) {
        bestScore = sc;
        best = [cand];
      } else if (sc === bestScore) best.push(cand);
    }
    set(r, c, choose(best), side);
  };

  // 2. Take turns growing from each end: the most constrained open cell first.
  const frontier = (side: GrownCell['side']) => {
    const out: { r: number; c: number; placed: number; options: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r]![c]) continue;
        const near = neighbours(r, c);
        if (near.some((n) => n.cell.side === side)) {
          out.push({ r, c, placed: near.length, options: size(domain(r, c)) });
        }
      }
    }
    return out;
  };
  const share = opts.enemyShare ?? BLOCK_TUNING.grow.enemyShare;
  const repairs = new Map<string, number>();
  const maxRepairs = BLOCK_TUNING.grow.repairsPerCell;
  let budget = BLOCK_TUNING.grow.repairBudget * rows * cols;
  let owed = 0;
  let turn: GrownCell['side'] = 'enemy';
  for (let guard = rows * cols * 50; guard > 0; guard--) {
    let cells = frontier(turn);
    if (cells.length === 0) {
      turn = turn === 'enemy' ? 'player' : 'enemy';
      cells = frontier(turn);
      if (cells.length === 0) break;
    }
    const fewest = Math.min(...cells.map((x) => x.options));
    const tight = cells.filter((x) => x.options === fewest);
    const most = Math.max(...tight.map((x) => x.placed));
    const next = pick(tight.filter((x) => x.placed === most));
    if (!fillCell(next.r, next.c, turn)) {
      // Dead end: clear the neighbours that box it in and grow them again (a few times).
      const key = `${next.r},${next.c}`;
      const tries = repairs.get(key) ?? 0;
      const clearable = SIDE_LIST.map((sd) => step(next.r, next.c, sd)).filter(
        ([nr, nc]) => grid[nr]?.[nc] && !anchors.has(`${nr},${nc}`),
      );
      if (tries < maxRepairs && budget > 0 && clearable.length) {
        repairs.set(key, tries + 1);
        budget--;
        for (const [nr, nc] of clearable) grid[nr]![nc] = null;
        continue;
      }
      fallback(next.r, next.c, turn);
    }
    owed += share;
    if (owed >= 1) {
      owed -= 1;
      turn = 'enemy';
    } else turn = 'player';
  }

  // 3. Fit is judged at the end, seam by seam, against the final neighbours.
  const warnings: string[] = [];
  const out = grid as GrownCell[][];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = out[r]![c]!;
      const bad = neighbours(r, c).filter(
        ({ side, cell: o }) => !m.match(cell.edges[side], o.edges[OPPOSITE[side]]),
      );
      cell.fit = bad.length ? 'loose' : 'exact';
      if (bad.length) {
        warnings.push(
          `row ${r} col ${c}: doesn't match its ${bad.map((b) => SIDE_NAME[b.side]).join(', ')} neighbour`,
        );
      }
    }
  }
  return { grid: out, warnings };
}

const SIDE_NAME: Record<Side, string> = { n: 'north', e: 'east', s: 'south', w: 'west' };

/** How many tiles of `mine` find their type within one place on `theirs` (lined up). */
function tileAgreement(mine: string, theirs: string): number {
  const t = [...theirs].reverse();
  let n = 0;
  for (let i = 0; i < mine.length; i++) {
    if (t[i] === mine[i] || t[i - 1] === mine[i] || t[i + 1] === mine[i]) n++;
  }
  return n;
}

/** Whether a placed cell's side matches the cell next to it (as the board stands). */
export function seamMatches(grid: GrownCell[][], r: number, c: number, side: Side): boolean {
  const [nr, nc] = step(r, c, side);
  const o = grid[nr]?.[nc];
  return !o || edgesMatch(grid[r]![c]!.edges[side], o.edges[OPPOSITE[side]]);
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
