/** Nine existing gameplay materials through the real renderer: ?scene=gallery&terrain=1. */
import type { MapDef } from '../../sim/world/map';
import type { WorldView } from '../../sim/view';
const kinds = ['G', 'D', 'R', 'S', 'C', 'W', 'K', 'X', 'B'] as const;
const names = [
  'Grass',
  'Dirt',
  'Road',
  'Sand',
  'Concrete',
  'Water',
  'Rock',
  'Fortified wall',
  'Bridge deck',
];
export const TERRAIN_GALLERY_MAP: MapDef = {
  id: 'terrain-gallery',
  nameKey: 'map.gallery.name',
  width: 960,
  height: 768,
  spawnPoints: [],
  walls: [
    { x: 0, y: 512, w: 320, h: 256 },
    { x: 320, y: 512, w: 320, h: 256 },
  ],
  water: [{ x: 640, y: 256, w: 320, h: 256 }],
  ground: {
    cellSize: 64,
    rows: Array.from({ length: 12 }, (_, r) =>
      Array.from({ length: 15 }, (_, c) => kinds[Math.floor(r / 4) * 3 + Math.floor(c / 5)]).join(
        '',
      ),
    ),
  },
};
export const TERRAIN_CAPTIONS = names.map((text, i) => ({
  text,
  x: (i % 3) * 320 + 160,
  y: Math.floor(i / 3) * 256 + 210,
}));
export function terrainGalleryView(tick: number): WorldView {
  return {
    tick,
    soldiers: [],
    turrets: [],
    mines: [],
    vehicles: [],
    gates: [],
    levers: [],
    bridges: [],
    objectives: [],
    capturePoints: [],
    events: [],
    missionComplete: null,
  };
}
