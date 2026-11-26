import { describe, expect, it } from 'vitest';
import { HUB_MAP } from '../content/hub';
import { BASIC_TRAINING } from '../content/maps/basic-training';
import { scenarioTemplate } from './scenario-templates';
import { BLOCK_TUNING } from '../content/tuning';
import { validateMap } from '../sim/world/map';
import {
  newScenarioLayout,
  parseScenarioLayout,
  scenarioPreviewMap,
  scenarioSpawnProblem,
  type ScenarioLayout,
} from './scenario-layout';

describe('scenario layout preview', () => {
  const layout: ScenarioLayout = {
    ...newScenarioLayout(),
    ground: ['GWGG', 'GGXG', 'TGGG'],
    items: [
      { kind: 'wall', rect: { x: 0, y: 0, w: 1, h: 2 } },
      { kind: 'cover', material: 'crate', rect: { x: 3, y: 1, w: 1, h: 1 } },
    ],
    spawn: { x: 1, y: 2 },
  };

  it('round-trips a rectangular layout without adding staging or objectives', () => {
    const loaded = parseScenarioLayout(JSON.stringify(layout));
    expect(loaded).toEqual(layout);
    const map = scenarioPreviewMap(loaded!, 'draft')!;
    const cs = BLOCK_TUNING.cellSize;
    expect(() => validateMap(map)).not.toThrow();
    expect(map.ground?.rows).toEqual(layout.ground);
    expect([map.width, map.height]).toEqual([4 * cs, 3 * cs]);
    expect(map.spawnPoints.map((sp) => sp.position)).toEqual([{ x: 1.5 * cs, y: 2.5 * cs }]);
    expect(map.walls).toContainEqual({ x: 0, y: 0, w: cs, h: 2 * cs });
    expect(map.walls).toContainEqual({ x: 2 * cs, y: cs, w: cs, h: cs });
    expect(map.water).toEqual([{ x: cs, y: 0, w: cs, h: cs }]);
    expect(map.cover?.[0]).toMatchObject({
      material: 'crate',
      rect: { x: 3 * cs, y: cs, w: cs, h: cs },
    });
    expect(map.concealment?.[0]).toMatchObject({ kind: 'trench' });
    expect(map.capturePoints).toBeUndefined();
  });

  it('rejects malformed imports and requires an open spawn to play', () => {
    for (const invalid of [
      { ...layout, ground: ['GGGG', 'GGX', 'TGGG'] },
      { ...layout, spawn: { x: -1, y: 2 } },
      { ...layout, items: [{ kind: 'wall', rect: { x: 0, y: 0, w: 5, h: 1 } }] },
    ]) {
      expect(parseScenarioLayout(JSON.stringify(invalid))).toBeNull();
    }
    expect(scenarioSpawnProblem({ ...layout, spawn: null })).toBe('missing');
    for (const spawn of [
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 0, y: 1 },
      { x: 3, y: 1 },
    ]) {
      const blocked = { ...layout, spawn };
      expect(scenarioSpawnProblem(blocked)).toBe('blocked');
      expect(scenarioPreviewMap(blocked, 'draft')).toBeUndefined();
    }
  });
});

describe('shipped layout templates', () => {
  it.each([
    ['hq', HUB_MAP],
    ['basic-training', BASIC_TRAINING],
  ] as const)('round-trips the exact %s floor plan and physical props', (name, original) => {
    const draft = scenarioTemplate(name);
    const reopened = parseScenarioLayout(JSON.stringify(draft));
    expect(reopened).toEqual(draft);
    const preview = scenarioPreviewMap(reopened!, 'draft')!;
    expect(() => validateMap(preview)).not.toThrow();
    expect([preview.width, preview.height]).toEqual([original.width, original.height]);
    expect(preview.walls).toEqual(original.walls);
    expect(preview.water).toEqual(original.water);
    if (original.ground) expect(preview.ground).toEqual(original.ground);
    expect(preview.cover).toEqual(original.cover);
    expect(preview.gates).toEqual(original.gates);
    expect(preview.raisedGround ?? []).toEqual(original.raisedGround ?? []);
    expect(preview.ladders ?? []).toEqual(original.ladders ?? []);
    expect(preview.concealment).toEqual(original.concealment);
    expect(preview.groundMist ?? []).toEqual(original.groundMist ?? []);
    expect(preview.spawnPoints[0]?.position).toEqual(original.spawnPoints[0]?.position);
    expect(preview.scenery?.length).toBeGreaterThan(0);
    expect(preview.triggers).toBeUndefined();
    expect(preview.squads).toBeUndefined();
  });

  it('moves a firing surface independently of its attached cover artwork', () => {
    const draft = scenarioTemplate('hq');
    const tower = draft.items.find((item) => item.id === 'surface-0')!;
    tower.rect.x += 1 / draft.cellSize!;
    const preview = scenarioPreviewMap(draft, 'draft')!;
    expect(preview.raisedGround?.[0]?.x).toBe(1131);
    expect(preview.cover?.[0]?.fireOverFrom?.x).toBe(1131);
    expect(HUB_MAP.raisedGround?.[0]?.x).toBe(1130);
  });
});

it('repainting duplicate water removes its collision without dropping exact legacy pieces', () => {
  const draft: ScenarioLayout = {
    ...newScenarioLayout(),
    ground: ['WGG', 'UGG', 'TGG'],
    items: [
      { kind: 'water', rect: { x: 0, y: 0, w: 1, h: 1 } },
      { kind: 'water', rect: { x: 2, y: 0, w: 0.5, h: 1 } },
    ],
    spawn: { x: 1, y: 1 },
  };
  const imported = parseScenarioLayout(JSON.stringify(draft))!;
  expect(imported.items).toEqual([draft.items[1]]);
  imported.ground[0] = 'GGG';
  const preview = scenarioPreviewMap(imported, 'draft')!;
  expect(preview.water).toEqual([{ x: 128, y: 0, w: 32, h: 64 }]);
  expect(preview.concealment?.map((piece) => piece.kind)).toEqual(['bush', 'trench']);
});
