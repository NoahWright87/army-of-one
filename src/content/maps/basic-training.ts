/**
 * (PHASE18) Basic Training: the tutorial ([D155]). One long course, south to north, "on rails":
 * each station leaves one obvious way through, and the game's own rules do the teaching. The
 * drill sergeant walks along the west fence yelling at you (drawn by the app, not the sim).
 * Every gate is a mission rule (`triggers`): do the station, it opens. Before each fight a
 * small room with a flag: take it, and that's where you come back.
 *
 *        x: 40   230 242     520 680 700 780 940 1000 1012         1360
 *   y  40 ┌──────┬─┬──────────────────────────────────────────────────┐
 *         │      │┊│  R7 SNIPER RANGE ▮bags      (flag)   ┆ snipers, MGs │
 *     400 │      │┊├┤g8├────────────────────────────────────────────────┤
 *         │      │┊│  R6 GRENADE                    ▐parapet  enemy   │
 *     700 │      │┊├──────────┤g7├──────────────────────────────────────┤
 *         │ S    │┊│  R6F  (D flag)                                   │
 *     900 │ A    │┊├──────────┤g6├──────────────────────────────────────┤
 *         │ R    │┊│  R5 AMBUSH    ▮your bags (gap)    5 riflemen far │
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
 *    3380 │      │┊├┤g1├─────────────────────────────────────────────┬──── (solid)
 *         │      │┊│ R1C LIVE FIRE  ← ← ← west along the concrete wall, MGs beyond  │
 *    4080 │      │┊├────────────────────────────────────────────────────┤g1b├──┤
 *         │      │┊│▒▒▒▒▒▒▒▒ (solid) ▒│ R1B SANDBAG LANE ↑ north │bags│ path ↑ │
 *    4980 │      │┊├──────────────────────────────────────────────────────┤g1a├┤
 *         │      │┊│ R1 OPEN FIELD  → → → east, seven targets spread far out    │
 *    5680 │      │┊├──────────┤  ├────────────────────────────────────────────┤
 *         │      │┊│  R0 START  (spawn)                      │ (solid)           │
 *    6160 └──────┴─┴──────────────────────────────────────────────────────────┘
 *   The range zig-zags east, north, west, north: the map is 2200 wide down here, 1400 above.
 */
import type { CoverDef, MapDef, Rect } from '../../sim/world/map';
import { borderWalls } from '../../sim/world/map';
import type { SignDef } from '../sign-styles';
import type { Vec2 } from '../../sim/core/vec';

export const BASIC_TRAINING_ID = 'basic-training';
export const BT_W = 2200;
export const BT_H = 6200;
/** The northern rooms' east edge (the range below them is wider). */
const BT_NORTH_R = 1360;
/** The sandbag lane is the east end of its band: west of this is solid. */
const LANE_X = 1000;

/** The west fence the sergeant walks behind. */
export const BT_FENCE_X = 230;
/** Where the sergeant walks (x). */
export const BT_SARGE_X = 140;

