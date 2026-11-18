import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { expect, it } from 'vitest';
import { FINISHED_ART } from '../src/content/finished-art';
const png = (key: string) => PNG.sync.read(readFileSync('assets/' + FINISHED_ART[key]!.file));

it('open gates and raised/broken bridges reveal their central gap', () => {
  for (const key of ['gate_open', 'bridge_up', 'bridge_destroyed']) {
    const p = png(key);
    let clear = 0,
      count = 0;
    for (let y = Math.floor(p.height * 0.4); y < Math.ceil(p.height * 0.6); y++)
      for (let x = Math.floor(p.width * 0.4); x < Math.ceil(p.width * 0.6); x++) {
        count++;
        if (p.data[(y * p.width + x) * 4 + 3]! < 32) clear++;
      }
    expect(clear / count, key).toBeGreaterThan(0.75);
  }
  const deck = png('bridge_down');
  expect(deck.data[(64 * deck.width + 64) * 4 + 3]).toBe(255);
});
it('friendly and enemy status flags share one silhouette', () => {
  const a = png('flag_ours'),
    b = png('flag_enemy');
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  for (let i = 3; i < a.data.length; i += 4) expect(a.data[i]).toBe(b.data[i]);
});
