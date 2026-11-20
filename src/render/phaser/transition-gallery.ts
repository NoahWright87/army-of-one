/** Edge/corner/island/junction review: ?scene=gallery&transitions=1. */
import type { MapDef } from '../../sim/world/map';
import type { GroundKind } from '../../content/ground';
import { terrainGalleryView } from './terrain-gallery';
const cells: GroundKind[][] = Array.from({ length: 16 }, () =>
  Array.from({ length: 24 }, (_, x) => (x < 12 ? 'G' : 'W')),
);
const paint = (x: number, y: number, w: number, h: number, kind: GroundKind) => {
  for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) cells[r]![c] = kind;
};
paint(2, 3, 8, 8, 'D');
paint(6, 7, 4, 4, 'G');
paint(3, 1, 2, 6, 'R');
paint(3, 6, 8, 2, 'R');
paint(15, 3, 6, 8, 'S');
paint(16, 4, 4, 6, 'G');
paint(18, 8, 3, 3, 'W');
paint(2, 12, 3, 3, 'C');
paint(7, 12, 3, 3, 'K');
paint(20, 12, 3, 3, 'X');
paint(10, 13, 8, 1, 'B');
paint(13, 1, 1, 1, 'G');
paint(22, 5, 1, 1, 'G');
const rows = cells.map((row) => row.join(''));
export const TRANSITION_GALLERY_MAP: MapDef = {
  id: 'transition-gallery',
  nameKey: 'map.gallery.name',
  width: 1536,
  height: 1024,
  spawnPoints: [],
  ground: { cellSize: 64, rows },
  water: [],
  walls: [],
};
rows.forEach((row, y) =>
  [...row].forEach((k, x) => {
    const rect = { x: x * 64, y: y * 64, w: 64, h: 64 };
    if (k === 'W') TRANSITION_GALLERY_MAP.water.push(rect);
    if (k === 'K' || k === 'X') TRANSITION_GALLERY_MAP.walls.push(rect);
  }),
);
export const TRANSITION_CAPTIONS = [
  { x: 370, y: 560, text: 'Dirt / grass: inside corners and road bends' },
  { x: 1140, y: 730, text: 'Shore: islands, concave bays and beach' },
  { x: 620, y: 975, text: 'Concrete · rock · bridge · wall' },
];
export const transitionGalleryView = terrainGalleryView;
