import { borderWalls, type MapDef, type Rect } from '../../sim/world/map';

/**
 * Mission 01: "Fuel Depot". The first real test mission (PHASE02-a).
 *
 *   ┌──────────────┬─┬──────────────────────────────┬───────────────┐
 *   │              │H│  north corridor   [GATE]     │   COMPOUND    │
 *   │   west zone  │I│ ─────────────────────────────┤      (!)      │
 *   │  (switch-    │G│  road corridor  ~[BRIDGE*]~   T ───────────  │
 *   │   back)      │H│ ─────────────────────────────────────┤  ├────│
 *   │  R           │W│  south field                                │
 *   │              │A│ ~~~~~~~ river ~~~~~ [DRAWBRIDGE] ~~~~~~~~~~~~│
 *   │              │Y│  dunes                                      │
 *   │              │ │ ████████ rock ███████  mines  ████ rock ████│
 *   │              │ │        B   beach                            │
 *   └──────────────┴─┴─────────────────────────────────────────────┘
 *   R = Road spawn (west), B = Beach spawn (south), T = turret, ! = objective (fuel depot),
 *   * = destructible bridge (shoot its charge).
 *
 * Routes:
 * - Road, obvious: cross the highway (traffic), cross the destructible bridge, walk east along
 *   the road corridor straight into the turret's range. A naive first soldier dies here.
 * - Road, gate: after the highway, turn north into the north corridor and open the gate with its
 *   lever. Out of the turret's sight; enters the compound from the north-west.
 * - Beach: weave through (or shoot) the mine field, lower the drawbridge with its lever, cross the
 *   south field and enter the compound from the south.
 * Each route is ~56–60 s of pure walking at the default soldier speed (tested), so ~60–75 s with
 * the lever, the traffic and the mines.
 */

const W = 6400;
const H = 4400;

// Highway: two vertical lanes between fences, crossable only at the road gap.
const HIGHWAY_WEST_FENCE = 2020;
const HIGHWAY_EAST_FENCE = 2300;
const ROAD_GAP: [number, number] = [1400, 1600];

const fence = (x: number): Rect[] => [
  { x, y: 0, w: 20, h: ROAD_GAP[0] },
  { x, y: ROAD_GAP[1], w: 20, h: H - ROAD_GAP[1] },
];

// Compound west wall, with a north-corridor entrance and a road entrance.
const COMPOUND_X = 5000;
// Road corridor ↔ south field separator, with the compound's south entrance.
const SOUTH_WALL_Y = 1800;
const RIVER: [number, number] = [2400, 2600];
const DRAWBRIDGE_X: [number, number] = [2950, 3050];
const CHASM_X: [number, number] = [3200, 3320];
const ROAD_BRIDGE_Y: [number, number] = [1200, 1400];
const ROCK_Y: [number, number] = [3100, 3500];
const MINE_CHANNEL_X: [number, number] = [5000, 5800];

const mineRow = (y: number, xs: number[], row: number) =>
  xs.map((x, i) => ({ id: `mine-${row}-${i + 1}`, position: { x, y } }));

