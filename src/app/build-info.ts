/**
 * Which build is this? Version, commit, branch and when it was built, stamped in by Vite
 * (`__AOO_BUILD__`, vite.config.ts). Shown on the HQ's build sign so a tester can tell a stale
 * preview from a fresh one. Tests and tools have no stamp: everything reads "unknown".
 */
export interface BuildInfo {
  version: string;
  sha: string;
  branch: string;
  /** ISO timestamp (UTC) of the build. */
  time: string;
}

declare const __AOO_BUILD__: BuildInfo | undefined;

export function buildInfo(): BuildInfo {
  const b = typeof __AOO_BUILD__ === 'object' ? __AOO_BUILD__ : undefined;
  return {
    version: b?.version || 'unknown',
    sha: b?.sha || 'unknown',
    branch: b?.branch || 'unknown',
    time: b?.time || '',
  };
}

/** The build time in the viewer's own time zone ("Nov 26, 2026, 1:07 AM"), or "unknown". */
export function formatBuildTime(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return 'unknown';
  return d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

/** The same moment in UTC ("UTC 2026-11-26 01:07"), to compare with a CI log. */
export function formatBuildUtc(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  return `UTC ${d.toISOString().slice(0, 16).replace('T', ' ')}`;
}
