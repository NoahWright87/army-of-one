/**
 * (PHASE18) Basic Training: the tutorial ([D155]). One long course, south to north, "on rails":
 * each station leaves one obvious way through, and the game's own rules do the teaching. The
 * drill sergeant walks along the west fence yelling at you (drawn by the app, not the sim).
 * Every gate is a mission rule (`triggers`): do the station, it opens. Before each fight a
 * small room with a flag: take it, and that's where you come back.
 *
 *        x: 40   230 242     520 680 700 780 940 1000 1012         1360
 *   y  40 ┌──────┬─┬──────────────────────────────────────────────────┐
 *         │      │┊│  R7 GRADUATION               (flag)              │
 *     400 │      │┊├──────────┤g8├──────────────────────────────────────┤
 *         │      │┊│  R6 GRENADE                    ▐parapet  enemy   │
 *     700 │      │┊├──────────┤g7├──────────────────────────────────────┤
 *         │ S    │┊│  R6F  (D flag)                                   │
 *     900 │ A    │┊├──────────┤g6├──────────────────────────────────────┤
 *         │ R    │┊│  R5 AMBUSH    ▮your bags         5 riflemen       │
 *    1300 │ G    │┊├──────────┤g5b├─────────────────────────────────────┤
 *         │ E    │┊│  R5F  (C flag)                                   │
 *    1520 │      │┊├──────────┤g5├──────────────────┬───────────────────┤
 *         │ W    │┊│  R4  (B flag)                 g4   ▀▀▀▀▀▀▀▀  ┆gap │
 *         │ A    │┊│                                ┃  shotgunner      │
 *    2120 │ L    │┊├████████████████┤exit├───────┤  corridor         │
 *         │ K    │┊│████████████████│ ✶✶✶✶✶ │ ┊  ▮ MG nest        │
 *         │      │┊│████████████████│  >>>  │ ┊      lever        │
 *         │      │┊│████████████████│  >>>  ├─█──────────────────────┤
 *    2860 │      │┊├──────────────────┤g2├────┴──────────────────────────┤
 *         │      │┊│  R2  (A flag, near the gate)                     │
 *    3380 │      │┊├──────────┤g1├──────────────────────────────────────┤
 *         │      │┊│  R1 RANGE          ▮sandbags      ◎ ◎ targets    │
 *    3900 │      │┊├──────────┤  ├──────────────────────────────────────┤
 *         │      │┊│  R0 START  (spawn)                               │
 *    4360 └──────┴─┴──────────────────────────────────────────────────┘
 */
import type { CoverDef, MapDef, Rect } from '../../sim/world/map';
import { borderWalls } from '../../sim/world/map';
import type { Vec2 } from '../../sim/core/vec';
import type { DeepPartial, Tuning } from '../tuning';

export const BASIC_TRAINING_ID = 'basic-training';
export const BT_W = 1400;
export const BT_H = 4400;

/** The west fence the sergeant walks behind. */
export const BT_FENCE_X = 230;
/** Where the sergeant walks (x). */
export const BT_SARGE_X = 140;

/** North edge (y) of each room, south to north. */
export const BT = {
  r0: 3900,
  r1: 3380,
  r2: 2860,
  r3: 2120,
  r4: 1520,
  r5f: 1300,
  r5: 900,
  r6f: 700,
  r6: 400,
  r7: 40,
} as const;

export type BtRoom = keyof typeof BT;

/** The corridor east of R3/R4 (round behind the MG nest). */
export const BT_CORRIDOR_X = 1006;