export const MISSION_01: MapDef = {
  id: 'mission-01',
  nameKey: 'map.mission01.name',
  width: W,
  height: H,
  walls: [
    ...borderWalls(W, H, 40),
    // West zone switchback: the road winds south around this ridge.
    { x: 1000, y: 0, w: 40, h: 3500 },
    // Highway fences.
    ...fence(HIGHWAY_WEST_FENCE),
    ...fence(HIGHWAY_EAST_FENCE),
    // North corridor ↔ road corridor separator (open at the west end, by the highway).
    { x: 2700, y: 700, w: COMPOUND_X - 2700, h: 80 },
    // Road corridor ↔ south field separator, with the compound's south entrance at x 5600–5800.
    { x: HIGHWAY_EAST_FENCE, y: SOUTH_WALL_Y, w: 5600 - HIGHWAY_EAST_FENCE, h: 80 },
    { x: 5800, y: SOUTH_WALL_Y, w: W - 5800, h: 80 },
    // Compound west wall: openings at y 200–600 (north corridor) and 1200–1400 (road).
    { x: COMPOUND_X, y: 0, w: 40, h: 200 },
    { x: COMPOUND_X, y: 600, w: 40, h: 600 },
    { x: COMPOUND_X, y: 1400, w: 40, h: SOUTH_WALL_Y - 1400 },
    // Cover inside the compound.
    { x: 5450, y: 1000, w: 220, h: 40 },
    { x: 6000, y: 1250, w: 40, h: 260 },
    // Cover along the road corridor (lets a soldier peek at the turret).
    { x: 3700, y: 1000, w: 40, h: 160 },
    { x: 3700, y: 1450, w: 40, h: 160 },
    // Beach rocks, with the mine channel between them.
    { x: HIGHWAY_EAST_FENCE, y: ROCK_Y[0], w: MINE_CHANNEL_X[0] - HIGHWAY_EAST_FENCE, h: 400 },
    { x: MINE_CHANNEL_X[1], y: ROCK_Y[0], w: W - MINE_CHANNEL_X[1], h: 400 },
  ],
  water: [
    // Chasm across the road corridor; the destructible bridge spans the gap.
    { x: CHASM_X[0], y: 780, w: CHASM_X[1] - CHASM_X[0], h: ROAD_BRIDGE_Y[0] - 780 },
    {
      x: CHASM_X[0],
      y: ROAD_BRIDGE_Y[1],
      w: CHASM_X[1] - CHASM_X[0],
      h: SOUTH_WALL_Y - ROAD_BRIDGE_Y[1],
    },
    // River between the south field and the dunes; the drawbridge spans the gap.
    { x: HIGHWAY_EAST_FENCE, y: RIVER[0], w: DRAWBRIDGE_X[0] - HIGHWAY_EAST_FENCE, h: 200 },
    { x: DRAWBRIDGE_X[1], y: RIVER[0], w: W - DRAWBRIDGE_X[1], h: 200 },
  ],
  spawnPoints: [
    {
      id: 'road',
      nameKey: 'spawn.mission01.road',
      position: { x: 200, y: 1500 },
      facing: 0,
      kind: 'initial',
    },
    {
      id: 'beach',
      nameKey: 'spawn.mission01.beach',
      position: { x: 2700, y: 4200 },
      facing: -Math.PI / 2,
      kind: 'initial',
    },
  ],
  turrets: [{ id: 'turret-1', position: { x: 4500, y: 1300 }, facing: Math.PI }],
  mines: [
    // Staggered rows: a careful soldier can weave between trigger radii, the edges are covered,
    // and every mine can be shot from outside its trigger radius.
    ...mineRow(3180, [5080, 5240, 5400, 5560, 5720], 1),
    ...mineRow(3300, [5020, 5160, 5320, 5480, 5640, 5780], 2),
    ...mineRow(3420, [5080, 5240, 5400, 5560, 5720], 3),
  ],
  trafficLanes: [
    { id: 'lane-north', from: { x: 2100, y: H + 100 }, to: { x: 2100, y: -100 } },
    {
      id: 'lane-south',
      from: { x: 2220, y: -100 },
      to: { x: 2220, y: H + 100 },
      offsetSeconds: 1.2,
    },
  ],
  gates: [{ id: 'gate-1', rect: { x: 3600, y: 40, w: 40, h: 660 }, initiallyOpen: false }],
  bridges: [
    {
      id: 'bridge-road',
      rect: {
        x: CHASM_X[0],
        y: ROAD_BRIDGE_Y[0],
        w: CHASM_X[1] - CHASM_X[0],
        h: ROAD_BRIDGE_Y[1] - ROAD_BRIDGE_Y[0],
      },
      axis: 'x',
      kind: 'destructible',
      charge: { x: (CHASM_X[0] + CHASM_X[1]) / 2, y: ROAD_BRIDGE_Y[0] + 16 },
    },
    {
      id: 'drawbridge-1',
      rect: { x: DRAWBRIDGE_X[0], y: RIVER[0], w: DRAWBRIDGE_X[1] - DRAWBRIDGE_X[0], h: 200 },
      axis: 'y',
      kind: 'draw',
      initiallyUp: true,
    },
  ],
  levers: [
    { id: 'lever-gate-w', position: { x: 3540, y: 380 }, targetId: 'gate-1' },
    { id: 'lever-gate-e', position: { x: 3700, y: 380 }, targetId: 'gate-1' },
    { id: 'lever-draw-s', position: { x: 3110, y: 2650 }, targetId: 'drawbridge-1' },
    { id: 'lever-draw-n', position: { x: 3110, y: 2350 }, targetId: 'drawbridge-1' },
  ],
  objectives: [{ id: 'depot', position: { x: 5900, y: 800 }, radius: 48 }],
};
