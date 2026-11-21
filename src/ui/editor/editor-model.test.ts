import { describe, expect, it } from 'vitest';
import { newBlock, parseBlock, blockToJson } from '../../gen/block';
import { blockToPreviewMap } from '../../gen/preview';
import { rotateMap } from '../../gen/rotate-map';
import { orientBlock } from '../../gen/transform';
import { EditorModel } from './editor-model';

describe('EditorModel', () => {
  it('paints any tile, edges included ([D101]: edges are just tiles)', () => {
    const m = new EditorModel(newBlock());
    m.paintKind = 'D';
    expect(m.paint(7, 7)).toBe(true);
    expect(m.block.ground[7]![7]).toBe('D');
    expect(m.paint(7, 0)).toBe(true);
    expect(m.paint(7, 0)).toBe(false); // already dirt
  });

  it('an edge preset paints that side, read clockwise', () => {
    const m = new EditorModel(newBlock());
    m.applyEdgePreset('n', 'RGGGGGGGGGGGGGW');
    expect(m.block.ground[0]).toBe('RGGGGGGGGGGGGGW');
    // The south edge reads east→west, so the same preset comes out reversed on the row.
    m.applyEdgePreset('s', 'RGGGGGGGGGGGGGW');
    expect(m.block.ground[14]).toBe('WGGGGGGGGGGGGGR');
  });

  it('places with defaults, snaps moves, renames levers along', () => {
    const m = new EditorModel(newBlock());
    m.placeKind = 'gate';
    const gate = m.place(7.6, 5.1);
    m.placeKind = 'lever';
    const lever = m.place(4, 6);
    expect(lever.kind === 'lever' && lever.target).toBe(gate.id);
    m.renameItem(gate.id, 'main-gate');
    const l = m.item(lever.id);
    expect(l?.kind === 'lever' && l.target).toBe('main-gate');
    m.moveItemTo(lever.id, 3.3, 9.8);
    expect(m.item(lever.id)).toMatchObject({ at: [3.5, 10] });
  });

  it('preserves bushes and trenches when saving, previewing and rotating a block', () => {
    const m = new EditorModel(newBlock());
    m.placeKind = 'bush';
    const bush = m.place(5, 5);
    m.placeKind = 'trench';
    const trench = m.place(10, 10);
    const parsed = parseBlock(blockToJson(m.block));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const preview = blockToPreviewMap(parsed.block, {
      id: 'preview',
      nameKey: 'preview',
      budget: 0,
    });
    expect(preview.concealment).toMatchObject([
      { id: bush.id, kind: 'bush' },
      { id: trench.id, kind: 'trench' },
    ]);
    const original = preview.concealment![1]!.rect;
    const rotated = rotateMap(preview, 1).concealment![1]!.rect;
    expect(rotated.w).toBe(original.h);
    expect(rotated.h).toBe(original.w);
  });

  it('paints trenches as ground and stacks mist once per stroke', () => {
    const m = new EditorModel(newBlock());
    m.paintKind = 'T';
    m.paint(4, 6);
    m.paint(5, 6);
    m.paintKind = 'mist';
    m.beginGesture();
    m.paint(4, 6);
    m.paint(5, 6);
    m.paint(4, 6);
    m.endGesture();
    m.paint(4, 6);
    expect(m.block.ground[6]?.slice(4, 6)).toBe('TT');
    expect(m.block.mist?.[6]?.slice(4, 6)).toBe('21');
    m.undo();
    expect(m.block.mist?.[6]?.slice(4, 6)).toBe('11');
    m.redo();
    const parsed = parseBlock(blockToJson(m.block));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const oriented = orientBlock(parsed.block, 1);
    expect(oriented.mist?.[4]?.[8]).toBe('2');
    const preview = blockToPreviewMap(oriented, { id: 'preview', nameKey: 'preview', budget: 0 });
    expect(preview.concealment).toMatchObject([{ kind: 'trench', painted: true }]);
    expect(preview.mist).toHaveLength(2);
    m.paintKind = 'eraseMist';
    m.paint(4, 6);
    expect(m.block.mist?.[6]?.slice(4, 6)).toBe('01');
    expect(m.block.ground[6]?.slice(4, 6)).toBe('TT');
  });

  it('a drag is one undo step; undo/redo walk history', () => {
    const m = new EditorModel(newBlock());
    m.placeKind = 'rally';
    const s = m.place(5, 5); // also starts a squad: one undo step with the point
    m.beginGesture();
    m.moveItemTo(s.id, 6, 5);
    m.moveItemTo(s.id, 7, 5);
    m.moveItemTo(s.id, 8, 5);
    m.endGesture();
    expect(m.item(s.id)).toMatchObject({ at: [8, 5] });
    m.undo();
    expect(m.item(s.id)).toMatchObject({ at: [5, 5] });
    m.undo();
    expect(m.item(s.id)).toBeUndefined();
    expect(m.block.groups).toEqual([]);
    expect(m.selected).toBeNull();
    m.redo();
    m.redo();
    expect(m.item(s.id)).toMatchObject({ at: [8, 5] });
  });

  it('hit-tests points over rects and rotates the selection', () => {
    const m = new EditorModel(newBlock());
    m.placeKind = 'wall';
    const wall = m.place(7, 7);
    m.placeKind = 'turret';
    const t = m.place(7, 7);
    expect(m.hitTest(7.1, 7.1)?.id).toBe(t.id);
    expect(m.hitTest(6.2, 7)?.id).toBe(wall.id);
    m.select(wall.id);
    m.rotateSelected();
    expect(m.item(wall.id)).toMatchObject({ rect: [6.75, 6.25, 0.5, 2] });
    m.select(t.id);
    m.rotateSelected();
    expect(m.item(t.id)).toMatchObject({ facing: 135 });
  });

  it('the budget slider decides what spawns, cached per block and budget', () => {
    const m = new EditorModel(newBlock());
    m.placeKind = 'rally';
    m.place(3, 3); // a new squad: two riflemen (priorities 1 and 2)
    m.placeKind = 'turret';
    const t = m.place(9, 3);
    const g = m.block.groups[0]!.id;
    expect(m.spend().spawned.has(`${g}#0`)).toBe(true);
    m.budget = 0;
    expect([...m.spend().spawned].some((id) => id.includes('#') || id === t.id)).toBe(false);
    expect(m.spend()).toBe(m.spend());
    m.budget = m.totalCost();
    expect(m.spend().spawned.has(t.id)).toBe(true);
    expect(m.spend().spawned.has(`${g}#1`)).toBe(true);
  });

  it('squads: rally points join the active squad; rename and delete carry their points', () => {
    const m = new EditorModel(newBlock());
    m.placeKind = 'rally';
    const a = m.place(3, 3);
    const b = m.place(6, 3);
    expect(m.block.groups).toHaveLength(1);
    expect(a.group).toBe(b.group);
    m.renameGroup(a.group!, 'nest');
    expect(m.item(a.id)?.group).toBe('nest');
    m.addGroup();
    const c = m.place(10, 3);
    expect(c.group).not.toBe('nest');
    m.deleteGroup('nest');
    expect(m.item(a.id)).toBeUndefined();
    expect(m.item(c.id)).toBeDefined();
  });
});
