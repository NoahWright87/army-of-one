/**
 * (PHASE13) One level from a seed ([D80], [D85], [D101], [D102]): a small board grown from both
 * ends (`grow.ts`: the enemy HQ at the top, the player's start at the bottom, the sides taking
 * turns with blocks whose edges match tile for tile), a path cut where there's none, then the
 * budget spent (rows further up get more, [D86]) and the objective put where you can reach it.
 *
 * Pure and deterministic: same blocks, seed and options → same map.
 */
import { BLOCK_CELLS } from '../content/ground';
import { BLOCK_TUNING } from '../content/tuning';
import { createRng, nextFloat, type RngState } from '../sim/core/rng';
import type { Vec2 } from '../sim/core/vec';
import type { MapDef, Rect } from '../sim/world/map';
import { assembleMap, type PlacedBlock } from './assemble';
import type { BlockDef } from './block';
import { blockTotalCost, spendBudget } from './budget';
import { bottomTiles, connect, growBoard, Palette, type GrownCell } from './grow';
import type { Orientation } from './transform';

export interface LevelOptions {
  id: string;
  nameKey: string;
  seed: number;
  /** Whole-level enemy budget; default `BLOCK_TUNING.level.budgetPerBlock` × blocks. */
  budget?: number;
  cols?: number;
  rows?: number;
}

export interface LevelCell {
  blockId: string;
  orientation: Orientation;
  /** Did it match every neighbour, or only the most it could? */
  fit: 'exact' | 'loose';
  budget: number;
  spent: number;
}

export interface GeneratedLevel {
  map: MapDef;
  /** [row][col], row 0 at the top. */
  cells: LevelCell[][];
  warnings: string[];
  spent: number;
  /** Tiles cut to make a way through ([D102]). */
  cut: number;
  reachable: boolean;
}

/** Blocks the generator can use: well-formed ones only (the caller validates). */
export function generateLevel(pool: readonly BlockDef[], opts: LevelOptions): GeneratedLevel {
  if (pool.length === 0) throw new Error('generateLevel: no blocks');
  const t = BLOCK_TUNING.level;
  const rng = createRng(opts.seed);
  const rows = opts.rows ?? t.rows;
  const cols = opts.cols ?? t.cols;
  const { grid, warnings } = growBoard(new Palette(pool), { rows, cols }, rng);
  const built = buildLevelMap(grid, {
    id: opts.id,
    nameKey: opts.nameKey,
    seed: opts.seed,
    budget: opts.budget ?? t.budgetPerBlock * rows * cols,
  });
  return { ...built, warnings: [...warnings, ...built.warnings] };
}

export interface BuildOptions {
  id: string;
  nameKey: string;
  seed: number;
  /** Whole-level enemy budget ([D86]): rows further up get more, leftovers carry on. */
  budget: number;
}

/**
 * A playable map from a grid of placed blocks (a random level, or one level of the world map):
 * spend the budget, assemble, put the objective at the first reachable candidate (top-row
 * objective slots first). If none can be reached from the south edge, a path is cut to the best
 * one ([D102]) in this level's copy of the blocks.
 */
export function buildLevelMap(
  source: readonly (readonly GrownCell[])[],
  opts: BuildOptions,
): GeneratedLevel {
  const t = BLOCK_TUNING.level;
  const grid = source.map((row) => row.map((g) => ({ ...g })));
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const shares = budgetShares(
    grid.map((row) => row.map((g) => g.placed)),
    opts.budget,
    t.ramp,
  );
  const spendAll = () => {
    const placed: PlacedBlock[] = [];
    const cells: LevelCell[][] = Array.from({ length: rows }, () => []);
    let carry = 0;
    let spent = 0;
    for (let r = rows - 1; r >= 0; r--) {
      for (let c = 0; c < cols; c++) {
        const g = grid[r]![c]!;
        const share = shares[r]![c]! + carry;
        const budget = Math.floor(share + 1e-6);
        const res = spendBudget(g.placed, budget, mix(opts.seed, r * 97 + c));
        carry = share - res.spent;
        spent += res.spent;
        placed.push({
          block: g.placed,
          col: c,
          row: r,
          spawned: res.spawned,
          prefix: `r${r}c${c}-`,
        });
        cells[r]![c] = {
          blockId: g.block.id,
          orientation: g.o,
          fit: g.fit,
          budget,
          spent: res.spent,
        };
      }
    }
    return { placed, cells, spent };
  };

  let cut = 0;
  for (let pass = 0; pass < 2; pass++) {
    const { placed, cells, spent } = spendAll();
    const candidates = objectiveCandidates(placed, cols, createRng(mix(opts.seed, 0x51ab)));
    let map: MapDef | null = null;
    for (const objective of candidates) {
      map = assembleMap({ id: opts.id, nameKey: opts.nameKey, cols, rows, placed, objective });
      if (objectiveReachable(map)) {
        return { map, cells, warnings: [], spent, cut, reachable: true };
      }
    }
    if (pass === 1) return { map: map!, cells, warnings: [], spent, cut, reachable: false };
    // No way in: cut one from the south edge to the best objective spot.
    const cs = BLOCK_TUNING.cellSize;
    const goal = candidates[0]!;
    const gy = Math.min(rows * BLOCK_CELLS - 1, Math.floor(goal.y / cs));
    const gx = Math.min(cols * BLOCK_CELLS - 1, Math.floor(goal.x / cs));
    cut = connect(grid, bottomTiles(grid), [[gy, gx]]).length;
  }
  throw new Error('unreachable');
}

