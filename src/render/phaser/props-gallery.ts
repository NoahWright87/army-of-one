/** Painted cover, debris and fixed turrets: ?scene=gallery&props=1. */
import type { CoverDef, MapDef } from '../../sim/world/map';
import type { WorldView } from '../../sim/view';
import { terrainGalleryView } from './terrain-gallery';

const materials: CoverDef['material'][] = [
  'sandbags',
  'crate',
  'fence',
  'halfWall',
  'window',
  'bunkerWindow',
];
const thickness = [26, 44, 10, 18, 18, 24];
const cover: CoverDef[] = materials.flatMap((material, i) => {
  const y = 95 + i * 100,
    h = thickness[i]!;
  return [
    {
      id: `${material}-short`,
      material,
      rect: { x: 160, y, w: material === 'crate' ? 88 : 200, h },
    },
    { id: `${material}-long`, material, rect: { x: 410, y, w: 260, h } },
    { id: `${material}-vertical`, material, rect: { x: 740, y: y - 24, w: h, h: 80 } },
    {
      id: `${material}-down`,
      material,
      rect: { x: 875, y, w: material === 'crate' ? 88 : 200, h },
    },
  ];
});

export const PROPS_GALLERY_MAP: MapDef = {
  id: 'props-gallery',
  nameKey: 'map.gallery.name',
  width: 1216,
  height: 896,
  walls: [],
  water: [],
  spawnPoints: [],
  cover,
  ground: {
    cellSize: 64,
    rows: Array.from({ length: 14 }, (_, y) => (y < 7 ? 'G' : 'C').repeat(19)),
  },
};
export const PROPS_CAPTIONS = [
  ...materials.map((text, i) => ({ text, x: 65, y: 95 + i * 100 })),
  ...['Sections', 'Long barrier', 'Vertical', 'Destroyed'].map((text, i) => ({
    text,
    x: [245, 540, 755, 970][i]!,
    y: 45,
  })),
  { text: 'Fixed turret • independent rotating gun', x: 280, y: 790 },
  { text: 'Windup / warning tint', x: 620, y: 790 },
  { text: 'Destroyed emplacement', x: 960, y: 790 },
];

export function propsGalleryView(tick: number): WorldView {
  const view = terrainGalleryView(tick);
  view.coverDestroyed = materials.map((m) => `${m}-down`);
  view.turrets = [
    {
      kind: 'turret',
      id: 'rotating',
      x: 280,
      y: 740,
      aim: tick / 100,
      state: 'tracking',
      hp: 100,
      maxHp: 100,
      range: 1,
    },
    {
      kind: 'turret',
      id: 'warning',
      x: 620,
      y: 740,
      aim: -tick / 100,
      state: 'windup',
      hp: 100,
      maxHp: 100,
      range: 1,
    },
    {
      kind: 'turret',
      id: 'wreck',
      x: 960,
      y: 740,
      aim: 0,
      state: 'destroyed',
      hp: 0,
      maxHp: 100,
      range: 1,
    },
  ];
  return view;
}
