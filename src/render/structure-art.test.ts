import { expect, it } from 'vitest';
import { bridgeDeckOpacity, structureArtLayout } from './structure-art';

it('preserves the authored gate footprint on either axis', () => {
  expect(structureArtLayout({ x: 10, y: 20, w: 120, h: 24 }, 'x')).toEqual({
    x: 70,
    y: 32,
    width: 120,
    height: 24,
    rotation: 0,
  });
  expect(structureArtLayout({ x: 10, y: 20, w: 24, h: 120 }, 'x')).toEqual({
    x: 22,
    y: 80,
    width: 120,
    height: 24,
    rotation: Math.PI / 2,
  });
});
it('keeps bridge abutments at the two ends of the long axis', () => {
  expect(structureArtLayout({ x: 0, y: 0, w: 80, h: 200 }, 'y')).toMatchObject({
    width: 80,
    height: 200,
    rotation: 0,
  });
  expect(structureArtLayout({ x: 0, y: 0, w: 200, h: 80 }, 'y')).toMatchObject({
    width: 80,
    height: 200,
    rotation: Math.PI / 2,
  });
});
it('reveals water as the bridge rises and preserves broken planks on destruction', () => {
  expect([0, 0.5, 1].map((h) => bridgeDeckOpacity(h, false))).toEqual([1, 0.5, 0]);
  expect(bridgeDeckOpacity(1, true)).toBe(1);
});
