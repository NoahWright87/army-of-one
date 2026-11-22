/**
 * (PHASE18) The HQ: the hub you land in and walk around, like a battle ([D153]).
 *
 *        x: 40  160      720 760        1640 1680     2240 2280 2360
 *   y  40 ┌─┬───┬────────┬─┬────────────┬─┬────────────┬─┬───┐
 *         │ │   │        │ │ DEV CORNER │ │            │ │   │
 *         │e│ S │ clip-  │ │   (sign)   │ │ ▒▒▒▒▒▒▒▒   │ │ e │
 *     480 │x│ K │ board  │ └──────┐ ┌───┘ │ ▒ table▒   │ │ x │
 *         │i│ I │        │ banner │ │door│ │ ▒▒▒▒▒▒▒▒   │ │ i │
 *     560 │t▕ R ▏gate    │  LOBBY  (spawn)  WAR ROOM gate▕ t │
 *     780 │ │ M │        door              door          │ │   │
 *         │ │ I │  TV    │                │ trophy  TV   │ │   │
 *    1160 ├─┴───┴────────┴──────┐ ┌───────┴──────────────┴─┴───┤
 *         │ SHOOTING RANGE   guns   range sign                 │
 *         │  cover of each kind on the firing line             │
 *         │   targets at 150 · 300 · 450 · 600 (some behind cover)
 *    1960 └────────────────────────────────────────────────────┘
 *
 * Plain data only. Sign texts and buttons are filled in by the app (they depend on saves).
 */
import type { ImageKey } from './assets';
import type { SignDef } from './sign-styles';
import type { StringKey } from './strings';
import { borderWalls, type CoverDef, type MapDef, type Rect } from '../sim/world/map';
import type { Vec2 } from '../sim/core/vec';

export const HUB_W = 2400;
export const HUB_H = 2000;
const T = 40;

export const HUB_MAP_ID = 'hq';

const cover = (id: string, material: CoverDef['material'], rect: Rect): CoverDef => ({
  id,
  material,
  rect,
});

const rangeTower = { x: 1130, y: 1350, w: 140, h: 135 };
const parapet = (side: string, rect: Rect): CoverDef => ({
  ...cover(`range-tower-${side}`, 'halfWall', rect),
  bullet: 0.4, // TUNE: tower walls stop 40% of crossing shots
  fireOverFrom: rangeTower,
});

export const HUB_MAP: MapDef = {
  id: HUB_MAP_ID,
  nameKey: 'hub.name',
  width: HUB_W,
  height: HUB_H,
  walls: [
    ...borderWalls(HUB_W, HUB_H, T),
    // Skirmish room's west wall (gate at y 560–680) and east wall (door at y 780–900).
    { x: 120, y: 40, w: 40, h: 520 },
    { x: 120, y: 680, w: 40, h: 480 },
    { x: 720, y: 40, w: 40, h: 740 },
    { x: 720, y: 900, w: 40, h: 260 },
    // Dev corner / lobby wall (door at x 1500–1600).
    { x: 760, y: 480, w: 740, h: 40 },
    { x: 1600, y: 480, w: 40, h: 40 },
    // War room's west wall (door) and east wall (gate).
    { x: 1640, y: 40, w: 40, h: 740 },
    { x: 1640, y: 900, w: 40, h: 260 },
    { x: 2240, y: 40, w: 40, h: 520 },
    { x: 2240, y: 680, w: 40, h: 480 },
    // Lobby / range wall (door at x 1140–1260).
    { x: 40, y: 1160, w: 1100, h: 40 },
    { x: 1260, y: 1160, w: 1100, h: 40 },
  ],
  water: [],
  gates: [
    { id: 'gate-skirmish', rect: { x: 120, y: 560, w: 40, h: 120 }, initiallyOpen: false },
    { id: 'gate-campaign', rect: { x: 2240, y: 560, w: 40, h: 120 }, initiallyOpen: false },
  ],
  raisedGround: [rangeTower],
  ladders: [{ id: 'range-tower-ladder', bottom: { x: 1200, y: 1334 }, top: { x: 1200, y: 1366 } }],
  cover: [
    parapet('south', { x: 1130, y: 1473, w: 140, h: 12 }),
    parapet('west', { x: 1130, y: 1350, w: 12, h: 123 }),
    parapet('east', { x: 1258, y: 1350, w: 12, h: 123 }),
    parapet('north-west', { x: 1142, y: 1350, w: 36, h: 12 }),
    parapet('north-east', { x: 1222, y: 1350, w: 36, h: 12 }),
    // The campaign table: walk round it, read it from any side.
    cover('war-table', 'halfWall', { x: 1830, y: 340, w: 260, h: 160 }),
    // The range's firing line: one of each kind of cover.
    cover('range-sandbags', 'sandbags', { x: 260, y: 1340, w: 160, h: 24 }),
    cover('range-crate', 'crate', { x: 560, y: 1330, w: 48, h: 48 }),
    cover('range-fence', 'fence', { x: 1500, y: 1350, w: 160, h: 10 }),
    cover('range-halfwall', 'halfWall', { x: 1760, y: 1342, w: 140, h: 20 }),
    cover('range-window', 'window', { x: 2020, y: 1342, w: 140, h: 20 }),
    // Targets behind cover, downrange.
    cover('target-fence', 'fence', { x: 520, y: 1600, w: 160, h: 10 }),
    cover('target-bags', 'sandbags', { x: 1720, y: 1600, w: 160, h: 24 }),
  ],
  concealment: [
    { id: 'range-firing-trench', kind: 'trench', rect: { x: 245, y: 1245, w: 190, h: 95 } },
    { id: 'range-target-bush', kind: 'bush', rect: { x: 840, y: 1730, w: 120, h: 100 } },
    { id: 'range-target-trench', kind: 'trench', rect: { x: 1705, y: 1624, w: 190, h: 85 } },
  ],
  spawnPoints: [
    {
      id: 'lobby',
      nameKey: 'hub.name',
      position: { x: 1200, y: 900 },
      facing: -Math.PI / 2,
      kind: 'initial',
    },
  ],
};

