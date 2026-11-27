import { describe, expect, it } from 'vitest';
import { BLOCK_CELLS } from '../../content/ground';
import { BLOCK_TUNING, DEFAULT_TUNING } from '../../content/tuning';
import { createWorld, step } from '../../sim/sim';
import { validateMap } from '../../sim/world/map';
import {
  BLOCK_VERSION,
  blockToJson,
  newBlock,
  parseBlock,
  validateBlock,
  type BlockDef,
  type BlockItem,
} from '../block';
import { blockToPreviewMap, waterRects } from '../preview';

const keys = (b: BlockDef) => validateBlock(b).map((p) => p.key);

/** A small fortified block: a stream with a gated crossing, a squad holding a point. */
function fort(): BlockDef {
  const b = newBlock('fort', 'Fort');
  const ground = b.ground.map((row, r) => (r >= 6 && r <= 8 ? row.replace(/G/g, 'W') : row));
  const items: BlockItem[] = [
    { id: 'gate', kind: 'gate', priority: 0, rect: [6, 6.5, 3, 0.5] },
    { id: 'lever', kind: 'lever', priority: 0, at: [5, 10], target: 'gate' },
    { id: 'wall', kind: 'wall', priority: 0, rect: [2, 3, 3, 0.5] },
    { id: 'bags', kind: 'cover', priority: 0, rect: [6, 4, 3, 0.5], material: 'sandbags' },
    { id: 'cp', kind: 'capture', priority: 0, at: [7.5, 3], group: 'g' },
    { id: 'r1', kind: 'rally', priority: 0, at: [7, 2], group: 'g' },
    { id: 'r2', kind: 'rally', priority: 0, at: [9, 2.5], group: 'g' },
    { id: 't', kind: 'turret', priority: 2, at: [11, 2], facing: 90 },
    { id: 'mine', kind: 'mine', priority: 4, at: [3, 11] },
    { id: 'obj', kind: 'objective', priority: 0, at: [7.5, 1.5] },
  ];
  // A crossing through the stream where the gate is.
  for (const r of [6, 7, 8]) ground[r] = ground[r]!.slice(0, 6) + 'RRR' + ground[r]!.slice(9);
  const groups = [
    {
      id: 'g',
      units: [
        { role: 'gunner' as const, priority: 1 as const },
        { role: 'rifleman' as const, priority: 3 as const },
      ],
    },
  ];
  return { ...b, ground, items, groups };
}

describe('validateBlock', () => {
  it('a fresh block and the fort are clean', () => {
    expect(keys(newBlock())).toEqual([]);
    expect(keys(fort())).toEqual([]);
  });

  it('flags placed walls on the edge tiles (edges are paint only, [D101])', () => {
    const b = newBlock();
    b.items.push({ id: 'w', kind: 'wall', priority: 0, rect: [3, 0, 2, 0.5] });
    expect(keys(b)).toContain('editor.problem.blocksEdge');
  });

  it('checks levers, ids and squads', () => {
    const b = fort();
    const bad = {
      ...b,
      items: b.items.map((i): BlockItem => {
        if (i.kind === 'lever') return { ...i, target: 'nope' };
        if (i.id === 't') return { ...i, id: 'S1' };
        if (i.id === 'r2') return { ...i, group: 'ghost' };
        return i;
      }),
    };
    const k = keys(bad);
    expect(k).toContain('editor.problem.leverTarget');
    expect(k).toContain('editor.problem.badId');
    expect(k).toContain('editor.problem.groupMissing');
    const lonely = { ...b, groups: [...b.groups, { id: 'empty', units: [] }] };
    expect(keys(lonely)).toEqual(['editor.problem.groupEmpty', 'editor.problem.groupNoRally']);
  });
});

