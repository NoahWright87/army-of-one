import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIRECTOR,
  framePoints,
  framing,
  initialCamera,
  minZoom,
  stepCamera,
  type DirectorConfig,
} from './director';

const C: DirectorConfig = { ...DEFAULT_DIRECTOR, viewW: 1200, viewH: 800, mapW: 1600, mapH: 5000 };

describe('replay camera director ([D42])', () => {
  it('frames every point (all inside the view)', () => {
    const pts = [
      { x: 300, y: 3000 },
      { x: 1200, y: 3300 },
      { x: 700, y: 2800 },
    ];
    const f = framing(pts, C, { x: 0, y: 0 });
    const hw = C.viewW / f.zoom / 2;
    const hh = C.viewH / f.zoom / 2;
    for (const p of pts) {
      expect(Math.abs(p.x - f.x)).toBeLessThanOrEqual(hw);
      expect(Math.abs(p.y - f.y)).toBeLessThanOrEqual(hh);
    }
  });

  it('zooms in as the group shrinks, out as it spreads; clamped both ways', () => {
    const tight = framing([{ x: 800, y: 3000 }], C, { x: 0, y: 0 }).zoom;
    const wide = framing(
      [
        { x: 100, y: 3000 },
        { x: 1500, y: 3000 },
      ],
      C,
      { x: 0, y: 0 },
    ).zoom;
    expect(tight).toBeGreaterThan(wide);
    expect(tight).toBeLessThanOrEqual(C.maxZoom);
    const huge = framing(
      [
        { x: 0, y: 0 },
        { x: 1600, y: 5000 },
      ],
      C,
      { x: 0, y: 0 },
    ).zoom;
    expect(huge).toBeCloseTo(minZoom(C));
  });

  it('handles 0, 1 and 100 soldiers', () => {
    expect(framing([], C, { x: 800, y: 2500 }).zoom).toBeCloseTo(minZoom(C));
    expect(Number.isFinite(framing([{ x: 1, y: 1 }], C, { x: 0, y: 0 }).x)).toBe(true);
    const many = Array.from({ length: 100 }, (_, i) => ({
      x: 200 + (i % 10) * 120,
      y: 2000 + i * 20,
    }));
    expect(Number.isFinite(framing(many, C, { x: 0, y: 0 }).zoom)).toBe(true);
  });

  it('eases without overshoot or jitter (bounded acceleration)', () => {
    let cam = initialCamera({ x: 0, y: 0, zoom: 1 });
    const target = { x: 1000, y: 500, zoom: 0.5 };
    let maxX = 0;
    let prevV = 0;
    let maxAccel = 0;
    for (let i = 0; i < 600; i++) {
      cam = stepCamera(cam, target, 1 / 60, C.omega);
      maxX = Math.max(maxX, cam.x);
      maxAccel = Math.max(maxAccel, Math.abs(cam.vx - prevV) * 60);
      prevV = cam.vx;
    }
    expect(maxX).toBeLessThanOrEqual(1000 + 1e-6);
    expect(cam.x).toBeCloseTo(1000, 0);
    expect(cam.zoom).toBeCloseTo(0.5, 2);
    expect(maxAccel).toBeLessThanOrEqual(C.omega * C.omega * 1000 + 1);
  });

  it('a long frame is sub-stepped (same result as small steps)', () => {
    const t = { x: 500, y: 0, zoom: 1 };
    const one = stepCamera(initialCamera({ x: 0, y: 0, zoom: 1 }), t, 0.5, 2);
    let many = initialCamera({ x: 0, y: 0, zoom: 1 });
    for (let i = 0; i < 30; i++) many = stepCamera(many, t, 1 / 60, 2);
    expect(one.x).toBeCloseTo(many.x, 3);
  });

  it('insets: the points land in the uncovered part of the screen', () => {
    const cfg = { ...C, insets: { top: 0, right: 0, bottom: 300, left: 0 } };
    const p = { x: 800, y: 3000 };
    const f = framing([p], cfg, { x: 0, y: 0 });
    const screenY = (p.y - f.y) * f.zoom + cfg.viewH / 2;
    expect(screenY).toBeLessThan(cfg.viewH - 300);
  });

  it('key moments stay in frame for a while', () => {
    const pts = framePoints([{ x: 1, y: 1 }], [{ x: 9, y: 9, tick: 100 }], 150, 90);
    expect(pts).toHaveLength(2);
    expect(framePoints([], [{ x: 9, y: 9, tick: 100 }], 300, 90)).toHaveLength(0);
  });
});
