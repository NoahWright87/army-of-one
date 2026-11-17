/**
 * Checks and review sheets for the miniature art ([D116]–[D121], docs/art/). Pure functions over
 * raw RGBA buffers (pngjs only for file IO in the CLI), so they're unit-tested on synthetic
 * images. Deterministic: no randomness, no time.
 */
import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';
import {
  BASES,
  BASE_SHAPE_BY_ROLE,
  type BaseShape,
  type Colorway,
  type MiniFile,
} from '../src/content/miniatures';

export interface Img {
  w: number;
  h: number;
  /** Straight (non-premultiplied) RGBA, 8 bit. */
  data: Uint8Array;
}

export interface Issue {
  severity: 'error' | 'warn';
  file: string;
  message: string;
}

export function loadPng(path: string): Img {
  const png = PNG.sync.read(readFileSync(path));
  return { w: png.width, h: png.height, data: new Uint8Array(png.data) };
}

export function blank(w: number, h: number): Img {
  return { w, h, data: new Uint8Array(w * h * 4) };
}

export function encodePng(img: Img): Buffer {
  const png = new PNG({ width: img.w, height: img.h });
  png.data = Buffer.from(img.data);
  return PNG.sync.write(png);
}

const OPAQUE = 200;
const SOLID = 240;
const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

export interface AlphaStats {
  opaque: number;
  soft: number;
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Alpha-weighted centroid in px (canvas coordinates), or null if empty. */
  cx: number | null;
  cy: number | null;
}

export function alphaStats(img: Img): AlphaStats {
  let opaque = 0;
  let soft = 0;
  let sum = 0;
  let sx = 0;
  let sy = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const a = img.data[(y * img.w + x) * 4 + 3]!;
      if (a >= SOLID) opaque++;
      else if (a >= 16) soft++;
      if (a > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      sum += a;
      sx += a * (x + 0.5);
      sy += a * (y + 0.5);
    }
  }
  return {
    opaque,
    soft,
    bbox: x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 },
    cx: sum > 0 ? sx / sum : null,
    cy: sum > 0 ? sy / sum : null,
  };
}

/** Alpha-weighted mean luminance of the pixels on one side of a line through the center. */
function halfPlaneLuminance(img: Img, angle: number): number {
  const cx = img.w / 2;
  const cy = img.h / 2;
  const nx = Math.cos(angle);
  const ny = Math.sin(angle);
  let acc = 0;
  let wsum = 0;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * 4;
      const a = img.data[i + 3]! / 255;
      if (a === 0) continue;
      if ((x + 0.5 - cx) * nx + (y + 0.5 - cy) * ny <= 0) continue;
      acc += a * lum(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!);
      wsum += a;
    }
  }
  return wsum > 0 ? acc / wsum : 0;
}

/**
 * How directional the shading is: the biggest difference in mean luminance between any half of the
 * image and the opposite half, as a share of the overall mean. A base lit from one side (the thing
 * that breaks when the view rotates) scores high; radially symmetric shading scores ~0.
 */
export function lightingBias(img: Img): number {
  let overall = 0;
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3]! / 255;
    overall += a * lum(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!);
    n += a;
  }
  if (n === 0) return 0;
  overall /= n;
  let worst = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 8;
    const d = Math.abs(halfPlaneLuminance(img, a) - halfPlaneLuminance(img, a + Math.PI));
    if (d > worst) worst = d;
  }
  return overall > 0 ? worst / overall : 0;
}

/** Share of opaque pixels whose alpha mask matches between two images of equal size (IoU). */
export function silhouetteIou(a: Img, b: Img): number {
  if (a.w !== b.w || a.h !== b.h) return 0;
  let inter = 0;
  let union = 0;
  for (let i = 3; i < a.data.length; i += 4) {
    const pa = a.data[i]! >= 128;
    const pb = b.data[i]! >= 128;
    if (pa && pb) inter++;
    if (pa || pb) union++;
  }
  return union === 0 ? 1 : inter / union;
}

/** Mean RGB (0–255) and luminance (0–1) of the solid pixels. */
export function meanColor(img: Img): { r: number; g: number; b: number; lum: number; sat: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3]! < OPAQUE) continue;
    r += img.data[i]!;
    g += img.data[i + 1]!;
    b += img.data[i + 2]!;
    n++;
  }
  if (n === 0) return { r: 0, g: 0, b: 0, lum: 0, sat: 0 };
  r /= n;
  g /= n;
  b /= n;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return { r, g, b, lum: lum(r, g, b), sat: mx === 0 ? 0 : (mx - mn) / mx };
}