describe('block JSON', () => {
  it('round-trips through the download format, role included', () => {
    const b: BlockDef = { ...fort(), role: 'hq' };
    const res = parseBlock(blockToJson(b));
    expect(res.ok && res.block).toEqual(b);
  });

  it('rejects junk with a strings key', () => {
    expect(parseBlock('nope')).toEqual({ ok: false, key: 'editor.load.notJson' });
    expect(parseBlock('{"v":99}')).toEqual({ ok: false, key: 'editor.load.version' });
    expect(parseBlock('{"v":3,"id":"x","ground":["Q"],"items":[],"groups":[]}').ok).toBe(false);
  });

  it('reads version 2 blocks: their edge tags are dropped (the paint is the edge)', () => {
    const v2 = { ...fort(), v: 2, edges: { n: 'grass', e: 'stream', s: 'grass', w: 'stream' } };
    const res = parseBlock(JSON.stringify(v2));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.block.v).toBe(BLOCK_VERSION);
    expect('edges' in res.block).toBe(false);
    expect(res.block.ground).toEqual(fort().ground);
  });

  it('reads version 1 blocks: placed soldiers become a squad with rally points', () => {
    const v1 = {
      ...newBlock('old'),
      v: 1,
      edges: { n: 'grass', e: 'grass', s: 'grass', w: 'grass' },
      groups: undefined,
      items: [
        {
          id: 'a',
          kind: 'soldier',
          at: [3, 3],
          role: 'gunner',
          facing: 90,
          priority: 1,
          group: 'nest',
          anchor: true,
        },
        {
          id: 'b',
          kind: 'soldier',
          at: [3.2, 3.1],
          role: 'rifleman',
          facing: 90,
          priority: 2,
          group: 'nest',
        },
        { id: 'c', kind: 'soldier', at: [10, 3], role: 'sniper', facing: 90, priority: 4 },
        { id: 'cp', kind: 'capture', at: [5, 5], priority: 0, group: 'nest' },
      ],
    };
    const res = parseBlock(JSON.stringify(v1));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.block.v).toBe(BLOCK_VERSION);
    expect(res.block.groups).toEqual([
      {
        id: 'nest',
        units: [
          { role: 'gunner', priority: 1 },
          { role: 'rifleman', priority: 2 },
        ],
      },
      { id: 'squad', units: [{ role: 'sniper', priority: 4 }] },
    ]);
    expect(res.block.items.filter((i) => i.kind === 'rally').map((i) => i.group)).toEqual([
      'nest',
      'squad',
    ]);
    expect(res.block.items.find((i) => i.id === 'cp')?.group).toBe('nest');
    expect(keys(res.block)).toEqual([]);
  });
});

describe('blockToPreviewMap', () => {
  const opts = { id: 'preview', nameKey: 'map.editorPreview.name' };

  it('makes a valid map with spawns below, an objective, squads and water', () => {
    const map = blockToPreviewMap(fort(), opts);
    expect(() => validateMap(map)).not.toThrow();
    expect(map.spawnPoints.filter((s) => s.kind === 'initial')).toHaveLength(3);
    expect(map.capturePoints?.find((c) => c.objective)?.position).toEqual({ x: 480, y: 96 });
    expect(map.squads).toEqual([expect.objectContaining({ id: 'sq-g', capturePointId: 'cp' })]);
    expect(map.squads?.[0]?.members).toHaveLength(2);
    expect(map.water.length).toBeGreaterThan(0);
    expect(map.ground?.rows).toHaveLength(BLOCK_CELLS + 3);
  });

  it('wall and rock tiles become solid walls ([D103])', () => {
    const b = newBlock();
    b.ground[5] = 'GGGXXXGGGKKKGGG';
    const map = blockToPreviewMap(b, opts);
    const cs = BLOCK_TUNING.cellSize;
    const solid = map.walls.filter((w) => w.y === 5 * cs && w.h === cs);
    expect(solid.map((w) => [w.x / cs, w.w / cs])).toEqual([
      [3, 3],
      [9, 3],
    ]);
  });

  it('a budget spawns priority 0 free, then 1-5 in order while it lasts', () => {
    const map = blockToPreviewMap(fort(), { ...opts, budget: 0 });
    expect(map.squads).toEqual([]);
    expect(map.turrets).toEqual([]);
    expect(map.capturePoints?.length).toBe(2);
    // Gunner (p1, 20) + turret (p2, 30) = 50; the p3 rifleman doesn't fit.
    const p2 = blockToPreviewMap(fort(), { ...opts, budget: 50 });
    expect(p2.squads?.[0]?.members).toHaveLength(1);
    expect(p2.turrets).toHaveLength(1);
  });

  it('runs in the sim with enemies on', () => {
    const w = createWorld(blockToPreviewMap(fort(), opts), DEFAULT_TUNING);
    for (let i = 0; i < 300; i++) step(w, new Map());
    expect(w.state.tick).toBe(300);
  });
});

describe('waterRects', () => {
  it('merges runs down the rows', () => {
    expect(waterRects(['GWWG', 'GWWG', 'WGGG'], 10)).toEqual([
      { x: 10, y: 0, w: 20, h: 20 },
      { x: 0, y: 20, w: 10, h: 10 },
    ]);
  });
});
