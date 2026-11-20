import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { TERRAIN_ART } from '../src/content/terrain-art';
import { IMAGE_ASSETS } from '../src/content/assets';
describe('terrain textures', () => {
  it('covers every existing terrain type with opaque seamless opposite borders', () => {
    for (const key of Object.values(TERRAIN_ART)) {
      const spec = IMAGE_ASSETS[key];
      const p = PNG.sync.read(readFileSync(new URL(`../assets/${spec.file}`, import.meta.url)));
      expect([p.width, p.height]).toEqual([128, 128]);
      for (let i = 3; i < p.data.length; i += 4) expect(p.data[i]).toBe(255);
      for (let t = 0; t < 128; t++)
        for (let c = 0; c < 4; c++) {
          expect(p.data[t * 128 * 4 + c]).toBe(p.data[(t * 128 + 127) * 4 + c]);
          expect(p.data[t * 4 + c]).toBe(p.data[(127 * 128 + t) * 4 + c]);
        }
    }
  });
});
