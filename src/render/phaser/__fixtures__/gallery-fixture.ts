/**
 * Hand-written fake WorldView with one of every entity kind and soldier state, for the
 * `?scene=gallery` visual test page. Lightly animated by tick (turret aim, a moving vehicle,
 * bridges raising/lowering) and replays a loop of SimEvents so every effect/sound shows up.
 *
 * Captions are developer-facing labels for this test page only (not player copy).
 */
import { TICKS_PER_SECOND, type Tick } from '../../../sim/core/time';
import type { SimEvent } from '../../../sim/events';
import { borderWalls, type MapDef } from '../../../sim/world/map';
import type {
  BridgeView,
  MineView,
  ObjectiveView,
  SoldierView,
  TurretView,
  VehicleView,
  WorldView,
} from '../../../sim/view';

export const GALLERY_W = 1520;
export const GALLERY_H = 1080;
const col = (i: number) => 110 + i * 185;
const ROW = [130, 330, 520, 720, 920] as const;
const MAX_HP = 100;

export const GALLERY_MAP: MapDef = {
  id: 'gallery',
  nameKey: 'map.gallery.name',
  width: GALLERY_W,
  height: GALLERY_H,
  walls: [...borderWalls(GALLERY_W, GALLERY_H), { x: 1440, y: 60, w: 30, h: 160 }],
  // Water under the bridges row.
  water: [{ x: 20, y: ROW[3] - 50, w: col(4) + 80, h: 100 }],
  spawnPoints: [
    {
      id: 'west',
      nameKey: 'spawn.west',
      position: { x: col(7) - 20, y: ROW[1] },
      facing: 0,
      kind: 'initial',
    },
  ],
};

/** The soldier the HUD and "incoming fire" logic treat as live (centre of the crowd). */
export const GALLERY_LIVE_ID = 'S1';

export interface Caption {
  x: number;
  y: number;
  text: string;
}

export const GALLERY_CAPTIONS: Caption[] = [
  ...[
    'live',
    'live + lead-in shield',
    'echo',
    'echo (damaged)',
    'interrupted (!)',
    'static (flicker)',
    'corpse',
    'echo + lead-in',
  ].map((text, i) => ({ x: col(i), y: ROW[0] + 50, text })),
  ...['turret idle', 'turret tracking', 'turret wind-up', 'turret destroyed'].map((text, i) => ({
    x: col(i),
    y: ROW[1] + 50,
    text,
  })),
  { x: col(4), y: ROW[1] + 50, text: 'mine idle' },
  { x: col(5), y: ROW[1] + 50, text: 'mine armed' },
  { x: col(7) - 20, y: ROW[1] + 58, text: 'spawn marker' },
  { x: col(6), y: ROW[1] + 50, text: 'mine detonated' },
  { x: col(0) + 40, y: ROW[2] + 50, text: 'vehicle (moving)' },
  { x: col(2), y: ROW[2] + 50, text: 'vehicle wreck' },
  { x: col(3), y: ROW[2] + 70, text: 'gate closed' },
  { x: col(4), y: ROW[2] + 70, text: 'gate open' },
  { x: col(5), y: ROW[2] + 50, text: 'lever off' },
  { x: col(6), y: ROW[2] + 50, text: 'lever on' },
  ...['bridge down', 'bridge raising', 'bridge up', 'bridge lowering', 'bridge destroyed'].map(
    (text, i) => ({ x: col(i), y: ROW[3] + 62, text }),
  ),
  { x: col(0), y: ROW[4] + 62, text: 'objective' },
  { x: col(1), y: ROW[4] + 62, text: 'objective (damaged)' },
  { x: col(2), y: ROW[4] + 62, text: 'objective destroyed' },
  { x: col(5), y: ROW[4] + 80, text: 'crowd: find the live soldier' },
];

