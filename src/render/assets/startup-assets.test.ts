import { describe, expect, it } from 'vitest';
import { ASSET_MANIFEST } from '../../content/assets';
import { MINIATURE_ATLAS } from '../../content/miniature-atlas';
import { missingStartupImages, STARTUP_IMAGES } from './startup-assets';

describe('visual startup requirements', () => {
  it('loads every game image while sharing miniature layers and excluding DOM art/audio', () => {
    const keys = new Set(STARTUP_IMAGES.map((a) => a.key));
    expect(keys.has(MINIATURE_ATLAS.key)).toBe(true);
    for (const asset of ASSET_MANIFEST) {
      if (asset.key.startsWith('mini_')) {
        expect(keys.has(asset.key)).toBe(asset.key === MINIATURE_ATLAS.key);
      } else {
        expect(keys.has(asset.key)).toBe(asset.kind === 'image' && !asset.key.startsWith('ui_'));
      }
    }
  });

  it('reports missing decoded textures even if there was no network error', () => {
    expect(missingStartupImages((key) => key !== 'mini_atlas' && key !== 'terrain_grass')).toEqual(
      expect.arrayContaining(['mini_atlas', 'terrain_grass']),
    );
    expect(missingStartupImages(() => true)).toEqual([]);
  });
});
