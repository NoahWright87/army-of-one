import { describe, expect, it } from 'vitest';
import { BLOCK_CELLS, EDGE_TAGS, EDGE_TAG_IDS, mirrorTag } from '../../content/ground';
import { DEFAULT_TUNING } from '../../content/tuning';
import { createWorld, step } from '../../sim/sim';
import { validateMap } from '../../sim/world/map';
import {
  applyEdges,
  blockToJson,
  edgeLock,
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
  // Open a crossing through the stream where the gate is.
  ground[6] = ground[6]!.slice(0, 6) + 'RRR' + ground[6]!.slice(9);
  ground[7] = ground[7]!.slice(0, 6) + 'RRR' + ground[7]!.slice(9);
  ground[8] = ground[8]!.slice(0, 6) + 'RRR' + ground[8]!.slice(9);
  const groups = [
    {
      id: 'g',
      units: [
        { role: 'gunner' as const, priority: 1 as const },
        { role: 'rifleman' as const, priority: 3 as const },
      ],
    },
  ];
  return applyEdges({
    ...b,
    edges: { ...b.edges, e: 'stream', w: 'stream' },
    ground,
    items,
    groups,
  });
}

describe('edge tags', () => {
  it('profiles are one cell per side; a mirror reads the same edge backwards', () => {
    for (const t of EDGE_TAG_IDS) {
      const p = EDGE_TAGS[t].profile;
      expect(p.length, t).toBe(BLOCK_CELLS);
      expect([...p].reverse().join(''), t).toBe(EDGE_TAGS[mirrorTag(t)].profile);
      expect(mirrorTag(mirrorTag(t)), t).toBe(t);
    }
  });

  it('read clockwise: the south and west edges run backwards across the grid', () => {
    const edges = { n: 'concrete', e: 'perimeter', s: 'grass', w: 'perimeter-r' } as const;
    expect(edgeLock(edges, 14, 1)).toBe('C'); // east, near the top: concrete
    expect(edgeLock(edges, 14, 13)).toBe('G');
    expect(edgeLock(edges, 0, 1)).toBe('C'); // west, near the top: concrete too
    expect(edgeLock(edges, 0, 13)).toBe('G');
    expect(edgeLock(edges, 0, 7)).toBe('C'); // the wall cell paints as concrete
  });

  it('walls may sit on a wall cell of the edge', () => {
    const b = applyEdges({
      ...newBlock(),
      edges: { n: 'concrete', e: 'perimeter', s: 'grass', w: 'perimeter-r' },
    });
    b.items.push({ id: 'w', kind: 'wall', priority: 0, rect: [0, 7.25, 15, 0.5] });
    expect(keys(b)).toEqual([]);
    b.items.push({ id: 'w2', kind: 'wall', priority: 0, rect: [0, 3, 1, 0.5] });
    expect(keys(b)).toContain('editor.problem.blocksEdge');
  });

  it('lock the outer ring except the corners', () => {
    const edges = { n: 'road', e: 'grass', s: 'water', w: 'grass' } as const;
    expect(edgeLock(edges, 0, 0)).toBeNull();
    expect(edgeLock(edges, 7, 0)).toBe('R');
    expect(edgeLock(edges, 1, 0)).toBe('G');
    expect(edgeLock(edges, 7, 14)).toBe('W');
    expect(edgeLock(edges, 7, 7)).toBeNull();
  });
});

describe('validateBlock', () => {
  it('a fresh block and the fort are clean', () => {
    expect(keys(newBlock())).toEqual([]);
    expect(keys(fort())).toEqual([]);
  });

  it('flags edge paint that disagrees with the tag', () => {
    const b = newBlock();
    b.ground[0] = 'GGGGGGDGGGGGGGG';
    expect(keys(b)).toContain('editor.problem.edgePaint');
  });

  it('flags walls across an open edge, but not across water', () => {
    const b = newBlock();
    b.items.push({ id: 'w', kind: 'wall', priority: 0, rect: [3, 0, 2, 0.5] });
    expect(keys(b)).toContain('editor.problem.blocksEdge');
    const wet = applyEdges({ ...b, edges: { ...b.edges, n: 'water' } });
    expect(keys(wet)).not.toContain('editor.problem.blocksEdge');
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

  it('reads version 1 blocks: placed soldiers become a squad with rally points', () => {
    const v1 = {
      ...newBlock('old'),
      v: 1,
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
    expect(res.block.v).toBe(2);
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
    // Two nest soldiers stood together: one rally point.
    expect(res.block.items.filter((i) => i.kind === 'rally').map((i) => i.group)).toEqual([
      'nest',
      'squad',
    ]);
    expect(res.block.items.find((i) => i.id === 'cp')?.group).toBe('nest');
    expect(keys(res.block)).toEqual([]);
  });
});

describe('block JSON', () => {
  it('round-trips through the download format', () => {
    const b = fort();
    const res = parseBlock(blockToJson(b));
    expect(res.ok && res.block).toEqual(b);
  });

  it('rejects junk with a strings key', () => {
    expect(parseBlock('nope')).toEqual({ ok: false, key: 'editor.load.notJson' });
    expect(parseBlock('{"v":99}')).toEqual({ ok: false, key: 'editor.load.version' });
    expect(parseBlock('{"v":1,"id":"x","ground":[],"items":[],"edges":{}}').ok).toBe(false);
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
