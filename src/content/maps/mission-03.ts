import type { RoleId } from '../../contracts/mission';
import { borderWalls, type CoverDef, type MapDef, type SquadDef } from '../../sim/world/map';

/**
 * Mission 03: "Breach" (PHASE06-a). The default mission: a straight shot north ([D27], [D28]).
 * Tall and narrow; you enter at the bottom and push up. Forward is always up. Every layer is
 * about one screen tall, so the next problem is always in view.
 *
 *          x: 0        400       800      1200      1600
 *   y    0 ┌─────────────────────────────────────────┐
 *     380  │   ▀▀▀           [ ! ]           ▀▀▀     │  Command Post (destroy to win)
 *     760  │ ███████████████▌     ▐████████████████  │  bunker wall, opening in the middle
 *    1020  │                   T5                    │  final turret nest (T5 covers the opening)
 *    1220  │        T3                      T4       │
 *    1500  │               ▀▀▀▀    ▀▀▀▀              │  sandbags (peek cover)
 *    1880  │ ~~~~~~~~~~~~~~~~~[DB]~~~~~~~~~~~~~~~~~~ │  canal + drawbridge (starts up; levers)
 *    2450  │       ▀▀▀       ( P )       ▀▀▀         │  Forward Post (capture → forward spawn)
 *    2900  │ ╭────────── gun truck patrol ──────────╮ │  road: two enemy gun trucks driving
 *    3020  │ ╰───────────────────────────────────────╯ │  an oval ([D75])
 *    3400  │ ████████  *  *  *  *  *  *  *  ████████ │  mine strip (3 staggered rows) in a channel
 *    4100  │ █████████████████[GATE]█████████████████│  wall + gate (a lever on each side)
 *    4650  │ ███    T1                      T2   ███ │  first turret line (contact in ~2 s)
 *    4910  │               ▀▀▀▀    ▀▀▀▀              │  sandbags (peek cover)
 *    5250  │        W            C            E      │  three initial spawns, facing up
 *    5450  └─────────────────────────────────────────┘
 *
 * Story beats (each a problem that past echoes help with):
 * 1. Turret line, ~2 s of walking from every spawn. A naive first soldier dies here. Snipe a
 *    turret from just out of its range (rifle 520 > turret 420), or fire over the sandbags.
 *    Every route north passes within range of one of them, so at least one has to go.
 * 2. The gate: closed, a lever on each side. Shutting it again strands echoes ([D16]).
 * 3. Mine strip: weave between the staggered rows, or shoot a path open.
 * 4. Road: two enemy gun trucks patrol an oval ([D75]). Slip between them, or knock one out.
 * 5. Forward Post: capture it (well out of the nest's range) to open a forward spawn ([D8]).
 * 6. Canal: lower the drawbridge (raising it again strands echoes on the far side).
 * 7. Turret nest: three turrets. The outer two can be sniped from below; the centre one sits
 *    deeper and covers the bunker opening.
 * 8. Command Post: shoot it through the bunker opening to win.
 */

export const M3_W = 1600;
export const M3_H = 5450;

/** Layer y coordinates (top = 0), shared with the scripts in src/sim/scenarios/mission-03.ts. */
export const M3 = {
  objectiveY: 380,
  bunkerWallY: 760,
  nestCentreY: 1020,
  nestY: 1220,
  nestCoverY: 1500,
  canalY: [1880, 2000] as [number, number],
  captureY: 2450,
  roadNorthY: 2900,
  roadSouthY: 3020,
  rockY: [3350, 3710] as [number, number],
  mineRowsY: [3650, 3530, 3410] as const,
  gateWallY: 4100,
  turretLineY: 4650,
  lineCoverY: 4910,
  spawnY: 5250,
} as const;

const CX = M3_W / 2;
const GATE_X: [number, number] = [CX - 80, CX + 80];
const BRIDGE_X: [number, number] = [CX - 60, CX + 60];
const BUNKER_GAP: [number, number] = [CX - 170, CX + 170];
const CHANNEL_X: [number, number] = [400, 1200];

/** A sandbag line: blocks movement, half cover against shots ([D32]). */
const bags = (id: string, cx: number, y: number, w: number): CoverDef => ({
  id,
  rect: { x: cx - w / 2, y, w, h: 28 },
  material: 'sandbags',
});

const mineRow = (y: number, xs: number[], row: number) =>
  xs.map((x, i) => ({ id: `m3-mine-${row}-${i + 1}`, position: { x, y } }));
const ROW_A = [480, 640, 800, 960, 1120];
const ROW_B = [420, 560, 720, 880, 1040, 1180];

/** (PHASE12-d) The oval the road's gun trucks drive ([D75]), clockwise from the north-west. */
const ROAD_LOOP = [
  { x: 260, y: M3.roadNorthY - 60 },
  { x: M3_W - 260, y: M3.roadNorthY - 60 },
  { x: M3_W - 260, y: M3.roadSouthY + 60 },
  { x: 260, y: M3.roadSouthY + 60 },
];

