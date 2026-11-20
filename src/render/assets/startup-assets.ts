import { ASSET_MANIFEST } from '../../content/assets';
import { MINIATURE_ATLAS } from '../../content/miniature-atlas';

/** DOM art and individual atlas layers never need another GPU upload. */
export const STARTUP_IMAGES = ASSET_MANIFEST.filter(
  (asset) =>
    asset.kind === 'image' &&
    !asset.key.startsWith('ui_') &&
    (!asset.key.startsWith('mini_') || asset.key === MINIATURE_ATLAS.key),
);

/** Check the texture cache, not just loaderror: decode failures use a different Phaser path. */
export function missingStartupImages(exists: (key: string) => boolean): string[] {
  return STARTUP_IMAGES.filter((asset) => !exists(asset.key)).map((asset) => asset.key);
}
