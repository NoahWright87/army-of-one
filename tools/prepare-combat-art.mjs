/** Package imagegen masters into small runtime textures; never redraw or recenter animation frames. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { resize } from './art-raster.mjs';

const sourceDir = process.argv[2];
if (!sourceDir) throw new Error('Usage: node tools/prepare-combat-art.mjs <master-directory>');
const read = (name) => PNG.sync.read(readFileSync(join(sourceDir, `${name}.png`)));
mkdirSync('assets/projectiles', { recursive: true });
for (const [name, w, h] of [
  ['pellet', 64, 32],
  ['pistol', 96, 32],
  ['rifle', 128, 32],
  ['rocket', 192, 64],
  ['grenade', 64, 64],
]) {
  const src = read(name);
  let x0 = src.width,
    y0 = src.height,
    x1 = 0,
    y1 = 0;
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++)
      if (src.data[(y * src.width + x) * 4 + 3] > 8) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x + 1);
        y1 = Math.max(y1, y + 1);
      }
  const scale = Math.min((w - 8) / (x1 - x0), (h - 8) / (y1 - y0));
  const rw = Math.round((x1 - x0) * scale),
    rh = Math.round((y1 - y0) * scale);
  const resized = resize(src, rw, rh, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(resized, out, 0, 0, rw, rh, Math.floor((w - rw) / 2), Math.floor((h - rh) / 2));
  writeFileSync(`assets/projectiles/${name}.png`, PNG.sync.write(out));
}
const impact = read('impact');
if (impact.width !== 1536 || impact.height !== 1024)
  throw new Error('Expected 1536×1024 impact master');
const sheet = resize(impact, 768, 512);
// Filtering must never bleed a neighbouring frame. Keep fixed centers/scales and clean 2px borders.
for (let y = 0; y < sheet.height; y++)
  for (let x = 0; x < sheet.width; x++) {
    const fx = x % 128,
      fy = y % 128,
      k = (y * sheet.width + x) * 4;
    if (fx < 2 || fy < 2 || fx >= 126 || fy >= 126) sheet.data.fill(0, k, k + 4);
  }
writeFileSync('assets/effects/impact.png', PNG.sync.write(sheet));
