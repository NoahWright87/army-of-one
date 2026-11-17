/** Real renderer / pooled native animation review: ?scene=gallery&explosions=1. */
import { explosionVariation, type ExplosionSize } from '../../content/explosions';
import type { SimEvent } from '../../sim/events';
import { borderWalls, type MapDef } from '../../sim/world/map';
import type { WorldView } from '../../sim/view';

export const EXPLOSION_GALLERY_MAP: MapDef = {
  id: 'explosion-gallery',
  nameKey: 'map.gallery.name',
  width: 1100,
  height: 760,
  walls: borderWalls(1100, 760),
  water: [],
  spawnPoints: [],
};

function idForRow(size: ExplosionSize, row: number, tick: number): string {
  for (let i = 0; i < 10; i++) {
    const id = `review-${size}-${row}-${i}`;
    if (explosionVariation(id, tick, size) === row) return id;
  }
  throw new Error('No matching explosion review variation');
}

export function explosionGalleryView(tick: number): WorldView {
  const events: SimEvent[] = [];
  for (let row = 0; row < 3; row++) {
    if (tick % 90 !== 1 + row * 18) continue;
    const y = 135 + row * 235;
    events.push({
      kind: 'grenadeExploded',
      tick,
      id: idForRow('small', row, tick),
      by: 'review',
      x: 285,
      y,
      radius: 40,
      fragments: [],
    });
    events.push({
      kind: 'mineDetonated',
      tick,
      id: idForRow('large', row, tick),
      x: 815,
      y,
      radius: 100,
    });
  }
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
    grenades: [],
    rockets: [],
    coverDestroyed: [],
    coverArcs: [],
    events,
    missionComplete: null,
  };
}

export const EXPLOSION_CAPTIONS = (['small', 'large'] as const).flatMap((size, column) =>
  [0, 1, 2].map((row) => ({
    x: 285 + column * 530,
    y: 235 + row * 235,
    text: `${size} · variation ${row + 1} · 8 frames`,
  })),
);
