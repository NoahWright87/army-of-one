import { describe, expect, it } from 'vitest';
import { OFFICIAL_BLOCKS } from '../../content/blocks';
import { BLOCK_TUNING } from '../../content/tuning';
import { createRng } from '../../sim/core/rng';
import { validateMap } from '../../sim/world/map';
import { newBlock, type BlockDef } from '../block';
import { edgesMatch, sideProfiles } from '../edges';
import { blockTiles, connect, growBoard, Palette, seamMatches, type GrownCell } from '../grow';
import { parseWorldMissionId, worldMissionId } from '../mission-id';
import { generateWorld, worldLevelMap } from '../world';

const W = BLOCK_TUNING.world;
const key = (w: ReturnType<typeof generateWorld>) =>
  JSON.stringify([w.grid.map((r) => r.map((g) => [g.block.id, g.o])), w.levels, w.cut]);

describe('generateWorld ([D101], [D102])', () => {
  it('is deterministic per seed', () => {
    const a = generateWorld(OFFICIAL_BLOCKS, { seed: 4 });
    expect(key(generateWorld(OFFICIAL_BLOCKS, { seed: 4 }))).toBe(key(a));
    expect(key(generateWorld(OFFICIAL_BLOCKS, { seed: 5 }))).not.toBe(key(a));
  });

  it('grows from the HQ (top row) and the start (bottom row), and carves every block into one level', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const w = generateWorld(OFFICIAL_BLOCKS, { seed });
      expect(w.grid).toHaveLength(W.rows);
      expect(
        w.grid[0]!.some((g) => g.block.role === 'hq'),
        `seed ${seed}`,
      ).toBe(true);
      expect(
        w.grid[W.rows - 1]!.some((g) => g.block.role === 'start'),
        `seed ${seed}`,
      ).toBe(true);
      const owner = w.grid.map((row) => row.map(() => 0));
      for (const lv of w.levels) {
        for (let r = lv.row; r < lv.row + lv.rows; r++) {
          for (let c = lv.col; c < lv.col + lv.cols; c++) owner[r]![c]! += 1;
        }
      }
      expect(
        owner.flat().every((n) => n === 1),
        `seed ${seed}`,
      ).toBe(true);
      expect(w.levels.at(-1)!.kind).toBe('base');
    }
  });

  it('seams between blocks that both fit exactly match', () => {
    const w = generateWorld(OFFICIAL_BLOCKS, { seed: 8 });
    w.grid.forEach((row, r) =>
      row.forEach((g, c) => {
        if (g.fit !== 'exact') return;
        const up = w.grid[r - 1]?.[c];
        const left = row[c - 1];
        // A seam between two blocks that both fitted exactly must match.
        if (up?.fit === 'exact') expect(edgesMatch(g.edges.n, up.edges.s)).toBe(true);
        if (left?.fit === 'exact') expect(edgesMatch(g.edges.w, left.edges.e)).toBe(true);
      }),
    );
  });

  it('every level builds a valid, winnable map', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const w = generateWorld(OFFICIAL_BLOCKS, { seed });
      for (const lv of w.levels) {
        const m = worldLevelMap(w, lv.index, { id: 'x', nameKey: 'map.generated.name' });
        expect(() => validateMap(m.map)).not.toThrow();
        expect(m.reachable, `seed ${seed} level ${lv.index}`).toBe(true);
        expect(m.spent).toBeLessThanOrEqual(lv.budget);
      }
    }
  });

  it("a level's full budget buys everything in it", () => {
    const w = generateWorld(OFFICIAL_BLOCKS, { seed: 7 });
    for (const lv of w.levels.slice(0, 6)) {
      const m = worldLevelMap(w, lv.index, { id: 'x', nameKey: 'x', budget: lv.maxBudget });
      expect(m.spent, `level ${lv.index}`).toBe(lv.maxBudget);
    }
  });

  it('budgets rise from the first levels to the base', () => {
    const w = generateWorld(OFFICIAL_BLOCKS, { seed: 9 });
    const bottom = Math.max(...w.levels.map((x) => x.row));
    const first = w.levels.filter((l) => l.row === bottom);
    const base = w.levels.filter((l) => l.kind === 'base');
    const avg = (ls: typeof first) => ls.reduce((n, l) => n + l.budget, 0) / ls.length;
    expect(avg(base)).toBeGreaterThan(avg(first));
  });

  it('level mission ids round-trip', () => {
    expect(parseWorldMissionId(worldMissionId(42, 3))).toEqual({ seed: 42, level: 3 });
    expect(parseWorldMissionId(worldMissionId(42, 3, 500))).toEqual({
      seed: 42,
      level: 3,
      budget: 500,
    });
    expect(parseWorldMissionId('gen-42')).toBeNull();
  });
});

