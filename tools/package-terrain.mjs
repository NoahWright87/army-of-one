/** Downsample imagegen surfaces and match opposite borders for repeating GPU textures. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
const source = process.argv[2];
if (!source) throw new Error('Usage: node tools/package-terrain.mjs <master-directory>');
mkdirSync('assets/terrain', { recursive: true });
for (const name of [
  'grass',
  'dirt',
  'road',
  'sand',
  'concrete',
  'water',
  'rocks',
  'wall',
  'bridge',
]) {
  const src = PNG.sync.read(readFileSync(join(source, `${name}.png`)));
  const n = 128,
    out = new PNG({ width: n, height: n });
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const rgb = [0, 0, 0];
      let count = 0;
      for (
        let sy = Math.floor((y * src.height) / n);
        sy < Math.floor(((y + 1) * src.height) / n);
        sy++
      )
        for (
          let sx = Math.floor((x * src.width) / n);
          sx < Math.floor(((x + 1) * src.width) / n);
          sx++
        ) {
          for (let c = 0; c < 3; c++) rgb[c] += src.data[(sy * src.width + sx) * 4 + c];
          count++;
        }
      const k = (y * n + x) * 4;
      for (let c = 0; c < 3; c++) out.data[k + c] = Math.round(rgb[c] / count);
      out.data[k + 3] = 255;
    }
  // Symmetric 8px edge conditioning: exact pixel matches at the outermost seam.
  for (let d = 0; d < 8; d++) {
    const mix = (1 - d / 8) * 0.5;
    for (let p = 0; p < n; p++)
      for (let c = 0; c < 3; c++)
        for (const horizontal of [true, false]) {
          const a = (horizontal ? p * n + d : d * n + p) * 4 + c;
          const b = (horizontal ? p * n + n - 1 - d : (n - 1 - d) * n + p) * 4 + c;
          const av = out.data[a],
            bv = out.data[b];
          out.data[a] = Math.round(av * (1 - mix) + bv * mix);
          out.data[b] = Math.round(bv * (1 - mix) + av * mix);
        }
  }
  // Resolve rounding at corners after the two-axis conditioning pass.
  for (const horizontal of [true, false])
    for (let p = 0; p < n; p++)
      for (let c = 0; c < 3; c++) {
        const a = (horizontal ? p * n : p) * 4 + c;
        const b = (horizontal ? p * n + n - 1 : (n - 1) * n + p) * 4 + c;
        const mean = Math.round((out.data[a] + out.data[b]) / 2);
        out.data[a] = mean;
        out.data[b] = mean;
      }
  writeFileSync(`assets/terrain/${name}.png`, PNG.sync.write(out));
}
