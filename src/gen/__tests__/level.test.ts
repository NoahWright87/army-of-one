import { describe, expect, it } from 'vitest';
import { OFFICIAL_BLOCKS } from '../../content/blocks';
import { BLOCK_CELLS, EDGE_TAGS } from '../../content/ground';
import { BLOCK_TUNING, DEFAULT_TUNING } from '../../content/tuning';
import { hashState } from '../../sim/core/hash';
import { createWorld, step } from '../../sim/sim';
import { validateMap } from '../../sim/world/map';
import { newBlock, validateBlock, type BlockDef, type BlockItem } from '../block';
import { blockTotalCost, itemCost, spendBudget } from '../budget';
import { generateLevel, objectiveReachable } from '../level';
import { genMissionId, parseGenMissionId } from '../mission-id';
import {
  edgeLayout,
  ORIENTATIONS,
  orientBlock,
  orientEdges,
  orientFacing,
  orientPoint,
  type Orientation,
} from '../transform';

const T = BLOCK_TUNING.threat;

function squadBlock(items: BlockItem[]): BlockDef {
  return { ...newBlock(), items };
}
const soldier = (id: string, priority: number, extra: Partial<BlockItem> = {}): BlockItem =>
  ({
    id,
    kind: 'soldier',
    at: [7, 7],
    role: 'rifleman',
    facing: 90,
    priority,
    ...extra,
  }) as BlockItem;

describe('spendBudget', () => {
  it('priority 0 is free and always spawns; nothing is free for the enemy otherwise', () => {
    const b = squadBlock([soldier('a', 0), soldier('b', 1)]);
    expect(itemCost(b.items[0]!)).toBe(0);
    expect(itemCost(b.items[1]!)).toBe(T.role.rifleman);
    const r = spendBudget(b, 0);
    expect([...r.spawned]).toEqual(['a']);
    expect(r.spent).toBe(0);
  });

  it('spends breadth-first by priority and skips what does not fit', () => {
    const b = squadBlock([
      { id: 'tank', kind: 'soldier', at: [1, 1], role: 'tank', facing: 90, priority: 1 },
      soldier('r1', 1),
      soldier('r2', 2),
      { id: 'mine', kind: 'mine', at: [2, 2], priority: 3 },
    ]);
    // Not enough for the tank: the rifleman at the same priority still spawns, then r2, then mine.
    const r = spendBudget(b, 2 * T.role.rifleman + T.mine);
    expect([...r.spawned].sort()).toEqual(['mine', 'r1', 'r2']);
    expect(r.left).toBe(0);
    expect(blockTotalCost(b)).toBe(T.role.tank + 2 * T.role.rifleman + T.mine);
  });

  it('group members need their anchor; levers need their gate', () => {
    const b = squadBlock([
      soldier('lead', 2, { group: 'g', anchor: true }),
      soldier('m', 2, { group: 'g' }),
      { id: 'gate', kind: 'gate', rect: [5, 5, 3, 0.5], priority: 4 },
      { id: 'lever', kind: 'lever', at: [4, 6], target: 'gate', priority: 4 },
    ]);
    const none = spendBudget(b, T.role.rifleman - 1);
    expect(none.spawned.has('m')).toBe(false);
    const all = spendBudget(b, null);
    expect([...all.spawned].sort()).toEqual(['gate', 'lead', 'lever', 'm']);
  });

  it('is deterministic per seed', () => {
    const b = squadBlock(Array.from({ length: 8 }, (_, i) => soldier(`s${i}`, 1)));
    const a = spendBudget(b, 3 * T.role.rifleman, 7);
    expect([...spendBudget(b, 3 * T.role.rifleman, 7).spawned]).toEqual([...a.spawned]);
    expect(a.spawned.size).toBe(3);
  });
});

describe('orientation', () => {
  const tagged: BlockDef = {
    ...newBlock(),
    edges: { n: 'road', e: 'water', s: 'grass', w: 'stream' },
  };

  it('four quarter turns and two flips are the identity', () => {
    let p: [number, number] = [2, 3];
    for (let i = 0; i < 4; i++) p = orientPoint(p, 1);
    expect(p).toEqual([2, 3]);
    expect(orientPoint(orientPoint([2, 3], 4), 4)).toEqual([2, 3]);
  });

  it('a quarter turn clockwise moves north to east; a flip swaps east and west', () => {
    expect(orientEdges(tagged.edges, 1)).toEqual({
      n: 'stream',
      e: 'road',
      s: 'water',
      w: 'grass',
    });
    expect(orientEdges(tagged.edges, 4)).toEqual({
      n: 'road',
      e: 'stream',
      s: 'grass',
      w: 'water',
    });
    expect(orientPoint([7.5, 0], 1)).toEqual([BLOCK_CELLS, 7.5]);
    expect(orientFacing(90, 1)).toBe(180); // south → west
    expect(orientFacing(0, 4)).toBe(180); // east → west
  });

  it('edge layouts group blocks that are the same up to rotation and flipping', () => {
    const k = edgeLayout(tagged.edges).key;
    for (const o of ORIENTATIONS) expect(edgeLayout(orientEdges(tagged.edges, o)).key).toBe(k);
    expect(edgeLayout({ n: 'road', e: 'grass', s: 'road', w: 'grass' }).key).not.toBe(
      edgeLayout({ n: 'road', e: 'road', s: 'grass', w: 'grass' }).key,
    );
  });

  it('every official block stays valid in all 8 orientations', () => {
    for (const b of OFFICIAL_BLOCKS) {
      for (const o of ORIENTATIONS) {
        expect(validateBlock(orientBlock(b, o as Orientation)), `${b.id} o${o}`).toEqual([]);
      }
    }
  });
});

