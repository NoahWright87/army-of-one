/** Crop/normalize imagegen masters; preserve alpha and the turret's mechanical pivot. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { BATTLEFIELD_FILES } from '../src/content/battlefield-art.ts';
import { resize } from './art-raster.mjs';

const source = process.argv[2];
if (!source)
  throw new Error('Usage: node --import tsx tools/package-battlefield.mjs <master-directory>');
mkdirSync('assets/battlefield', { recursive: true });

function bounds(p) {
  let x0 = p.width,
    y0 = p.height,
    x1 = 0,
    y1 = 0;
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++) {
      if (p.data[(y * p.width + x) * 4 + 3] <= 16) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x + 1);
      y1 = Math.max(y1, y + 1);
    }
  if (x1 <= x0 || y1 <= y0) throw new Error('Empty master');
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Tallest alpha span finds the round breech, ignoring the long horizontal barrel. */
function gunPivot(p) {
  const spans = [];
  for (let x = 0; x < p.width; x++) {
    let top = p.height,
      bottom = 0;
    for (let y = 0; y < p.height; y++)
      if (p.data[(y * p.width + x) * 4 + 3] > 128) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + 1);
      }
    spans.push({ x, top, bottom, span: bottom - top });
  }
  const maximum = Math.max(...spans.map((s) => s.span));
  const crown = spans.filter((s) => s.span >= maximum * 0.99);
  return {
    x: crown.reduce((a, s) => a + s.x + 0.5, 0) / crown.length,
    y: crown.reduce((a, s) => a + (s.top + s.bottom) / 2, 0) / crown.length,
  };
}

/** Pair opposing edge texels so repeated strips have no transparent cut at the join. */
function matchEdges(p) {
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < 4; x++) {
      const a = (y * p.width + x) * 4;
      const b = (y * p.width + p.width - 1 - x) * 4;
      const aa = p.data[a + 3],
        ba = p.data[b + 3],
        total = aa + ba;
      for (let c = 0; c < 3; c++) {
        const value = total ? Math.round((p.data[a + c] * aa + p.data[b + c] * ba) / total) : 0;
        p.data[a + c] = value;
        p.data[b + c] = value;
      }
      p.data[a + 3] = Math.round(total / 2);
      p.data[b + 3] = Math.round(total / 2);
    }
}

const report = {};
for (const [key, spec] of Object.entries(BATTLEFIELD_FILES)) {
  const src = PNG.sync.read(readFileSync(join(source, spec.file)));
  const b = bounds(src);
  let out;
  if (key.startsWith('turret_')) {
    const pivot = key === 'turret_gun' ? gunPivot(src) : { x: src.width / 2, y: src.height / 2 };
    const radius = Math.max(pivot.x - b.x, b.x + b.w - pivot.x, pivot.y - b.y, b.y + b.h - pivot.y);
    const extent = (radius * spec.width) / (spec.width / 2 - 4);
    out = resize(src, spec.width, spec.height, {
      x: pivot.x - extent / 2,
      y: pivot.y - extent / 2,
      w: extent,
      h: extent,
    });
    report[key] = { master: [src.width, src.height], pivot, extent };
  } else {
    // Fence has two repeated panels; use the central panel to retain readable post/mesh proportions.
    if (key === 'cover_fence') {
      b.x += b.w / 4;
      b.w /= 2;
    }
    const strip = spec.width !== spec.height;
    const scale = Math.min((spec.width - (strip ? 0 : 8)) / b.w, (spec.height - 4) / b.h);
    const w = Math.round(b.w * scale),
      h = Math.round(b.h * scale);
    const image = resize(src, w, h, b);
    out = new PNG({ width: spec.width, height: spec.height });
    PNG.bitblt(
      image,
      out,
      0,
      0,
      w,
      h,
      Math.floor((spec.width - w) / 2),
      Math.floor((spec.height - h) / 2),
    );
    if (strip) matchEdges(out);
  }
  for (let i = 0; i < out.data.length; i += 4) if (out.data[i + 3] < 3) out.data.fill(0, i, i + 4);
  writeFileSync(`assets/battlefield/${spec.file}`, PNG.sync.write(out));
}
writeFileSync(join(source, 'normalization.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Packaged ${Object.keys(BATTLEFIELD_FILES).length} battlefield textures`);
