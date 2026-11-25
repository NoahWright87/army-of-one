/**
 * (PHASE18) Sarge's script, as the player/author has it: the default (`content/sarge-script.ts`)
 * unless they edited it in the in-game editor, in which case their copy is kept in localStorage.
 */
import { DEFAULT_SARGE_SCRIPT, type SargeScript } from '../content/sarge-script';
import type { TextStorage } from './replay-library';

export const SARGE_SCRIPT_KEY = 'aoo:bt:script:v2';
const KEY = SARGE_SCRIPT_KEY;

interface Saved {
  script: SargeScript;
  /** Fingerprint of the default this was edited from: if the default has since changed, say so. */
  base: string;
}

/** A short fingerprint of a script (djb2 of its JSON). */
export function fingerprint(s: SargeScript): string {
  const text = JSON.stringify(s);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Is this the shape of a script (enough that the director won't crash on it)? */
export function parseScript(json: string): SargeScript | string {
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    return "That isn't valid JSON.";
  }
  const s = v as Partial<SargeScript> | null;
  if (!s || s.version !== 2) return 'Not a Sarge script (version should be 2).';
  if (
    !s.timing ||
    !Array.isArray(s.zones) ||
    !Array.isArray(s.flags) ||
    !Array.isArray(s.prefs) ||
    !Array.isArray(s.rules) ||
    typeof s.gateDelays !== 'object' ||
    !s.gateDelays
  ) {
    return 'The script needs timing, zones, flags, gateDelays, prefs and rules.';
  }
  for (const r of s.rules) {
    if (typeof r.id !== 'string' || typeof r.when !== 'string' || !Array.isArray(r.steps)) {
      return `A rule is malformed (${JSON.stringify(r).slice(0, 60)}…).`;
    }
  }
  return s as SargeScript;
}

export interface LoadedScript {
  script: SargeScript;
  /** The edited copy is in use. */
  edited: boolean;
  /** …and the default has changed since it was made. */
  outdated: boolean;
}

export function loadScript(storage: TextStorage | null): LoadedScript {
  const fallback = (): LoadedScript => ({
    script: structuredClone(DEFAULT_SARGE_SCRIPT),
    edited: false,
    outdated: false,
  });
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return fallback();
    const saved = JSON.parse(raw) as Saved;
    const parsed = parseScript(JSON.stringify(saved.script));
    if (typeof parsed === 'string') return fallback();
    return {
      script: parsed,
      edited: true,
      outdated: saved.base !== fingerprint(DEFAULT_SARGE_SCRIPT),
    };
  } catch {
    return fallback();
  }
}

export function saveScript(storage: TextStorage | null, script: SargeScript): void {
  try {
    const saved: Saved = { script, base: fingerprint(DEFAULT_SARGE_SCRIPT) };
    storage?.setItem(KEY, JSON.stringify(saved));
  } catch {
    // this visit only
  }
}

/** Throws the edits away: the default again. */
export function clearScript(
  storage: (TextStorage & { removeItem?(k: string): void }) | null,
): void {
  try {
    storage?.removeItem?.(KEY);
  } catch {
    // nothing to do
  }
}