function soldier(
  id: string,
  ordinal: number,
  x: number,
  y: number,
  role: SoldierView['role'],
  extra: Partial<SoldierView> = {},
): SoldierView {
  return {
    kind: 'soldier',
    id,
    ordinal,
    x,
    y,
    facing: 0,
    hp: MAX_HP,
    maxHp: MAX_HP,
    alive: true,
    role,
    leadIn: false,
    ...extra,
  };
}

function soldiers(tick: Tick): SoldierView[] {
  const spin = (tick / TICKS_PER_SECOND) * 0.8;
  const r0 = ROW[0];
  const list: SoldierView[] = [
    soldier('S2', 2, col(0), r0, 'live', { facing: spin }),
    soldier('S3', 3, col(1), r0, 'live', { leadIn: true, hp: 1 }),
    soldier('S4', 4, col(2), r0, 'echo', { facing: -0.6 }),
    soldier('S5', 5, col(3), r0, 'echo', { hp: 35, facing: 2.4 }),
    soldier('S6', 6, col(4), r0, 'interrupted', { facing: 1.2 }),
    soldier('S7', 7, col(5), r0, 'static', { facing: 3.6 }),
    soldier('S8', 8, col(6), r0, 'echo', { alive: false, hp: 0, facing: 0.7 }),
    soldier('S9', 9, col(7), r0, 'echo', { leadIn: true }),
  ];
  // Crowd: live soldier among echoes and statics.
  const cx = col(5);
  const cy = ROW[4];
  list.push(soldier(GALLERY_LIVE_ID, 1, cx, cy, 'live', { facing: -2.4, hp: 62 }));
  const ring = [
    [-34, -10],
    [-14, -32],
    [16, -30],
    [36, -6],
    [30, 22],
    [4, 34],
    [-26, 24],
    [-52, 14],
    [54, 18],
    [-6, -58],
  ] as const;
  ring.forEach(([dx, dy], i) => {
    const role = i % 4 === 3 ? 'static' : 'echo';
    list.push(soldier(`S${10 + i}`, 10 + i, cx + dx, cy + dy, role, { facing: -2.4 + i * 0.3 }));
  });
  return list.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

function turrets(tick: Tick): TurretView[] {
  const r = ROW[1];
  const sweep = Math.sin(tick / 40) * 0.8;
  const live = { x: col(5), y: ROW[4] };
  const windupAim = Math.atan2(live.y - r, live.x - col(2));
  const base = { kind: 'turret' as const, y: r, hp: 100, maxHp: 100, range: 70 };
  return [
    { ...base, id: 'T1', x: col(0), aim: 0, state: 'idle' },
    { ...base, id: 'T2', x: col(1), aim: 1 + sweep, state: 'tracking' },
    { ...base, id: 'T3', x: col(2), aim: windupAim, state: 'windup', hp: 60, range: 600 },
    { ...base, id: 'T4', x: col(3), aim: 0, state: 'destroyed', hp: 0 },
  ];
}

function mines(): MineView[] {
  const base = { kind: 'mine' as const, y: ROW[1], triggerRadius: 30, blastRadius: 60 };
  return [
    { ...base, id: 'M1', x: col(4), state: 'idle' },
    { ...base, id: 'M2', x: col(5), state: 'armed' },
    { ...base, id: 'M3', x: col(6), state: 'detonated' },
  ];
}

function vehicles(tick: Tick): VehicleView[] {
  const travel = 150;
  const x = col(0) - 30 + ((tick * 1.5) % travel);
  return [
    {
      kind: 'vehicle',
      id: 'V1',
      x,
      y: ROW[2],
      w: 96,
      h: 48,
      heading: 0,
      state: 'moving',
      hp: 70,
      maxHp: 100,
    },
    {
      kind: 'vehicle',
      id: 'V2',
      x: col(2),
      y: ROW[2],
      w: 96,
      h: 48,
      heading: 0.25,
      state: 'wreck',
      hp: 0,
      maxHp: 100,
    },
  ];
}

function bridges(tick: Tick): BridgeView[] {
  const cycle = (tick % 180) / 180;
  const y = ROW[3] - 50;
  const b = (id: string, i: number, state: BridgeView['state'], raised: number): BridgeView => ({
    kind: 'bridge',
    id,
    x: col(i) - 40,
    y,
    w: 80,
    h: 100,
    state,
    raised,
  });
  return [
    b('B1', 0, 'down', 0),
    b('B2', 1, 'raising', cycle),
    b('B3', 2, 'up', 1),
    b('B4', 3, 'lowering', 1 - cycle),
    b('B5', 4, 'destroyed', 0),
  ];
}

function objectives(): ObjectiveView[] {
  const base = { kind: 'objective' as const, y: ROW[4], radius: 40, maxHp: 300 };
  return [
    { ...base, id: 'O1', x: col(0), hp: 300, destroyed: false },
    { ...base, id: 'O2', x: col(1), hp: 110, destroyed: false },
    { ...base, id: 'O3', x: col(2), hp: 0, destroyed: true },
  ];
}

/** A loop of events (period 120 ticks) so every effect shows up regularly. */
export function galleryEvents(tick: Tick): SimEvent[] {
  const t = tick % 120;
  const live = { x: col(5), y: ROW[4] };
  const turret = { x: col(2), y: ROW[1] };
  const out: SimEvent[] = [];
  if (t === 5) out.push({ kind: 'turretWindup', tick, id: 'T3', targetId: GALLERY_LIVE_ID });
  if (t === 40) {
    const angle = Math.atan2(live.y - turret.y, live.x - turret.x);
    out.push(
      {
        kind: 'shotFired',
        tick,
        by: 'T3',
        fromX: turret.x,
        fromY: turret.y,
        angle,
        hitX: live.x,
        hitY: live.y,
        hitId: GALLERY_LIVE_ID,
      },
      { kind: 'damaged', tick, target: GALLERY_LIVE_ID, amount: 10, by: 'T3' },
    );
  }
  if (t === 20 || t === 26 || t === 32) {
    const from = { x: col(0), y: ROW[0] };
    const angle = (tick / TICKS_PER_SECOND) * 0.8;
    out.push({
      kind: 'shotFired',
      tick,
      by: 'S2',
      fromX: from.x,
      fromY: from.y,
      angle,
      hitX: from.x + Math.cos(angle) * 90,
      hitY: from.y + Math.sin(angle) * 90,
    });
  }
  if (t === 60) {
    out.push({
      kind: 'shotFired',
      tick,
      by: 'S4',
      fromX: col(2),
      fromY: ROW[0],
      angle: -0.6,
      hitX: col(2) + Math.cos(-0.6) * 120,
      hitY: ROW[0] + Math.sin(-0.6) * 120,
    });
  }
  if (t === 70) out.push({ kind: 'damaged', tick, target: 'S5', amount: 5, by: 'T3' });
  if (t === 80)
    out.push({ kind: 'mineDetonated', tick, id: 'M3', x: col(6), y: ROW[1], radius: 60 });
  if (t === 100) out.push({ kind: 'hazardDestroyed', tick, id: 'T4' });
  if (t === 110) out.push({ kind: 'damaged', tick, target: 'O2', amount: 20, by: 'S2' });
  return out;
}

export function galleryView(tick: Tick): WorldView {
  const gateY = ROW[2];
  return {
    tick,
    soldiers: soldiers(tick),
    turrets: turrets(tick),
    mines: mines(),
    vehicles: vehicles(tick),
    gates: [
      { kind: 'gate', id: 'G1', x: col(3) - 15, y: gateY - 50, w: 30, h: 100, open: false },
      { kind: 'gate', id: 'G2', x: col(4) - 15, y: gateY - 50, w: 30, h: 100, open: true },
    ],
    levers: [
      { kind: 'lever', id: 'L1', x: col(5), y: gateY, on: false, targetId: 'G1' },
      { kind: 'lever', id: 'L2', x: col(6), y: gateY, on: true, targetId: 'B2' },
    ],
    bridges: bridges(tick),
    objectives: objectives(),
    events: galleryEvents(tick),
    missionComplete: null,
  };
}