/** Which room a point is in (the corridor counts as R4's flank). */
export function btRoomAt(x: number, y: number): BtRoom {
  if (y >= BT.r0) return 'r0';
  if (y >= BT.r1) return 'r1';
  if (y >= BT.r2) return 'r2';
  if (x > BT_CORRIDOR_X && y >= BT.r4) return 'r4';
  if (y >= BT.r3) return 'r3';
  if (y >= BT.r4) return 'r4';
  if (y >= BT.r5f) return 'r5f';
  if (y >= BT.r5) return 'r5';
  if (y >= BT.r6f) return 'r6f';
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

/** R3 is a chute: x 700–1000, its doors at x 780–940. */
const CHUTE_X = 700;
const CHUTE_DOOR = 780;
/** South of this, the chute is out of the MG's sight (a wall, not a fence, beside it). */
export const BT_CHUTE_SAFE_Y = 2560;

const gateAt = (id: string, y: number, door = DOOR_X) => ({
  id,
  rect: { x: door, y: y - 20, w: DOOR_W, h: 20 },
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
/** Mines across the chute (R3), out where the MG covers it. */
export const BT_MINES = ['bt-m1', 'bt-m2', 'bt-m3', 'bt-m4', 'bt-m5'] as const;
/** Seconds after Alpha is taken before the chute's gate opens (time to get to it). */
export const BT_CHUTE_DELAY_S = 6; // TUNE

/** Where to go: chevrons painted on the floor (`sprint`: the big red ones). */
export const BT_CHEVRONS: readonly { from: Vec2; to: Vec2; sprint?: true }[] = [
  { from: { x: 600, y: 4170 }, to: { x: 600, y: 3930 } },
  { from: { x: 860, y: 3040 }, to: { x: 860, y: 2890 } },
  { from: { x: 860, y: 2820 }, to: { x: 860, y: 2150 }, sprint: true },
  { from: { x: 860, y: 2090 }, to: { x: 720, y: 1990 } },
  { from: { x: 700, y: 1800 }, to: { x: 970, y: 1760 } },
  { from: { x: 1060, y: 1760 }, to: { x: 1300, y: 1800 } },
  { from: { x: 600, y: 1440 }, to: { x: 600, y: 1320 } },
  { from: { x: 600, y: 840 }, to: { x: 600, y: 720 } },
];

export const BASIC_TRAINING: MapDef = {
  id: BASIC_TRAINING_ID,
  nameKey: 'map.basic.name',
  width: BT_W,
  height: BT_H,
  walls: [
    ...borderWalls(BT_W, BT_H, 40),
    ...crossWall(BT.r0), // R0 → R1: an open doorway
    ...crossWall(BT.r1), // gate g1
    ...crossWall(BT.r2, L, R, CHUTE_DOOR), // gate g2, into the chute
    // R3: solid west of the chute; the exit north is an open doorway.
    { x: L, y: BT.r3, w: CHUTE_X - L, h: BT.r2 - 20 - BT.r3 },
    ...crossWall(BT.r3, L, 1000, CHUTE_DOOR),
    // Beside the chute: a wall where it's safe (south), a fence where the MG sees you (north).
    { x: 1000, y: BT_CHUTE_SAFE_Y, w: 12, h: BT.r2 - 20 - BT_CHUTE_SAFE_Y },
    // The corridor (x 1012+): it ends south of the nest.
    { x: 1012, y: 2700, w: R - 1012, h: BT.r2 - 20 - 2700 },
    // R4's east wall, gate g4 into the corridor.
    { x: 1000, y: BT.r4, w: 12, h: 180 },
    { x: 1000, y: BT.r4 + 300, w: 12, h: BT.r3 - BT.r4 - 300 },
    // In the corridor: a wall the shotgunner waits behind; round its east end, he's right there.
    { x: 1012, y: 1850, w: 268, h: 20 },
    // A baffle just past the chute's exit: the MG can't see through the doorway into R4.
    { x: 760, y: 2010, w: 220, h: 20 },
    ...crossWall(BT.r4), // gate g5 (the lever)
    ...crossWall(BT.r5f), // gate g5b (the C flag)
    ...crossWall(BT.r5), // gate g6 (the riflemen down)
    ...crossWall(BT.r6f), // gate g7 (the D flag)
    ...crossWall(BT.r6), // gate g8 (the parapet rifleman down)
  ],
  water: [],
  cover: [
    // The sergeant's fence: you can see him, you can't get to him.
    cover('bt-fence', 'fence', { x: BT_FENCE_X, y: 40, w: 12, h: BT_H - 80 }),
    // R1: sandbags between you and the targets: get up to them and fire over.
    cover('bt-r1-bags', 'sandbags', { x: 880, y: 3480, w: 24, h: 280 }),
    // R3: the fence the MG fires through, and the nest's heavy cover.
    cover('bt-r3-fence', 'fence', { x: 1000, y: BT.r3, w: 12, h: BT_CHUTE_SAFE_Y - BT.r3 }),
    cover('bt-mg-nest', 'sandbags', { x: 1060, y: 2380, w: 24, h: 160 }, { bullet: 0.95 }),
    // R5: heavy sandbags right by the door for you; theirs to the east.
    cover('bt-r5-bags', 'sandbags', { x: 690, y: 1110, w: 24, h: 170 }, { bullet: 0.85 }),
    // R6: a parapet bullets can't get through: only a grenade over the top will do.
    cover(
      'bt-r6-parapet',
      'halfWall',
      { x: 940, y: 460, w: 24, h: 220 },
      { bullet: 0.98, lobbed: 0 },
    ),
  ],
  gates: [
    gateAt('bt-g1', BT.r1),
    gateAt('bt-g2', BT.r2, CHUTE_DOOR),
    { id: 'bt-g4', rect: { x: 1000, y: BT.r4 + 180, w: 12, h: 120 }, initiallyOpen: false },
    gateAt('bt-g5', BT.r4),
    gateAt('bt-g5b', BT.r5f),
    gateAt('bt-g6', BT.r5),
    gateAt('bt-g7', BT.r6f),
    gateAt('bt-g8', BT.r6),
  ],
  levers: [{ id: 'bt-lever', position: { x: 1300, y: 2640 }, targetId: 'bt-g5' }],
  objectives: [
    { id: 'bt-t1', position: { x: 1150, y: 3500 }, radius: 18, maxHp: 50, target: true },
    { id: 'bt-t2', position: { x: 1270, y: 3600 }, radius: 18, maxHp: 50, target: true },
    { id: 'bt-t3', position: { x: 1150, y: 3700 }, radius: 18, maxHp: 50, target: true },
    { id: 'bt-t4', position: { x: 1270, y: 3800 }, radius: 18, maxHp: 50, target: true },
  ],
  mines: [
    { id: 'bt-m1', position: { x: 730, y: 2420 } },
    { id: 'bt-m2', position: { x: 795, y: 2440 } },
    { id: 'bt-m3', position: { x: 855, y: 2415 } },
    { id: 'bt-m4', position: { x: 915, y: 2440 } },
    { id: 'bt-m5', position: { x: 972, y: 2420 } },
  ],
  capturePoints: [
    { id: 'bt-a', nameKey: 'spawn.basic.a', position: { x: 860, y: 3030 } },
    { id: 'bt-b', nameKey: 'spawn.basic.b', position: { x: 650, y: 1830 } },
    { id: 'bt-c', nameKey: 'spawn.basic.c', position: { x: 600, y: 1410 }, radius: 90 },
    { id: 'bt-d', nameKey: 'spawn.basic.d', position: { x: 600, y: 800 }, radius: 90 },
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
    ...(
      [
        ['bt-sp-a', 'spawn.basic.a', 'bt-a', { x: 860, y: 3110 }],
        ['bt-sp-b', 'spawn.basic.b', 'bt-b', { x: 650, y: 1900 }],
        ['bt-sp-c', 'spawn.basic.c', 'bt-c', { x: 600, y: 1460 }],
        ['bt-sp-d', 'spawn.basic.d', 'bt-d', { x: 600, y: 850 }],
      ] as const
    ).map(([id, nameKey, capturePointId, position]) => ({
      id,
      nameKey,
      position,
      facing: -Math.PI / 2,
      kind: 'capture' as const,
      capturePointId,
    })),
  ],
  squads: [
    // R3: the MG nest. Deadly to anyone walking; a sprinter is a hard target.
    {
      id: 'bt-nest',
      hold: true,
      members: [{ role: 'gunner', position: { x: 1110, y: 2460 }, facing: Math.PI }],
      order: { kind: 'guard' },
      skill: { reactionSeconds: 0.2, aimError: 0.02, movingTargetError: 0.3 },
    },
    // The corridor: a shotgunner round the corner, waiting.
    {
      id: 'bt-ambush',
      hold: true,
      members: [{ role: 'shotgun', position: { x: 1262, y: 1902 }, facing: -Math.PI / 4 }],
      order: { kind: 'guard' },
      // Hits like a truck (a rifleman walking into him is done), but goes down fast (a Shield
      // pushing in with its pistol wins).
      skill: {
        reactionSeconds: 0.05,
        aimError: 0,
        thinkSeconds: 0.05,
        enemyDamageScale: 1.7,
        enemyHpScale: 0.45,
      },
    },
    // R5: five riflemen in the open, firing the moment you're through the door.
    {
      id: 'bt-r5',
      hold: true,
      members: [
        { position: { x: 950, y: 980 }, facing: Math.PI },
        { position: { x: 1000, y: 1060 }, facing: Math.PI },
        { position: { x: 950, y: 1140 }, facing: Math.PI },
        { position: { x: 1000, y: 1210 }, facing: Math.PI },
        { position: { x: 950, y: 1270 }, facing: Math.PI },
      ],
      order: { kind: 'guard' },
      skill: { reactionSeconds: 0.25 },
    },
    // R5: a grenadier behind them, slow to start: a braced MG has swept the room by the time his
    // grenade lands; anyone slower (a rifleman, a Shield sitting behind the sandbags) hasn't.
    {
      id: 'bt-r5g',
      hold: true,
      members: [{ role: 'grenadier', position: { x: 900, y: 1230 }, facing: Math.PI }],
      order: { kind: 'guard' },
      // His grenade hits hard enough to get through a Shield's front.
      skill: { reactionSeconds: 3, enemyDamageScale: 5 },
    },
    // R6: one rifleman behind a parapet.
    {
      id: 'bt-r6',
      hold: true,
      members: [{ position: { x: 984, y: 570 }, facing: Math.PI }],
      order: { kind: 'guard' },
      // Slow, wild bursts: deadly to a rifleman trading shots, time for a couple of throws.
      skill: { aimError: 0.12, burstSeconds: 0.5, burstPauseSeconds: 1.4 },
    },
  ],
  triggers: [
    { id: 'bt-tr1', when: { destroyed: [...BT_TARGETS] }, openGate: 'bt-g1' },
    {
      id: 'bt-tr2',
      when: { captured: 'bt-a' },
      openGate: 'bt-g2',
      delaySeconds: BT_CHUTE_DELAY_S,
    },
    { id: 'bt-tr4', when: { captured: 'bt-b' }, openGate: 'bt-g4' },
    { id: 'bt-tr5', when: { captured: 'bt-c' }, openGate: 'bt-g5b' },
    { id: 'bt-tr6', when: { squadDead: ['bt-r5', 'bt-r5g'] }, openGate: 'bt-g6' },
    { id: 'bt-tr7', when: { captured: 'bt-d' }, openGate: 'bt-g7' },
    { id: 'bt-tr8', when: { squadDead: 'bt-r6' }, openGate: 'bt-g8' },
  ],
  economy: { startMoney: 0, baseIncomePerSecond: 0 },
  // Unlocked as you go (src/app/basic-training.ts sets this list).
  roles: ['rifleman'],
};

/** Basic training's rules on top of the usual tuning: no money, enemies don't heal, quick flags. */
export const BASIC_TRAINING_TUNING: DeepPartial<Tuning> = {
  economy: { enabled: false },
  soldier: { regen: { enemies: false } },
  capture: { stageSeconds: 1.25 },
  // Mines go off as you step on them: sprinting doesn't outrun these.
  mine: { fuseSeconds: 0.05 },
  // A first-timer's grenade lands near, not on: a bigger blast forgives it.
  grenade: { blastRadius: 90 },
};
