/** Pure layout for painted cover; never changes the authored collision rectangle. */
import { COVER_ART } from '../content/battlefield-art';
import type { CoverDef } from '../sim/world/map';

export function coverArtLayout(def: CoverDef, destroyed: boolean) {
  const spec = COVER_ART[def.material];
  const { x, y, w, h } = def.rect;
  const vertical = h > w;
  const thickness = Math.min(w, h);
  const textureHeight = destroyed && def.material !== 'crate' ? 64 : spec.height;
  return {
    key: destroyed ? spec.rubble : spec.key,
    x: x + w / 2,
    y: y + h / 2,
    width: Math.max(w, h),
    height: thickness,
    rotation: vertical ? Math.PI / 2 : 0,
    tileScale: thickness / textureHeight,
  };
}
