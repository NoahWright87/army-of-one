/**
 * Placeholder image recipes + a tiny anti-aliased shape rasterizer (signed distance fields,
 * 4×4 supersampling). Pure JS (pngjs), deterministic: no randomness, no time.
 *
 * Every image key in the manifest MUST have a recipe here (enforced by the `Record<ImageKey, …>`
 * type), so the manifest and the generator cannot drift.
 */
import { PNG } from 'pngjs';
import type { ImageKey } from '../src/content/assets';

export type Sdf = (x: number, y: number) => number;
type Rgba = readonly [number, number, number, number];

export class Raster {
  readonly data: Float32Array; // straight RGBA, 0..1
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Float32Array(w * h * 4);
  }

  /** Paints `color` wherever `sdf <= 0`, anti-aliased, composited "over" existing pixels. */
  paint(sdf: Sdf, color: Rgba | string, alphaMul = 1): this {
    const c = typeof color === 'string' ? hex(color) : color;
    const S = 4;
    for (let py = 0; py < this.h; py++) {
      for (let px = 0; px < this.w; px++) {
        // Quick reject using the pixel-center distance.
        const d = sdf(px + 0.5, py + 0.5);
        let cover: number;
        if (d > 1) continue;
        if (d < -1) cover = 1;
        else {
          let n = 0;
          for (let sy = 0; sy < S; sy++) {
            for (let sx = 0; sx < S; sx++) {
              if (sdf(px + (sx + 0.5) / S, py + (sy + 0.5) / S) <= 0) n++;
            }
          }
          cover = n / (S * S);
        }
        if (cover <= 0) continue;
        this.blend(px, py, c, cover * c[3] * alphaMul);
      }
    }
    return this;
  }

  /** Per-pixel shader, composited over existing pixels. Return null to skip a pixel. */
  shade(fn: (x: number, y: number) => Rgba | null, mask?: Sdf): this {
    for (let py = 0; py < this.h; py++) {
      for (let px = 0; px < this.w; px++) {
        if (mask && mask(px + 0.5, py + 0.5) > 0) continue;
        const c = fn(px, py);
        if (c) this.blend(px, py, c, c[3]);
      }
    }
    return this;
  }

  /** Filled shape with a dark outline of width `ow` drawn outside it. */
  shape(sdf: Sdf, fill: string, outline = '#111111', ow = 3): this {
    if (ow > 0) this.paint(grow(sdf, ow), outline);
    return this.paint(sdf, fill);
  }

  private blend(px: number, py: number, c: Rgba, a: number): void {
    const i = (py * this.w + px) * 4;
    const d = this.data;
    const da = d[i + 3]!;
    const oa = a + da * (1 - a);
    if (oa <= 0) return;
    for (let k = 0; k < 3; k++) {
      d[i + k] = (c[k]! * a + d[i + k]! * da * (1 - a)) / oa;
    }
    d[i + 3] = oa;
  }

  toRgba8(): Buffer {
    const out = Buffer.alloc(this.w * this.h * 4);
    for (let i = 0; i < out.length; i++) {
      out[i] = Math.max(0, Math.min(255, Math.round(this.data[i]! * 255)));
    }
    return out;
  }

  toPng(): Buffer {
    const png = new PNG({ width: this.w, height: this.h });
    this.toRgba8().copy(png.data);
    return PNG.sync.write(png, { colorType: 6, deflateLevel: 9 });
  }
}

// ---- colors & noise ----------------------------------------------------------------------

export function hex(s: string, alpha = 1): Rgba {
  const v = s.replace('#', '');
  const n = parseInt(v.length === 3 ? [...v].map((c) => c + c).join('') : v.slice(0, 6), 16);
  const a = v.length === 8 ? parseInt(v.slice(6, 8), 16) / 255 : alpha;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
}

/** Deterministic integer hash noise in [0, 1). */
export function noise(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const mix = (a: Rgba, b: Rgba, t: number): Rgba => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
  a[3] + (b[3] - a[3]) * t,
];

// ---- SDF primitives (pixel coordinates) ---------------------------------------------------