describe('connect: cutting a way through ([D102])', () => {
  const block = (id: string, fill: string): BlockDef => ({
    ...newBlock(id),
    ground: newBlock().ground.map(() => fill.repeat(15)),
  });
  const cell = (b: BlockDef): GrownCell => ({
    block: b,
    o: 0,
    placed: b,
    edges: sideProfiles(b),
    fit: 'exact',
    side: 'player',
  });

  it('bridges a lake that cuts the board in two, only where it must', () => {
    const grid = [
      [cell(block('top', 'G'))],
      [cell(block('lake', 'W'))],
      [cell(block('bottom', 'G'))],
    ];
    const cut = connect(grid, blockTiles(2, 0), blockTiles(0, 0));
    expect(cut.length).toBeGreaterThan(0);
    const lake = grid[1]![0]!.placed.ground.join('');
    // A bridge three tiles wide, straight across (15 rows × 3).
    expect([...lake].filter((ch) => ch === 'B')).toHaveLength(45);
    // Already connected: nothing to cut.
    expect(connect(grid, blockTiles(2, 0), blockTiles(0, 0))).toEqual([]);
  });

  it('breaches walls and makes passes through rocks', () => {
    const grid = [
      [cell(block('a', 'G'))],
      [cell(block('wall', 'X'))],
      [cell(block('rock', 'K'))],
      [cell(block('b', 'G'))],
    ];
    connect(grid, blockTiles(3, 0), blockTiles(0, 0));
    expect(grid[1]![0]!.placed.ground.join('')).toContain('C');
    expect(grid[2]![0]!.placed.ground.join('')).toContain('D');
  });
});

describe('growBoard', () => {
  it('fills every cell, the enemy side growing from the top', () => {
    const { grid } = growBoard(new Palette(OFFICIAL_BLOCKS), { rows: 6, cols: 4 }, createRng(1));
    expect(grid.flat()).toHaveLength(24);
    expect(grid[0]!.some((g) => g.side === 'enemy')).toBe(true);
    expect(grid[5]!.some((g) => g.side === 'player')).toBe(true);
  });
});

describe('growBoard look-ahead and repair', () => {
  it('marks a cell loose exactly when one of its seams fails against the final board', () => {
    const w = generateWorld(OFFICIAL_BLOCKS, { seed: 444015314 });
    for (let r = 0; r < w.rows; r++) {
      for (let c = 0; c < w.cols; c++) {
        const ok = (['n', 'e', 's', 'w'] as const).every((sd) => seamMatches(w.grid, r, c, sd));
        expect(w.grid[r]![c]!.fit).toBe(ok ? 'exact' : 'loose');
      }
    }
  });

  it('rarely leaves a bad seam (was ~70 per world before look-ahead)', () => {
    let bad = 0;
    const seeds = [3, 444015314, 77, 1234];
    for (const seed of seeds) {
      const w = generateWorld(OFFICIAL_BLOCKS, { seed });
      for (let r = 0; r < w.rows; r++) {
        for (let c = 0; c < w.cols; c++) {
          if (!seamMatches(w.grid, r, c, 'e')) bad++;
          if (!seamMatches(w.grid, r, c, 's')) bad++;
        }
      }
    }
    expect(bad / seeds.length).toBeLessThan(10);
  });
});
