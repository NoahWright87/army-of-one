/**
 * (PHASE18) Basic Training: the tutorial ([D155]). One long course, south to north, a station
 * at a time; the drill sergeant walks along the west fence yelling at you (drawn by the app,
 * not part of the sim). Every gate is a mission rule (`triggers`): do the station, it opens.
 *
 *        x: 40   230 242          520  680     1000 1012       1360
 *   y  40 ┌──────┬─┬──────────────────────────────────────────────┐
 *         │      │┊│  R7 GRADUATION        (flag)                  │
 *     400 │      │┊├───────────────┤g7├────────────────────────────┤
 *         │ S    │┊│  R6 GRENADE           ▐ parapet │ enemy        │
 *     900 │ A    │┊├───────────────┤g6├────────────────────────────┤
 *         │ R    │┊│  R5 COVER   ▮sandbags        ▮ 3 enemies      │
 *    1520 │ G    │┊├───────────────┤g5├──────────────┬─────────────┤
 *         │ E    │┊│  R4  (B flag)                 g4  corridor    │
 *    2120 │      │┊├───────────────┤  ├──────────────┤  shotgunner  │
 *         │ W    │┊│  R3   mines ✶✶✶               ┊▮ MG nest      │
 *         │ A    │┊│                               ┊   lever      │
 *    2860 │ L    │┊├───────────────┤g2├──────────────┴─────────────┤
 *         │ K    │┊│  R2  (A flag)                                │
 *    3380 │      │┊├───────────────┤g1├────────────────────────────┤
 *         │      │┊│  R1 RANGE          ▮sandbags      ◎ ◎ targets │
 *    3900 │      │┊├───────────────┤  ├────────────────────────────┤
 *         │      │┊│  R0 START  (spawn)                           │
 *    4360 └──────┴─┴──────────────────────────────────────────────┘
 */
import type { CoverDef, MapDef, Rect } from '../../sim/world/map';
import { borderWalls } from '../../sim/world/map';
import type { DeepPartial, Tuning } from '../tuning';

export const BASIC_TRAINING_ID = 'basic-training';
export const BT_W = 1400;
export const BT_H = 4400;

/** The west fence the sergeant walks behind. */
export const BT_FENCE_X = 230;
/** Where the sergeant walks (x), and how far north / south he goes. */
export const BT_SARGE_X = 140;

/** North edge (y) of each room, south to north. */
export const BT = {
  r0: 3900,
  r1: 3380,
  r2: 2860,
  r3: 2120,
  r4: 1520,
  r5: 900,
  r6: 400,
  r7: 40,
} as const;

export type BtRoom = 'r0' | 'r1' | 'r2' | 'r3' | 'r4' | 'r5' | 'r6' | 'r7';

/** Which room a point is in (the corridor east of R3/R4 counts as R4's flank). */
export function btRoomAt(x: number, y: number): BtRoom {
  if (y >= BT.r0) return 'r0';
  if (y >= BT.r1) return 'r1';
  if (y >= BT.r2) return 'r2';
  if (x > 1006 && y >= BT.r4) return 'r4';
  if (y >= BT.r3) return 'r3';
  if (y >= BT.r4) return 'r4';
  if (y >= BT.r5) return 'r5';
  if (y >= BT.r6) return 'r6';
  return 'r7';
}

const DOOR_X = 520;
const DOOR_W = 160;
const L = BT_FENCE_X + 12; // west edge of the course
const R = BT_W - 40; // east edge

/** A wall across the course at `y` with a doorway at `door` (default x 520–680). */
function crossWall(y: number, from = L, to = R, door = DOOR_X): Rect[] {
  return [
    { x: from, y: y - 20, w: door - from, h: 20 },
    { x: door + DOOR_W, y: y - 20, w: to - door - DOOR_W, h: 20 },
  ];
}

/** R3's way north: across the nest's field of fire (and its mines). */
export const BT_R3_DOOR = 780;

