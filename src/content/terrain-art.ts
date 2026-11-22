import type { GroundKind } from './ground';
/** Runtime texture keys, independent of terrain collision rules. */
export const TERRAIN_ART = {
  G: 'terrain_grass',
  T: 'terrain_dirt',
  D: 'terrain_dirt',
  R: 'terrain_road',
  S: 'terrain_sand',
  C: 'terrain_concrete',
  W: 'terrain_water',
  K: 'terrain_rocks',
  X: 'terrain_wall',
  B: 'terrain_bridge',
} as const satisfies Record<GroundKind, string>;