/** Mean luminance of the outline: solid pixels that touch a transparent neighbour. */
export function outlineLuminance(img: Img): number {
  let acc = 0;
  let n = 0;
  const alphaAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= img.w || y >= img.h ? 0 : img.data[(y * img.w + x) * 4 + 3]!;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * 4;
      if (img.data[i + 3]! < OPAQUE) continue;
      if (
        alphaAt(x - 1, y) < 32 ||
        alphaAt(x + 1, y) < 32 ||
        alphaAt(x, y - 1) < 32 ||
        alphaAt(x, y + 1) < 32
      ) {
        acc += lum(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!);
        n++;
      }
    }
  }
  return n === 0 ? 0 : acc / n;
}

/** True if any pixel with alpha > 8 lies in the outer `margin` px of the canvas. */
export function touchesEdge(img: Img, margin: number): boolean {
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (x >= margin && y >= margin && x < img.w - margin && y < img.h - margin) continue;
      if (img.data[(y * img.w + x) * 4 + 3]! > 8) return true;
    }
  }
  return false;
}

/** Checks for one delivered file. */
export function checkFile(spec: MiniFile, img: Img): Issue[] {
  const issues: Issue[] = [];
  const add = (severity: Issue['severity'], message: string) =>
    issues.push({ severity, file: spec.file, message });

  if (img.w !== spec.canvas.w || img.h !== spec.canvas.h) {
    add('error', `canvas is ${img.w}×${img.h}, expected ${spec.canvas.w}×${spec.canvas.h}`);
    return issues; // everything else assumes the right size
  }
  const st = alphaStats(img);
  if (!st.bbox) {
    add('error', 'image is empty (fully transparent)');
    return issues;
  }
  if (spec.kind === 'shadow') return issues;

  if (touchesEdge(img, 2)) {
    add('error', 'content touches the outer 2 px of the canvas (leave a transparent margin)');
  }
  if (st.soft > st.opaque * 0.12) {
    add(
      'warn',
      `lots of semi-transparent pixels (${st.soft} soft vs ${st.opaque} solid): is a shadow or glow baked in? Shadows are a separate layer.`,
    );
  }

  const cx = img.w / 2;
  const cy = img.h / 2;
  const bw = st.bbox.x1 - st.bbox.x0;
  const bh = st.bbox.y1 - st.bbox.y0;

  if (spec.kind === 'base') {
    const fp = BASES[spec.subject as BaseShape].footprint;
    const dw = Math.abs(bw - fp.w);
    const dh = Math.abs(bh - fp.h);
    if (dw > 8 || dh > 8) {
      add('error', `base is ${bw}×${bh} px, footprint should be ${fp.w}×${fp.h}`);
    } else if (dw > 3 || dh > 3) {
      add('warn', `base is ${bw}×${bh} px, footprint should be ${fp.w}×${fp.h}`);
    }
    if (st.cx !== null && st.cy !== null && Math.hypot(st.cx - cx, st.cy - cy) > 3) {
      add('error', `base is off-center by ${Math.hypot(st.cx - cx, st.cy - cy).toFixed(1)} px`);
    }
    const bias = lightingBias(img);
    if (bias > 0.12) {
      add(
        'error',
        `shading is directional (bias ${bias.toFixed(2)}, must be ≤ 0.12): the base must look right at EVERY rotation, so light it radially or evenly, not from one side`,
      );
    } else if (bias > 0.06) {
      add('warn', `shading leans one way (bias ${bias.toFixed(2)}); aim for ≤ 0.06`);
    }
    return issues;
  }

  if (spec.kind === 'figure' || spec.kind === 'fallen') {
    const alphaAtPivot = img.data[(Math.floor(cy) * img.w + Math.floor(cx)) * 4 + 3]!;
    if (alphaAtPivot < OPAQUE) {
      add(
        'error',
        'the figure does not cover the pivot (canvas center): body must sit on the center',
      );
    }
    const mid = (st.bbox.y0 + st.bbox.y1) / 2;
    if (Math.abs(mid - cy) > 6) {
      add(
        'warn',
        `figure is ${(mid - cy).toFixed(1)} px off the horizontal axis (should be centered on y)`,
      );
    }
    if (spec.kind === 'figure' && spec.subject !== 'bazooka') {
      const front = st.bbox.x1 - cx;
      const back = cx - st.bbox.x0;
      if (front < back * 0.95) {
        add(
          'warn',
          'the figure extends further to the left than the right: does it face +x (right)?',
        );
      }
    }
    if (outlineLuminance(img) > 0.38) {
      add('warn', 'outline is light: figures need a dark outline (≥ 4 px) to read at 32 px');
    }
    // Everything fits the canvas with room for the base to show.
    if (bw > img.w - 4 || bh > img.h - 4) add('warn', 'figure fills nearly the whole canvas');
  }
  return issues;
}

