/** Fast projectiles on grass, concrete and road: ?scene=gallery&trails=1. */
import { DEFAULT_TUNING } from '../../content/tuning';
import type { WorldView } from '../../sim/view';
import type { MapDef } from '../../sim/world/map';
import { GALLERY_LIVE_ID } from './__fixtures__/gallery-fixture';
import { terrainGalleryView } from './terrain-gallery';

export const TRAIL_GALLERY_MAP: MapDef = {
  id: 'trail-gallery',
  nameKey: 'map.gallery.name',
  width: 1152,
  height: 768,
  water: [],
  walls: [],
  spawnPoints: [],
  ground: {
    cellSize: 64,
    rows: Array.from({ length: 12 }, (_, y) => (y < 4 ? 'G' : y < 8 ? 'C' : 'R').repeat(18)),
  },
};

export const TRAIL_CAPTIONS = [
  ...['Player • gold', 'Echo • subdued gold', 'Enemy • coral'].map((text, i) => ({
    x: i * 384 + 192,
    y: 8,
    text,
  })),
  ...['Grass', 'Concrete', 'Road'].map((text, i) => ({ x: 48, y: i * 256 + 226, text })),
  ...['Rifle / MG', 'Pistol', 'Shotgun pellets', 'Rocket smoke', 'Grenade arc + shadow'].map(
    (text, i) => ({
      x: 192,
      y: i === 4 ? 235 : 53 + i * 38,
      text,
    }),
  ),
];

export function trailGalleryView(tick: number): WorldView {
  const view = terrainGalleryView(tick);
  view.bullets = [];
  view.rockets = [];
  view.grenades = [];
  for (let band = 0; band < 3; band++) {
    for (let column = 0; column < 3; column++) {
      const by = column === 0 ? GALLERY_LIVE_ID : column === 1 ? 'echo' : 'enemy';
      const hostile = column === 2;
      for (const [row, weapon] of (['rifle', 'pistol', 'shotgun'] as const).entries()) {
        const speed = DEFAULT_TUNING.bullets.speed[weapon];
        const cycle = Math.ceil(300 / (speed / 60));
        const flight = Math.floor(tick / cycle);
        const x = column * 384 + 45 + (tick % cycle) * (speed / 60);
        const y = band * 256 + 42 + row * 38;
        for (let pellet = 0; pellet < (weapon === 'shotgun' ? 3 : 1); pellet++)
          view.bullets.push({
            id: `${band}-${column}-${weapon}-${pellet}-${flight}`,
            x,
            y: y + pellet * 6,
            angle: 0,
            weapon,
            by,
            hostile,
          });
      }
      const flight = Math.floor(tick / 45);
      const x = column * 384 + 45 + (tick % 45) * (300 / 45);
      view.rockets.push({
        kind: 'rocket',
        id: `${band}-${column}-${flight}`,
        x,
        y: band * 256 + 156,
        angle: 0,
        by,
        hostile,
      });
      const t = (tick % 90) / 90;
      view.grenades.push({
        kind: 'grenade',
        id: `${band}-${column}`,
        x: column * 384 + 70 + t * 230,
        y: band * 256 + 210,
        z: Math.sin(t * Math.PI) * 40,
        fuse: t,
      });
    }
  }
  return view;
}
