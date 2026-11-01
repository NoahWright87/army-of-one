/** Pure: matches manifest entries to bundler-provided URLs (see asset-urls.ts). */
import type { AssetEntry, AssetKey } from '../../content/assets';

export interface ResolvedAssets {
  urls: Map<AssetKey, string>;
  /** Manifest keys whose file the bundler did not provide (should be empty). */
  missing: AssetKey[];
}

/**
 * @param globbed map from "/assets/<file>" (as import.meta.glob reports it) to a served URL.
 */
export function resolveAssetUrls(
  manifest: readonly AssetEntry[],
  globbed: Readonly<Record<string, string>>,
  prefix = '/assets/',
): ResolvedAssets {
  const urls = new Map<AssetKey, string>();
  const missing: AssetKey[] = [];
  for (const a of manifest) {
    const url = globbed[prefix + a.file];
    if (url) urls.set(a.key, url);
    else missing.push(a.key);
  }
  return { urls, missing };
}
