import { describe, expect, it } from 'vitest';
import { OFFICIAL_BLOCKS } from '../../content/blocks';
import { EDGE_TAGS } from '../../content/ground';
import { BLOCK_TUNING } from '../../content/tuning';
import { validateMap } from '../../sim/world/map';
import { isBaseBlock } from '../level';
import { parseWorldMissionId, worldMissionId } from '../mission-id';
import { orientEdges } from '../transform';
import { generateWorld, worldLevelMap } from '../world';

const W = BLOCK_TUNING.world;

describe('generateWorld ([D83], [D89])', () => {
  it('is deterministic per seed', () => {
    const a = generateWorld(OFFICIAL_BLOCKS, { seed: 4 });
    const b = generateWorld(OFFICIAL_BLOCKS, { seed: 4 });
    const key = (w: typeof a) =>
      JSON.stringify([w.grid.map((r) => r.map((g) => [g.block.id, g.o])), w.levels, w.h, w.v]);
    expect(key(b)).toBe(key(a));
    expect(key(generateWorld(OFFICIAL_BLOCKS, { seed: 5 }))).not.toBe(key(a));
  });

  it('puts the base on top, respects the frame and carves the whole board into levels', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const w = generateWorld(OFFICIAL_BLOCKS, { seed });
      expect(w.grid).toHaveLength(W.rows);
      for (let c = 0; c < W.cols; c++) {
        for (let r = 0; r < W.baseRows; r++) expect(isBaseBlock(w.grid[r]![c]!.block)).toBe(true);
        expect(isBaseBlock(w.grid[W.baseRows]![c]!.block)).toBe(false);
      }
      // Frame barriers block movement wherever the fill matched exactly.
      w.h.forEach((row, r) =>
        row.forEach((bar, c) => {
          const g = w.grid[r]![c]!;
          if (!bar || g.fit !== 'exact') return;
          expect(EDGE_TAGS[orientEdges(g.block.edges, g.o).s].passable, `seed ${seed}`).toBe(false);
        }),
      );
      // Every block belongs to exactly one level.
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
    const first = w.levels.filter((l) => l.row === Math.max(...w.levels.map((x) => x.row)));
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