const gateAt = (id: string, y: number) => ({
  id,
  rect: { x: DOOR_X, y: y - 20, w: DOOR_W, h: 20 },
  initiallyOpen: false,
});

const cover = (
  id: string,
  material: CoverDef['material'],
  rect: Rect,
  extra: Partial<CoverDef> = {},
): CoverDef => ({ id, material, rect, ...extra });

/** Targets on the range (R1). */
export const BT_TARGETS = ['bt-t1', 'bt-t2', 'bt-t3', 'bt-t4'] as const;
/** Mines across R3's way north. */
export const BT_MINES = ['bt-m1', 'bt-m2', 'bt-m3', 'bt-m4', 'bt-m5'] as const;

export const BASIC_TRAINING: MapDef = {
  id: BASIC_TRAINING_ID,
  nameKey: 'map.basic.name',
  width: BT_W,
  height: BT_H,
  walls: [
    ...borderWalls(BT_W, BT_H, 40),
    ...crossWall(BT.r0), // R0 → R1: an open doorway
    ...crossWall(BT.r1), // gate g1
    ...crossWall(BT.r2), // gate g2
    // R3 → R4: an open doorway near the nest; the corridor (x 1012+) runs on north.
    ...crossWall(BT.r3, L, 1000, BT_R3_DOOR),
    // R3/R4's east side: the corridor wall, with gate g4 into the corridor from R4.
    { x: 1000, y: BT.r4, w: 12, h: 180 },
    { x: 1000, y: BT.r4 + 300, w: 12, h: BT.r3 - BT.r4 - 300 },
    // A wall stub in the corridor: the shotgunner waits round its corner.
    { x: 1012, y: 2280, w: 200, h: 20 },
    ...crossWall(BT.r4), // gate g5 (the lever)
    ...crossWall(BT.r5), // gate g6
    ...crossWall(BT.r6), // gate g7
  ],
  water: [],
  cover: [
    // The sergeant's fence: you can see him, you can't get to him.
    cover('bt-fence', 'fence', { x: BT_FENCE_X, y: 40, w: 12, h: BT_H - 80 }),
    // R1: sandbags between you and the targets: get up to them and fire over.
    cover('bt-r1-bags', 'sandbags', { x: 880, y: 3480, w: 24, h: 280 }),
    // R3: the fence between you and the MG nest, and the nest's heavy cover.
    cover('bt-r3-fence', 'fence', { x: 1000, y: BT.r3, w: 12, h: BT.r2 - 20 - BT.r3 }),
    cover('bt-mg-nest', 'sandbags', { x: 1060, y: 2400, w: 24, h: 200 }, { bullet: 0.95 }),
    // R5: heavy sandbags for you; theirs to the east.
    cover('bt-r5-bags', 'sandbags', { x: 640, y: 1040, w: 24, h: 340 }, { bullet: 0.8 }),
    cover('bt-r5-theirs', 'sandbags', { x: 1100, y: 1040, w: 24, h: 340 }),
    // R6: a parapet bullets can't get through: only a grenade over the top will do.
    cover(
      'bt-r6-parapet',
      'halfWall',
      { x: 1060, y: 520, w: 24, h: 260 },
      { bullet: 1, lobbed: 0 },
    ),
  ],
  gates: [
    gateAt('bt-g1', BT.r1),
    gateAt('bt-g2', BT.r2),
    { id: 'bt-g4', rect: { x: 1000, y: BT.r4 + 180, w: 12, h: 120 }, initiallyOpen: false },
    gateAt('bt-g5', BT.r4),
    gateAt('bt-g6', BT.r5),
    gateAt('bt-g7', BT.r6),
  ],
  levers: [{ id: 'bt-lever', position: { x: 1300, y: 2760 }, targetId: 'bt-g5' }],
  objectives: [
    { id: 'bt-t1', position: { x: 1150, y: 3500 }, radius: 18, maxHp: 50, target: true },
    { id: 'bt-t2', position: { x: 1270, y: 3600 }, radius: 18, maxHp: 50, target: true },
    { id: 'bt-t3', position: { x: 1150, y: 3700 }, radius: 18, maxHp: 50, target: true },
    { id: 'bt-t4', position: { x: 1270, y: 3800 }, radius: 18, maxHp: 50, target: true },
  ],
  mines: [
    { id: 'bt-m1', position: { x: 730, y: 2195 } },
    { id: 'bt-m2', position: { x: 800, y: 2220 } },
    { id: 'bt-m3', position: { x: 860, y: 2180 } },
    { id: 'bt-m4', position: { x: 920, y: 2220 } },
    { id: 'bt-m5', position: { x: 975, y: 2190 } },
  ],
  capturePoints: [
    { id: 'bt-a', nameKey: 'spawn.basic.a', position: { x: 800, y: 3110 } },
    { id: 'bt-b', nameKey: 'spawn.basic.b', position: { x: 650, y: 1820 } },
    {
      id: 'bt-grad',
      nameKey: 'spawn.basic.grad',
      position: { x: 700, y: 220 },
      objective: true,
    },
  ],
  spawnPoints: [
    {
      id: 'bt-start',
      nameKey: 'spawn.basic.start',
      position: { x: 600, y: 4250 },
      facing: -Math.PI / 2,
      kind: 'initial',
    },
    {
      id: 'bt-sp-a',
      nameKey: 'spawn.basic.a',
      position: { x: 800, y: 3180 },
      facing: -Math.PI / 2,
      kind: 'capture',
      capturePointId: 'bt-a',
    },
    {
      id: 'bt-sp-b',
      nameKey: 'spawn.basic.b',
      position: { x: 650, y: 1890 },
      facing: -Math.PI / 2,
      kind: 'capture',
      capturePointId: 'bt-b',
    },
  ],
  squads: [
    // R3: the MG nest (and, round the corner, the shotgunner guarding its back).
    {
      id: 'bt-nest',
      hold: true,
      members: [
        { role: 'gunner', position: { x: 1110, y: 2500 }, facing: Math.PI },
        { role: 'shotgun', position: { x: 1290, y: 2340 }, facing: -Math.PI / 2 },
      ],
      order: { kind: 'guard' },
    },
    // R5: three riflemen behind their sandbags.
    {
      id: 'bt-r5',
      hold: true,
      members: [
        { position: { x: 1160, y: 1080 }, facing: Math.PI },
        { position: { x: 1160, y: 1210 }, facing: Math.PI },
        { position: { x: 1160, y: 1340 }, facing: Math.PI },
      ],
      order: { kind: 'guard' },
    },
    // R6: one rifleman behind a parapet.
    {
      id: 'bt-r6',
      hold: true,
      members: [{ position: { x: 1100, y: 650 }, facing: Math.PI }],
      order: { kind: 'guard' },
    },
  ],
  triggers: [
    { id: 'bt-tr1', when: { destroyed: [...BT_TARGETS] }, openGate: 'bt-g1' },
    { id: 'bt-tr2', when: { captured: 'bt-a' }, openGate: 'bt-g2' },
    { id: 'bt-tr4', when: { captured: 'bt-b' }, openGate: 'bt-g4' },
    { id: 'bt-tr6', when: { squadDead: 'bt-r5' }, openGate: 'bt-g6' },
    { id: 'bt-tr7', when: { squadDead: 'bt-r6' }, openGate: 'bt-g7' },
  ],
  economy: { startMoney: 0, baseIncomePerSecond: 0 },
  // Unlocked as you go (src/app/basic-training.ts adds to this list).
  roles: ['rifleman'],
};

/** Basic training's rules on top of the usual tuning: no money, enemies don't heal. */
export const BASIC_TRAINING_TUNING: DeepPartial<Tuning> = {
  economy: { enabled: false },
  soldier: { regen: { enemies: false } },
};
