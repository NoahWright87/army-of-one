/**
 * (PHASE13-c) The world map: a Carcassonne board of blocks carved into levels ([D83], [D89],
 * [D90]).
 *
 * 1. Frame: the enemy base in the top `baseRows` rows; a few impassable strokes (rivers across,
 *    ridges along), each kept only if every block can still be reached from the bottom row.
 * 2. Fill the board block by block (`fillGrid`): exact edge matches, and the strokes' seams must
 *    block movement. If the finished board has a pocket nobody can reach, reroll (seeded).
 * 3. Carve into levels: bands `levelRows` deep from the bottom, each split into chunks 2–3
 *    blocks wide (cutting where a ridge already divides the band, when it can). The base rows
 *    are the last band. Budgets rise from the first band to the last ([D86]).
 *
 * A level is played on its own ([D91]): its blocks, attacked from the south, at its budget.
 * Pure and deterministic: same blocks and seed → same world.
 */
import { EDGE_TAGS, mirrorTag } from '../content/ground';
import { BLOCK_TUNING } from '../content/tuning';
import { createRng, nextFloat, nextInt, type RngState } from '../sim/core/rng';
import type { BlockDef } from './block';
import { blockTotalCost } from './budget';
import { buildLevelMap, fillGrid, mix, type GeneratedLevel, type GridCell } from './level';
import { orientBlock, orientEdges } from './transform';

export interface WorldOptions {
  seed: number;
  cols?: number;
  rows?: number;
}

/** A level carved from the board: a rectangle of blocks. */
export interface WorldLevel {
  index: number;
  row: number;
  col: number;
  rows: number;
  cols: number;
  kind: 'field' | 'base';
  /** Default enemy budget for this level. */
  budget: number;
  /** Everything in its blocks at full strength. */
  maxBudget: number;
}

export interface GeneratedWorld {
  seed: number;
  cols: number;
  rows: number;
  baseRows: number;
  grid: GridCell[][];
  /** Frame barriers: `h[r][c]` between rows r and r+1; `v[r][c]` between cols c and c+1. */
  h: boolean[][];
  v: boolean[][];
  levels: WorldLevel[];
  warnings: string[];
  attempts: number;
}

export function generateWorld(pool: readonly BlockDef[], opts: WorldOptions): GeneratedWorld {
  if (pool.length === 0) throw new Error('generateWorld: no blocks');
  const t = BLOCK_TUNING.world;
  let last: GeneratedWorld | null = null;
  for (let attempt = 0; attempt < t.maxAttempts; attempt++) {
    const w = attemptWorld(pool, opts, attempt);
    if (allReachable(w)) return w;
    last = w;
  }
  last!.warnings.push(`part of the board unreachable after ${t.maxAttempts} attempts`);
  return last!;
}

function attemptWorld(
  pool: readonly BlockDef[],
  opts: WorldOptions,
  attempt: number,
): GeneratedWorld {
  const t = BLOCK_TUNING.world;
  const cols = opts.cols ?? t.cols;
  const rows = opts.rows ?? t.rows;
  const baseRows = Math.min(t.baseRows, rows - 1);
  const rng = createRng(mix(opts.seed, attempt));
  const h = Array.from({ length: rows - 1 }, () => new Array<boolean>(cols).fill(false));
  const v = Array.from({ length: rows }, () => new Array<boolean>(cols - 1).fill(false));
  layStrokes(h, v, baseRows, t.strokes, rng);

  const { grid, warnings } = fillGrid(
    pool,
    {
      rows,
      cols,
      baseRows,
      // [D83]: the frame decides every hard edge; any seam it didn't mark must be crossable.
      barrier: (r, c, side) =>
        r < baseRows ? undefined : side === 's' ? !!h[r]?.[c] : !!v[r]?.[c],
    },
    rng,
  );
  const levels = carve(grid, rows, cols, baseRows, h, v, rng);
  return {
    seed: opts.seed,
    cols,
    rows,
    baseRows,
    grid,
    h,
    v,
    levels,
    warnings,
    attempts: attempt + 1,
  };
}

/**
 * Rivers (across, with a crossing or two) and ridges (along), on seams below the base. A stroke
 * that would cut any block off from the bottom row is dropped.
 */
