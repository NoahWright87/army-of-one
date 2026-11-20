/** Read-only layout of rectangle art. Gates face along local +x; bridge decks along local +y. */
import type { Rect } from '../sim/world/map';
export function structureArtLayout(rect: Rect, along: 'x' | 'y') {
  const vertical = rect.h > rect.w;
  const turn = along === 'x' ? vertical : !vertical;
  return {
    x: rect.x + rect.w / 2,
    y: rect.y + rect.h / 2,
    width: along === 'x' ? Math.max(rect.w, rect.h) : Math.min(rect.w, rect.h),
    height: along === 'x' ? Math.min(rect.w, rect.h) : Math.max(rect.w, rect.h),
    rotation: turn ? Math.PI / 2 : 0,
  };
}
export function bridgeDeckOpacity(raised: number, destroyed: boolean): number {
  return destroyed ? 1 : 1 - Math.max(0, Math.min(1, raised));
}
