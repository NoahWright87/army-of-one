import { describe, expect, it } from 'vitest';
import { OFFICIAL_BLOCKS } from '../../content/blocks';
import { BLOCK_TUNING, DEFAULT_TUNING } from '../../content/tuning';
import { hashState } from '../../sim/core/hash';
import { createWorld, step } from '../../sim/sim';
import { validateMap } from '../../sim/world/map';
import { newBlock, validateBlock, type BlockDef, type BlockItem, type GroupUnit } from '../block';
import { blockTotalCost, itemCost, spendBudget, unitCost } from '../budget';
import { edgesMatch, sideProfiles } from '../edges';
import { generateLevel, objectiveReachable } from '../level';
import { genMissionId, parseGenMissionId } from '../mission-id';
import {
  ORIENTATIONS,
  orientBlock,
  orientFacing,
  orientPoint,
  type Orientation,
} from '../transform';

const T = BLOCK_TUNING.threat;

/** A block with one squad (`units`, rally point at the centre) plus `items`. */
function squadBlock(units: GroupUnit[], items: BlockItem[] = []): BlockDef {
  return {
    ...newBlock(),
    items: [{ id: 'r', kind: 'rally', at: [7, 7], group: 'g', priority: 0 }, ...items],
    groups: [{ id: 'g', units }],
  };
}
const unit = (priority: number, role: GroupUnit['role'] = 'rifleman'): GroupUnit => ({
  role,
  priority: priority as GroupUnit['priority'],
});
const bought = (b: BlockDef, budget: number | null, seed?: number) =>
  [...spendBudget(b, budget, seed).spawned].filter((id) => id.startsWith('g#')).sort();

describe('spendBudget', () => {
  it('priority 0 is free and always spawns; nothing is free for the enemy otherwise', () => {
    const b = squadBlock([unit(0), unit(1)]);
    expect(unitCost(b.groups[0]!.units[0]!)).toBe(0);
    expect(unitCost(b.groups[0]!.units[1]!)).toBe(T.role.rifleman);
    expect(bought(b, 0)).toEqual(['g#0']);
    expect(spendBudget(b, 0).spawned.has('r')).toBe(true); // rally points are free
  });

  it('tank first, riflemen second: low budgets buy riflemen, more the tank, lots both', () => {
    const b = squadBlock(
      [unit(1, 'tank'), unit(2), unit(2)],
      [{ id: 'mine', kind: 'mine', at: [2, 2], priority: 3 }],
    );
    expect(bought(b, 2 * T.role.rifleman)).toEqual(['g#1', 'g#2']);
    expect(bought(b, T.role.tank)).toEqual(['g#0']);
    expect(bought(b, T.role.tank + 2 * T.role.rifleman)).toEqual(['g#0', 'g#1', 'g#2']);
    expect(blockTotalCost(b)).toBe(T.role.tank + 2 * T.role.rifleman + T.mine);
    expect(itemCost(b.items[1]!)).toBe(T.mine);
  });

  it('a lever bought before its gate waits for it', () => {
    const b = squadBlock(
      [],
      [
        { id: 'gate', kind: 'gate', rect: [5, 5, 3, 0.5], priority: 4 },
        { id: 'lever', kind: 'lever', at: [4, 6], target: 'gate', priority: 3 },
      ],
    );
    const r = spendBudget(b, 0);
    expect(r.spawned.has('gate')).toBe(true);
    expect(r.spawned.has('lever')).toBe(true);
  });

  it('is deterministic per seed', () => {
    const b = squadBlock(Array.from({ length: 8 }, () => unit(1)));
    const a = bought(b, 3 * T.role.rifleman, 7);
    expect(bought(b, 3 * T.role.rifleman, 7)).toEqual(a);
    expect(a).toHaveLength(3);
  });
});

describe('orientation', () => {
  it('four quarter turns and two flips are the identity', () => {
    let p: [number, number] = [2, 3];
    for (let i = 0; i < 4; i++) p = orientPoint(p, 1);
    expect(p).toEqual([2, 3]);
    expect(orientPoint(orientPoint([2, 3], 4), 4)).toEqual([2, 3]);
    expect(orientFacing(90, 1)).toBe(180); // south → west
    expect(orientFacing(0, 4)).toBe(180); // east → west
  });

  it('turning a block turns its edges: north goes east', () => {
    const b = {
      ...newBlock(),
      ground: newBlock().ground.map((r, i) => (i === 0 ? 'R'.repeat(15) : r)),
    };
    expect(sideProfiles(orientBlock(b, 1)).e).toBe('R'.repeat(15));
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
  it('load, validate, have unique ids, and include a start and an HQ', () => {
    const ids = OFFICIAL_BLOCKS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(OFFICIAL_BLOCKS.some((b) => b.role === 'start')).toBe(true);
    expect(OFFICIAL_BLOCKS.some((b) => b.role === 'hq')).toBe(true);
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

  it('makes valid, reachable maps', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const lvl = generateLevel(OFFICIAL_BLOCKS, { ...opts, seed });
      expect(() => validateMap(lvl.map), `seed ${seed}`).not.toThrow();
      expect(lvl.reachable, `seed ${seed}`).toBe(true);
    }
  });

  it('puts the HQ at the top and the start at the bottom', () => {
    const lvl = generateLevel(OFFICIAL_BLOCKS, { ...opts, seed: 3 });
    const id = (r: number) => lvl.cells[r]!.map((c) => c.blockId);
    const role = (bid: string) => OFFICIAL_BLOCKS.find((b) => b.id === bid)?.role;
    expect(id(0).some((b) => role(b) === 'hq')).toBe(true);
    expect(id(lvl.cells.length - 1).some((b) => role(b) === 'start')).toBe(true);
  });

  it('blocks that fit exactly match their neighbours tile for tile ([D101])', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const lvl = generateLevel(OFFICIAL_BLOCKS, { ...opts, seed });
      const sides = lvl.cells.map((row) =>
        row.map((c) => {
          const b = OFFICIAL_BLOCKS.find((x) => x.id === c.blockId)!;
          return sideProfiles(orientBlock(b, c.orientation));
        }),
      );
      lvl.cells.forEach((row, r) =>
        row.forEach((c, col) => {
          // A seam between two blocks that both fitted exactly must match.
          if (c.fit !== 'exact') return;
          if (r > 0 && lvl.cells[r - 1]![col]!.fit === 'exact') {
            expect(edgesMatch(sides[r]![col]!.n, sides[r - 1]![col]!.s)).toBe(true);
          }
          if (col > 0 && row[col - 1]!.fit === 'exact') {
            expect(edgesMatch(sides[r]![col]!.w, sides[r]![col - 1]!.e)).toBe(true);
          }
        }),
      );
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
      // A wall right across the map, just south of the objective.
      walls: [
        ...lvl.map.walls,
        {
          x: 0,
          y: lvl.map.capturePoints!.find((c) => c.objective)!.position.y + 120,
          w: lvl.map.width,
          h: 40,
        },
      ],
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