/**
 * Splits a level's budget between its blocks ([D86]): rows further up weigh more (`ramp`), but
 * no block gets more than it can spend; the excess goes to the others (so a budget at or above
 * everything's cost buys everything).
 */
export function budgetShares(
  blocks: readonly (readonly BlockDef[])[],
  total: number,
  ramp: number,
): number[][] {
  const rows = blocks.length;
  const weight = (r: number) => 1 + (rows > 1 ? (ramp * (rows - 1 - r)) / (rows - 1) : 0);
  const cap = blocks.map((row) => row.map((b) => blockTotalCost(b)));
  const share = blocks.map((row) => row.map(() => 0));
  let left = total;
  let open = blocks.flatMap((row, r) => row.map((_, c) => [r, c] as const));
  const EPS = 1e-6;
  for (let guard = 0; left > EPS && open.length > 0 && guard < 64; guard++) {
    const sumW = open.reduce((n, [r]) => n + weight(r), 0);
    let used = 0;
    const still: (readonly [number, number])[] = [];
    for (const [r, c] of open) {
      const want = (left * weight(r)) / sumW;
      const room = cap[r]![c]! - share[r]![c]!;
      const give = Math.min(want, room);
      share[r]![c]! += give;
      used += give;
      if (room - give > EPS) still.push([r, c]);
    }
    left -= used;
    if (used <= EPS) break;
    open = still;
  }
  return share;
}

/**
 * Where the objective could go, best first: objective slots in the top row (seeded order), then
 * slots elsewhere, then block centres from the top down. The first reachable one wins.
 */
function objectiveCandidates(placed: readonly PlacedBlock[], cols: number, rng: RngState): Vec2[] {
  const cs = BLOCK_TUNING.cellSize;
  const n = BLOCK_CELLS;
  const slots = (top: boolean) => {
    const out: Vec2[] = [];
    for (const pb of placed) {
      if ((pb.row === 0) !== top) continue;
      for (const it of pb.block.items) {
        if (it.kind === 'objective') {
          out.push({ x: (pb.col * n + it.at[0]) * cs, y: (pb.row * n + it.at[1]) * cs });
        }
      }
    }
    return shuffled(out, rng).sort((a, b) => a.y - b.y);
  };
  const centres = [...placed]
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((pb) => ({ x: (pb.col * n + n / 2) * cs, y: (pb.row * n + n / 2) * cs }));
  return [...slots(true), ...slots(false), { x: (cols * n * cs) / 2, y: 1.5 * cs }, ...centres];
}

function shuffled<T>(arr: T[], rng: RngState): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(nextFloat(rng) * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Can a soldier walk from the spawns to the objective? A coarse grid (half a cell) blocked by
 * walls, water and cover; gates count as open (a lever opens them).
 */
export function objectiveReachable(map: MapDef): boolean {
  const step = BLOCK_TUNING.cellSize / 2;
  const cols = Math.floor(map.width / step);
  const rowsN = Math.floor(map.height / step);
  const blockers: Rect[] = [...map.walls, ...map.water, ...(map.cover ?? []).map((c) => c.rect)];
  // (perf) Paint the blockers onto the grid once: a cell is blocked if a blocker holds its centre.
  const blocked = new Uint8Array(cols * rowsN);
  for (const b of blockers) {
    const x0 = Math.max(0, Math.ceil(b.x / step - 0.5));
    const x1 = Math.min(cols - 1, Math.floor((b.x + b.w) / step - 0.5));
    const y0 = Math.max(0, Math.ceil(b.y / step - 0.5));
    const y1 = Math.min(rowsN - 1, Math.floor((b.y + b.h) / step - 0.5));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) blocked[y * cols + x] = 1;
  }
  const free = (cx: number, cy: number) => !blocked[cy * cols + cx];
  const start = map.spawnPoints.find((s) => s.kind === 'initial')!.position;
  const goal = map.capturePoints!.find((c) => c.objective)!.position;
  const sx = Math.floor(start.x / step);
  const sy = Math.floor(start.y / step);
  const gx = Math.floor(goal.x / step);
  const gy = Math.floor(goal.y / step);
  const seen = new Uint8Array(cols * rowsN);
  const queue: number[] = [sy * cols + sx];
  seen[sy * cols + sx] = 1;
  const goalR = 2; // within a cell of the flag is close enough to capture it
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % cols;
    const y = (i - x) / cols;
    if (Math.abs(x - gx) <= goalR && Math.abs(y - gy) <= goalR) return true;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rowsN) continue;
      const j = ny * cols + nx;
      if (seen[j] || !free(nx, ny)) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return false;
}

/** Combines a seed with a number into a new 32-bit seed. */
export function mix(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}
