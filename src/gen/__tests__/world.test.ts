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
import { levelTags } from '../campaign';

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
    for (let seed = 1; seed <= 6; seed++) {
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
      // Levels hold only walkable ground, and nearly all of it (tiny pockets cut off by the
      // board's edge are no-man's-land).
      let loose = 0;
      let walkable = 0;
      let wrong = 0;
      for (let i = 0; i < w.owner.length; i++) {
        if (w.tiles.walk[i]) walkable++;
        if (w.owner[i]! >= 0 && !w.tiles.walk[i]) wrong++;
        else if (w.owner[i]! < 0 && w.tiles.walk[i]) loose++;
      }
      expect(wrong, `seed ${seed}`).toBe(0);
      expect(loose / walkable, `seed ${seed}`).toBeLessThan(0.01);
      expect(w.levels[w.hq]!.kind).toBe('base');
    }
  }, 20_000); // whole worlds: slower on CI

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
  }, 20_000); // whole worlds: slower on CI

  it("a level's full budget buys nearly everything (not what's kept clear of entries)", () => {
    const w = generateWorld(OFFICIAL_BLOCKS, { seed: 7 });
    for (const lv of w.levels.slice(0, 6)) {
      const m = worldLevelMap(w, lv.index, { id: 'x', nameKey: 'x', budget: lv.maxBudget });
      expect(m.spent, `level ${lv.index}`).toBeLessThanOrEqual(lv.maxBudget);
      expect(m.spent, `level ${lv.index}`).toBeGreaterThan(lv.maxBudget * 0.75);
    }
  });

  it('no enemy starts near an entry ([D114])', () => {
    const w = generateWorld(OFFICIAL_BLOCKS, { seed: 7 });
    const r = BLOCK_TUNING.carve.safeEntry * BLOCK_TUNING.cellSize;
    for (const lv of w.levels) {
      const m = worldLevelMap(w, lv.index, { id: 'x', nameKey: 'x', budget: lv.maxBudget }).map;
      const entries = m.spawnPoints.filter((s) => s.kind === 'initial').map((s) => s.position);
      for (const sq of m.squads ?? []) {
        for (const p of sq.rally ?? []) {
          for (const e of entries) {
            expect(Math.hypot(p.x - e.x, p.y - e.y), `level ${lv.index}`).toBeGreaterThan(
              r - 2 * BLOCK_TUNING.cellSize,
            );
          }
        }
      }
    }
  });

  it('entries have a run-in path from outside the level ([D112])', () => {
    const w = generateWorld(OFFICIAL_BLOCKS, { seed: 7 });
    const m = worldLevelMap(w, 0, { id: 'x', nameKey: 'x' }).map;
    for (const s of m.spawnPoints.filter((sp) => sp.kind === 'initial')) {
      expect(s.approach!.length).toBeGreaterThan(2);
      expect(s.approach!.at(-1)).toEqual(s.position);
    }
  });

  it('budgets rise from the first levels to the base', () => {
    const w = generateWorld(OFFICIAL_BLOCKS, { seed: 9 });
    const first = w.levels.filter((l) => l.band === 0);
    const base = w.levels.filter((l) => l.kind === 'base');
    const per = (l: (typeof first)[number]) => l.budget / Math.max(1, l.blocks);
    const avg = (ls: typeof first) => ls.reduce((n, l) => n + per(l), 0) / ls.length;
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
  }, 20_000); // whole worlds: slower on CI
});

describe('carving by terrain ([D107]–[D110])', () => {
  const w = generateWorld(OFFICIAL_BLOCKS, { seed: 149211784 });

  it('every level can be reached from the start through crossings', () => {
    const seen = new Set(w.crossings.filter((c) => c.a === -1).map((c) => c.b));
    for (let grew = true; grew;) {
      grew = false;
      for (const c of w.crossings) {
        if (c.a >= 0 && seen.has(c.a) !== seen.has(c.b)) {
          seen.add(c.a);
          seen.add(c.b);
          grew = true;
        }
      }
    }
    expect(seen.size).toBe(w.levels.length);
  });

  it('levels are numbered in the order you meet them', () => {
    expect(w.crossings.some((c) => c.a === -1 && c.b === 0)).toBe(true);
  });

  it("a level's map: spawns at entries, an objective at every exit, nothing outside walkable", () => {
    for (const lv of w.levels) {
      const m = worldLevelMap(w, lv.index, { id: 'x', nameKey: 'x' });
      const initial = m.map.spawnPoints.filter((s) => s.kind === 'initial');
      expect(initial.length, `level ${lv.index}`).toBe(m.entries.length);
      // (PHASE17, [D139]) Exits (or a far-end flag) + the HQ + the key position, plus green
      // flags at the entries.
      const cps = m.map.capturePoints ?? [];
      const exitFlags = cps.filter((c) => c.id.startsWith('exit-')).length;
      const hq = lv.index === w.hq ? 1 : 0;
      expect(exitFlags, `level ${lv.index}`).toBe(Math.max(1, m.exits.length + hq));
      const entries = cps.filter((c) => c.id.startsWith('entry-'));
      expect(entries.length).toBe(m.entries.length);
      expect(entries.every((c) => c.objective && c.initialStage === 'ours')).toBe(true);
      expect(cps.filter((c) => c.id === 'key').length).toBeLessThanOrEqual(1);
      expect(m.map.winByKillAll).toBe(true);
      expect(m.map.bounds).toBeDefined();
    }
  });

  it('holding a neighbour turns its exit into an entry', () => {
    const lv = w.levels.find((l) => w.crossings.some((c) => c.a === l.index && c.b > l.index))!;
    const next = w.crossings.find((c) => c.a === lv.index && c.b > lv.index)!.b;
    const before = worldLevelMap(w, lv.index, { id: 'x', nameKey: 'x' });
    const held = new Set([
      next,
      ...w.crossings.filter((c) => c.b === lv.index && c.a >= 0).map((c) => c.a),
    ]);
    const after = worldLevelMap(w, lv.index, { id: 'x', nameKey: 'x', held });
    expect(after.entries.length).toBeGreaterThan(before.entries.length);
    expect(after.exits.length).toBeLessThan(before.exits.length);
  });
});