/** A gun truck driving the road loop, starting at corner `from`. */
function truckPatrol(id: string, from: number): SquadDef {
  const route = [...ROAD_LOOP.slice(from), ...ROAD_LOOP.slice(0, from)];
  return {
    id,
    members: [{ role: 'truck', position: route[0]!, facing: 0 }],
    order: { kind: 'patrol', route },
  };
}

export const MISSION_03: MapDef = {
  id: 'mission-03',
  nameKey: 'map.mission03.name',
  width: M3_W,
  height: M3_H,
  walls: [
    ...borderWalls(M3_W, M3_H, 40),
    // Bunker wall around the Command Post, opening in the middle.
    { x: 0, y: M3.bunkerWallY, w: BUNKER_GAP[0], h: 40 },
    { x: BUNKER_GAP[1], y: M3.bunkerWallY, w: M3_W - BUNKER_GAP[1], h: 40 },
    // Mine strip rocks: the channel is x 400–1200.
    { x: 0, y: M3.rockY[0], w: CHANNEL_X[0], h: M3.rockY[1] - M3.rockY[0] },
    { x: CHANNEL_X[1], y: M3.rockY[0], w: M3_W - CHANNEL_X[1], h: M3.rockY[1] - M3.rockY[0] },
    // Gate wall: the gate fills the gap.
    { x: 0, y: M3.gateWallY, w: GATE_X[0], h: 40 },
    { x: GATE_X[1], y: M3.gateWallY, w: M3_W - GATE_X[1], h: 40 },
    // First turret line flanks: no sneaking past along the side walls out of range.
    { x: 0, y: M3.turretLineY - 120, w: 200, h: 240 },
    { x: M3_W - 200, y: M3.turretLineY - 120, w: 200, h: 240 },
  ],
  // (07-c) Sandbags are half cover ([D32]): they stop half the bullets, you can fire over them
  // from close up, and they cut a turret's sight past them.
  cover: [
    // Cover inside the bunker (either side of the objective).
    bags('m3-bags-bunker-w', 380, 420, 160),
    bags('m3-bags-bunker-e', 1220, 420, 160),
    // Nest sandbags (inside range: duck behind them, fire over them).
    bags('m3-bags-nest-w', CX - 170, M3.nestCoverY, 160),
    bags('m3-bags-nest-e', CX + 170, M3.nestCoverY, 160),
    // Cover around the Forward Post.
    bags('m3-bags-post-w', 470, M3.captureY - 40, 160),
    bags('m3-bags-post-e', 1130, M3.captureY - 40, 160),
    // First turret line: sandbags inside range (duck behind them, fire over them).
    bags('m3-bags-line-w', CX - 180, M3.lineCoverY, 160),
    bags('m3-bags-line-e', CX + 180, M3.lineCoverY, 160),
  ],
  water: [
    // Canal below the nest; the drawbridge spans the gap.
    { x: 0, y: M3.canalY[0], w: BRIDGE_X[0], h: M3.canalY[1] - M3.canalY[0] },
    { x: BRIDGE_X[1], y: M3.canalY[0], w: M3_W - BRIDGE_X[1], h: M3.canalY[1] - M3.canalY[0] },
  ],
  spawnPoints: [
    {
      id: 'west',
      nameKey: 'spawn.mission03.west',
      position: { x: 460, y: M3.spawnY },
      facing: -Math.PI / 2,
      kind: 'initial',
    },
    {
      id: 'centre',
      nameKey: 'spawn.mission03.centre',
      position: { x: CX, y: M3.spawnY },
      facing: -Math.PI / 2,
      kind: 'initial',
    },
    {
      id: 'east',
      nameKey: 'spawn.mission03.east',
      position: { x: 1140, y: M3.spawnY },
      facing: -Math.PI / 2,
      kind: 'initial',
    },
    {
      id: 'forward',
      nameKey: 'spawn.mission03.forward',
      position: { x: CX, y: M3.captureY + 60 },
      facing: -Math.PI / 2,
      kind: 'capture',
      capturePointId: 'cp-forward',
    },
  ],
  turrets: [
    // First line (facing down the approach).
    { id: 't1', position: { x: 500, y: M3.turretLineY }, facing: Math.PI / 2 },
    { id: 't2', position: { x: 1100, y: M3.turretLineY }, facing: Math.PI / 2 },
    // Final nest.
    { id: 't3', position: { x: 460, y: M3.nestY }, facing: Math.PI / 2 },
    { id: 't4', position: { x: 1140, y: M3.nestY }, facing: Math.PI / 2 },
    { id: 't5', position: { x: CX, y: M3.nestCentreY }, facing: Math.PI / 2 },
  ],
  mines: [
    ...mineRow(M3.mineRowsY[0], ROW_A, 1),
    ...mineRow(M3.mineRowsY[1], ROW_B, 2),
    ...mineRow(M3.mineRowsY[2], ROW_A, 3),
  ],
  gates: [
    {
      id: 'm3-gate',
      rect: { x: GATE_X[0], y: M3.gateWallY, w: GATE_X[1] - GATE_X[0], h: 40 },
      initiallyOpen: false,
    },
  ],
  bridges: [
    {
      id: 'm3-drawbridge',
      rect: {
        x: BRIDGE_X[0],
        y: M3.canalY[0],
        w: BRIDGE_X[1] - BRIDGE_X[0],
        h: M3.canalY[1] - M3.canalY[0],
      },
      axis: 'y',
      kind: 'draw',
      initiallyUp: true,
    },
  ],
  levers: [
    {
      id: 'm3-lever-gate-s',
      position: { x: GATE_X[0] - 50, y: M3.gateWallY + 80 },
      targetId: 'm3-gate',
    },
    {
      id: 'm3-lever-gate-n',
      position: { x: GATE_X[1] + 50, y: M3.gateWallY - 40 },
      targetId: 'm3-gate',
    },
    {
      id: 'm3-lever-bridge-s',
      position: { x: BRIDGE_X[1] + 70, y: M3.canalY[1] + 60 },
      targetId: 'm3-drawbridge',
    },
    {
      id: 'm3-lever-bridge-n',
      position: { x: BRIDGE_X[1] + 70, y: M3.canalY[0] - 50 },
      targetId: 'm3-drawbridge',
    },
  ],
  capturePoints: [
    {
      id: 'cp-forward',
      nameKey: 'capture.mission03.forward',
      position: { x: CX, y: M3.captureY },
    },
  ],
  objectives: [{ id: 'm3-command', position: { x: CX, y: M3.objectiveY }, radius: 56, maxHp: 400 }],
  // (07-d) Enemy soldiers ([D44]): you're vastly outnumbered, and they don't respawn.
  squads: [
    // Behind the first turret line.
    squad('m3-sq-line', M3.turretLineY - 110, [300, 520, 800, 1080, 1300], ['gunner', 'rifleman']),
    // Inside the gate.
    squad('m3-sq-gate', M3.gateWallY - 140, [560, 700, 900, 1040], ['grenadier', 'rifleman']),
    // Patrolling the far end of the mine strip.
    {
      id: 'm3-sq-mines',
      members: [
        { position: { x: 600, y: M3.rockY[0] - 90 } },
        { position: { x: 660, y: M3.rockY[0] - 120 } },
        { position: { x: 720, y: M3.rockY[0] - 90 } },
      ],
      order: {
        kind: 'patrol',
        route: [
          { x: 520, y: M3.rockY[0] - 110 },
          { x: 1080, y: M3.rockY[0] - 110 },
        ],
      },
    },
    // Holding the Forward Post (they retake it, [D45]).
    {
      ...squad('m3-sq-post', M3.captureY - 110, [520, 680, 800, 920, 1080], ['gunner', 'rifleman']),
      capturePointId: 'cp-forward',
    },
    // (PHASE12-d) The road: two gun trucks driving an oval, half a lap apart ([D75]).
    truckPatrol('m3-sq-road-a', 0),
    truckPatrol('m3-sq-road-b', 2),
    // Along the canal.
    squad('m3-sq-canal', M3.canalY[0] - 90, [300, 520, 1080, 1300], ['grenadier', 'rifleman']),
    // The nest: dug in behind its sandbags.
    squad(
      'm3-sq-nest',
      M3.nestCoverY - 50,
      [480, 630, 800, 970, 1120],
      ['gunner', 'rifleman', 'gunner'],
    ),
    squad('m3-sq-nest2', M3.nestY - 110, [360, 600, 1000, 1240], ['rifleman', 'grenadier']),
    // Inside the bunker, around the Command Post.
    {
      ...squad(
        'm3-sq-bunker',
        M3.objectiveY + 140,
        [300, 520, 680, 920, 1080, 1300],
        ['rifleman', 'gunner', 'rifleman', 'grenadier'],
      ),
      fallback: { x: CX, y: M3.objectiveY - 160 },
    },
  ],
};

/**
 * (07-d) A guard squad in a row at `y`, facing down the map (toward us), roles cycling through
 * `roles`. Falls back further up the map.
 */
function squad(id: string, y: number, xs: number[], roles: RoleId[]): SquadDef {
  return {
    id,
    members: xs.map((x, i) => ({
      role: roles[i % roles.length]!,
      position: { x, y },
      facing: Math.PI / 2,
    })),
    order: { kind: 'guard' },
    fallback: { x: M3_W / 2, y: Math.max(200, y - 300) },
  };
}
