import { describe, expect, it } from 'vitest';
import { BLOCK_CELLS, EDGE_TAGS, EDGE_TAG_IDS } from '../../content/ground';
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
    {
      id: 'lead',
      kind: 'soldier',
      priority: 1,
      at: [7, 2],
      role: 'gunner',
      facing: 90,
      group: 'g',
      anchor: true,
    },
    {
      id: 'm2',
      kind: 'soldier',
      priority: 3,
      at: [8, 2],
      role: 'rifleman',
      facing: 90,
      group: 'g',
    },
    { id: 't', kind: 'turret', priority: 2, at: [11, 2], facing: 90 },
    { id: 'mine', kind: 'mine', priority: 4, at: [3, 11] },
    { id: 'obj', kind: 'objective', priority: 0, at: [7.5, 1.5] },
  ];
  // Open a crossing through the stream where the gate is.
  ground[6] = ground[6]!.slice(0, 6) + 'RRR' + ground[6]!.slice(9);
  ground[7] = ground[7]!.slice(0, 6) + 'RRR' + ground[7]!.slice(9);
  ground[8] = ground[8]!.slice(0, 6) + 'RRR' + ground[8]!.slice(9);
  return applyEdges({ ...b, edges: { ...b.edges, e: 'stream', w: 'stream' }, ground, items });
}

describe('edge tags', () => {
  it('profiles are one cell per side and palindromes (rotation never reverses one)', () => {
    for (const t of EDGE_TAG_IDS) {
      const p = EDGE_TAGS[t].profile;
      expect(p.length, t).toBe(BLOCK_CELLS);
      expect([...p].reverse().join(''), t).toBe(p);
    }
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

  it('checks levers, ids, group anchors and member order', () => {
    const b = fort();
    const bad = {
      ...b,
      items: b.items.map((i): BlockItem => {
        if (i.kind === 'lever') return { ...i, target: 'nope' };
        if (i.id === 'm2') return { ...i, priority: 1 };
        if (i.id === 'lead') return { ...i, priority: 2 };
        if (i.id === 't') return { ...i, id: 'S1' };
        return i;
      }),
    };
    const k = keys(bad);
    expect(k).toContain('editor.problem.leverTarget');
    expect(k).toContain('editor.problem.memberBeforeAnchor');
    expect(k).toContain('editor.problem.badId');
    const noAnchor = { ...b, items: b.items.map((i) => ({ ...i, anchor: undefined })) };
    expect(keys(noAnchor)).toContain('editor.problem.groupAnchor');
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

  it("maxPriority drops later items, and a group's members with its anchor", () => {
    const map = blockToPreviewMap(fort(), { ...opts, maxPriority: 0 });
    expect(map.squads).toEqual([]);
    expect(map.turrets).toEqual([]);
    expect(map.capturePoints?.length).toBe(2);
    const p2 = blockToPreviewMap(fort(), { ...opts, maxPriority: 2 });
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