describe('islands, pockets, exit spawns ([D108], [D111])', () => {
  const w = generateWorld(OFFICIAL_BLOCKS, { seed: 774454002 });

  it('a walled yard entered from the start edge belongs to a level', () => {
    // Seed 774454002: a base yard on the south edge, walled off from both neighbours.
    const y = w.tiles.h - 2;
    let yard = 0;
    for (let x = 23; x < 52; x++) if (w.owner[y * w.tiles.w + x]! >= 0) yard++;
    expect(yard).toBeGreaterThan(20);
  });

  it('no level is smaller than the merge size', () => {
    const min = BLOCK_TUNING.carve.mergeBelowBlocks;
    for (const lv of w.levels) expect(lv.blocks, `level ${lv.index}`).toBeGreaterThanOrEqual(min);
  });

  it('bridged islands get an optional outpost with a spawn', () => {
    expect(w.outposts.length).toBeGreaterThan(0);
    const [y, x] = w.outposts[0]!;
    const lv = w.owner[y * w.tiles.w + x]!;
    expect(lv).toBeGreaterThanOrEqual(0);
    const m = worldLevelMap(w, lv, { id: 'x', nameKey: 'x' }).map;
    const post = m.capturePoints!.find((c) => c.id.startsWith('outpost-'))!;
    expect(post.objective).toBeFalsy();
    expect(m.spawnPoints.some((s) => s.capturePointId === post.id)).toBe(true);
  });

  it('every exit taken opens a spawn point', () => {
    for (const lv of w.levels) {
      const m = worldLevelMap(w, lv.index, { id: 'x', nameKey: 'x' });
      const flags = m.map.capturePoints!.filter((c) => c.id.startsWith('exit-'));
      for (const f of flags.slice(0, m.exits.length)) {
        expect(
          m.map.spawnPoints.some((s) => s.kind === 'capture' && s.capturePointId === f.id),
        ).toBe(true);
      }
    }
  });
});

describe('walled bases ([D143], PHASE17)', () => {
  it('get a way in and are played, as elite levels', () => {
    let checked = 0;
    for (const seed of [42, 2]) {
      const w = generateWorld(OFFICIAL_BLOCKS, { seed });
      const tags = levelTags(w);
      for (const [y, x] of w.fortresses) {
        const lv = w.owner[y * w.tiles.w + x]!;
        expect(lv, `seed ${seed} fortress at ${y},${x}`).toBeGreaterThanOrEqual(0);
        expect(w.tiles.walk[y * w.tiles.w + x]).toBe(1);
        if (lv !== w.hq) expect(tags[lv]![0]).toEqual({ kind: 'elite' });
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('no trivially short levels ([D143], PHASE17)', () => {
  it('the key position is well away from every entry and exit', () => {
    const w = generateWorld(OFFICIAL_BLOCKS, { seed: 11 });
    const cs = BLOCK_TUNING.cellSize;
    const min = BLOCK_TUNING.carve.keyKeepAway * cs;
    for (const lv of w.levels) {
      const cps = worldLevelMap(w, lv.index, { id: 'x', nameKey: 'x' }).map.capturePoints ?? [];
      const key = cps.find((c) => c.id === 'key');
      if (!key) continue;
      for (const c of cps) {
        if (c.id === 'key') continue;
        const d = Math.hypot(c.position.x - key.position.x, c.position.y - key.position.y);
        expect(d, `level ${lv.index}: ${c.id}`).toBeGreaterThanOrEqual(min - cs);
      }
    }
  });
});