describe('official blocks', () => {
  it('load, validate and have unique ids', () => {
    expect(OFFICIAL_BLOCKS.length).toBeGreaterThan(0);
    const ids = OFFICIAL_BLOCKS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('generateLevel', () => {
  const opts = { id: 'gen-test', nameKey: 'map.generated.name' };

  it('is deterministic: same seed, same map', () => {
    const a = generateLevel(OFFICIAL_BLOCKS, { ...opts, seed: 5 });
    const b = generateLevel(OFFICIAL_BLOCKS, { ...opts, seed: 5 });
    expect(JSON.stringify(b.map)).toBe(JSON.stringify(a.map));
    const c = generateLevel(OFFICIAL_BLOCKS, { ...opts, seed: 6 });
    expect(JSON.stringify(c.map)).not.toBe(JSON.stringify(a.map));
  });

  it('makes valid, reachable maps whose seams match exactly', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const lvl = generateLevel(OFFICIAL_BLOCKS, { ...opts, seed });
      expect(() => validateMap(lvl.map), `seed ${seed}`).not.toThrow();
      expect(lvl.reachable, `seed ${seed}`).toBe(true);
      expect(lvl.warnings, `seed ${seed}`).toEqual([]);
      const rows = lvl.cells.length;
      const cols = lvl.cells[0]!.length;
      const edges = (r: number, c: number) => {
        const cell = lvl.cells[r]![c]!;
        const block = OFFICIAL_BLOCKS.find((b) => b.id === cell.blockId)!;
        return orientEdges(block.edges, cell.orientation);
      };
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (r < rows - 1) expect(edges(r, c).s).toBe(edges(r + 1, c).n);
          if (c > 0) expect(edges(r, c).w).toBe(edges(r, c - 1).e);
        }
        expect(EDGE_TAGS[edges(rows - 1, 0).s].passable).toBe(true);
      }
    }
  });

  it('spends no more than the budget, and more budget means more enemies', () => {
    const count = (budget: number) => {
      const lvl = generateLevel(OFFICIAL_BLOCKS, { ...opts, seed: 3, budget });
      expect(lvl.spent).toBeLessThanOrEqual(budget);
      return lvl.map.squads!.reduce((n, s) => n + s.members.length, 0) + lvl.map.turrets!.length;
    };
    expect(count(0)).toBe(0);
    expect(count(150)).toBeLessThan(count(900));
  });

  it('later rows get more of the budget', () => {
    const lvl = generateLevel(OFFICIAL_BLOCKS, { ...opts, seed: 9, budget: 400 });
    const rowBudget = (r: number) => lvl.cells[r]!.reduce((n, c) => n + c.budget, 0);
    expect(rowBudget(0)).toBeGreaterThan(rowBudget(lvl.cells.length - 1));
  });

  it('runs in the sim with enemies, deterministically', () => {
    const run = () => {
      const w = createWorld(
        generateLevel(OFFICIAL_BLOCKS, { ...opts, seed: 11 }).map,
        DEFAULT_TUNING,
      );
      for (let i = 0; i < 240; i++) step(w, new Map());
      return hashState(w.state);
    };
    expect(run()).toBe(run());
  });

  it('notices an unreachable objective', () => {
    const lvl = generateLevel(OFFICIAL_BLOCKS, { ...opts, seed: 2 });
    const walled = {
      ...lvl.map,
      walls: [...lvl.map.walls, { x: 0, y: 1500, w: lvl.map.width, h: 40 }],
    };
    expect(objectiveReachable(walled)).toBe(false);
  });
});

describe('generated mission ids', () => {
  it('round-trip seed and budget', () => {
    expect(parseGenMissionId(genMissionId(42))).toEqual({ seed: 42 });
    expect(parseGenMissionId(genMissionId(7, 500))).toEqual({ seed: 7, budget: 500 });
    expect(parseGenMissionId('mission-03')).toBeNull();
    expect(parseGenMissionId('gen-x')).toBeNull();
  });
});
