/**
 * Regenerates every placeholder asset from the manifest (src/content/assets.ts):
 *   - PNGs  (tools/gen-images.ts)
 *   - WAVs  (tools/gen-sounds.ts)
 *   - assets/ASSETS.md (tools/gen-assets-md.ts)
 * Deterministic: running it twice produces identical files. Removes stale PLACEHOLDER__ files.
 *
 *   npm run gen:placeholders
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_MANIFEST, type ImageKey, type SoundKey } from '../src/content/assets';
import { buildAssetsMd } from './gen-assets-md';
import { renderImage } from './gen-images';
import { renderSound } from './gen-sounds';

export const ASSETS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../assets');

export function generateAll(assetsDir = ASSETS_DIR): { written: number; removed: string[] } {
  let written = 0;
  const expected = new Set<string>();
  for (const a of ASSET_MANIFEST) {
    if (a.status !== 'placeholder') continue;
    const out = join(assetsDir, a.file);
    expected.add(resolve(out));
    mkdirSync(dirname(out), { recursive: true });
    const bytes =
      a.kind === 'image'
        ? renderImage(a.key as ImageKey, a.size.w, a.size.h).toPng()
        : renderSound(a.key as SoundKey);
    writeFileSync(out, bytes);
    written++;
  }
  const removed: string[] = [];
  const phDir = join(assetsDir, 'placeholder');
  for (const f of readdirSync(phDir)) {
    const p = resolve(phDir, f);
    if (f.startsWith('PLACEHOLDER__') && !expected.has(p)) {
      rmSync(p);
      removed.push(f);
    }
  }
  writeFileSync(join(assetsDir, 'ASSETS.md'), buildAssetsMd());
  return { written, removed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { written, removed } = generateAll();
  console.log(`gen:placeholders: wrote ${written} placeholder files + assets/ASSETS.md`);
  if (removed.length) console.log(`removed stale: ${removed.join(', ')}`);
}
