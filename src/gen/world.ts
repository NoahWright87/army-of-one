/**
 * (PHASE13-c/d) The world map: a board of blocks grown from both ends, carved into levels by its
 * terrain ([D89], [D101], [D102], [D107]–[D110]).
 *
 * 1. Grow (`grow.ts`): the enemy HQ in the top row, the player's start in the bottom row, the
 *    two sides taking turns placing blocks whose edges match tile for tile.
 * 2. Make sure there's a way from the start to the HQ: cut one where there isn't (a bridge over
 *    water, a pass through rocks, a breach in a wall), preferring open ground.
 * 3. Carve (`carve.ts`): levels are regions of walkable ground with borders along rivers, lakes
 *    and narrow places; big impassable areas belong to no level. Crossings join levels.
 * 4. Budgets rise in the order you'd meet the levels; the HQ's band gets more ([D86]).
 *
 * Pure and deterministic: same blocks and seed → same world.
 */
import { BLOCK_CELLS } from '../content/ground';
import { BLOCK_TUNING } from '../content/tuning';
import { createRng } from '../sim/core/rng';
import type { BlockDef } from './block';
import { blockTotalCost } from './budget';
import {
  boardTiles,
  bridgeIslands,
  carveBoard,
  type BoardTiles,
  type CarvedLevel,
  type Crossing,
} from './carve';
import { blockTiles, connect, growBoard, Palette, type GrownCell } from './grow';
import { clipBlock } from './region';

export interface WorldOptions {
  seed: number;
  cols?: number;
  rows?: number;
}

/** A level carved from the board: a region of walkable ground ([D109]). */
export interface WorldLevel extends CarvedLevel {
  kind: 'field' | 'base';
  /** Default enemy budget for this level. */
  budget: number;
  /** Everything on its ground at full strength. */
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
  tiles: BoardTiles;
  /** Level per board tile (-1: no level). */
  owner: Int16Array;
  crossings: Crossing[];
  /** The level holding the enemy HQ. */
  hq: number;
  /** Bridged islands' outposts ([y, x] board tiles): optional capture points ([D111]). */
  outposts: [number, number][];
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
  const hqCol = hqColumn(grid);
  const cut = connect(grid, blockTiles(rows - 1, startCol), blockTiles(0, hqCol));

  let tiles = boardTiles(grid);
  // Islands near the shore get a bridge, and an outpost to take ([D111]).
  const outposts = bridgeIslands(grid, tiles);
  if (outposts.length) tiles = boardTiles(grid);
  const carving = carveBoard(tiles, rng);
  const { owner, crossings } = carving;
  const hq = levelAtBlock(owner, tiles.w, 0, hqCol, carving.levels.length);
  const topBand = Math.max(0, ...carving.levels.map((l) => l.band));
  const n = carving.levels.length;
  const levels: WorldLevel[] = carving.levels.map((lv) => {
    let maxBudget = 0;
    for (let br = 0; br < rows; br++) {
      for (let bc = 0; bc < cols; bc++) {
        const clipped = clipBlock(grid, owner, tiles.w, br, bc, lv.index);
        if (clipped) maxBudget += blockTotalCost(clipped);
      }
    }
    const base = lv.band === topBand || lv.index === hq;
    const ramp = n > 1 ? lv.index / (n - 1) : 1;
    let perBlock = t.budgetPerBlockFirst + (t.budgetPerBlockLast - t.budgetPerBlockFirst) * ramp;
    if (base) perBlock *= t.baseBudgetBonus;
    return {
      ...lv,
      kind: base ? ('base' as const) : ('field' as const),
      budget: Math.round(Math.min(perBlock * lv.blocks, maxBudget)),
      maxBudget,
    };
  });
  return {
    seed: opts.seed,
    cols,
    rows,
    grid,
    levels,
    warnings,
    cut,
    tiles,
    owner,
    crossings,
    hq,
    outposts,
  };
}

/** The top row's HQ block (else its first enemy block). */
function hqColumn(grid: GrownCell[][]): number {
  const row = grid[0] ?? [];
  const hq = row.findIndex((g) => g.block.role === 'hq');
  return hq >= 0
    ? hq
    : Math.max(
        0,
        row.findIndex((g) => g.side === 'enemy'),
      );
}

/** The level holding most of a block's walkable ground (the last level if none). */
function levelAtBlock(owner: Int16Array, w: number, br: number, bc: number, count: number): number {
  const n = BLOCK_CELLS;
  const votes = new Map<number, number>();
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const lv = owner[(br * n + y) * w + bc * n + x]!;
      if (lv >= 0) votes.set(lv, (votes.get(lv) ?? 0) + 1);
    }
  }
  let best = count - 1;
  let most = 0;
  for (const [lv, v] of [...votes].sort((a, b) => a[0] - b[0])) {
    if (v > most) {
      most = v;
      best = lv;
    }
  }
  return best;
}

export { worldLevelMap } from './region';