/** Where you come back after dying on the range. */
export const HUB_RANGE_SPAWN: Vec2 = { x: 1200, y: 1270 };
/** Below this line you're on the range. */
export const HUB_RANGE_Y = 1200;

/** Targets on the range (enemy dummies that stand still and get back up). */
export const HUB_TARGETS: readonly Vec2[] = [
  { x: 340, y: 1480 },
  { x: 600, y: 1640 },
  { x: 900, y: 1780 },
  { x: 1200, y: 1900 },
  { x: 1500, y: 1480 },
  { x: 1800, y: 1645 },
  { x: 2100, y: 1780 },
];

export type HubExitId = 'skirmish' | 'campaign';

/** Walk into one of these with its gate open and you're on your way. */
export const HUB_EXITS: readonly { id: HubExitId; gateId: string; zone: Rect }[] = [
  { id: 'skirmish', gateId: 'gate-skirmish', zone: { x: 40, y: 520, w: 80, h: 200 } },
  { id: 'campaign', gateId: 'gate-campaign', zone: { x: 2280, y: 520, w: 80, h: 200 } },
];

export type HubSignId =
  | 'welcome'
  | 'skirmish'
  | 'skirmishTv'
  | 'campaign'
  | 'campaignTv'
  | 'trophies'
  | 'guns'
  | 'range'
  | 'dev'
  | 'training';

export const HUB_SIGNS: readonly (SignDef & { id: HubSignId })[] = [
  { id: 'training', x: 900, y: 1040, kind: 'clipboard', textKey: 'hub.sign.training', size: 44 },
  { id: 'welcome', x: 1200, y: 810, kind: 'wood', textKey: 'hub.sign.welcome', size: 48 },
  { id: 'skirmish', x: 440, y: 380, kind: 'clipboard', textKey: 'hub.sign.skirmish', size: 48 },
  { id: 'skirmishTv', x: 440, y: 960, kind: 'tv', textKey: 'hub.sign.replays', size: 52 },
  {
    id: 'campaign',
    x: 1960,
    y: 420,
    kind: 'mapTable',
    textKey: 'hub.sign.campaign',
    size: 260,
    radius: 175,
  },
  { id: 'campaignTv', x: 2120, y: 960, kind: 'tv', textKey: 'hub.sign.replays', size: 52 },
  { id: 'trophies', x: 1800, y: 960, kind: 'trophy', textKey: 'hub.sign.trophies', size: 56 },
  {
    id: 'guns',
    x: 1000,
    y: 1262,
    kind: 'guns',
    textKey: 'hub.sign.guns',
    size: 120,
    radius: 80,
  },
  { id: 'range', x: 1400, y: 1262, kind: 'wood', textKey: 'hub.sign.range', size: 48 },
  { id: 'dev', x: 1200, y: 420, kind: 'plain', textKey: 'hub.sign.dev', size: 48 },
];

/** Pictures on the walls and floor (no collision). */
export const HUB_DECOR: readonly { image: ImageKey; x: number; y: number; w: number }[] = [
  { image: 'hub_banner', x: 1100, y: 565, w: 440 },
];

/** Words painted in the world (screen-size text): door labels, range distances. */
export const HUB_LABELS: readonly { key: StringKey; x: number; y: number; big?: boolean }[] = [
  { key: 'title.name', x: 1100, y: 565, big: true },
  { key: 'hub.label.skirmish', x: 860, y: 840 },
  { key: 'hub.label.war', x: 1540, y: 840 },
  { key: 'hub.label.tower', x: 1200, y: 1305 },
  { key: 'hub.label.range', x: 1200, y: 1110 },
  { key: 'hub.label.dev', x: 1550, y: 570 },
  { key: 'hub.label.exit', x: 220, y: 620 },
  { key: 'hub.label.exitEast', x: 2180, y: 620 },
  { key: 'hub.label.d150', x: 120, y: 1480 },
  { key: 'hub.label.d300', x: 120, y: 1630 },
  { key: 'hub.label.d450', x: 120, y: 1780 },
  { key: 'hub.label.d600', x: 120, y: 1900 },
];
