/**
 * (PHASE13-b) One level from a seed: blocks stitched like Carcassonne tiles ([D80]–[D83], [D85]).
 *
 * 1. Frame ([D83]): if there are base blocks, the top `baseRows` rows are the enemy base (base
 *    blocks only, the last base row's south edge facing out of the base); the rest are field
 *    blocks.
 * 2. Fill top-down, left to right. Each cell takes a block, in one of its 8 orientations, whose
 *    north edge matches the block above and whose west edge matches the block to its left
 *    ([D81]: the mirror tag). The bottom row's south edge must be crossable. A seeded pick:
 *    first a block (each fitting block equally likely), then one of its fitting orientations.
 * 3. If nothing matches exactly, take one that matches on crossable/not only, then anything,
 *    and say so in `warnings` (that's missing coverage for the block library).
 * 4. Spend the level budget: rows further up get more ([D86]), leftovers carry on.
 * 5. The objective goes at an objective slot in the top row (seeded pick), else the top centre.
 * 6. If the objective can't be reached from the spawns, reroll (same seed, next attempt).
 *
 * Pure and deterministic: same blocks, seed and options → same map.
 */
import { BLOCK_CELLS, EDGE_TAGS, edgeDef, mirrorTag, type EdgeTag } from '../content/ground';
import { BLOCK_TUNING } from '../content/tuning';
import { createRng, nextFloat, type RngState } from '../sim/core/rng';
import type { Vec2 } from '../sim/core/vec';
import { rectContains, type MapDef, type Rect } from '../sim/world/map';
import { assembleMap, type PlacedBlock } from './assemble';
import { SIDES, type BlockDef } from './block';
import { blockTotalCost, spendBudget } from './budget';
import { ORIENTATIONS, orientBlock, orientEdges, type Orientation } from './transform';

export interface LevelOptions {
  id: string;
  nameKey: string;
  seed: number;
  /** Whole-level enemy budget; default `BLOCK_TUNING.level.budget`. */
  budget?: number;
  cols?: number;
  rows?: number;
}

export interface LevelCell {
  blockId: string;
  orientation: Orientation;
  /** How the block was chosen: an exact match, a crossable-only match, or anything. */
  fit: 'exact' | 'passable' | 'any';
  budget: number;
  spent: number;
}

export interface GeneratedLevel {
  map: MapDef;
  /** [row][col], row 0 at the top. */
  cells: LevelCell[][];
  warnings: string[];
  spent: number;
  attempts: number;
  reachable: boolean;
}

/** Blocks the generator can use: well-formed ones only (the caller validates). */
export function generateLevel(pool: readonly BlockDef[], opts: LevelOptions): GeneratedLevel {
  if (pool.length === 0) throw new Error('generateLevel: no blocks');
  const t = BLOCK_TUNING.level;
  let last: GeneratedLevel | null = null;
  for (let attempt = 0; attempt < t.maxAttempts; attempt++) {
    const level = attemptLevel(pool, opts, attempt);
    if (level.reachable) return level;
    last = level;
  }
  last!.warnings.push(`objective unreachable after ${t.maxAttempts} attempts`);
  return last!;
}

function attemptLevel(
  pool: readonly BlockDef[],
  opts: LevelOptions,
  attempt: number,
): GeneratedLevel {
  const t = BLOCK_TUNING.level;
  const cols = opts.cols ?? t.cols;
  const rows = opts.rows ?? t.rows;
  const seed = mix(opts.seed, attempt);
  const rng = createRng(seed);
  const { grid, warnings } = fillGrid(pool, { rows, cols, baseRows: t.baseRows }, rng);
  const built = buildLevelMap(grid, {
    id: opts.id,
    nameKey: opts.nameKey,
    seed,
    budget: opts.budget ?? t.budget,
  });
  return { ...built, warnings: [...warnings, ...built.warnings], attempts: attempt + 1 };
}

/** A block placed on a grid: which block, which way round, how well it matched. */
export interface GridCell {
  block: BlockDef;
  o: Orientation;
  fit: LevelCell['fit'];
}

export interface FillOptions {
  rows: number;
  cols: number;
  /** Top rows that are the enemy base (if the pool has base blocks). */
  baseRows: number;
  /**
   * (PHASE13-c) The frame's say on a side of a cell ([D83]): true = must block movement,
   * false = must be crossable, undefined = free. Only the east and south sides are asked (the
   * north and west follow from the neighbours already placed).
   */
  barrier?: (r: number, c: number, side: 'e' | 's') => boolean | undefined;
}

/**
 * Fills a grid top-down, left to right ([D83]): base blocks in the top `baseRows` rows (the
 * last of them facing out of the base), field blocks below, each matching the block above and
 * to the left exactly ([D81]), and the frame's barriers. Fallbacks are logged in `warnings`.
 */
