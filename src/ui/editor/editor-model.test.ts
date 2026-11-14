import { describe, expect, it } from 'vitest';
import { newBlock } from '../../gen/block';
import { EditorModel } from './editor-model';

describe('EditorModel', () => {
  it('paints free cells, never edge-locked ones', () => {
    const m = new EditorModel(newBlock());
    m.paintKind = 'D';
    expect(m.paint(7, 7)).toBe(true);
    expect(m.block.ground[7]![7]).toBe('D');
    expect(m.paint(7, 0)).toBe(false);
    expect(m.paint(0, 0)).toBe(true); // corners are free
  });

  it('changing an edge tag repaints its band', () => {
    const m = new EditorModel(newBlock());
    m.setEdge('s', 'road');
    expect(m.block.ground[14]).toBe('GGGGGGRRRGGGGGG');
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

  it('a drag is one undo step; undo/redo walk history', () => {
    const m = new EditorModel(newBlock());
    m.placeKind = 'soldier';
    const s = m.place(5, 5);
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
    m.placeKind = 'soldier';
    const a = m.place(3, 3);
    m.placeKind = 'turret';
    const t = m.place(9, 3);
    expect(m.spend().spawned.has(a.id)).toBe(true);
    m.budget = 0;
    expect(m.spend().spawned.size).toBe(0);
    expect(m.spend()).toBe(m.spend());
    m.budget = m.totalCost();
    expect([...m.spend().spawned].sort()).toEqual([a.id, t.id].sort());
  });
});
