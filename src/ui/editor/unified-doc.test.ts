import { describe, expect, it } from 'vitest';
import { BLOCK_CELLS } from '../../content/ground';
import { BLOCK_TUNING } from '../../content/tuning';
import { validateMap } from '../../sim/world/map';
import { EditorModel } from './editor-model';
import { blockToJson, newBlock, parseBlock, validateBlock, type BlockDef } from '../../gen/block';
import { blockToPreviewMap } from '../../gen/preview';
import { scenarioMap } from '../../gen/scenario';
import { layoutToBlock, scenarioPreviewMap } from '../../gen/scenario-layout';
import { scenarioTemplate } from '../../gen/scenario-templates';
import { orientBlock } from '../../gen/transform';

const keys = (b: BlockDef) => validateBlock(b).map((p) => p.key);

describe('blocks and scenarios share one document', () => {
  it('only blocks must be the level size; scenarios need a spawn instead', () => {
    const odd = newBlock('odd', 'Odd', 20, 9);
    expect(keys(odd)).toContain('editor.problem.groundSize');
    const scenario: BlockDef = { ...odd, kind: 'scenario' };
    expect(keys(scenario)).toEqual(['editor.problem.noSpawn']);
    scenario.items.push({ id: 'spawn-1', priority: 0, kind: 'spawn', at: [3.5, 4.5] });
    expect(keys(scenario)).toEqual([]);
    scenario.ground = scenario.ground.map((r, y) => (y === 4 ? 'WWWWW' + r.slice(5) : r));
    expect(keys(scenario)).toEqual(['editor.problem.spawnBlocked']);
  });

  it('a scenario of any size round-trips through JSON and plays as is', () => {
    const m = new EditorModel({ ...newBlock('s', 'S', 7, 5), kind: 'scenario' });
    m.placeKind = 'spawn';
    m.place(1.5, 3.5);
    m.addItem({ kind: 'raised', rect: [3, 0, 2, 2] });
    m.addItem({ kind: 'prop', rect: [5, 3, 1, 1], image: 'hub_banner' });
    m.addItem({ kind: 'ladder', rect: [3, 2, 1, 1], bottom: [0.5, 0.9], top: [0.5, 0.1] });
    m.placeKind = 'turret';
    m.place(6, 1);
    const res = parseBlock(blockToJson(m.block));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.block).toEqual(m.block);
    const map = scenarioMap(res.block, 'draft')!;
    const cs = BLOCK_TUNING.cellSize;
    expect(() => validateMap(map)).not.toThrow();
    expect([map.width, map.height]).toEqual([7 * cs, 5 * cs]);
    expect(map.spawnPoints[0]!.position).toEqual({ x: 1.5 * cs, y: 3.5 * cs });
    expect(map.raisedGround).toEqual([{ x: 3 * cs, y: 0, w: 2 * cs, h: 2 * cs }]);
    expect(map.scenery).toHaveLength(1);
    expect(map.ladders).toHaveLength(1);
    // No budget: a priority-1 turret spawns anyway.
    expect(map.turrets).toHaveLength(1);
  });

  it.each(['hq', 'basic-training'] as const)(
    'the %s template plays the same map in the new format',
    (name) => {
      const layout = scenarioTemplate(name);
      const res = parseBlock(blockToJson(layoutToBlock(layout, name, name)));
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(validateBlock(res.block)).toEqual([]);
      expect(scenarioMap(res.block, 'draft')).toEqual(scenarioPreviewMap(layout, 'draft'));
    },
  );

  it('blocks can use the scenario pieces too, and they turn with the block', () => {
    const b = newBlock();
    b.items.push(
      { id: 'deck', priority: 0, kind: 'raised', rect: [4, 4, 3, 2] },
      {
        id: 'ladder',
        priority: 0,
        kind: 'ladder',
        rect: [7, 4, 1, 2],
        bottom: [0.5, 1],
        top: [0.5, 0],
      },
      { id: 'sign', priority: 0, kind: 'prop', rect: [2, 2, 1, 1], image: 'hub_banner' },
    );
    expect(validateBlock(b)).toEqual([]);
    const map = blockToPreviewMap(b, { id: 'p', nameKey: 'p' });
    expect(() => validateMap(map)).not.toThrow();
    expect(map.raisedGround).toHaveLength(1);
    const cs = BLOCK_TUNING.cellSize;
    expect(map.ladders).toEqual([
      { id: 'ladder', bottom: { x: 7.5 * cs, y: 6 * cs }, top: { x: 7.5 * cs, y: 4 * cs } },
    ]);
    // A quarter turn: the ladder's ends turn with it (its bottom was south, now west).
    const turned = orientBlock(b, 1).items.find((i) => i.id === 'ladder');
    expect(turned).toMatchObject({
      rect: [BLOCK_CELLS - 6, 7, 2, 1],
      bottom: [0, 0.5],
      top: [1, 0.5],
    });
  });

  it('resizing keeps the corner and refuses to cut things off', () => {
    const m = new EditorModel({ ...newBlock('s', 'S', 6, 6), kind: 'scenario' });
    m.addItem({ kind: 'wall', rect: [4, 4, 2, 1] });
    expect(m.resize(5, 8)).toBe(false);
    expect(m.resize(10, 8)).toBe(true);
    expect([m.cols, m.rows]).toEqual([10, 8]);
    expect(m.block.ground[7]).toBe('G'.repeat(10));
    m.undo();
    expect([m.cols, m.rows]).toEqual([6, 6]);
  });
});
