/** Normalize the remaining imagegen masters and derive compatibility stills from delivered art. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';
import { FINISHED_ART } from '../src/content/finished-art.ts';
import { resize } from './art-raster.mjs';
const source = process.argv[2];
if (!source)
  throw new Error(
    'Usage: node --import tsx tools/package-finished-art.mjs <master-directory> [--partial]',
  );
const partial = process.argv.includes('--partial');
const read = (p) => PNG.sync.read(readFileSync(p));
const bounds = (p) => {
  let x0 = p.width,
    y0 = p.height,
    x1 = 0,
    y1 = 0;
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++)
      if (p.data[(y * p.width + x) * 4 + 3] > 12) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x + 1);
        y1 = Math.max(y1, y + 1);
      }
  if (x1 <= x0 || y1 <= y0) throw Error('Empty master');
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};
function fit(p, w, h, margin = 4) {
  const b = bounds(p),
    scale = Math.min((w - margin * 2) / b.w, (h - margin * 2) / b.h);
  const rw = Math.max(1, Math.round(b.w * scale)),
    rh = Math.max(1, Math.round(b.h * scale));
  const q = resize(p, rw, rh, b),
    out = new PNG({ width: w, height: h });
  PNG.bitblt(q, out, 0, 0, rw, rh, Math.floor((w - rw) / 2), Math.floor((h - rh) / 2));
  return out;
}
function periodic(p) {
  for (const vertical of [false, true])
    for (let a = 0; a < (vertical ? p.width : p.height); a++)
      for (let b = 0; b < 4; b++) {
        const i = (vertical ? b * p.width + a : a * p.width + b) * 4;
        const j = (vertical ? (p.height - 1 - b) * p.width + a : a * p.width + p.width - 1 - b) * 4;
        for (let c = 0; c < 4; c++) {
          const v = Math.round((p.data[i + c] + p.data[j + c]) / 2);
          p.data[i + c] = v;
          p.data[j + c] = v;
        }
      }
}
const legacy = {
  soldier_live: 'miniatures/figure_rifleman_ally.png',
  soldier_echo: 'miniatures/figure_rifleman_ally.png',
  soldier_static: 'miniatures/figure_rifleman_ally.png',
  soldier_enemy: 'miniatures/figure_rifleman_enemy.png',
  soldier_corpse: 'miniatures/figure_fallen_ally.png',
  vehicle: 'miniatures/hull_truck_enemy.png',
  vehicle_wreck: 'miniatures/wreck_truck.png',
  ground_tile: 'terrain/grass.png',
  water_tile: 'terrain/water.png',
  wall_tile: 'terrain/wall.png',
  impact: 'effects/impact.png',
  explosion: 'effects/explosion_small.png',
};
let count = 0;
for (const [key, spec] of Object.entries(FINISHED_ART)) {
  if (spec.file.startsWith('ui/symbols/')) continue; // Exported from their native SVG sources.
  let out;
  if (legacy[key]) {
    const p = read('assets/' + legacy[key]);
    if (key === 'impact') out = resize(p, spec.w, spec.h, { x: 256, y: 0, w: 128, h: 128 });
    else if (key === 'explosion') out = resize(p, spec.w, spec.h, { x: 384, y: 0, w: 128, h: 128 });
    else if (key.endsWith('_tile')) out = resize(p, spec.w, spec.h);
    else out = fit(p, spec.w, spec.h, 3);
  } else {
    const master = join(source, key + '.png');
    if (!existsSync(master)) {
      if (partial) continue;
      throw Error('Missing ' + master);
    }
    const p = read(master);
    if (key.startsWith('ui_')) out = resize(p, spec.w, spec.h);
    else if (key === 'bridge_down') {
      // The surface is square; crop its painted square to remove its outer transparent padding.
      const b = bounds(p);
      out = resize(p, spec.w, spec.h, b);
      periodic(out);
      for (let i = 3; i < out.data.length; i += 4) out.data[i] = 255;
    } else out = fit(p, spec.w, spec.h, key === 'muzzle_flash' ? 2 : 4);
  }
  const dest = 'assets/' + spec.file;
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, PNG.sync.write(out));
  count++;
}
console.log(`Packaged ${count} painted/compatibility textures`);
