import type { RoleId } from '../../contracts/mission';
import {
  borderWalls,
  type CoverDef,
  type MapDef,
  type Rect,
  type SquadDef,
} from '../../sim/world/map';

/**
 * Mission 04: "Compound" (07-c). A proof of concept for the cover system ([D32]) indoors: fences,
 * crates, sandbags, windows, half walls and an armored bunker slit. Straight north like Breach
 * ([D27]), contact within seconds ([D28]).
 *
 *          x: 0       350       700      1050      1400
 *   y    0 ┌───────────────────────────────────────┐
 *     460  │          ┌─────────────────┐          │  bunker: Command Post inside (destroy)
 *     580  │          │  [!]            ▕ door     │  east door (mines outside it)
 *     760  │          └──────[slit]─────┘          │  armored slit (90 %); T4 fires out of it
 *    1000  │      ▣                         ▣      │  courtyard crates
 *    1280  │ ████[win]█████████████████[door]████ │  building back wall
 *    1420  │   ▬▬▬▬       ▬▬▬ T3 ▬▬▬       ▬▬▬▬    │  half walls (desks); T3 covers the door
 *    1550  │               ( Office )              │  capture point → forward spawn
 *    1700  │ ████[win]█████[door]██████[win]██████ │  building front wall: windows + door
 *    1800  │       T1                      T2      │  yard turrets
 *    1960  │          ▀▀▀▀▀        ▀▀▀▀▀           │  sandbags
 *    2050  │     ▣                           ▣     │  crates
 *    2180  │ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄      ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │  chain-link fence (10 %), gap in the middle
 *    2450  │       W            C            E     │  spawns
 *    2600  └───────────────────────────────────────┘
 *
 * What it shows:
 * - The fence barely stops bullets (T1/T2 shoot straight through it) but bounces half the
 *   grenades thrown at it.
 * - Crates and sandbags: duck behind, fire over from right next to them.
 * - Windows: shoot (and lob grenades) into the building; the walls either side are solid.
 * - Half walls: cover inside the rooms; T3 behind the centre one guards the front door.
 * - The bunker slit stops 90 % of bullets and most grenades. T4 stands right behind it and fires
 *   out through it; go round to the east door, or keep lobbing grenades at the slit.
 */

export const M4_W = 1400;
export const M4_H = 2600;
const CX = M4_W / 2;
const T = 40; // wall thickness

export const M4 = {
  bunkerTopY: 460,
  bunkerFrontY: 760,
  courtyardY: 1000,
  backWallY: 1280,
  deskY: 1420,
  officeY: 1550,
  frontWallY: 1700,
  yardTurretY: 1800,
  bagsY: 1960,
  cratesY: 2050,
  fenceY: 2180,
  spawnY: 2450,
} as const;

/** Solid wall pieces along y from x0 to x1, leaving `gaps` ([x, x] ranges) open. */
function wallWithGaps(y: number, x0: number, x1: number, gaps: [number, number][]): Rect[] {
  const out: Rect[] = [];
  let x = x0;
  for (const [g0, g1] of gaps) {
    if (g0 > x) out.push({ x, y, w: g0 - x, h: T });
    x = g1;
  }
  if (x1 > x) out.push({ x, y, w: x1 - x, h: T });
  return out;
}

const cover = (
  id: string,
  material: CoverDef['material'],
  x: number,
  y: number,
  w: number,
  h: number,
): CoverDef => ({ id, material, rect: { x, y, w, h } });

const FRONT_WINDOWS: [number, number][] = [
  [240, 380],
  [1020, 1160],
];
const FRONT_DOOR: [number, number] = [CX - 60, CX + 60];
const BACK_WINDOW: [number, number] = [280, 420];
const BACK_DOOR: [number, number] = [1080, 1200];
const BUNKER_X: [number, number] = [440, 960];
const SLIT: [number, number] = [CX - 70, CX + 70];
const BUNKER_DOOR_Y: [number, number] = [560, 660];