export const circle =
  (cx: number, cy: number, r: number): Sdf =>
  (x, y) =>
    Math.hypot(x - cx, y - cy) - r;

export const ring = (cx: number, cy: number, r: number, thickness: number): Sdf => {
  const c = circle(cx, cy, r);
  return (x, y) => Math.abs(c(x, y)) - thickness / 2;
};

export const ellipse =
  (cx: number, cy: number, rx: number, ry: number, rot = 0): Sdf =>
  (x, y) => {
    const [lx, ly] = rotate(x - cx, y - cy, -rot);
    return (Math.hypot(lx / rx, ly / ry) - 1) * Math.min(rx, ry);
  };

/** Rotated rounded box centered at (cx, cy) with half extents (hw, hh). */
export const box =
  (cx: number, cy: number, hw: number, hh: number, radius = 0, rot = 0): Sdf =>
  (x, y) => {
    const [lx, ly] = rotate(x - cx, y - cy, -rot);
    const qx = Math.abs(lx) - (hw - radius);
    const qy = Math.abs(ly) - (hh - radius);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
  };

/** Capsule from a to b with radius r (thick line with round caps). */
export const segment =
  (ax: number, ay: number, bx: number, by: number, r: number): Sdf =>
  (x, y) => {
    const pax = x - ax;
    const pay = y - ay;
    const bax = bx - ax;
    const bay = by - ay;
    const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay || 1)));
    return Math.hypot(pax - bax * h, pay - bay * h) - r;
  };

export const polygon =
  (pts: readonly (readonly [number, number])[]): Sdf =>
  (x, y) => {
    let d = Infinity;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]!;
      const [xj, yj] = pts[j]!;
      d = Math.min(d, segment(xi, yi, xj, yj, 0)(x, y));
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside ? -d : d;
  };

export const regular = (cx: number, cy: number, r: number, n: number, rot = 0): Sdf =>
  polygon(
    Array.from({ length: n }, (_, i) => {
      const a = rot + (i / n) * Math.PI * 2;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;
    }),
  );

