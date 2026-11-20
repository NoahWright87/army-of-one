import { describe, expect, it } from 'vitest';
import {
  canonicalMask,
  TRANSITION_MASKS,
  terrainEdges,
  transitionDistance,
  isPaintedRect,
  N,
  E,
  S,
  W,
  NW,
  NE,
  SW,
  SE,
} from './transition-rules';
describe('automatic terrain transitions', () => {
  it('reduces all eight-neighbour layouts to 47 reusable edge/corner shapes', () => {
    expect(TRANSITION_MASKS).toHaveLength(47);
    expect(canonicalMask(N | NW | NE)).toBe(N);
    expect(canonicalMask(NW | SE)).toBe(NW | SE);
    for (let mask = 0; mask < 256; mask++)
      expect(canonicalMask(canonicalMask(mask))).toBe(canonicalMask(mask));
  });
  it('has no seam inside a single material or at an unknown map boundary', () => {
    const rows = Object.freeze(['GGG', 'GGG', 'GGG']);
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 3; x++) expect(terrainEdges(rows, x, y)).toEqual([]);
    expect(terrainEdges(rows, -1, 0)).toEqual([]);
  });
  it('selects actual neighbouring materials in a stable order at multi-terrain junctions', () => {
    const rows = Object.freeze(['GRC', 'GDG', 'GGG']);
    expect(terrainEdges(rows, 1, 1)).toEqual([
      { kind: 'G', mask: E | S | W, style: 'natural' },
      { kind: 'R', mask: N, style: 'hard' },
      { kind: 'C', mask: NE, style: 'hard' },
    ]);
    expect(rows).toEqual(['GRC', 'GDG', 'GGG']);
  });
  it('gives an isolated diagonal a rounded outer corner and a paired edge an inner corner', () => {
    expect(transitionDistance(NW, 0.04, 0.04, 'natural')).toBeGreaterThan(0);
    expect(transitionDistance(NW, 0.18, 0.18, 'natural')).toBeLessThan(0);
    expect(transitionDistance(N | W, 0.2, 0.2, 'natural')).toBeGreaterThan(0);
    for (const style of ['natural', 'shore', 'hard', 'rock'] as const)
      for (const mask of TRANSITION_MASKS) {
        expect(transitionDistance(mask, 0.5, 0.5, style)).toBeLessThan(0);
        expect(Number.isFinite(transitionDistance(mask, 0, 0, style))).toBe(true);
      }
  });
  it('uses banks on water, straight built edges and rock rims without changing tile kinds', () => {
    expect(terrainEdges(['GGG', 'GWG', 'GGG'], 1, 1)).toEqual([
      { kind: 'G', mask: N | E | S | W, style: 'shore' },
    ]);
    expect(terrainEdges(['KKK', 'KGK', 'KKK'], 1, 1)[0]?.style).toBe('rock');
    expect(terrainEdges(['BBB', 'BWB', 'BBB'], 1, 1)[0]?.style).toBe('hard');
  });
  it('only suppresses duplicate terrain rectangles when the entire rect is painted', () => {
    const ground = { cellSize: 64, rows: ['WWGG', 'WWKX'] };
    expect(isPaintedRect(ground, { x: 0, y: 0, w: 128, h: 128 }, ['W'])).toBe(true);
    expect(isPaintedRect(ground, { x: 128, y: 64, w: 128, h: 64 }, ['K', 'X'])).toBe(true);
    expect(isPaintedRect(ground, { x: 0, y: 0, w: 192, h: 128 }, ['W'])).toBe(false);
    expect(isPaintedRect(ground, { x: 1, y: 0, w: 64, h: 64 }, ['W'])).toBe(false);
    expect(isPaintedRect(undefined, { x: 0, y: 0, w: 64, h: 64 }, ['W'])).toBe(false);
  });
  it('has smooth periodic straight-edge joins between consecutive cells', () => {
    for (const style of ['natural', 'shore', 'rock'] as const)
      for (const t of [0.05, 0.15, 0.25, 0.4]) {
        expect(transitionDistance(N, 0, t, style)).toBeCloseTo(
          transitionDistance(N, 1, t, style),
          10,
        );
        expect(transitionDistance(W, t, 0, style)).toBeCloseTo(
          transitionDistance(W, t, 1, style),
          10,
        );
      }
    expect(canonicalMask(SW | S)).toBe(S);
  });
});