/** North edge (y) of each room, south to north. */
export const BT = {
  r0: 5680,
  r1: 4980,
  r1b: 4080,
  r1c: 3380,
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

/**
 * The rooms as rectangles (for drawing them in the Sarge editor and finding a room's middle).
 * The chute and the corridor bend `btRoomAt`, so these are the plain bands.
 */
export const BT_ROOM_RECTS: Record<BtRoom, Rect> = (() => {
  const order: BtRoom[] = [
    'r0',
    'r1',
    'r1b',
    'r1c',
    'r2',
    'r3',
    'r4',
    'r5f',
    'r5',
    'r6f',
    'r6',
    'r7',
  ];
  const x = BT_FENCE_X + 12;
  const out = {} as Record<BtRoom, Rect>;
  order.forEach((r, i) => {
    const top = BT[r];
    const bottom = i === 0 ? BT_H - 40 : BT[order[i - 1]!];
    // The range below the flag room is wide; the start room and everything north are not.
    const wide = r === 'r1' || r === 'r1b' || r === 'r1c';
    const right = wide ? BT_W - 40 : BT_NORTH_R;
    out[r] = { x, y: top, w: right - x, h: bottom - top };
  });
  // The sandbag lane is only the east end of its band: the rest is solid.
  out.r1b = { x: LANE_X, y: BT.r1b, w: BT_W - 40 - LANE_X, h: BT.r1 - BT.r1b };
  return out;
})();

/** The corridor east of R3/R4 (round behind the MG nest). */
export const BT_CORRIDOR_X = 1006;

/** Which room a point is in (the corridor counts as R4's flank). */
export function btRoomAt(x: number, y: number): BtRoom {
  if (y >= BT.r0) return 'r0';
  if (y >= BT.r1) return 'r1';
  if (y >= BT.r1b) return 'r1b';
  if (y >= BT.r1c) return 'r1c';
  if (y >= BT.r2) return 'r2';
  if (x > BT_CORRIDOR_X && y >= BT.r4) return 'r4';
  if (y >= BT.r3) return 'r3';
  // Just past the chute's exit, behind the baffle: still the chute (the mines reach up to it).
  if (x >= CHUTE_X && x <= 1000 && y >= BT_CHUTE_EXIT_Y) return 'r3';
  if (y >= BT.r4) return 'r4';
  if (y >= BT.r5f) return 'r5f';
  if (y >= BT.r5) return 'r5';
  if (y >= BT.r6f) return 'r6f';
  if (y >= BT.r6) return 'r6';
  return 'r7';
}

/** R3 is a chute: x 700–1000, its doors at x 780–940. */
const CHUTE_X = 700;
/** North of the chute's exit, up to the baffle: the minefield's last rows. */
const BT_CHUTE_EXIT_Y = 2000;
const DOOR_X = 520;
const DOOR_W = 160;
const L = BT_FENCE_X + 12; // west edge of the course
const R = BT_NORTH_R; // east edge of the northern rooms
const RR = BT_W - 40; // east edge of the range

/** A wall across the course at `y` with a doorway at `door` (default x 520–680). */
function crossWall(y: number, from = L, to = R, door = DOOR_X): Rect[] {
  return [
    { x: from, y: y - 20, w: door - from, h: 20 },
    { x: door + DOOR_W, y: y - 20, w: to - door - DOOR_W, h: 20 },
  ];
}

const CHUTE_DOOR = 780;
/** The sandbag lane's north door (lined up with the bags, on the path's side). */
const LANE_DOOR = 1960;
/** The open field's exit door (east end), into the sandbag lane. */
const FIELD_DOOR = 1960;
/** The live-fire stall's exit, far west: the path runs west to it. */
const EXIT_DOOR = 252;
/** South of this, the chute is out of the MG's sight (a wall, not a fence, beside it). */
export const BT_CHUTE_SAFE_Y = 2560;

/** R7's door is at its west end; the sniper's sandbags are just inside it. */
const R7_DOOR = L + 20;

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

/**
 * The sandbag lane's sandbags: wall to wall (the doorways' walls are 20 thick), so you can't walk
 * round. The path north is the east side, and the door is lined up with them.
 */
export const BT_BAGS: Rect = { x: 1900, y: BT.r1b, w: 24, h: BT.r1 - 20 - BT.r1b };
/** The open field's targets (R1): just shoot. */
export const BT_TARGETS_A = [
  'bt-a1',
  'bt-a2',
  'bt-a3',
  'bt-a4',
  'bt-a5',
  'bt-a6',
  'bt-a7',
] as const;
/** The sandbag lane's targets (R1B), west of the bags: three mid-range, six far. */
export const BT_TARGETS_B = [
  'bt-b1',
  'bt-b2',
  'bt-b3',
  'bt-b4',
  'bt-b5',
  'bt-b6',
  'bt-b7',
  'bt-b8',
  'bt-b9',
] as const;
export const BT_TARGETS = [...BT_TARGETS_A, ...BT_TARGETS_B] as const;
/** The live-fire stall's machine gunners (R1C), behind the concrete wall. */
export const BT_MG_SQUAD = 'bt-mg';
/**
 * The minefield: staggered rows from halfway up the chute, through its exit, right up to the
 * baffle wall beyond it. No gaps, and you can't sprint through the wall: the last mines get you.
 * Shot from the gate, they go off in a chain.
 */
export const BT_MINEFIELD: { id: string; position: Vec2 }[] = (() => {
  const out: { id: string; position: Vec2 }[] = [];
  let n = 0;
  for (let row = 0, y = 2480; y >= 2060; row++, y -= 52) {
    // Through the doorway (y < 2140) only the doorway's width.
    const [x0, x1] = y < 2140 ? [790, 930] : [722, 990];
    for (let x = x0 + (row % 2) * 32; x <= x1; x += 64) {
      out.push({ id: `bt-m${++n}`, position: { x, y } });
    }
  }
  return out;
})();
export const BT_MINES = BT_MINEFIELD.map((m) => m.id);
/**
 * R7: mines between the graduation flag and the far fence, staggered, no gaps: a Grenadier
 * can't walk into throwing range of the guns. Snipe them from the door.
 */
export const BT_R7_MINEFIELD: { id: string; position: Vec2 }[] = (() => {
  const out: { id: string; position: Vec2 }[] = [];
  let n = 0;
  for (let col = 0, x = 900; x <= 1220; col++, x += 52) {
    for (let y = 70 + (col % 2) * 32; y <= 380; y += 64) {
      out.push({ id: `bt-r7m${++n}`, position: { x, y } });
    }
  }
  return out;
})();
/** R7's far guns (snipers and machine gunners), spread so one grenade can't get two. */
export const BT_R7_GUNS = [
  { role: 'sniper', position: { x: 1330, y: 70 } },
  { role: 'gunner', position: { x: 1325, y: 170 } },
  { role: 'sniper', position: { x: 1330, y: 270 } },
  { role: 'gunner', position: { x: 1325, y: 370 } },
] as const;
/** Seconds after Alpha is taken before the chute's gate opens (time to get to it). */
export const BT_CHUTE_DELAY_S = 6; // TUNE

/** Where to go: chevrons painted on the floor (`sprint`: the big red ones). */
export const BT_CHEVRONS: readonly { from: Vec2; to: Vec2; sprint?: true }[] = [
  { from: { x: 600, y: 5980 }, to: { x: 600, y: 5720 } },
  { from: { x: 700, y: 5600 }, to: { x: 1900, y: 5100 } },
  { from: { x: 2040, y: 5020 }, to: { x: 2040, y: 4930 } },
  { from: { x: 2040, y: 4900 }, to: { x: 2040, y: 4130 } },
  { from: { x: 1980, y: 4040 }, to: { x: 620, y: 3960 } },
  { from: { x: 480, y: 3900 }, to: { x: 330, y: 3420 } },
  { from: { x: 860, y: 3040 }, to: { x: 860, y: 2890 } },
  { from: { x: 860, y: 2820 }, to: { x: 860, y: 2150 }, sprint: true },
  { from: { x: 860, y: 2090 }, to: { x: 720, y: 1990 } },
  { from: { x: 700, y: 1800 }, to: { x: 970, y: 1760 } },
  { from: { x: 1060, y: 1760 }, to: { x: 1300, y: 1800 } },
  { from: { x: 600, y: 1440 }, to: { x: 600, y: 1320 } },
  { from: { x: 600, y: 840 }, to: { x: 600, y: 720 } },
  { from: { x: 560, y: 520 }, to: { x: 380, y: 430 } },
  { from: { x: 380, y: 290 }, to: { x: 700, y: 270 } }, // over the sniper's bags, not through
];

export const BT_SIGNS: readonly SignDef[] = [
  { id: 'bt-s-flag', x: 420, y: 3300, kind: 'wood', textKey: 'bt.sign.flag', size: 44 },
  { id: 'bt-s-mg', x: 420, y: 1460, kind: 'plate', textKey: 'bt.sign.mg', size: 44 },
  { id: 'bt-s-nade', x: 420, y: 840, kind: 'plate', textKey: 'bt.sign.grenade', size: 44 },
  { id: 'bt-s-sniper', x: 520, y: 450, kind: 'plate', textKey: 'bt.sign.sniper', size: 44 },
];

export const BASIC_TRAINING: MapDef = {
  id: BASIC_TRAINING_ID,
  nameKey: 'map.basic.name',
  // 2: the on-rails layout ([D156]); 3: R5 out of auto-aim range, R7 the sniper range ([D158]);
  // 4: R7's guns spread out behind a minefield; 5: concealment in R3, R4 and R7;
  // 6: R1's sandbags run wall to wall, targets behind other cover; 7: three range stalls
  // (open field, sandbag lane, live fire) south of the flag room; 8: the range zig-zags east,
  // north, west across a wider map.
  rev: 8,
  width: BT_W,
  height: BT_H,
  walls: [
    ...borderWalls(BT_W, BT_H, 40),
    // The range is wider than the rooms above and below it: those parts are solid.
    { x: BT_NORTH_R, y: 40, w: RR - BT_NORTH_R, h: BT.r1c - 40 },
    { x: BT_NORTH_R, y: BT.r0, w: RR - BT_NORTH_R, h: BT_H - 40 - BT.r0 },
    { x: L, y: BT.r1b, w: LANE_X - L, h: BT.r1 - BT.r1b },
    ...crossWall(BT.r0, L, RR), // R0 → R1: an open doorway (west)
    ...crossWall(BT.r1, L, RR, FIELD_DOOR), // gate g1a (the open field's targets down), east
    ...crossWall(BT.r1b, L, RR, LANE_DOOR), // gate g1b (the lane's targets down), by the bags
    ...crossWall(BT.r1c, L, RR, EXIT_DOOR), // gate g1 (the MGs down), far west
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
    ...crossWall(BT.r6, L, R, R7_DOOR), // gate g8 (the parapet rifleman down)
  ],
  water: [],
  concealment: [
    // R1C: bushes along the concrete wall: you're hard to see, so the guns miss.
    { id: 'bt-c-bushes', kind: 'bush', rect: { x: 560, y: 3844, w: 1380, h: 80 } },
    { id: 'bt-ambush-bush', kind: 'bush', rect: { x: 1210, y: 1870, w: 100, h: 84 } },
    { id: 'bt-r7-trench', kind: 'trench', rect: { x: 1305, y: 43, w: 53, h: 349 } },
  ],
  groundMist: [{ x: CHUTE_X, y: 2030, w: 300, h: 515 }],
  cover: [
    // The sergeant's fence: you can see him, you can't get to him.
    cover('bt-fence', 'fence', { x: BT_FENCE_X, y: 40, w: 12, h: BT_H - 80 }),
    // R1B: sandbags wall to wall between the path and the targets, so there's no way round: get
    // up to them and shoot over (and steady the rifle on them for the far ones).
    cover('bt-r1-bags', 'sandbags', BT_BAGS),
    // R1C: a long concrete wall between the path and five machine guns. Heavy, but low enough
    // to shoot over from beside it.
    cover('bt-c-wall', 'halfWall', { x: 560, y: 3820, w: 1380, h: 24 }, { bullet: 0.9 }),
    // R3: the fence the MG fires through, and the nest's heavy cover.
    cover('bt-r3-fence', 'fence', { x: 1000, y: BT.r3, w: 12, h: BT_CHUTE_SAFE_Y - BT.r3 }),
    cover('bt-mg-nest', 'sandbags', { x: 1060, y: 2380, w: 24, h: 160 }, { bullet: 0.95 }),
    // R5: heavy sandbags right by the door for you, with a gap to go through (a Shield's way:
    // too many of them). They're past auto-aim's reach: mount the MG and aim it yourself.
    cover('bt-r5-bags', 'sandbags', { x: 690, y: 1030, w: 24, h: 110 }, { bullet: 0.95 }),
    cover('bt-r5-bags2', 'sandbags', { x: 690, y: 1180, w: 24, h: 110 }, { bullet: 0.95 }),
    // R6: a parapet bullets can't get through: only a grenade over the top will do.
    cover(
      'bt-r6-parapet',
      'halfWall',
      { x: 940, y: 460, w: 24, h: 220 },
      { bullet: 0.98, lobbed: 0 },
    ),
    // R7: sandbags just inside the door, for the sniper to brace on.
    cover(
      'bt-r7-bags',
      'sandbags',
      { x: R7_DOOR + DOOR_W + 8, y: 320, w: 24, h: 70 },
      { bullet: 0.9 }, // heavy: they fire back at where the shots come from
    ),
    // R7: their fence, far east. Past auto-aim, past their sight, inside a braced sniper's reach.
    cover('bt-r7-fence', 'fence', { x: 1250, y: 40, w: 12, h: 340 }),
  ],
  gates: [
    gateAt('bt-g1a', BT.r1, FIELD_DOOR),
    gateAt('bt-g1b', BT.r1b, LANE_DOOR),
    gateAt('bt-g1', BT.r1c, EXIT_DOOR),
    gateAt('bt-g2', BT.r2, CHUTE_DOOR),
    { id: 'bt-g4', rect: { x: 1000, y: BT.r4 + 180, w: 12, h: 120 }, initiallyOpen: false },
    gateAt('bt-g5', BT.r4),
    gateAt('bt-g5b', BT.r5f),
    gateAt('bt-g6', BT.r5),
    gateAt('bt-g7', BT.r6f),
    gateAt('bt-g8', BT.r6, R7_DOOR),
  ],
  levers: [{ id: 'bt-lever', position: { x: 1300, y: 2640 }, targetId: 'bt-g5' }],
  objectives: [
    // R1: the open field: seven in the open, spread far out east so none are in your face when
    // the door opens (no tricks: can you shoot at all?).
    { id: 'bt-a1', position: { x: 1250, y: 5500 }, radius: 18, maxHp: 50, target: true },
    { id: 'bt-a2', position: { x: 1450, y: 5150 }, radius: 18, maxHp: 50, target: true },
    { id: 'bt-a3', position: { x: 1560, y: 5580 }, radius: 18, maxHp: 50, target: true },
    { id: 'bt-a4', position: { x: 1760, y: 5300 }, radius: 18, maxHp: 50, target: true },
    { id: 'bt-a5', position: { x: 1900, y: 5600 }, radius: 18, maxHp: 50, target: true },
    { id: 'bt-a6', position: { x: 2060, y: 5200 }, radius: 18, maxHp: 50, target: true },
    { id: 'bt-a7', position: { x: 1660, y: 5060 }, radius: 18, maxHp: 50, target: true },
    // R1B: west of the bags, in a lane 900 wide. Three mid-range ones (about 450–540 out) go down
    // at once. Six far ones sit 800–870 out, well past the rifle's 520 (where bullets lose
    // speed, damage and, on held fire, accuracy): standing, you hose and mostly miss; braced on
    // the bags, held fire stays tight. Each takes six hits.
    { id: 'bt-b1', position: { x: 1480, y: 4300 }, radius: 18, maxHp: 50, target: true },
    { id: 'bt-b2', position: { x: 1400, y: 4550 }, radius: 18, maxHp: 50, target: true },
    { id: 'bt-b3', position: { x: 1460, y: 4800 }, radius: 18, maxHp: 50, target: true },
    { id: 'bt-b4', position: { x: 1090, y: 4190 }, radius: 14, maxHp: 150, target: true },
    { id: 'bt-b5', position: { x: 1130, y: 4330 }, radius: 14, maxHp: 150, target: true },
    { id: 'bt-b6', position: { x: 1070, y: 4470 }, radius: 14, maxHp: 150, target: true },
    { id: 'bt-b7', position: { x: 1120, y: 4610 }, radius: 14, maxHp: 150, target: true },
    { id: 'bt-b8', position: { x: 1080, y: 4750 }, radius: 14, maxHp: 150, target: true },
    { id: 'bt-b9', position: { x: 1140, y: 4890 }, radius: 14, maxHp: 150, target: true },
  ],
  mines: [...BT_MINEFIELD.map((mine) => ({ ...mine, smoke: true })), ...BT_R7_MINEFIELD],
  capturePoints: [
    { id: 'bt-a', nameKey: 'spawn.basic.a', position: { x: 860, y: 3030 } },
    { id: 'bt-b', nameKey: 'spawn.basic.b', position: { x: 650, y: 1830 } },
    { id: 'bt-c', nameKey: 'spawn.basic.c', position: { x: 600, y: 1410 }, radius: 90 },
    { id: 'bt-d', nameKey: 'spawn.basic.d', position: { x: 600, y: 800 }, radius: 90 },
    {
      id: 'bt-grad',
      nameKey: 'spawn.basic.grad',
      position: { x: 780, y: 260 },
      radius: 70,
      objective: true,
    },
  ],
  spawnPoints: [
    {
      id: 'bt-start',
      nameKey: 'spawn.basic.start',
      position: { x: 600, y: 6040 },
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
    // R3: the MG nest.
    {
      id: 'bt-nest',
      hold: true,
      members: [{ role: 'gunner', position: { x: 1110, y: 2460 }, facing: Math.PI }],
      order: { kind: 'guard' },
    },
    // The corridor: a shotgunner round the corner, waiting.
    {
      id: 'bt-ambush',
      hold: true,
      members: [{ role: 'shotgun', position: { x: 1262, y: 1902 }, facing: -Math.PI / 4 }],
      order: { kind: 'guard' },
    },
    // R5: five riflemen in the open, firing the moment you're through the door.
    {
      id: 'bt-r5',
      hold: true,
      members: [
        { position: { x: 1300, y: 960 }, facing: Math.PI },
        { position: { x: 1320, y: 1040 }, facing: Math.PI },
        { position: { x: 1300, y: 1120 }, facing: Math.PI },
        { position: { x: 1320, y: 1200 }, facing: Math.PI },
        { position: { x: 1300, y: 1270 }, facing: Math.PI },
      ],
      order: { kind: 'guard' },
    },
    // R5: a grenadier with them: a Shield walking up gets one.
    {
      id: 'bt-r5g',
      hold: true,
      members: [{ role: 'grenadier', position: { x: 1330, y: 1160 }, facing: Math.PI }],
      order: { kind: 'guard' },
    },
    // R6: one rifleman behind a parapet.
    {
      id: 'bt-r6',
      hold: true,
      members: [{ position: { x: 984, y: 570 }, facing: Math.PI }],
      order: { kind: 'guard' },
    },
    // R7: snipers and machine gunners brace on the trench lip and guard the graduation flag.
    {
      id: 'bt-r7',
      hold: true,
      members: BT_R7_GUNS.map((g) => ({ ...g, facing: Math.PI })),
      order: { kind: 'guard' },
    },
    // (Last, so adding it didn't shift the other soldiers' ids: the sim's rolls hash them.)
    // R1C: five machine guns spread along the far side of the concrete wall: they shoot back (and
    // hit less than you'd think: the wall and the bushes).
    {
      id: BT_MG_SQUAD,
      hold: true,
      members: [
        { role: 'gunner', position: { x: 720, y: 3500 }, facing: Math.PI / 2 },
        { role: 'gunner', position: { x: 1020, y: 3660 }, facing: Math.PI / 2 },
        { role: 'gunner', position: { x: 1280, y: 3480 }, facing: Math.PI / 2 },
        { role: 'gunner', position: { x: 1520, y: 3680 }, facing: Math.PI / 2 },
        { role: 'gunner', position: { x: 1740, y: 3540 }, facing: Math.PI / 2 },
      ],
      order: { kind: 'guard' },
    },
  ],
  triggers: [
    { id: 'bt-tr1a', when: { destroyed: [...BT_TARGETS_A] }, openGate: 'bt-g1a' },
    { id: 'bt-tr1b', when: { destroyed: [...BT_TARGETS_B] }, openGate: 'bt-g1b' },
    { id: 'bt-tr1', when: { squadDead: BT_MG_SQUAD }, openGate: 'bt-g1' },
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
  // Every class you've unlocked is affordable: training isn't about money.
  economy: { startMoney: 9_999_999, baseIncomePerSecond: 0 },
  // Unlocked as you go (src/app/basic-training.ts sets this list).
  roles: ['rifleman'],
};