export const MISSION_04: MapDef = {
  id: 'mission-04',
  nameKey: 'map.mission04.name',
  width: M4_W,
  height: M4_H,
  walls: [
    ...borderWalls(M4_W, M4_H, T),
    // Building front wall: two windows and a door.
    ...wallWithGaps(M4.frontWallY, T, M4_W - T, [FRONT_WINDOWS[0]!, FRONT_DOOR, FRONT_WINDOWS[1]!]),
    // Building back wall: a window (west) and a door (east).
    ...wallWithGaps(M4.backWallY, T, M4_W - T, [BACK_WINDOW, BACK_DOOR]),
    // Bunker: back wall, west wall, east wall with a door, front wall with the slit.
    { x: BUNKER_X[0], y: M4.bunkerTopY, w: BUNKER_X[1] - BUNKER_X[0], h: T },
    { x: BUNKER_X[0], y: M4.bunkerTopY, w: T, h: M4.bunkerFrontY + T - M4.bunkerTopY },
    {
      x: BUNKER_X[1] - T,
      y: M4.bunkerTopY,
      w: T,
      h: BUNKER_DOOR_Y[0] - M4.bunkerTopY,
    },
    {
      x: BUNKER_X[1] - T,
      y: BUNKER_DOOR_Y[1],
      w: T,
      h: M4.bunkerFrontY + T - BUNKER_DOOR_Y[1],
    },
    ...wallWithGaps(M4.bunkerFrontY, BUNKER_X[0], BUNKER_X[1], [SLIT]),
  ],
  water: [],
  cover: [
    // Yard: a chain-link fence with a gap in the middle.
    cover('m4-fence-w', 'fence', T, M4.fenceY, CX - 80 - T, 8),
    cover('m4-fence-e', 'fence', CX + 80, M4.fenceY, M4_W - T - (CX + 80), 8),
    // Yard: crates and sandbags.
    cover('m4-crate-yard-w', 'crate', 250, M4.cratesY, 56, 56),
    cover('m4-crate-yard-e', 'crate', M4_W - 250 - 56, M4.cratesY, 56, 56),
    cover('m4-bags-yard-w', 'sandbags', CX - 260, M4.bagsY, 150, 26),
    cover('m4-bags-yard-e', 'sandbags', CX + 110, M4.bagsY, 150, 26),
    // Building: the front windows and the back window fill their wall gaps.
    ...FRONT_WINDOWS.map(([x0, x1], i) =>
      cover(`m4-window-front-${i + 1}`, 'window', x0, M4.frontWallY, x1 - x0, T),
    ),
    cover(
      'm4-window-back',
      'window',
      BACK_WINDOW[0],
      M4.backWallY,
      BACK_WINDOW[1] - BACK_WINDOW[0],
      T,
    ),
    // Building: half walls (desk rows).
    cover('m4-desk-w', 'halfWall', 140, M4.deskY + 60, 240, 20),
    cover('m4-desk-c', 'halfWall', CX - 110, M4.deskY, 220, 20),
    cover('m4-desk-e', 'halfWall', M4_W - 140 - 240, M4.deskY + 60, 240, 20),
    // Courtyard crates.
    cover('m4-crate-court-w', 'crate', 250, M4.courtyardY, 64, 64),
    cover('m4-crate-court-e', 'crate', M4_W - 250 - 64, M4.courtyardY, 64, 64),
    cover('m4-bags-court', 'sandbags', CX - 90, M4.courtyardY + 120, 180, 26),
    // Bunker: the armored slit.
    cover('m4-slit', 'bunkerWindow', SLIT[0], M4.bunkerFrontY, SLIT[1] - SLIT[0], T),
  ],
  spawnPoints: [
    {
      id: 'west',
      nameKey: 'spawn.mission04.west',
      position: { x: 300, y: M4.spawnY },
      facing: -Math.PI / 2,
      kind: 'initial',
    },
    {
      id: 'centre',
      nameKey: 'spawn.mission04.centre',
      position: { x: CX, y: M4.spawnY },
      facing: -Math.PI / 2,
      kind: 'initial',
    },
    {
      id: 'east',
      nameKey: 'spawn.mission04.east',
      position: { x: M4_W - 300, y: M4.spawnY },
      facing: -Math.PI / 2,
      kind: 'initial',
    },
    {
      id: 'office',
      nameKey: 'spawn.mission04.office',
      position: { x: CX, y: M4.officeY + 70 },
      facing: -Math.PI / 2,
      kind: 'capture',
      capturePointId: 'cp-office',
    },
  ],
  turrets: [
    { id: 'm4-t1', position: { x: 340, y: M4.yardTurretY }, facing: Math.PI / 2 },
    { id: 'm4-t2', position: { x: M4_W - 340, y: M4.yardTurretY }, facing: Math.PI / 2 },
    // Inside the building, behind the centre desk, covering the front door.
    { id: 'm4-t3', position: { x: CX, y: M4.deskY - 60 }, facing: Math.PI / 2 },
    // Inside the bunker, right behind the slit: it fires out through it.
    { id: 'm4-t4', position: { x: CX, y: M4.bunkerFrontY - 24 }, facing: Math.PI / 2 },
  ],
  mines: [
    { id: 'm4-mine-1', position: { x: BUNKER_X[1] + 70, y: 590 } },
    { id: 'm4-mine-2', position: { x: BUNKER_X[1] + 120, y: 660 } },
  ],
  capturePoints: [
    { id: 'cp-office', nameKey: 'capture.mission04.office', position: { x: CX, y: M4.officeY } },
  ],
  objectives: [{ id: 'm4-command', position: { x: 560, y: 590 }, radius: 44, maxHp: 300 }],
  // (07-d) Enemy soldiers ([D44]), using the cover the way you would.
  squads: [
    guardSquad('m4-sq-yard', [
      ['rifleman', 300, M4.bagsY - 50],
      ['gunner', CX - 180, M4.bagsY - 40],
      ['rifleman', CX + 180, M4.bagsY - 40],
      ['rifleman', M4_W - 300, M4.bagsY - 50],
      ['grenadier', CX, M4.yardTurretY + 40],
    ]),
    guardSquad('m4-sq-office', [
      ['rifleman', 260, M4.deskY + 30],
      ['gunner', CX - 60, M4.deskY - 30],
      ['rifleman', CX + 60, M4.deskY - 30],
      ['rifleman', M4_W - 260, M4.deskY + 30],
      ['grenadier', CX, M4.backWallY + 70],
    ]),
    guardSquad('m4-sq-court', [
      ['rifleman', 320, M4.courtyardY - 40],
      ['gunner', CX, M4.courtyardY + 90],
      ['rifleman', M4_W - 320, M4.courtyardY - 40],
      ['rifleman', 1050, M4.bunkerFrontY + 120],
    ]),
    guardSquad('m4-sq-bunker', [
      ['rifleman', 800, 560],
      ['grenadier', 620, 680],
      ['rifleman', 1020, 720],
    ]),
  ],
};

/** (07-d) A guard squad of [role, x, y] members, facing down the map (toward us). */
function guardSquad(id: string, members: [RoleId, number, number][]): SquadDef {
  return {
    id,
    members: members.map(([role, x, y]) => ({ role, position: { x, y }, facing: Math.PI / 2 })),
    order: { kind: 'guard' },
  };
}
