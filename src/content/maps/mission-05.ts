import type { RoleId } from '../../contracts/mission';
import { borderWalls, type CoverDef, type MapDef, type SquadDef } from '../../sim/world/map';

/**
 * Mission 05: "Armored Push" (PHASE12-b, [D69]). A long, wider mission to show off vehicles:
 * the Breach template ([D27], [D28], [D31]: forward is up, one direction, contact in seconds),
 * but about two landscape phone screens wide and over twice as tall, with four capture points
 * along the way (forward spawns + income, [D51]) and every kind of enemy, trucks and tanks too.
 *
 *          x: 0           600          1200          1800
 *   y    0 ┌────────────────────────────────────────────┐
 *      450 │      ▀▀▀          [ HQ ]          ▀▀▀       │  HQ bunker (destroy to win)
 *      900 │ ██████████████████▌    ▐██████████████████ │  fortress wall, gate in the middle
 *     1250 │       T7      ▀▀▀  TANK  ▀▀▀      T8       │  inner yard: tank, snipers, turrets
 *     1900 │    ▀▀▀    ▀▀▀   ( D Depot )   ▀▀▀    ▀▀▀  │  capture D (forward spawn)
 *     2700 │ ~~~~~~~~~~~[ B1 ]~~~~~~~~~~~~~[ B2 ]~~~~~~ │  river: drawbridge + destructible bridge
 *     3500 │    T5    ▀▀    ( C Crossroads )    ▀▀   T6 │  capture C, shotguns + bazookas
 *     4400 │ ⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢ highway ⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢ │  traffic + an enemy gun truck
 *     4520 │ ⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠⇠ │
 *     5400 │  * * *  TANK  * * *   ▄▄ ▄▄ ▄▄   * * *       │  minefield, half walls, a tank
 *     6300 │      ▀▀▀      ( B Fuel Farm )      ▀▀▀      │  capture B
 *     7300 │ ████████████████[GATE]████████████████████ │  checkpoint wall + gate (levers)
 *     8100 │   T3   ⊞ ⊞      ( A Checkpoint )     ⊞ ⊞  T4 │  capture A, crates, a truck
 *     9700 │ ⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢ service road ⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢⇢ │  one traffic lane
 *    10950 │    T1        ▀▀▀  ┼┼┼┼  ▀▀▀          T2      │  outer line: turrets, fence, squads
 *    11650 │      W                C                E     │  three initial spawns, facing up
 *    12000 └────────────────────────────────────────────┘
 */

export const M5_W = 1800;
export const M5_H = 12000;
const CX = M5_W / 2;

/** Layer y coordinates (top = 0). */
export const M5 = {
  hqY: 450,
  fortressWallY: 900,
  innerYardY: 1250,
  depotY: 1900,
  riverY: [2650, 2780] as [number, number],
  crossroadsY: 3500,
  highwayY: [4400, 4520] as [number, number],
  minefieldY: 5400,
  fuelY: 6300,
  checkpointWallY: 7300,
  checkpointY: 8100,
  serviceRoadY: 9700,
  outerLineY: 10950,
  spawnY: 11650,
} as const;

const GATE_X: [number, number] = [CX - 100, CX + 100];
const FORT_GAP: [number, number] = [CX - 110, CX + 110];
const BRIDGE1_X: [number, number] = [CX - 520, CX - 400];
const BRIDGE2_X: [number, number] = [CX + 380, CX + 520];

const cover = (
  id: string,
  material: CoverDef['material'],
  cx: number,
  y: number,
  w: number,
  h = 28,
): CoverDef => ({ id, rect: { x: cx - w / 2, y, w, h }, material });

const guard = (
  id: string,
  y: number,
  members: [RoleId, number][],
  extra: Partial<SquadDef> = {},
): SquadDef => ({
  id,
  members: members.map(([role, x]) => ({ role, position: { x, y }, facing: Math.PI / 2 })),
  order: { kind: 'guard' },
  fallback: { x: CX, y: Math.max(200, y - 300) },
  ...extra,
});

const capture = (id: string, nameKey: string, y: number) => ({
  id,
  nameKey,
  position: { x: CX, y },
  radius: 140,
  income: 2,
});

const forwardSpawn = (id: string, nameKey: string, cpId: string, y: number) => ({
  id,
  nameKey,
  position: { x: CX, y: y + 220 },
  facing: -Math.PI / 2,
  kind: 'capture' as const,
  capturePointId: cpId,
});

const mines = (y: number, xs: number[], tag: string) =>
  xs.map((x, i) => ({ id: `m5-mine-${tag}-${i + 1}`, position: { x, y: y + (i % 2) * 70 } }));

