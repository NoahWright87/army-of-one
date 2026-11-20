import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { expect, it } from 'vitest';
import { BATTLEFIELD_FILES } from '../src/content/battlefield-art';

it('painted barrier tiles have matching join pixels and clear cross-axis margins', () => {
  for (const spec of Object.values(BATTLEFIELD_FILES)) {
    if (spec.width === spec.height) continue;
    const p = PNG.sync.read(readFileSync(`assets/battlefield/${spec.file}`));
    for (let y = 0; y < p.height; y++) {
      const k = y * p.width * 4;
      expect([...p.data.subarray(k, k + 4)], spec.file).toEqual([
        ...p.data.subarray(k + (p.width - 1) * 4, k + p.width * 4),
      ]);
    }
    for (const y of [0, p.height - 1])
      for (let x = 0; x < p.width; x++)
        expect(p.data[(y * p.width + x) * 4 + 3], spec.file).toBe(0);
  }
});

it('window/slit sprites reveal ground through their openings', () => {
  for (const key of ['cover_window', 'cover_bunkerWindow'] as const) {
    const spec = BATTLEFIELD_FILES[key];
    const p = PNG.sync.read(readFileSync(`assets/battlefield/${spec.file}`));
    let clear = 0,
      count = 0;
    for (let y = 20; y < 44; y++)
      for (let x = 32; x < 224; x++) {
        count++;
        if (p.data[(y * p.width + x) * 4 + 3]! < 32) clear++;
      }
    expect(clear / count, key).toBeGreaterThan(0.2);
  }
});
