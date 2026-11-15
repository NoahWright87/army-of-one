/**
 * (PHASE13-c) The world map: a board of blocks grown from both ends, carved into levels ([D89],
 * [D90], [D101], [D102]).
 *
 * 1. Grow (`grow.ts`): the enemy HQ in the top row, the player's start in the bottom row, the
 *    two sides taking turns placing blocks whose edges match tile for tile. Concrete spreads
 *    from the HQ, grass from the start; they meet in the middle through transition blocks.
 * 2. Make sure there's a way from the start to the HQ: cut one where there isn't (a bridge over
 *    water, a pass through rocks, a breach in a wall), preferring open ground.
 * 3. Carve into levels: bands `levelRows` deep from the bottom, each split into chunks 2–3
 *    blocks wide; the top band holds the HQ. Budgets rise toward the HQ ([D86]). Each level
 *    gets its own way in from its south edge when it's played ([D91]).
 *
 * Pure and deterministic: same blocks and seed → same world.
 */
import { BLOCK_TUNING } from '../content/tuning';
import { createRng, nextInt, type RngState } from '../sim/core/rng';
import type { BlockDef } from './block';
import { blockTotalCost } from './budget';
import { blockTiles, connect, growBoard, Palette, type GrownCell } from './grow';
import { buildLevelMap, mix, type GeneratedLevel } from './level';

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
  grid: GrownCell[][];
  levels: WorldLevel[];
  warnings: string[];
  /** Tiles cut to join the start to the HQ ([D102]), as [row, col] of the board's tiles. */
  cut: [number, number][];
}

export function generateWorld(pool: readonly BlockDef[], opts: WorldOptions): GeneratedWorld {
  if (pool.length === 0) throw new Error('generateWorld: no blocks');
  const t = BLOCK_TUNING.world;
  const cols = opts.cols ?? t.cols;
  const rows = opts.rows ?? t.rows;
  const rng = createRng(opts.seed);
  const { grid, warnings } = growBoard(new Palette(pool), { rows, cols }, rng);

  // A way from the start (bottom row) to the HQ (top row).
  const find = (side: GrownCell['side'], r: number) => grid[r]!.findIndex((g) => g.side === side);
  const startCol = Math.max(0, find('player', rows - 1));
  const hqCol = Math.max(0, find('enemy', 0));
  const cut = connect(grid, blockTiles(rows - 1, startCol), blockTiles(0, hqCol));

  const levels = carve(grid, rows, cols, rng);
  return { seed: opts.seed, cols, rows, grid, levels, warnings, cut };
}

/**
 * Levels: bands `levelRows` deep from the bottom, each split into chunks 2–3 wide, numbered from
 * the bottom-left (the order a campaign would meet them in). The top band is the enemy base.
 */
function carve(grid: GrownCell[][], rows: number, cols: number, rng: RngState): WorldLevel[] {
  const t = BLOCK_TUNING.world;
  const bands: { row: number; rows: number }[] = [];
  for (let r = rows; r > 0;) {
    const depth = Math.min(t.levelRows, r);
    r -= depth;
    bands.push({ row: r, rows: depth });
  }
  const levels: WorldLevel[] = [];
  bands.forEach((band, bi) => {
    const base = band.row === 0;
    let col = 0;
    for (const w of splitWidths(cols, rng)) {
      const ramp = bands.length > 2 ? Math.min(1, bi / (bands.length - 2)) : 1;
      let perBlock = t.budgetPerBlockFirst + (t.budgetPerBlockLast - t.budgetPerBlockFirst) * ramp;
      if (base) perBlock = t.budgetPerBlockLast * t.baseBudgetBonus;
      const budget = perBlock * band.rows * w;
      let maxBudget = 0;
      for (let rr = band.row; rr < band.row + band.rows; rr++) {
        for (let cc = col; cc < col + w; cc++) maxBudget += blockTotalCost(grid[rr]![cc]!.placed);
      }
      levels.push({
        index: levels.length,
        row: band.row,
        col,
        rows: band.rows,
        cols: w,
        kind: base ? 'base' : 'field',
        budget: Math.round(Math.min(budget, maxBudget)),
        maxBudget,
      });
      col += w;
    }
  });
  return levels;
}

/** Chunk widths of 2–3 (a lone 1 only if the board is that narrow) summing to `cols`. */
function splitWidths(cols: number, rng: RngState): number[] {
  const [lo, hi] = BLOCK_TUNING.world.levelCols;
  const out: number[] = [];
  let left = cols;
  while (left > 0) {
    if (left <= hi) {
      out.push(left);
      break;
    }
    let w = nextInt(rng, lo, hi);
    if (left - w < lo) w = left - lo; // don't leave a sliver
    out.push(w);
    left -= w;
  }
  return out;
}

/** The playable map of one level of the world, at `budget` (default: the level's own). */
export function worldLevelMap(
  world: GeneratedWorld,
  index: number,
  opts: { id: string; nameKey: string; budget?: number },
): GeneratedLevel {
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