/** Cross-file checks over the delivered set (same silhouettes across finishes/factions). */
export function checkSet(files: { spec: MiniFile; img: Img }[]): Issue[] {
  const issues: Issue[] = [];
  const by = new Map(files.map((f) => [f.spec.file, f]));

  // Same base shape → same silhouette in every finish.
  for (const shape of Object.keys(BASES) as BaseShape[]) {
    const set = files.filter((f) => f.spec.kind === 'base' && f.spec.subject === shape);
    const ref = set[0];
    if (!ref) continue;
    for (const f of set.slice(1)) {
      const iou = silhouetteIou(ref.img, f.img);
      if (iou < 0.98) {
        issues.push({
          severity: 'error',
          file: f.spec.file,
          message: `silhouette differs from ${ref.spec.file} (IoU ${iou.toFixed(3)}); finishes of one shape must be pixel-identical recolors`,
        });
      }
    }
    // Finishes must be tellable apart.
    const col = (c: Colorway) => set.find((f) => f.spec.colorway === c);
    const gold = col('gold');
    const tgold = col('gold-tarnished');
    const silver = col('silver');
    const tsilver = col('silver-tarnished');
    if (gold) {
      const m = meanColor(gold.img);
      if (m.sat < 0.35)
        issues.push({
          severity: 'warn',
          file: gold.spec.file,
          message: 'gold is not saturated enough to read as gold',
        });
    }
    if (silver) {
      const m = meanColor(silver.img);
      if (m.sat > 0.2)
        issues.push({
          severity: 'warn',
          file: silver.spec.file,
          message: 'silver is too colorful (should be near-neutral)',
        });
    }
    for (const [polished, tarnished] of [
      [gold, tgold],
      [silver, tsilver],
    ] as const) {
      if (!polished || !tarnished) continue;
      const a = meanColor(polished.img);
      const b = meanColor(tarnished.img);
      if (b.lum > a.lum * 0.85) {
        issues.push({
          severity: 'warn',
          file: tarnished.spec.file,
          message: `tarnished is not clearly darker than ${polished.spec.file} (lum ${b.lum.toFixed(2)} vs ${a.lum.toFixed(2)}; want ≤ 85%)`,
        });
      }
    }
    if (gold && tgold) {
      const a = meanColor(gold.img);
      const b = meanColor(tgold.img);
      const d = Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
      if (d < 45) {
        issues.push({
          severity: 'warn',
          file: tgold.spec.file,
          message: `live gold and echo gold are too alike (RGB distance ${d.toFixed(0)}, want ≥ 45): the player must find their soldier among echoes`,
        });
      }
    }
  }

  // Ally and enemy figures are the same sculpt, repainted.
  for (const f of files) {
    if (f.spec.faction !== 'ally' || !['figure', 'hull', 'turret', 'fallen'].includes(f.spec.kind))
      continue;
    const twin = by.get(f.spec.file.replace('_ally', '_enemy'));
    if (!twin) continue;
    const iou = silhouetteIou(f.img, twin.img);
    if (iou < 0.95) {
      issues.push({
        severity: 'warn',
        file: twin.spec.file,
        message: `silhouette differs from ${f.spec.file} (IoU ${iou.toFixed(3)}): the enemy should be the same sculpt repainted, not a new drawing`,
      });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------------------------
// Review sheets: draw layered pieces rotated and scaled, the way the game will.
// ---------------------------------------------------------------------------------------------

/** Float premultiplied RGBA canvas for compositing. */
export class Canvas {
  readonly data: Float32Array;
  constructor(
    readonly w: number,
    readonly h: number,
    bg: readonly [number, number, number] = [0.2, 0.24, 0.2],
  ) {
    this.data = new Float32Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      this.data[i * 4] = bg[0];
      this.data[i * 4 + 1] = bg[1];
      this.data[i * 4 + 2] = bg[2];
      this.data[i * 4 + 3] = 1;
    }
  }

  /**
   * Draws `src` with its center at (x, y), rotated by `angle` (radians, clockwise on screen like
   * the game's +x-forward facing), scaled by `scale`, at opacity `alpha`. Bilinear, premultiplied.
   */
  draw(src: Img, x: number, y: number, angle: number, scale: number, alpha = 1): void {
    const half = (Math.hypot(src.w, src.h) / 2) * scale;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (
      let py = Math.max(0, Math.floor(y - half));
      py < Math.min(this.h, Math.ceil(y + half));
      py++
    ) {
      for (
        let px = Math.max(0, Math.floor(x - half));
        px < Math.min(this.w, Math.ceil(x + half));
        px++
      ) {
        // Inverse-map the destination pixel center into source space.
        const dx = (px + 0.5 - x) / scale;
        const dy = (py + 0.5 - y) / scale;
        const sx = dx * cos + dy * sin + src.w / 2 - 0.5;
        const sy = -dx * sin + dy * cos + src.h / 2 - 0.5;
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const fx = sx - x0;
        const fy = sy - y0;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let j = 0; j < 2; j++) {
          for (let i = 0; i < 2; i++) {
            const xx = x0 + i;
            const yy = y0 + j;
            if (xx < 0 || yy < 0 || xx >= src.w || yy >= src.h) continue;
            const wgt = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
            const k = (yy * src.w + xx) * 4;
            const sa = (src.data[k + 3]! / 255) * wgt;
            r += (src.data[k]! / 255) * sa;
            g += (src.data[k + 1]! / 255) * sa;
            b += (src.data[k + 2]! / 255) * sa;
            a += sa;
          }
        }
        if (a <= 0) continue;
        a *= alpha;
        r *= alpha;
        g *= alpha;
        b *= alpha;
        const o = (py * this.w + px) * 4;
        const inv = 1 - a;
        this.data[o] = r + this.data[o]! * inv;
        this.data[o + 1] = g + this.data[o + 1]! * inv;
        this.data[o + 2] = b + this.data[o + 2]! * inv;
        this.data[o + 3] = a + this.data[o + 3]! * inv;
      }
    }
  }

  /** Nearest-neighbour enlargement, for looking at 32 px pieces. */
  toImg(zoom = 1): Img {
    const out = blank(this.w * zoom, this.h * zoom);
    for (let y = 0; y < out.h; y++) {
      for (let x = 0; x < out.w; x++) {
        const s = (Math.floor(y / zoom) * this.w + Math.floor(x / zoom)) * 4;
        const o = (y * out.w + x) * 4;
        for (let c = 0; c < 3; c++)
          out.data[o + c] = Math.round(Math.min(1, Math.max(0, this.data[s + c]!)) * 255);
        out.data[o + 3] = 255;
      }
    }
    return out;
  }
}

/** Tiny deterministic generator for sheet layouts (not sim code). */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface Pieces {
  base: Img;
  figure: Img;
  /** Pixels of the figure/base that map onto one logical unit. */
  fitPx: number;
}

/** The piece's (role, finish, faction) → files, resolved from whatever was delivered. */
export function pieceFor(
  images: Map<string, Img>,
  role: keyof typeof BASE_SHAPE_BY_ROLE,
  colorway: Colorway,
): Pieces | null {
  const shape = BASE_SHAPE_BY_ROLE[role];
  const faction = colorway.startsWith('gold') ? 'ally' : 'enemy';
  const base = images.get(`base_${shape}_${colorway}.png`);
  const figure = images.get(`figure_${role}_${faction}.png`);
  if (!base || !figure) return null;
  return { base, figure, fitPx: BASES[shape].fitPx };
}

/** Draws one assembled piece: base fixed in world orientation, figure turned to `facing`. */
export function drawPiece(
  c: Canvas,
  p: Pieces,
  x: number,
  y: number,
  worldDiameter: number,
  facing: number,
  opts: { alpha?: number; cameraRotation?: number } = {},
): void {
  const scale = worldDiameter / p.fitPx;
  const cam = opts.cameraRotation ?? 0;
  c.draw(p.base, x, y, cam, scale, opts.alpha ?? 1);
  c.draw(p.figure, x, y, cam + facing, scale, opts.alpha ?? 1);
}
