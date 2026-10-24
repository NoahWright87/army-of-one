import { borderWalls, type MapDef, type Rect } from '../../sim/world/map';

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
 *    2900  │ ⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢ │  road: two traffic lanes (frogger)
 *    3020  │ ⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠ │
 *    3400  │ ████████  *  *  *  *  *  *  *  ████████ │  mine strip (3 staggered rows) in a channel
 *    4100  │ █████████████████[GATE]█████████████████│  wall + gate (a lever on each side)
 *    4650  │ ███    T1                      T2   ███ │  first turret line (contact in ~2 s)
 *    4910  │               ▀▀▀▀    ▀▀▀▀              │  sandbags (peek cover)
 *    5250  │        W            C            E      │  three initial spawns, facing up
 *    5450  └─────────────────────────────────────────┘
 *
 * Story beats (each a problem that past echoes help with):
 * 1. Turret line, ~2 s of walking from every spawn. A naive first soldier dies here. Snipe a
 *    turret from just out of its range (rifle 520 > turret 420), or peek round the sandbags.
 *    Every route north passes within range of one of them, so at least one has to go.
 * 2. The gate: closed, a lever on each side. Shutting it again strands echoes ([D16]).
 * 3. Mine strip: weave between the staggered rows, or shoot a path open.
 * 4. Road: two lanes of traffic. Time the gap, or shoot a car into a wreck so traffic stops.
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

/** A sandbag line (a thin wall): blocks movement and shots. */
const bags = (cx: number, y: number, w: number): Rect => ({ x: cx - w / 2, y, w, h: 28 });

const mineRow = (y: number, xs: number[], row: number) =>
  xs.map((x, i) => ({ id: `m3-mine-${row}-${i + 1}`, position: { x, y } }));
const ROW_A = [480, 640, 800, 960, 1120];
const ROW_B = [420, 560, 720, 880, 1040, 1180];

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
    // Cover inside the bunker (either side of the objective).
    bags(380, 420, 160),
    bags(1220, 420, 160),
    // Nest sandbags (inside range: duck behind them, peek out to shoot).
    bags(CX - 170, M3.nestCoverY, 160),
    bags(CX + 170, M3.nestCoverY, 160),
    // Cover around the Forward Post.
    bags(470, M3.captureY - 40, 160),
    bags(1130, M3.captureY - 40, 160),
    // Mine strip rocks: the channel is x 400–1200.
    { x: 0, y: M3.rockY[0], w: CHANNEL_X[0], h: M3.rockY[1] - M3.rockY[0] },
    { x: CHANNEL_X[1], y: M3.rockY[0], w: M3_W - CHANNEL_X[1], h: M3.rockY[1] - M3.rockY[0] },
    // Gate wall: the gate fills the gap.
    { x: 0, y: M3.gateWallY, w: GATE_X[0], h: 40 },
    { x: GATE_X[1], y: M3.gateWallY, w: M3_W - GATE_X[1], h: 40 },
    // First turret line flanks: no sneaking past along the side walls out of range.
    { x: 0, y: M3.turretLineY - 120, w: 200, h: 240 },
    { x: M3_W - 200, y: M3.turretLineY - 120, w: 200, h: 240 },
    // First turret line: sandbags inside range (duck behind them, peek out to shoot).
    bags(CX - 180, M3.lineCoverY, 160),
    bags(CX + 180, M3.lineCoverY, 160),
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
  trafficLanes: [
    {
      id: 'm3-lane-east',
      from: { x: -100, y: M3.roadNorthY },
      to: { x: M3_W + 100, y: M3.roadNorthY },
    },
    {
      id: 'm3-lane-west',
      from: { x: M3_W + 100, y: M3.roadSouthY },
      to: { x: -100, y: M3.roadSouthY },
      offsetSeconds: 1.1,
    },
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
};
