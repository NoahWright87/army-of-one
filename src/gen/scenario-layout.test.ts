import { describe, expect, it } from 'vitest';
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
