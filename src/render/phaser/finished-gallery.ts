/** Remaining structures, state changes and status annotations: ?scene=gallery&finished=1. */
import type { MapDef } from '../../sim/world/map';
import type { WorldView, SoldierView } from '../../sim/view';
import { terrainGalleryView } from './terrain-gallery';

export const FINISHED_GALLERY_MAP: MapDef = {
  id: 'finished-gallery',
  nameKey: 'map.gallery.name',
  width: 1344,
  height: 960,
  walls: [],
  water: [{ x: 48, y: 370, w: 1248, h: 350 }],
  spawnPoints: [],
};
export const FINISHED_CAPTIONS = [
  ...[
    'Mine (retained)',
    'Armed (retained)',
    'Scorch',
    'HQ / target',
    'Destroyed HQ',
    'Enemy capture',
    'Friendly capture',
  ].map((text, i) => ({ text, x: [95, 220, 345, 550, 745, 1000, 1210][i]!, y: 190 })),
  { text: 'Closed gate', x: 220, y: 315 },
  { text: 'Open gate', x: 505, y: 315 },
  { text: 'Vertical gate', x: 745, y: 350 },
  { text: 'Lever off', x: 900, y: 315 },
  { text: 'Lever on', x: 1060, y: 315 },
  ...['Down', 'Raising', 'Raised', 'Lowering', 'Destroyed'].map((text, i) => ({
    text,
    x: 150 + i * 255,
    y: 745,
  })),
  ...['Lead-in shield', 'Static echo', 'Interrupted', 'Muzzle flash'].map((text, i) => ({
    text,
    x: 190 + i * 300,
    y: 900,
  })),
];
const soldier = (
  id: string,
  x: number,
  role: SoldierView['role'],
  leadIn = false,
): SoldierView => ({
  kind: 'soldier',
  id,
  x,
  y: 855,
  facing: 0,
  ordinal: 1,
  hp: 100,
  maxHp: 100,
  alive: true,
  role,
  leadIn,
  roleId: 'rifleman',
});
export function finishedGalleryView(tick: number): WorldView {
  const v = terrainGalleryView(tick),
    cycle = (tick % 180) / 180;
  v.mines = [
    { kind: 'mine', id: 'idle', x: 95, y: 110, state: 'idle', triggerRadius: 20, blastRadius: 55 },
    {
      kind: 'mine',
      id: 'armed',
      x: 220,
      y: 110,
      state: 'armed',
      triggerRadius: 20,
      blastRadius: 55,
    },
    {
      kind: 'mine',
      id: 'spent',
      x: 345,
      y: 110,
      state: 'detonated',
      triggerRadius: 20,
      blastRadius: 65,
    },
  ];
  v.objectives = [
    {
      kind: 'objective',
      id: 'hq',
      x: 550,
      y: 110,
      radius: 40,
      hp: 100,
      maxHp: 100,
      destroyed: false,
    },
    {
      kind: 'objective',
      id: 'hq-down',
      x: 745,
      y: 110,
      radius: 40,
      hp: 0,
      maxHp: 100,
      destroyed: true,
    },
  ];
  v.capturePoints = [
    {
      kind: 'capturePoint',
      id: 'flag-red',
      x: 1000,
      y: 145,
      radius: 48,
      stage: 'enemy',
      progress: cycle,
      contributors: [],
      nameKey: 'capture.gallery.name',
      objective: false,
      spawnPointIds: [],
    },
    {
      kind: 'capturePoint',
      id: 'flag-green',
      x: 1210,
      y: 145,
      radius: 48,
      stage: 'ours',
      progress: 0,
      contributors: [],
      nameKey: 'capture.gallery.name',
      objective: false,
      spawnPointIds: [],
    },
  ];
  v.gates = [
    { kind: 'gate', id: 'closed', x: 100, y: 255, w: 240, h: 40, open: false },
    { kind: 'gate', id: 'open', x: 385, y: 255, w: 240, h: 40, open: true },
    { kind: 'gate', id: 'vertical', x: 730, y: 240, w: 30, h: 100, open: false },
  ];
  v.levers = [
    { kind: 'lever', id: 'off', x: 900, y: 275, on: false, targetId: 'closed' },
    { kind: 'lever', id: 'on', x: 1060, y: 275, on: true, targetId: 'open' },
  ];
  v.bridges = (['down', 'raising', 'up', 'lowering', 'destroyed'] as const).map((state, i) => ({
    kind: 'bridge',
    id: state,
    x: 105 + i * 255,
    y: 410,
    w: 90,
    h: 270,
    state,
    raised: state === 'raising' ? cycle : state === 'lowering' ? 1 - cycle : state === 'up' ? 1 : 0,
  }));
  v.soldiers = [
    soldier('S1', 190, 'live', true),
    soldier('S2', 490, 'static'),
    soldier('S3', 790, 'interrupted'),
    soldier('S4', 1090, 'echo'),
  ];
  if (tick % 30 === 1)
    v.events.push({
      kind: 'shotFired',
      tick,
      by: 'S4',
      fromX: 1090,
      fromY: 855,
      angle: 0,
      hitX: 1160,
      hitY: 855,
    });
  return v;
}
