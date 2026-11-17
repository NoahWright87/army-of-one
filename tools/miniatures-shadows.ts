/** Generate the pilot's separate, rotation-invariant contact shadow. */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { blank, encodePng } from './miniatures-lib';

const img = blank(160, 160);
for (let y = 0; y < img.h; y++) {
  for (let x = 0; x < img.w; x++) {
    const r = Math.hypot(x + 0.5 - img.w / 2, y + 0.5 - img.h / 2) / 76;
    const falloff = Math.max(0, 1 - r * r);
    img.data[(y * img.w + x) * 4 + 3] = Math.round(255 * 0.45 * falloff ** 3);
  }
}
writeFileSync(
  fileURLToPath(new URL('../assets/miniatures/shadow_infantry.png', import.meta.url)),
  encodePng(img),
);
