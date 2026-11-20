import { describe, expect, it } from 'vitest';
import { vehicleMiniature } from '../src/render/vehicle-miniatures';
import { IMAGE_ASSETS } from '../src/content/assets';
import { miniatureFiles } from '../src/content/miniatures';
import { MINIATURE_ATLAS } from '../src/content/miniature-atlas';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
describe('vehicle layers', () => {
  it('packs every miniature without changing its pixels or frame dimensions', () => {
    const atlas = PNG.sync.read(
      readFileSync(new URL('../assets/atlases/miniatures.png', import.meta.url)),
    );
    expect([atlas.width, atlas.height]).toEqual([MINIATURE_ATLAS.width, MINIATURE_ATLAS.height]);
    for (const spec of miniatureFiles()) {
      const box = MINIATURE_ATLAS.frames[spec.key as keyof typeof MINIATURE_ATLAS.frames];
      const src = PNG.sync.read(
        readFileSync(new URL(`../assets/miniatures/${spec.file}`, import.meta.url)),
      );
      expect([box.w, box.h]).toEqual([src.width, src.height]);
      for (let y = 0; y < box.h; y++)
        expect(
          atlas.data
            .subarray(
              ((box.y + y) * atlas.width + box.x) * 4,
              ((box.y + y) * atlas.width + box.x + box.w) * 4,
            )
            .equals(src.data.subarray(y * box.w * 4, (y + 1) * box.w * 4)),
        ).toBe(true);
    }
  });
  it('registers every delivered miniature layer in the asset manifest', () => {
    for (const spec of miniatureFiles())
      expect(IMAGE_ASSETS[spec.key as keyof typeof IMAGE_ASSETS]?.file).toBe(
        `miniatures/${spec.file}`,
      );
  });
  it('selects faction, live/echo base and turret-free wreck layers', () => {
    for (const role of ['truck', 'tank'] as const) {
      expect(vehicleMiniature(role, 'live', true)?.base).toBe(`mini_base_${role}_gold`);
      expect(vehicleMiniature(role, 'echo', true)?.base).toBe(`mini_base_${role}_gold_tarnished`);
      expect(vehicleMiniature(role, 'enemy', true)?.hull).toBe(`mini_hull_${role}_enemy`);
      expect(vehicleMiniature(role, 'enemy', false)?.turret).toBeNull();
      expect(vehicleMiniature(role, 'echo', false)?.hull).toBe(`mini_wreck_${role}`);
    }
    expect(vehicleMiniature('rifleman', 'live', true)).toBeNull();
  });
});
