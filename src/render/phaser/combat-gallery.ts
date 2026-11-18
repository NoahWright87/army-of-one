/** Real renderer/pool review: ?scene=gallery&combat=1. */
import type { WorldView } from '../../sim/view';
import { borderWalls, type MapDef } from '../../sim/world/map';
import { impactRow } from '../../content/combat-art';

export const COMBAT_GALLERY_MAP: MapDef = {
  id: 'combat-gallery',
  nameKey: 'map.gallery.name',
  width: 960,
  height: 650,
  walls: borderWalls(960, 650),
  water: [],
  spawnPoints: [],
};
export const COMBAT_CAPTIONS = [
  ...[
    'Shotgun pellet',
    'Pistol round',
    'Rifle / MG round',
    'Bazooka rocket',
    'Frag grenade',
    'Tank shell',
  ].map((text, i) => ({ x: 160, y: 85 + i * 83, text })),
  ...['Earth / dust', 'Steel / ricochet', 'Stone / chips', 'Steel / variation'].map((text, i) => ({
    x: 760,
    y: 170 + i * 125,
    text,
  })),
];
export function combatGalleryView(tick: number): WorldView {
  const t = (tick % 120) / 120;
  const x = 250 + t * 260;
  const events: WorldView['events'] = [];
  if (tick % 45 === 1)
    for (let row = 0; row < 4; row++) {
      const y = 135 + row * 125;
      let ix = 760;
      while (impactRow(ix, y, row % 2 === 1) !== row) ix++;
      if (row % 2 === 0) events.push({ kind: 'bulletStopped', tick, by: 'review', x: ix, y });
      else events.push({ kind: 'damaged', tick, target: `metal-${row}`, amount: 0, armored: true });
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
    objectives: [1, 3].map((row) => ({
      kind: 'objective',
      id: `metal-${row}`,
      x: 761,
      y: 135 + row * 125,
      radius: 1,
      hp: 1,
      maxHp: 1,
      destroyed: true,
    })),
    capturePoints: [],
    bullets: ['shotgun', 'pistol', 'rifle'].map((weapon, i) => ({
      id: `review-${weapon}`,
      x,
      y: 65 + i * 83,
      angle: 0,
      hostile: false,
      weapon,
    })),
    rockets: [
      { kind: 'rocket', id: 'rocket', x, y: 314, angle: 0 },
      { kind: 'rocket', id: 'shell', x, y: 480, angle: 0, shell: true },
    ],
    grenades: [
      { kind: 'grenade', id: 'grenade', x, y: 397, z: Math.sin(t * Math.PI) * 35, fuse: t },
    ],
    events,
    missionComplete: null,
  };
}
