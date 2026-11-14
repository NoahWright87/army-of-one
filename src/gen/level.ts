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
import { spendBudget } from './budget';
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
  const rng = createRng(mix(opts.seed, attempt));
  const warnings: string[] = [];
  const grid: { block: BlockDef; o: Orientation; fit: LevelCell['fit'] }[][] = Array.from(
    { length: rows },
    () => [],
  );

  // Frame ([D83]): the enemy base takes the top row(s), wall facing south. Then everything is
  // filled top-down, left to right, matching the block above and the block to the left.
  const basePool = pool.filter(isBaseBlock);
  const fieldPool = pool.filter((b) => !isBaseBlock(b));
  const baseRows = basePool.length && fieldPool.length ? Math.min(t.baseRows, rows - 1) : 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const above = r > 0 ? grid[r - 1]![c]! : null;
      const left = c > 0 ? grid[r]![c - 1]! : null;
      const want: Want = {
        // The neighbour reads the shared edge the other way round ([D81]).
        n: above ? mirrorTag(orientEdges(above.block.edges, above.o).s) : null,
        w: left ? mirrorTag(orientEdges(left.block.edges, left.o).e) : null,
      };
      const inBase = r < baseRows;
      const lastBaseRow = r === baseRows - 1;
      const bottom = r === rows - 1;
      const fits = (e: BlockDef['edges']) =>
        (!lastBaseRow || !edgeDef(e.s).base) && (!bottom || EDGE_TAGS[e.s].passable);
      const pick = pickBlock(inBase ? basePool : baseRows ? fieldPool : pool, want, fits, rng);
      if (pick.fit !== 'exact') {
        warnings.push(`row ${r} col ${c}: no exact match for ${JSON.stringify(want)}`);
      }
      grid[r]![c] = pick;
    }
  }

  // Budget: row weights rise toward the top.
  const total = opts.budget ?? t.budget;
  const weight = (r: number) => 1 + (rows > 1 ? (t.ramp * (rows - 1 - r)) / (rows - 1) : 0);
  const sumW = Array.from({ length: rows }, (_, r) => weight(r)).reduce((a, b) => a + b, 0);
  const placed: PlacedBlock[] = [];
  const cells: LevelCell[][] = Array.from({ length: rows }, () => []);
  let carry = 0;
  let spent = 0;
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = 0; c < cols; c++) {
      const g = grid[r]![c]!;
      const block = orientBlock(g.block, g.o);
      const share = (total * weight(r)) / sumW / cols + carry;
      const res = spendBudget(block, Math.floor(share), mix(mix(opts.seed, attempt), r * 97 + c));
      carry = share - res.spent;
      spent += res.spent;
      placed.push({ block, col: c, row: r, spawned: res.spawned, prefix: `r${r}c${c}-` });
      cells[r]![c] = {
        blockId: g.block.id,
        orientation: g.o,
        fit: g.fit,
        budget: Math.floor(share),
        spent: res.spent,
      };
    }
  }

  const map = assembleMap({
    id: opts.id,
    nameKey: opts.nameKey,
    cols,
    rows,
    placed,
    objective: pickObjective(placed, cols, rng),
  });
  return { map, cells, warnings, spent, attempts: attempt + 1, reachable: objectiveReachable(map) };
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
  return { block: pool[0]!, o: 0, fit: 'any' };
}

function pickObjective(placed: readonly PlacedBlock[], cols: number, rng: RngState): Vec2 {
  const cs = BLOCK_TUNING.cellSize;
  const n = BLOCK_CELLS;
  const slots: Vec2[] = [];
  for (const pb of placed) {
    if (pb.row !== 0) continue;
    for (const it of pb.block.items) {
      if (it.kind === 'objective') {
        slots.push({ x: (pb.col * n + it.at[0]) * cs, y: it.at[1] * cs });
      }
    }
  }
  if (slots.length) return slots[Math.floor(nextFloat(rng) * slots.length)]!;
  return { x: (cols * n * cs) / 2, y: 1.5 * cs };
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