export const MISSION_05: MapDef = {
  id: 'mission-05',
  nameKey: 'map.mission05.name',
  width: M5_W,
  height: M5_H,
  economy: { startMoney: 150 }, // TUNE: room for an early vehicle once a point pays
  walls: [
    ...borderWalls(M5_W, M5_H, 40),
    // Fortress wall around the HQ, a gate in the middle.
    { x: 0, y: M5.fortressWallY, w: FORT_GAP[0], h: 50 },
    { x: FORT_GAP[1], y: M5.fortressWallY, w: M5_W - FORT_GAP[1], h: 50 },
    // Checkpoint wall + gate.
    { x: 0, y: M5.checkpointWallY, w: GATE_X[0], h: 50 },
    { x: GATE_X[1], y: M5.checkpointWallY, w: M5_W - GATE_X[1], h: 50 },
    // Outer line flanks.
    { x: 0, y: M5.outerLineY - 140, w: 220, h: 280 },
    { x: M5_W - 220, y: M5.outerLineY - 140, w: 220, h: 280 },
    // Minefield: concrete blocks funnel traffic toward the mines.
    { x: 300, y: M5.minefieldY - 260, w: 160, h: 120 },
    { x: M5_W - 460, y: M5.minefieldY - 260, w: 160, h: 120 },
  ],
  cover: [
    // HQ bunker cover.
    cover('m5-hq-w', 'sandbags', 520, M5.hqY - 40, 180),
    cover('m5-hq-e', 'sandbags', M5_W - 520, M5.hqY - 40, 180),
    // Inner yard: snipers behind sandbags, crates around the tank.
    cover('m5-yard-w', 'sandbags', 520, M5.innerYardY + 80, 200),
    cover('m5-yard-e', 'sandbags', M5_W - 520, M5.innerYardY + 80, 200),
    cover('m5-yard-c1', 'crate', CX - 180, M5.innerYardY + 200, 60, 60),
    cover('m5-yard-c2', 'crate', CX + 180, M5.innerYardY + 200, 60, 60),
    // Depot.
    cover('m5-depot-w1', 'sandbags', 300, M5.depotY, 160),
    cover('m5-depot-w2', 'halfWall', 600, M5.depotY + 120, 140, 24),
    cover('m5-depot-e1', 'sandbags', M5_W - 300, M5.depotY, 160),
    cover('m5-depot-e2', 'halfWall', M5_W - 600, M5.depotY + 120, 140, 24),
    // Crossroads.
    cover('m5-cross-w', 'sandbags', 520, M5.crossroadsY + 60, 160),
    cover('m5-cross-e', 'sandbags', M5_W - 520, M5.crossroadsY + 60, 160),
    cover('m5-cross-c1', 'crate', CX - 260, M5.crossroadsY - 140, 70, 70),
    cover('m5-cross-c2', 'crate', CX + 260, M5.crossroadsY - 140, 70, 70),
    // Minefield half walls (tank traps a tank can batter through).
    cover('m5-mine-hw1', 'halfWall', CX - 160, M5.minefieldY + 200, 120, 24),
    cover('m5-mine-hw2', 'halfWall', CX, M5.minefieldY + 200, 120, 24),
    cover('m5-mine-hw3', 'halfWall', CX + 160, M5.minefieldY + 200, 120, 24),
    // Fuel farm.
    cover('m5-fuel-w', 'sandbags', 480, M5.fuelY + 40, 180),
    cover('m5-fuel-e', 'sandbags', M5_W - 480, M5.fuelY + 40, 180),
    cover('m5-fuel-c1', 'crate', CX - 300, M5.fuelY - 160, 60, 60),
    cover('m5-fuel-c2', 'crate', CX + 300, M5.fuelY - 160, 60, 60),
    // Checkpoint crates.
    cover('m5-cp-c1', 'crate', 420, M5.checkpointY - 60, 60, 60),
    cover('m5-cp-c2', 'crate', 540, M5.checkpointY + 40, 60, 60),
    cover('m5-cp-c3', 'crate', M5_W - 420, M5.checkpointY - 60, 60, 60),
    cover('m5-cp-c4', 'crate', M5_W - 540, M5.checkpointY + 40, 60, 60),
    // Outer line: a chain-link fence and sandbags inside turret range.
    cover('m5-outer-fence', 'fence', CX, M5.outerLineY - 80, 360, 12),
    cover('m5-outer-w', 'sandbags', CX - 330, M5.outerLineY + 260, 180),
    cover('m5-outer-e', 'sandbags', CX + 330, M5.outerLineY + 260, 180),
  ],
  water: [
    // River, except under the two bridges.
    { x: 0, y: M5.riverY[0], w: BRIDGE1_X[0], h: M5.riverY[1] - M5.riverY[0] },
    {
      x: BRIDGE1_X[1],
      y: M5.riverY[0],
      w: BRIDGE2_X[0] - BRIDGE1_X[1],
      h: M5.riverY[1] - M5.riverY[0],
    },
    { x: BRIDGE2_X[1], y: M5.riverY[0], w: M5_W - BRIDGE2_X[1], h: M5.riverY[1] - M5.riverY[0] },
  ],
  spawnPoints: [
    {
      id: 'west',
      nameKey: 'spawn.mission05.west',
      position: { x: 420, y: M5.spawnY },
      facing: -Math.PI / 2,
      kind: 'initial',
    },
    {
      id: 'centre',
      nameKey: 'spawn.mission05.centre',
      position: { x: CX, y: M5.spawnY },
      facing: -Math.PI / 2,
      kind: 'initial',
    },
    {
      id: 'east',
      nameKey: 'spawn.mission05.east',
      position: { x: M5_W - 420, y: M5.spawnY },
      facing: -Math.PI / 2,
      kind: 'initial',
    },
    forwardSpawn('checkpoint', 'spawn.mission05.checkpoint', 'cp-a', M5.checkpointY),
    forwardSpawn('fuel', 'spawn.mission05.fuel', 'cp-b', M5.fuelY),
    forwardSpawn('crossroads', 'spawn.mission05.crossroads', 'cp-c', M5.crossroadsY),
    forwardSpawn('depot', 'spawn.mission05.depot', 'cp-d', M5.depotY),
  ],
  capturePoints: [
    capture('cp-a', 'capture.mission05.checkpoint', M5.checkpointY),
    capture('cp-b', 'capture.mission05.fuel', M5.fuelY),
    capture('cp-c', 'capture.mission05.crossroads', M5.crossroadsY),
    capture('cp-d', 'capture.mission05.depot', M5.depotY),
  ],
  objectives: [{ id: 'm5-hq', position: { x: CX, y: M5.hqY }, radius: 64, maxHp: 900 }],
  turrets: [
    { id: 'm5-t1', position: { x: 360, y: M5.outerLineY }, facing: Math.PI / 2 },
    { id: 'm5-t2', position: { x: M5_W - 360, y: M5.outerLineY }, facing: Math.PI / 2 },
    { id: 'm5-t3', position: { x: 260, y: M5.checkpointY - 300 }, facing: Math.PI / 2 },
    { id: 'm5-t4', position: { x: M5_W - 260, y: M5.checkpointY - 300 }, facing: Math.PI / 2 },
    { id: 'm5-t5', position: { x: 240, y: M5.crossroadsY - 200 }, facing: Math.PI / 2 },
    { id: 'm5-t6', position: { x: M5_W - 240, y: M5.crossroadsY - 200 }, facing: Math.PI / 2 },
    { id: 'm5-t7', position: { x: 380, y: M5.innerYardY }, facing: Math.PI / 2 },
    { id: 'm5-t8', position: { x: M5_W - 380, y: M5.innerYardY }, facing: Math.PI / 2 },
  ],
  mines: [
    ...mines(M5.minefieldY - 40, [180, 260, 340, 560, 640, 720], 'w'),
    ...mines(M5.minefieldY - 40, [1080, 1160, 1240, 1460, 1540, 1620], 'e'),
    ...mines(M5.minefieldY + 360, [400, 520, 640, 1160, 1280, 1400], 's'),
  ],
  trafficLanes: [
    {
      id: 'm5-hw-east',
      from: { x: -100, y: M5.highwayY[0] },
      to: { x: M5_W + 100, y: M5.highwayY[0] },
    },
    {
      id: 'm5-hw-west',
      from: { x: M5_W + 100, y: M5.highwayY[1] },
      to: { x: -100, y: M5.highwayY[1] },
      offsetSeconds: 0.9,
    },
    {
      id: 'm5-service',
      from: { x: -100, y: M5.serviceRoadY },
      to: { x: M5_W + 100, y: M5.serviceRoadY },
      offsetSeconds: 0.4,
    },
  ],
  gates: [
    {
      id: 'm5-gate-checkpoint',
      rect: { x: GATE_X[0], y: M5.checkpointWallY, w: GATE_X[1] - GATE_X[0], h: 50 },
      initiallyOpen: false,
    },
    {
      id: 'm5-gate-fortress',
      rect: { x: FORT_GAP[0], y: M5.fortressWallY, w: FORT_GAP[1] - FORT_GAP[0], h: 50 },
      initiallyOpen: false,
    },
  ],
  bridges: [
    {
      id: 'm5-drawbridge',
      rect: {
        x: BRIDGE1_X[0],
        y: M5.riverY[0],
        w: BRIDGE1_X[1] - BRIDGE1_X[0],
        h: M5.riverY[1] - M5.riverY[0],
      },
      axis: 'y',
      kind: 'draw',
      initiallyUp: false,
    },
    {
      id: 'm5-bridge-east',
      rect: {
        x: BRIDGE2_X[0],
        y: M5.riverY[0],
        w: BRIDGE2_X[1] - BRIDGE2_X[0],
        h: M5.riverY[1] - M5.riverY[0],
      },
      axis: 'y',
      kind: 'destructible',
      charge: { x: BRIDGE2_X[1] + 40, y: M5.riverY[0] - 30 },
    },
  ],
  levers: [
    {
      id: 'm5-lever-cp-s',
      position: { x: GATE_X[0] - 60, y: M5.checkpointWallY + 90 },
      targetId: 'm5-gate-checkpoint',
    },
    {
      id: 'm5-lever-cp-n',
      position: { x: GATE_X[1] + 60, y: M5.checkpointWallY - 40 },
      targetId: 'm5-gate-checkpoint',
    },
    {
      id: 'm5-lever-fort-s',
      position: { x: FORT_GAP[0] - 60, y: M5.fortressWallY + 90 },
      targetId: 'm5-gate-fortress',
    },
    {
      id: 'm5-lever-fort-n',
      position: { x: FORT_GAP[1] + 60, y: M5.fortressWallY - 40 },
      targetId: 'm5-gate-fortress',
    },
    {
      id: 'm5-lever-bridge',
      position: { x: BRIDGE1_X[1] + 70, y: M5.riverY[1] + 70 },
      targetId: 'm5-drawbridge',
    },
  ],
  squads: [
    // Outer line: contact within seconds.
    guard('m5-sq-outer', M5.outerLineY - 140, [
      ['rifleman', 520],
      ['shield', CX - 60],
      ['rifleman', CX + 60],
      ['gunner', M5_W - 520],
    ]),
    // Checkpoint: holds point A, with a gun truck.
    {
      ...guard('m5-sq-checkpoint', M5.checkpointY - 120, [
        ['sniper', 420],
        ['rifleman', CX - 140],
        ['truck', CX],
        ['shotgun', CX + 140],
        ['grenadier', M5_W - 420],
      ]),
      capturePointId: 'cp-a',
    },
    // Fuel farm: holds point B.
    {
      ...guard('m5-sq-fuel', M5.fuelY - 120, [
        ['rifleman', 480],
        ['bazooka', CX - 120],
        ['shield', CX],
        ['gunner', CX + 120],
        ['rifleman', M5_W - 480],
      ]),
      capturePointId: 'cp-b',
    },
    // Minefield: a tank and its escort.
    guard('m5-sq-mines', M5.minefieldY - 120, [
      ['tank', CX],
      ['rifleman', CX - 200],
      ['bazooka', CX + 200],
    ]),
    // Highway patrol: a gun truck driving the road between the lanes.
    {
      id: 'm5-sq-highway',
      members: [{ role: 'truck', position: { x: 300, y: M5.highwayY[0] - 140 }, facing: 0 }],
      order: {
        kind: 'patrol',
        route: [
          { x: 260, y: M5.highwayY[0] - 140 },
          { x: M5_W - 260, y: M5.highwayY[0] - 140 },
        ],
      },
    },
    // Crossroads: holds point C, close-range heavy.
    {
      ...guard('m5-sq-cross', M5.crossroadsY - 160, [
        ['shotgun', CX - 200],
        ['shotgun', CX + 200],
        ['bazooka', CX - 60],
        ['shield', CX + 60],
        ['sniper', 380],
        ['sniper', M5_W - 380],
      ]),
      capturePointId: 'cp-c',
    },
    // Depot: holds point D.
    {
      ...guard('m5-sq-depot', M5.depotY - 140, [
        ['gunner', 300],
        ['rifleman', CX - 120],
        ['truck', CX],
        ['grenadier', CX + 120],
        ['gunner', M5_W - 300],
      ]),
      capturePointId: 'cp-d',
    },
    // Inner yard: a tank, snipers on the sandbags, a shield wall.
    guard('m5-sq-yard', M5.innerYardY + 40, [
      ['sniper', 520],
      ['shield', CX - 90],
      ['tank', CX],
      ['shield', CX + 90],
      ['sniper', M5_W - 520],
    ]),
    // Inside the HQ.
    guard('m5-sq-hq', M5.hqY + 160, [
      ['rifleman', 420],
      ['shotgun', CX - 160],
      ['bazooka', CX],
      ['shotgun', CX + 160],
      ['rifleman', M5_W - 420],
    ]),
  ],
};
