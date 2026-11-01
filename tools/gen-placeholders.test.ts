import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  ASSET_MANIFEST,
  IMAGE_ASSETS,
  SOUND_ASSETS,
  fitPx,
  type ImageKey,
  type SoundKey,
} from '../src/content/assets';
import { buildAssetsMd } from './gen-assets-md';
import { renderImage } from './gen-images';
import { renderSound, SOUND_RECIPES } from './gen-sounds';
import { ASSETS_DIR } from './gen-placeholders';

const ROOT = join(ASSETS_DIR, '..');

describe('asset manifest', () => {
  it('has unique keys and files', () => {
    const keys = ASSET_MANIFEST.map((a) => a.key);
    const files = ASSET_MANIFEST.map((a) => a.file);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(files).size).toBe(files.length);
  });

  it('every entry has a file on disk', () => {
    for (const a of ASSET_MANIFEST) {
      expect(existsSync(join(ASSETS_DIR, a.file)), `${a.key} → ${a.file}`).toBe(true);
    }
  });

  it('placeholders follow the PLACEHOLDER__<key>.<ext> convention', () => {
    for (const a of ASSET_MANIFEST.filter((m) => m.status === 'placeholder')) {
      const ext = a.kind === 'image' ? 'png' : 'wav';
      expect(a.file).toBe(`placeholder/PLACEHOLDER__${a.key}.${ext}`);
    }
  });

  it('every entry has a represents text and a replacement brief', () => {
    for (const a of ASSET_MANIFEST) {
      expect(a.represents.length, a.key).toBeGreaterThan(5);
      expect(a.replacementBrief.length, a.key).toBeGreaterThan(10);
    }
  });

  it('no stray placeholder files exist on disk', () => {
    const expected = new Set(ASSET_MANIFEST.map((a) => a.file));
    for (const f of readdirSync(join(ASSETS_DIR, 'placeholder'))) {
      expect(expected.has(`placeholder/${f}`), f).toBe(true);
    }
  });

  it('fitPx fits inside the image', () => {
    for (const key of Object.keys(IMAGE_ASSETS) as ImageKey[]) {
      expect(fitPx(key)).toBeLessThanOrEqual(IMAGE_ASSETS[key].size.w);
    }
  });
});

describe('generated placeholders are up to date (rerun npm run gen:placeholders)', () => {
  it('PNGs match their recipes pixel for pixel', () => {
    for (const [key, def] of Object.entries(IMAGE_ASSETS)) {
      const onDisk = PNG.sync.read(readFileSync(join(ASSETS_DIR, def.file)));
      expect([onDisk.width, onDisk.height], key).toEqual([def.size.w, def.size.h]);
      const fresh = renderImage(key as ImageKey, def.size.w, def.size.h).toRgba8();
      expect(Buffer.compare(onDisk.data, fresh), key).toBe(0);
    }
  });

  it('rendering is deterministic', () => {
    const a = renderImage('soldier_live', 64, 64).toPng();
    const b = renderImage('soldier_live', 64, 64).toPng();
    expect(Buffer.compare(a, b)).toBe(0);
    expect(Buffer.compare(renderSound('sfx_explosion'), renderSound('sfx_explosion'))).toBe(0);
  });

  it('WAVs match their recipes byte for byte', () => {
    for (const [key, def] of Object.entries(SOUND_ASSETS)) {
      const onDisk = readFileSync(join(ASSETS_DIR, def.file));
      expect(Buffer.compare(onDisk, renderSound(key as SoundKey)), key).toBe(0);
    }
  });

  it('sound recipe durations/loops match the manifest', () => {
    for (const [key, def] of Object.entries(SOUND_ASSETS)) {
      const r = SOUND_RECIPES[key as SoundKey];
      expect(r.durationMs, key).toBe(def.durationMs);
      expect(Boolean(r.loop), key).toBe(Boolean((def as { loop?: boolean }).loop));
    }
  });

  it('assets/ASSETS.md matches the manifest', () => {
    expect(readFileSync(join(ASSETS_DIR, 'ASSETS.md'), 'utf8')).toBe(buildAssetsMd());
  });
});

describe('code references assets by key only', () => {
  it('no source file outside the asset resolver mentions asset paths', () => {
    const allowed = new Set([
      'src/content/assets.ts',
      'src/render/assets/asset-urls.ts',
      'src/render/assets/resolve-asset-urls.ts',
    ]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|js)$/.test(e.name) && !e.name.endsWith('.test.ts')) {
          const rel = relative(ROOT, p).replace(/\\/g, '/');
          if (allowed.has(rel)) continue;
          const src = readFileSync(p, 'utf8');
          if (/PLACEHOLDER__|assets\/placeholder|['"`]\/assets\//.test(src)) offenders.push(rel);
        }
      }
    };
    walk(join(ROOT, 'src'));
    expect(offenders).toEqual([]);
  });
});