export function fillGrid(
  pool: readonly BlockDef[],
  opts: FillOptions,
  rng: RngState,
): { grid: GridCell[][]; warnings: string[] } {
  const { rows, cols } = opts;
  const warnings: string[] = [];
  const grid: GridCell[][] = Array.from({ length: rows }, () => []);
  const basePool = pool.filter(isBaseBlock);
  const fieldPool = pool.filter((b) => !isBaseBlock(b));
  const baseRows = basePool.length && fieldPool.length ? Math.min(opts.baseRows, rows - 1) : 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const above = r > 0 ? grid[r - 1]![c]! : null;
      const left = c > 0 ? grid[r]![c - 1]! : null;
      const want: Want = {
        // The neighbour reads the shared edge the other way round ([D81]).
        n: above ? mirrorTag(orientEdges(above.block.edges, above.o).s) : null,
        w: left ? mirrorTag(orientEdges(left.block.edges, left.o).e) : null,
      };
      const lastBaseRow = r === baseRows - 1;
      const bottom = r === rows - 1;
      const eBar = c < cols - 1 ? opts.barrier?.(r, c, 'e') : undefined;
      const sBar = r < rows - 1 ? opts.barrier?.(r, c, 's') : undefined;
      const fits = (e: BlockDef['edges']) =>
        (!lastBaseRow || !edgeDef(e.s).base) &&
        (!bottom || EDGE_TAGS[e.s].passable) &&
        (eBar === undefined || EDGE_TAGS[e.e].passable === !eBar) &&
        (sBar === undefined || EDGE_TAGS[e.s].passable === !sBar);
      const from = r < baseRows ? basePool : baseRows ? fieldPool : pool;
      const pick = pickBlock(from, want, fits, rng);
      if (pick.fit !== 'exact') {
        warnings.push(`row ${r} col ${c}: no exact match for ${JSON.stringify(want)}`);
      }
      grid[r]![c] = pick;
    }
  }
  return { grid, warnings };
}

export interface BuildOptions {
  id: string;
  nameKey: string;
  seed: number;
  /** Whole-level enemy budget ([D86]): rows further up get more, leftovers carry on. */
  budget: number;
}

/**
 * A playable map from a grid of placed blocks (a generated level, or one level of the world
 * map): spend the budget, assemble, put the objective at a top-row slot, check reachability.
 */
export function buildLevelMap(
  grid: readonly (readonly GridCell[])[],
  opts: BuildOptions,
): Omit<GeneratedLevel, 'attempts'> {
  const t = BLOCK_TUNING.level;
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const rng = createRng(mix(opts.seed, 0x51ab));
  const oriented = grid.map((row) => row.map((g) => orientBlock(g.block, g.o)));
  const shares = budgetShares(oriented, opts.budget, t.ramp);
  const placed: PlacedBlock[] = [];
  const cells: LevelCell[][] = Array.from({ length: rows }, () => []);
  let carry = 0;
  let spent = 0;
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = 0; c < cols; c++) {
      const g = grid[r]![c]!;
      const block = oriented[r]![c]!;
      const share = shares[r]![c]! + carry;
      const res = spendBudget(block, Math.floor(share + 1e-6), mix(opts.seed, r * 97 + c));
      carry = share - res.spent;
      spent += res.spent;
      placed.push({ block, col: c, row: r, spawned: res.spawned, prefix: `r${r}c${c}-` });
      cells[r]![c] = {
        blockId: g.block.id,
        orientation: g.o,
        fit: g.fit,
        budget: Math.floor(share + 1e-6),
        spent: res.spent,
      };
    }
  }
  // The objective: the first candidate a soldier can actually walk to.
  const candidates = objectiveCandidates(placed, cols, rng);
  let map: MapDef | null = null;
  for (const objective of candidates) {
    map = assembleMap({ id: opts.id, nameKey: opts.nameKey, cols, rows, placed, objective });
    if (objectiveReachable(map)) {
      return { map, cells, warnings: [], spent, reachable: true };
    }
  }
  return { map: map!, cells, warnings: [], spent, reachable: false };
}

type Want = { n: EdgeTag | null; w: EdgeTag | null };

/** A block with any base edge (concrete, base wall) belongs to an enemy base. */
export function isBaseBlock(b: BlockDef): boolean {
  return SIDES.some((sd) => edgeDef(b.edges[sd]).base === true);
}

function pickBlock(
  pool: readonly BlockDef[],
  want: Want,
  fits: (e: BlockDef['edges']) => boolean,
  rng: RngState,
): { block: BlockDef; o: Orientation; fit: LevelCell['fit'] } {
  const passable = (tag: EdgeTag) => EDGE_TAGS[tag].passable;
  const tiers: [LevelCell['fit'], (e: BlockDef['edges']) => boolean][] = [
    ['exact', (e) => (want.n === null || e.n === want.n) && (want.w === null || e.w === want.w)],
    [
      'passable',
      (e) =>
        (want.n === null || passable(e.n) === passable(want.n)) &&
        (want.w === null || passable(e.w) === passable(want.w)),
    ],
    ['any', () => true],
  ];
  for (const [fit, ok] of tiers) {
    const options = pool
      .map((block) => ({
        block,
        os: ORIENTATIONS.filter((o) => {
          const e = orientEdges(block.edges, o);
          return ok(e) && fits(e);
        }),
      }))
      .filter((x) => x.os.length > 0);
    if (options.length === 0) continue;
    const choice = options[Math.floor(nextFloat(rng) * options.length)]!;
    const o = choice.os[Math.floor(nextFloat(rng) * choice.os.length)]!;
    return { block: choice.block, o, fit };
  }
  // Nothing satisfies the frame either: take anything (logged as a fallback by the caller).
  const block = pool[Math.floor(nextFloat(rng) * pool.length)]!;
  return { block, o: 0, fit: 'any' };
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
  const free = (cx: number, cy: number) => {
    const p = { x: (cx + 0.5) * step, y: (cy + 0.5) * step };
    return !blockers.some((b) => rectContains(b, p));
  };
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
  while (queue.length) {
    const i = queue.shift()!;
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