export const star = (cx: number, cy: number, ro: number, ri: number, n: number, rot = 0): Sdf =>
  polygon(
    Array.from({ length: n * 2 }, (_, i) => {
      const a = rot + (i / (n * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? ro : ri;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;
    }),
  );

export const union =
  (...s: Sdf[]): Sdf =>
  (x, y) =>
    Math.min(...s.map((f) => f(x, y)));
export const subtract =
  (a: Sdf, b: Sdf): Sdf =>
  (x, y) =>
    Math.max(a(x, y), -b(x, y));
export const intersect =
  (a: Sdf, b: Sdf): Sdf =>
  (x, y) =>
    Math.max(a(x, y), b(x, y));
export const grow =
  (s: Sdf, d: number): Sdf =>
  (x, y) =>
    s(x, y) - d;

function rotate(x: number, y: number, a: number): [number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}

// ---- recipes ------------------------------------------------------------------------------

const OUT = '#111111';

interface SoldierPalette {
  body: string;
  helmet: string;
  gun: string;
  outline: string;
  ow: number;
}

function soldier(r: Raster, p: SoldierPalette): Raster {
  // Facing +x. Body circle radius 22 (incl. outline) centered at (32, 32), rifle to x≈58.
  r.shape(segment(34, 37, 57.5, 37, 3.5), p.gun, p.outline, 2.5);
  r.shape(circle(32, 32, 22 - p.ow), p.body, p.outline, p.ow);
  r.paint(circle(29, 32, 9), p.helmet);
  r.paint(ring(29, 32, 9, 1.5), p.outline, 0.6);
  return r;
}

function tile(r: Raster, fn: (x: number, y: number) => Rgba): Raster {
  return r.shade(fn);
}

export const IMAGE_RECIPES: Record<ImageKey, (r: Raster) => Raster> = {
  soldier_live: (r) =>
    soldier(r, { body: '#ffc928', helmet: '#d98c00', gun: '#2b2b2b', outline: OUT, ow: 3.5 }),
  soldier_echo: (r) =>
    soldier(r, { body: '#8ea4b8', helmet: '#6b8196', gun: '#4a5560', outline: '#26303a', ow: 2.5 }),
  soldier_static: (r) => {
    soldier(r, { body: '#dfe5ea', helmet: '#b9c2ca', gun: '#8a949c', outline: '#5c6670', ow: 2.5 });
    const body = circle(32, 32, 20);
    return r.shade((_x, y) => (y % 4 < 2 ? hex('#000000', 0.18) : null), body);
  },
  soldier_corpse: (r) => {
    r.paint(ellipse(32, 34, 24, 18), hex('#3a0d0d', 0.45));
    r.shape(segment(20, 50, 46, 56, 3), '#3a3a3a', '#1a1a1a', 2);
    r.shape(ellipse(30, 32, 20, 15, 0.4), '#5b4a42', '#1d1512', 2.5);
    r.paint(circle(40, 26, 7), '#433630');
    r.paint(segment(22, 28, 30, 36, 1.8), '#1d1512');
    return r.paint(segment(30, 28, 22, 36, 1.8), '#1d1512');
  },
  soldier_shield_ring: (r) => {
    r.paint(ring(48, 48, 32, 10), hex('#35e0ff', 0.18));
    r.paint(ring(48, 48, 32, 4), hex('#7ff0ff', 0.95));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      r.paint(circle(48 + Math.cos(a) * 32, 48 + Math.sin(a) * 32, 3.5), '#e8fdff');
    }
    return r;
  },
  soldier_live_marker: (r) => {
    r.paint(circle(48, 48, 36), hex('#ffd34d', 0.16));
    return r.paint(ring(48, 48, 34, 4), hex('#ffd34d', 0.85));
  },
  static_overlay: (r) => {
    const mask = circle(32, 32, 22);
    return r.shade((x, y) => {
      const n = noise(x, y, 7);
      const fade = Math.max(0, Math.min(1, -mask(x + 0.5, y + 0.5) / 4));
      return n > 0.5 ? hex('#ffffff', 0.7 * fade) : hex('#000000', 0.5 * fade);
    }, mask);
  },
  icon_interrupted: (r) => {
    r.shape(
      polygon([
        [16, 2.5],
        [29.5, 27.5],
        [2.5, 27.5],
      ]),
      '#ffb020',
      OUT,
      2.5,
    );
    r.paint(segment(16, 10, 16, 18.5, 2.4), OUT);
    return r.paint(circle(16, 23.5, 2.4), OUT);
  },
  icon_x: (r) => {
    const x = union(segment(8, 8, 24, 24, 3.5), segment(24, 8, 8, 24, 3.5));
    return r.shape(x, '#ff3b3b', OUT, 2.5);
  },
  icon_o: (r) => r.shape(ring(16, 16, 9.5, 6), '#3ddc6e', OUT, 2.5),
  turret_base: (r) => {
    r.shape(regular(32, 32, 26, 8, Math.PI / 8), '#4a4f57', OUT, 3);
    r.paint(regular(32, 32, 18, 8, Math.PI / 8), '#5d636c');
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      r.paint(circle(32 + Math.cos(a) * 21, 32 + Math.sin(a) * 21, 2.2), '#c0392b');
    }
    return r;
  },
  turret_gun: (r) => {
    r.shape(box(46, 32, 14, 4.5, 2), '#2c2f34', OUT, 2.5);
    r.shape(circle(32, 32, 12), '#7b818a', OUT, 3);
    return r.paint(circle(32, 32, 5), '#c0392b');
  },
  turret_wreck: (r) => {
    r.shape(regular(32, 32, 26, 8, Math.PI / 8 + 0.2), '#2b2b2b', OUT, 3);
    r.paint(circle(32, 32, 14), hex('#000000', 0.5));
    r.paint(segment(14, 20, 34, 34, 1.5), '#111');
    r.paint(segment(48, 16, 30, 36, 1.5), '#111');
    return r.paint(segment(26, 50, 34, 34, 1.5), '#111');
  },
  mine: (r) => {
    r.shape(circle(16, 16, 10), '#3d4436', OUT, 2.5);
    r.paint(ring(16, 16, 6, 1.5), '#20251c');
    return r.paint(circle(16, 16, 2.5), '#9aa58a');
  },
  mine_armed: (r) => {
    r.paint(circle(16, 16, 15), hex('#ff2a2a', 0.35));
    r.shape(circle(16, 16, 10), '#3d4436', OUT, 2.5);
    return r.paint(circle(16, 16, 5), '#ff3030');
  },
  mine_scorch: (r) =>
    r.shade((x, y) => {
      const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32) / 28;
      if (d >= 1) return null;
      const n = noise(x, y, 3) * 0.25;
      return hex('#140f0a', Math.max(0, (1 - d) * 0.85 - n));
    }),
  vehicle: (r) => {
    r.shape(box(40, 24, 34, 18, 4), '#a8452f', OUT, 3); // cargo bed
    r.shape(box(80, 24, 11, 16, 4), '#c25a3c', OUT, 3); // cab
    r.paint(box(84, 24, 4, 12, 1.5), '#9fd4ff'); // windshield
    r.paint(box(40, 24, 28, 2, 1), hex('#000000', 0.25));
    return r.paint(
      polygon([
        [20, 12],
        [34, 24],
        [20, 36],
      ]),
      '#ffe066',
    );
  },
  vehicle_wreck: (r) => {
    r.shape(box(40, 24, 34, 18, 4, 0.04), '#2f2a27', OUT, 3);
    r.shape(box(79, 25, 11, 16, 4, -0.08), '#3a332f', OUT, 3);
    r.paint(circle(44, 22, 10), hex('#000000', 0.55));
    return r.paint(circle(66, 28, 6), hex('#ff7a1a', 0.5));
  },
  gate_closed: (r) => {
    r.paint(box(32, 32, 32, 32), '#6b4a2b');
    r.shade((x, y) => ((x + y) % 16 < 4 || (x - y + 64) % 16 < 4 ? hex('#3a2715', 1) : null));
    r.paint(subtract(box(32, 32, 32, 32), box(32, 32, 28, 28)), '#1a120b');
    return r.paint(circle(32, 32, 5), '#ffb020');
  },
  gate_open: (r) => {
    r.paint(subtract(box(32, 32, 32, 32), box(32, 32, 29, 29)), hex('#6b4a2b', 0.8));
    return r.shade((x, y) => ((x + y) % 16 < 2 ? hex('#6b4a2b', 0.25) : null));
  },
  lever_a: (r) => {
    r.shape(box(16, 22, 11, 6, 2), '#55595f', OUT, 2.5);
    r.shape(segment(16, 22, 6, 6, 2.5), '#9aa0a8', OUT, 2);
    return r.shape(circle(6, 6, 4), '#e04040', OUT, 2);
  },
  lever_b: (r) => {
    r.shape(box(16, 22, 11, 6, 2), '#55595f', OUT, 2.5);
    r.shape(segment(16, 22, 26, 6, 2.5), '#9aa0a8', OUT, 2);
    return r.shape(circle(26, 6, 4), '#40e070', OUT, 2);
  },
  bridge_down: (r) =>
    tile(r, (x, y) => {
      const plank = Math.floor(x / 8);
      const base = mix(hex('#8a6239'), hex('#a07444'), noise(plank, 0, 11));
      const seam = x % 8 === 0 ? 0.45 : 0;
      const grain = noise(x, y >> 2, plank) * 0.12;
      return mix(base, hex('#2a1a0c'), seam + grain);
    }),
  bridge_up: (r) =>
    tile(r, (x, y) => {
      const stripe = Math.floor((x + y) / 8) % 2 === 0;
      return stripe ? hex('#2b2b2b') : hex('#e0a020');
    }),
  bridge_destroyed: (r) =>
    tile(r, (x, y) => {
      const n = noise(x >> 3, y >> 3, 5);
      if (n < 0.45) return hex('#0d0a08', 0.9);
      return mix(hex('#3b2a1a'), hex('#120c07'), noise(x, y, 9) * 0.6);
    }),
  water_tile: (r) =>
    tile(r, (x, y) => {
      const w = Math.sin(((x + 2 * Math.sin((y / 64) * Math.PI * 2) * 4) / 64) * Math.PI * 4);
      const t = 0.5 + 0.5 * Math.sin((y / 64) * Math.PI * 6 + w);
      return mix(hex('#1f4e79'), hex('#2a6aa0'), t * 0.6 + noise(x, y, 2) * 0.08);
    }),
  ground_tile: (r) =>
    tile(r, (x, y) => {
      const coarse = noise(x >> 3, y >> 3, 1);
      const fine = noise(x, y, 4);
      return mix(hex('#34432f'), hex('#3d4c35'), coarse * 0.7 + fine * 0.3);
    }),
  wall_tile: (r) =>
    tile(r, (x, y) => {
      const row = Math.floor(y / 16);
      const off = row % 2 === 0 ? 0 : 16;
      const mortar = y % 16 < 2 || (x + off) % 32 < 2;
      if (mortar) return hex('#2c2f33');
      const brick = noise(Math.floor((x + off) / 32), row, 6);
      return mix(hex('#5d636b'), hex('#6c737c'), brick * 0.8 + noise(x, y, 8) * 0.2);
    }),
  objective: (r) => {
    r.shape(box(48, 48, 38, 38, 6), '#7a2a2a', OUT, 4);
    r.paint(box(48, 48, 30, 30, 4), '#943434');
    r.paint(ring(48, 48, 20, 5), '#ffd0d0');
    r.paint(ring(48, 48, 9, 4), '#ffd0d0');
    r.paint(circle(48, 48, 3), '#ffd0d0');
    return r;
  },
  objective_destroyed: (r) => {
    r.paint(circle(48, 48, 42), hex('#140f0a', 0.7));
    for (let i = 0; i < 9; i++) {
      const a = i * 2.3;
      const d = 10 + (i % 3) * 9;
      const cx = 48 + Math.cos(a) * d;
      const cy = 48 + Math.sin(a) * d;
      r.shape(box(cx, cy, 6 + (i % 3) * 2, 4 + (i % 2) * 2, 1, a), '#4a3030', OUT, 2);
    }
    return r.paint(circle(48, 48, 8), hex('#ff7a1a', 0.6));
  },
  spawn_marker: (r) => {
    r.paint(circle(32, 32, 28), hex('#3ddc6e', 0.15));
    r.paint(ring(32, 32, 27, 3), hex('#3ddc6e', 0.9));
    return r.shape(
      polygon([
        [52, 32],
        [30, 18],
        [34, 32],
        [30, 46],
      ]),
      '#3ddc6e',
      OUT,
      2,
    );
  },
  muzzle_flash: (r) => {
    r.paint(star(12, 16, 13, 5, 5), hex('#ffb020', 0.8));
    r.paint(
      polygon([
        [8, 11],
        [31, 16],
        [8, 21],
      ]),
      '#fff2a8',
    );
    return r.paint(circle(10, 16, 4), '#ffffff');
  },
  impact: (r) => {
    r.paint(star(16, 16, 13, 4, 6, 0.3), hex('#ffd27a', 0.9));
    return r.paint(circle(16, 16, 3.5), '#ffffff');
  },
  explosion: (r) => {
    r.paint(star(64, 64, 62, 44, 11, 0.2), hex('#5a3a2a', 0.55));
    r.paint(star(64, 64, 52, 36, 9), '#ff6a1a');
    r.paint(circle(64, 64, 30), '#ffb020');
    return r.paint(circle(64, 64, 15), '#fff2a8');
  },
  reticle: (r) => {
    const cross = union(
      segment(16, 2, 16, 10, 1),
      segment(16, 22, 16, 30, 1),
      segment(2, 16, 10, 16, 1),
      segment(22, 16, 30, 16, 1),
      ring(16, 16, 7, 1.5),
    );
    r.paint(grow(cross, 1.5), OUT);
    r.paint(cross, '#ffffff');
    return r.paint(circle(16, 16, 1.2), '#ff4040');
  },
};

export function renderImage(key: ImageKey, w: number, h: number): Raster {
  return IMAGE_RECIPES[key](new Raster(w, h));
}
