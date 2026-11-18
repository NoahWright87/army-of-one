import { describe, expect, it } from 'vitest';
import { ingressPoints, type IngressInput } from '../ingress';

/** A 9-wide corridor 60 tiles long (grass), entered from the bottom. */
function corridor(paint: (x: number, y: number) => string | null = () => null): IngressInput {
  const w = 9;
  const h = 60;
  const rows = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => paint(x, y) ?? 'G').join(''),
  );
  const far = Array.from({ length: w * h }, (_, i) => h - 1 - Math.floor(i / w));
  return {
    w,
    h,
    rows,
    own: () => true,
    far,
    walls: [],
    cellSize: 64,
    existing: [],
    every: 18,
    keepAway: 10,
    endMargin: 6,
  };
}

describe('ingress capture points (PHASE16, [D130])', () => {
  it('places one every so far along the way, not near the far end', () => {
    const pts = ingressPoints(corridor());
    expect(pts.length).toBe(2); // at ~18 and ~36 steps; 54 is within the end margin
    for (const [y] of pts) expect(59 - y).toBeLessThanOrEqual(59 - 6);
  });

  it('prefers a road over open field', () => {
    const pts = ingressPoints(corridor((x) => (x === 6 ? 'R' : null)));
    expect(pts.every(([, x]) => x === 6)).toBe(true);
  });

  it('prefers a building corner over open field, and keeps off walls', () => {
    const input = corridor();
    // A 2×2 building at x 0–1, y 40–41 (map units, 64 per tile).
    input.walls = [{ x: 0, y: 40 * 64, w: 128, h: 128 }];
    const pts = ingressPoints(input);
    const near = pts.find(([y]) => Math.abs(59 - y - 18) <= 6)!;
    expect(near[1]).toBeGreaterThanOrEqual(2); // room to stand next to it
    expect(near[1]).toBeLessThanOrEqual(3);
    expect(Math.abs(near[0] - 40.5)).toBeLessThanOrEqual(3);
  });

  it('keeps away from points already there, and is deterministic', () => {
    const input = corridor();
    input.existing = [[59 - 18, 4]];
    const pts = ingressPoints(input);
    for (const [y, x] of pts) expect((y - 41) ** 2 + (x - 4) ** 2).toBeGreaterThanOrEqual(100);
    expect(ingressPoints(input)).toEqual(pts);
  });
});