function layStrokes(
  h: boolean[][],
  v: boolean[][],
  baseRows: number,
  count: number,
  rng: RngState,
): void {
  const rows = v.length;
  const cols = v[0]!.length + 1;
  const field = rows - baseRows;
  if (field < 3) return;
  for (let k = 0; k < count * 3 && count > 0; k++) {
    const river = nextFloat(rng) < 0.6;
    const added: [boolean[][], number, number][] = [];
    if (river) {
      // On a seam between two bands of levels (rivers are where levels meet, [D89]): between
      // rows r and r+1, not against the base.
      const seams: number[] = [];
      for (
        let r = rows - 1 - BLOCK_TUNING.world.levelRows;
        r > baseRows;
        r -= BLOCK_TUNING.world.levelRows
      ) {
        seams.push(r);
      }
      if (seams.length === 0) continue;
      const r = seams[nextInt(rng, 0, seams.length - 1)]!;
      // One crossing in each third of the width, so most levels above it have their own.
      const crossings = new Set<number>();
      const parts = Math.max(1, Math.ceil(cols / 3));
      for (let k = 0; k < parts; k++) {
        const lo = Math.floor((k * cols) / parts);
        const hi = Math.floor(((k + 1) * cols) / parts) - 1;
        crossings.add(nextInt(rng, lo, Math.max(lo, hi)));
      }
      for (let c = 0; c < cols; c++) if (!crossings.has(c) && !h[r]![c]) added.push([h, r, c]);
    } else {
      const c = nextInt(rng, 0, cols - 2);
      const len = nextInt(rng, 2, Math.min(4, field - 1));
      const r0 = nextInt(rng, baseRows, rows - 1 - len);
      for (let r = r0; r < r0 + len; r++) if (!v[r]![c]) added.push([v, r, c]);
    }
    for (const [m, r, c] of added) m[r]![c] = true;
    if (!framesConnected(h, v, baseRows)) {
      for (const [m, r, c] of added) m[r]![c] = false;
    } else if (--count === 0) return;
  }
}

/** Every block reachable from the bottom row across non-barrier seams (the frame's view). */
function framesConnected(h: boolean[][], v: boolean[][], baseRows: number): boolean {
  void baseRows;
  const rows = v.length;
  const cols = v[0]!.length + 1;
  return (
    floodCount(rows, cols, (r, c, dr, dc) =>
      dr !== 0 ? !h[Math.min(r, r + dr)]![c] : !v[r]![Math.min(c, c + dc)],
    ) ===
    rows * cols
  );
}

/** Every block reachable from the bottom row across the board's actual edges. */
function allReachable(w: GeneratedWorld): boolean {
  const edge = (r: number, c: number) => orientEdges(w.grid[r]![c]!.block.edges, w.grid[r]![c]!.o);
  return (
    floodCount(w.rows, w.cols, (r, c, dr, dc) => {
      const a = edge(r, c);
      const b = edge(r + dr, c + dc);
      const [mine, theirs] =
        dr === 1 ? [a.s, b.n] : dr === -1 ? [a.n, b.s] : dc === 1 ? [a.e, b.w] : [a.w, b.e];
      return EDGE_TAGS[mine].passable && EDGE_TAGS[theirs].passable && mirrorTag(mine) === theirs;
    }) ===
    w.rows * w.cols
  );
}

function floodCount(
  rows: number,
  cols: number,
  open: (r: number, c: number, dr: number, dc: number) => boolean,
): number {
  const seen = new Uint8Array(rows * cols);
  const queue: [number, number][] = [];
  for (let c = 0; c < cols; c++) {
    seen[(rows - 1) * cols + c] = 1;
    queue.push([rows - 1, c]);
  }
  let n = queue.length;
  while (queue.length) {
    const [r, c] = queue.shift()!;
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || seen[nr * cols + nc]) continue;
      if (!open(r, c, dr, dc)) continue;
      seen[nr * cols + nc] = 1;
      n++;
      queue.push([nr, nc]);
    }
  }
  return n;
}

/**
 * Levels: bands `levelRows` deep from the bottom (the base rows are the last band), each split
 * into chunks 2–3 wide, preferring cuts where a ridge already divides the band. Numbered from
 * the bottom-left, the order a campaign would meet them in.
 */
