/**
 * (06-b) Pure minimap logic: its size for a map, world → minimap transform, and how each soldier
 * is drawn. No DOM (minimap.ts renders).
 */
import type { MapDef } from '../../sim/world/map';
import type { SoldierView } from '../../sim/view';
import type { MinimapSize } from './minimap-settings';

/** Longest side in CSS px per size preset. */
export const MINIMAP_PX: Record<MinimapSize, number> = { S: 140, M: 190, L: 250 };

export interface MinimapBox {
  /** CSS px. */
  w: number;
  h: number;
  /** CSS px per world unit. */
  scale: number;
}

/**
 * Fits the whole map into the preset size. Tall maps (06-a's vertical strip) may be up to 1.5×
 * taller than the preset so they don't become a sliver; never more than `maxW` × `maxH` px.
 */
export function minimapBox(
  map: Pick<MapDef, 'width' | 'height'>,
  size: MinimapSize,
  maxW: number,
  maxH: number,
): MinimapBox {
  const px = MINIMAP_PX[size];
  const tall = map.height > map.width * 1.2;
  const maxSide = tall ? px * 1.5 : px;
  let scale = maxSide / Math.max(map.width, map.height);
  scale = Math.min(scale, maxW / map.width, maxH / map.height);
  scale = Math.max(scale, 1e-4);
  return { w: Math.round(map.width * scale), h: Math.round(map.height * scale), scale };
}

export type DotKind = 'live' | 'echo' | 'static' | 'interrupted';

/** How a soldier shows on the minimap (null = not drawn: dead, or not yet on the field). */
export function dotKind(s: SoldierView, liveId: string | null): DotKind | null {
  if (!s.alive) return null;
  if (s.id === liveId || s.role === 'live') return 'live';
  if (s.role === 'static') return 'static';
  if (s.role === 'interrupted') return 'interrupted';
  return 'echo';
}

/** Dot radius (CSS px) and colour per kind. */
export const DOT_STYLE: Record<DotKind, { r: number; fill: string }> = {
  live: { r: 3.5, fill: '#ffd34d' },
  echo: { r: 1.8, fill: 'rgba(200, 214, 230, 0.75)' },
  static: { r: 1.8, fill: 'rgba(150, 160, 172, 0.55)' },
  interrupted: { r: 2, fill: '#ffae42' },
};
