import { borderWalls, type MapDef } from '../../sim/world/map';

/** Small walled sandbox used by PHASE01 and unit tests. */
export const TEST_RANGE: MapDef = {
  id: 'test-range',
  nameKey: 'map.testRange.name',
  width: 1600,
  height: 1200,
  walls: [
    ...borderWalls(1600, 1200),
    { x: 400, y: 300, w: 40, h: 600 },
    { x: 800, y: 200, w: 400, h: 40 },
    { x: 800, y: 900, w: 400, h: 40 },
    { x: 1150, y: 450, w: 120, h: 120 },
  ],
  water: [{ x: 600, y: 500, w: 120, h: 200 }],
  spawnPoints: [
    { id: 'west', nameKey: 'spawn.west', position: { x: 120, y: 600 }, facing: 0, kind: 'initial' },
    {
      id: 'south',
      nameKey: 'spawn.south',
      position: { x: 800, y: 1100 },
      facing: -Math.PI / 2,
      kind: 'initial',
    },
  ],
};
