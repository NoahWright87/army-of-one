/** Normalize imagegen vehicle layers; finishes/factions preserve the source alpha exactly. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { resize } from './art-raster.mjs';
const source = process.argv[2];
if (!source) throw new Error('Usage: node tools/package-vehicles.mjs <master-directory>');
const read = (name) => PNG.sync.read(readFileSync(join(source, `${name}.png`)));
const save = (name, p) => writeFileSync(`assets/miniatures/${name}.png`, PNG.sync.write(p));
function bounds(p) {
  let x0 = p.width,
    y0 = p.height,
    x1 = 0,
    y1 = 0;
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++)
      if (p.data[(y * p.width + x) * 4 + 3] > 210) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x + 1);
        y1 = Math.max(y1, y + 1);
      }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function clean(p) {
  for (let i = 3; i < p.data.length; i += 4)
    p.data[i] = Math.round(Math.max(0, Math.min(1, (p.data[i] - 100) / 145)) * 255);
  return p;
}
function centered(src, w, h, fw, fh) {
  const b = bounds(src),
    r = resize(clean(src), fw, fh, b),
    p = new PNG({ width: w, height: h });
  PNG.bitblt(r, p, 0, 0, fw, fh, Math.floor((w - fw) / 2), Math.floor((h - fh) / 2));
  return p;
}
function faction(p) {
  const q = PNG.sync.read(PNG.sync.write(p));
  for (let i = 0; i < q.data.length; i += 4) {
    const [r, g, b] = q.data.subarray(i, i + 3);
    if (r > b * 1.12 && g > b * 1.1) {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      q.data[i] = l * 0.87;
      q.data[i + 1] = l * 0.97;
      q.data[i + 2] = l * 1.08;
    }
  }
  return q;
}
for (const [role, w, h, fw, fh, sw, sh] of [
  ['truck', 192, 128, 140, 76, 224, 160],
  ['tank', 256, 192, 172, 120, 288, 224],
]) {
  const bw = role === 'truck' ? 160 : 200,
    bh = role === 'truck' ? 96 : 152;
  const gold = centered(read(`base_${role}`), w, h, bw, bh);
  // Geometry is explicit so all four material finishes share an exact, centered silhouette.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x + 0.5 - w / 2),
        dy = Math.abs(y + 0.5 - h / 2);
      const inside =
        role === 'truck'
          ? Math.hypot(Math.max(0, dx - (bw / 2 - 20)), Math.max(0, dy - (bh / 2 - 20))) <= 20
          : dx <= bw / 2 && dy <= bh / 2 && dx + dy <= bw / 2 + bh / 2 - 28;
      gold.data[(y * w + x) * 4 + 3] = inside ? 255 : 0;
    }
  for (const finish of ['gold', 'silver', 'gold-tarnished', 'silver-tarnished']) {
    const p = PNG.sync.read(PNG.sync.write(gold));
    for (let i = 0; i < p.data.length; i += 4) {
      const l = (0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]) / 200;
      const col =
        finish === 'gold'
          ? [236, 180, 44]
          : finish === 'silver'
            ? [195, 202, 212]
            : finish === 'gold-tarnished'
              ? [121, 95, 47]
              : [92, 99, 110];
      for (let c = 0; c < 3; c++) p.data[i + c] = Math.min(255, Math.round(col[c] * l));
    }
    save(`base_${role}_${finish}`, p);
  }
  const hull = centered(read(`hull_${role}`), w, h, fw, fh);
  save(`hull_${role}_ally`, hull);
  save(`hull_${role}_enemy`, faction(hull));
  save(`wreck_${role}`, centered(read(`wreck_${role}`), w, h, fw, fh));
  const src = clean(read(`turret_${role}`));
  const n = role === 'truck' ? 128 : 192;
  const pivotX = src.width * (role === 'truck' ? 0.5 : 0.457),
    pivotY = src.height * 0.5;
  const box = bounds(src),
    scale =
      (n / 2 - 4) /
      Math.max(box.x + box.w - pivotX, pivotX - box.x, box.y + box.h - pivotY, pivotY - box.y);
  // Resample a square about the mount, not the weapon-inclusive bounding box.
  const extent = n / scale;
  const turret = resize(src, n, n, {
    x: pivotX - extent / 2,
    y: pivotY - extent / 2,
    w: extent,
    h: extent,
  });
  save(`turret_${role}_ally`, turret);
  save(`turret_${role}_enemy`, faction(turret));
  const shadow = new PNG({ width: sw, height: sh });
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      const r = Math.hypot((x + 0.5 - sw / 2) / (sw / 2 - 4), (y + 0.5 - sh / 2) / (sh / 2 - 4));
      shadow.data[(y * sw + x) * 4 + 3] = Math.round(255 * 0.45 * Math.max(0, 1 - r * r) ** 3);
    }
  save(`shadow_${role}`, shadow);
}