function carve(
  grid: GridCell[][],
  rows: number,
  cols: number,
  baseRows: number,
  h: boolean[][],
  v: boolean[][],
  rng: RngState,
): WorldLevel[] {
  const t = BLOCK_TUNING.world;
  const bands: { row: number; rows: number; kind: WorldLevel['kind'] }[] = [];
  let r = rows;
  while (r > baseRows) {
    const depth = Math.min(t.levelRows, r - baseRows);
    r -= depth;
    bands.push({ row: r, rows: depth, kind: 'field' });
  }
  if (baseRows > 0) bands.push({ row: 0, rows: baseRows, kind: 'base' });
  const fieldBands = bands.filter((b) => b.kind === 'field').length;

  const levels: WorldLevel[] = [];
  bands.forEach((band, bi) => {
    const widths = withCrossings(splitWidths(cols, band, v, rng), band, rows, h);
    let col = 0;
    for (const w of widths) {
      const ramp = fieldBands > 1 ? Math.min(1, bi / (fieldBands - 1)) : 1;
      let budget = t.budgetFirst + (t.budgetLast - t.budgetFirst) * ramp;
      if (band.kind === 'base') budget = t.budgetLast * t.baseBudgetBonus;
      let maxBudget = 0;
      for (let rr = band.row; rr < band.row + band.rows; rr++) {
        for (let cc = col; cc < col + w; cc++) {
          const g = grid[rr]![cc]!;
          maxBudget += blockTotalCost(orientBlock(g.block, g.o));
        }
      }
      levels.push({
        index: levels.length,
        row: band.row,
        col,
        rows: band.rows,
        cols: w,
        kind: band.kind,
        budget: Math.round(Math.min(budget, maxBudget)),
        maxBudget,
      });
      col += w;
    }
  });
  return levels;
}

/**
 * A level is attacked from the south ([D91]), so its southern edge needs a way in: a chunk whose
 * whole bottom is a river is merged into its neighbour (the one sharing a crossing, if any).
 */
function withCrossings(
  widths: number[],
  band: { row: number; rows: number },
  rows: number,
  h: boolean[][],
): number[] {
  const seam = band.row + band.rows - 1;
  if (seam >= rows - 1) return widths;
  const out = [...widths];
  const open = (start: number, w: number) => {
    for (let c = start; c < start + w; c++) if (!h[seam]![c]) return true;
    return false;
  };
  for (let i = 0; i < out.length && out.length > 1;) {
    const start = out.slice(0, i).reduce((a, b) => a + b, 0);
    if (open(start, out[i]!)) {
      i++;
      continue;
    }
    const into = i > 0 ? i - 1 : i + 1;
    out[into] = out[into]! + out[i]!;
    out.splice(i, 1);
    i = Math.max(0, Math.min(i, into));
  }
  return out;
}

/** Chunk widths (2–3, a lone 1 only if the board is that narrow) summing to `cols`. */
function splitWidths(
  cols: number,
  band: { row: number; rows: number },
  v: boolean[][],
  rng: RngState,
): number[] {
  const [lo, hi] = BLOCK_TUNING.world.levelCols;
  // A ridge between columns c and c+1 across the whole band is a natural cut.
  const naturalCut = (c: number) => {
    for (let r = band.row; r < band.row + band.rows; r++) if (!v[r]?.[c]) return false;
    return true;
  };
  const out: number[] = [];
  let left = cols;
  let at = 0;
  while (left > 0) {
    if (left <= hi) {
      out.push(left);
      break;
    }
    let w = nextInt(rng, lo, hi);
    if (left - w < lo) w = left - lo; // don't leave a sliver
    for (let k = lo; k <= hi && k < left; k++) {
      if (naturalCut(at + k - 1) && left - k >= lo) {
        w = k;
        break;
      }
    }
    out.push(w);
    left -= w;
    at += w;
  }
  return out;
}

/** The playable map of one level of the world, at `budget` (default: the level's own). */
export function worldLevelMap(
  world: GeneratedWorld,
  index: number,
  opts: { id: string; nameKey: string; budget?: number },
): Omit<GeneratedLevel, 'attempts'> {
  const lv = world.levels[index];
  if (!lv) throw new Error(`world ${world.seed}: no level ${index}`);
  const grid = world.grid
    .slice(lv.row, lv.row + lv.rows)
    .map((row) => row.slice(lv.col, lv.col + lv.cols));
  return buildLevelMap(grid, {
    id: opts.id,
    nameKey: opts.nameKey,
    seed: mix(world.seed, 1000 + index),
    budget: opts.budget ?? lv.budget,
  });
}
