/**
 * The ONLY place that knows where asset files live. Vite bundles every file under /assets
 * (eager `?url` imports), and we map manifest keys to the resulting URLs.
 */
import { ASSET_MANIFEST, type AssetKey } from '../../content/assets';
import { resolveAssetUrls } from './resolve-asset-urls';

const files = import.meta.glob('/assets/**/*.{png,wav,ogg,mp3,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const resolved = resolveAssetUrls(ASSET_MANIFEST, files);
if (resolved.missing.length) {
  console.warn(`Assets missing from bundle: ${resolved.missing.join(', ')}`);
}

export function assetUrl(key: AssetKey): string {
  const u = resolved.urls.get(key);
  if (!u) throw new Error(`No URL for asset ${key}`);
  return u;
}
