import { describe, expect, it } from 'vitest';
import { ROLES } from '../src/content/roles';
import {
  BASES,
  BASE_SHAPES,
  BASE_SHAPE_BY_ROLE,
  COLORWAYS,
  FACTIONS,
  INFANTRY_ROLES,
  miniatureFiles,
  type MiniFile,
} from '../src/content/miniatures';
import {
  Canvas,
  alphaStats,
  blank,
  checkFile,
  checkSet,
  drawPiece,
  lightingBias,
  silhouetteIou,
  type Img,
} from './miniatures-lib';

/** A filled circle; `shade(dx, dy, r)` gives its grey level 0..255. */
function disc(
  w: number,
  h: number,
  radius: number,
  shade: (dx: number, dy: number, r: number) => [number, number, number],
): Img {
  const img = blank(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - w / 2;
      const dy = y + 0.5 - h / 2;
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      const [r, g, b] = shade(dx, dy, d);
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  return img;
}

const GOLD = (_dx: number, _dy: number, d: number): [number, number, number] => {
  const k = 1 - (d / 50) * 0.3; // brighter in the middle: radial, so rotation-safe
  return [Math.round(235 * k), Math.round(190 * k), Math.round(60 * k)];
};
const LIT_FROM_LEFT = (dx: number): [number, number, number] => {
  const k = 0.55 + 0.45 * (1 - (dx + 50) / 100);
  return [Math.round(235 * k), Math.round(190 * k), Math.round(60 * k)];
};

const specOf = (file: string): MiniFile => miniatureFiles().find((f) => f.file === file)!;

describe('miniature spec', () => {
  it('maps every role to a base shape, and every role is a real role', () => {
    for (const r of ROLES) expect(BASE_SHAPE_BY_ROLE[r.id], r.id).toBeDefined();
    expect(Object.keys(BASE_SHAPE_BY_ROLE).sort()).toEqual(ROLES.map((r) => r.id).sort());
  });

  it('has unique files and keys, and a base for every shape × finish', () => {
    const files = miniatureFiles();
    expect(new Set(files.map((f) => f.file)).size).toBe(files.length);
    expect(new Set(files.map((f) => f.key)).size).toBe(files.length);
    for (const shape of BASE_SHAPES) {
      for (const c of COLORWAYS) {
        expect(
          files.some((f) => f.file === `base_${shape}_${c}.png`),
          `${shape} ${c}`,
        ).toBe(true);
      }
    }
  });

  it('draws every infantry role for both factions on a canvas matching its base', () => {
    const files = miniatureFiles();
    for (const role of INFANTRY_ROLES) {
      for (const f of FACTIONS) {
        const fig = files.find((x) => x.file === `figure_${role}_${f}.png`);
        expect(fig, `${role} ${f}`).toBeDefined();
        const base = BASES[BASE_SHAPE_BY_ROLE[role]];
        expect(fig!.canvas).toEqual(base.canvas);
        expect(fig!.fitPx).toBe(base.fitPx);
      }
    }
  });

  it('keeps every base footprint inside its canvas with margin to spare', () => {
    for (const s of BASE_SHAPES) {
      const b = BASES[s];
      expect(b.footprint.w).toBeLessThanOrEqual(b.canvas.w - 16);
      expect(b.footprint.h).toBeLessThanOrEqual(b.canvas.h - 16);
    }
  });

  it('schedules a pilot tier that covers both infantry shapes and three silhouettes', () => {
    const tier1 = miniatureFiles().filter((f) => f.priority === 1);
    expect(tier1.filter((f) => f.kind === 'base')).toHaveLength(2 * COLORWAYS.length);
    expect(tier1.filter((f) => f.kind === 'figure').map((f) => f.subject)).toEqual(
      expect.arrayContaining(['rifleman', 'shield', 'sniper']),
    );
  });
});

describe('miniature checks', () => {
  const base = specOf('base_round_gold.png');

  it('accepts a radially lit, centered, correctly sized base', () => {
    const img = disc(128, 128, 50, GOLD);
    expect(checkFile(base, img).filter((i) => i.severity === 'error')).toEqual([]);
    expect(lightingBias(img)).toBeLessThan(0.06);
  });

  it('rejects a base lit from one side (breaks under rotation)', () => {
    const img = disc(128, 128, 50, LIT_FROM_LEFT);
    expect(lightingBias(img)).toBeGreaterThan(0.12);
    const errs = checkFile(base, img).filter((i) => i.severity === 'error');
    expect(errs.map((e) => e.message).join(' ')).toMatch(/directional/);
  });

  it('rejects a wrong canvas size and content that touches the edge', () => {
    expect(checkFile(base, disc(64, 64, 25, GOLD))[0]!.message).toMatch(/canvas is 64×64/);
    const big = disc(128, 128, 64, GOLD);
    expect(checkFile(base, big).some((i) => /touches/.test(i.message))).toBe(true);
  });

  it('flags a base that is not centered on the pivot', () => {
    const img = blank(128, 128);
    const src = disc(128, 128, 50, GOLD);
    // shift right by 10 px
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 118; x++) {
        const s = (y * 128 + x) * 4;
        const d = (y * 128 + x + 10) * 4;
        for (let c = 0; c < 4; c++) img.data[d + c] = src.data[s + c]!;
      }
    }
    expect(checkFile(base, img).some((i) => /off-center/.test(i.message))).toBe(true);
  });

  it('requires finishes of one shape to share a silhouette, and tarnish to be darker', () => {
    const gold = { spec: specOf('base_round_gold.png'), img: disc(128, 128, 50, GOLD) };
    const sameShape = {
      spec: specOf('base_round_gold-tarnished.png'),
      img: disc(128, 128, 50, GOLD),
    };
    const smaller = { spec: specOf('base_round_silver.png'), img: disc(128, 128, 40, GOLD) };
    expect(silhouetteIou(gold.img, smaller.img)).toBeLessThan(0.98);
    const issues = checkSet([gold, sameShape, smaller]);
    expect(
      issues.some((i) => /silhouette differs/.test(i.message) && i.file.includes('silver')),
    ).toBe(true);
    expect(issues.some((i) => /not clearly darker/.test(i.message))).toBe(true);
  });

  it('measures alpha stats', () => {
    const st = alphaStats(disc(128, 128, 50, GOLD));
    expect(st.bbox).toEqual({ x0: 14, y0: 14, x1: 114, y1: 114 });
    expect(st.cx).toBeCloseTo(64, 0);
  });
});

describe('review sheet compositing', () => {
  it('rotates a piece about its center without moving it', () => {
    const gold = disc(128, 128, 50, GOLD);
    const figure = blank(128, 128);
    // a small solid block pointing +x from the center
    for (let y = 60; y < 68; y++)
      for (let x = 64; x < 110; x++) {
        const i = (y * 128 + x) * 4;
        figure.data[i] = 20;
        figure.data[i + 1] = 30;
        figure.data[i + 2] = 20;
        figure.data[i + 3] = 255;
      }
    const piece = { base: gold, figure, fitPx: 100 };
    const a = new Canvas(200, 200);
    const b = new Canvas(200, 200);
    drawPiece(a, piece, 100, 100, 100, 0);
    drawPiece(b, piece, 100, 100, 100, Math.PI / 2);
    // facing +x at angle 0: dark pixel right of center; facing down (+y) at 90°: dark pixel below.
    const px = (c: Canvas, x: number, y: number) => c.data[(y * c.w + x) * 4]!;
    expect(px(a, 120, 100)).toBeLessThan(0.2);
    expect(px(b, 100, 120)).toBeLessThan(0.2);
    expect(px(a, 100, 120)).toBeGreaterThan(0.4); // gold there at angle 0
  });
});
