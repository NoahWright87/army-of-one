/**
 * How each soldier role/state looks (design doc §11: readability first). Pure, so the rules
 * are unit-tested and a future 3D renderer can reuse them.
 */
import type { ImageKey } from '../content/assets';
import type { SoldierView } from '../sim/view';
import { DEPTH } from './depth';

export interface SoldierStyleSettings {
  echoOpacity: number;
  echoLabels: boolean;
  staticFlicker: boolean;
  /** (05-b) Fade every non-live soldier back (army readability, design doc §14). */
  dimEchoes?: boolean;
  /** Opacity dimmed echoes are drawn at (static figures and corpses scale with it). */
  dimEchoesLevel?: number;
}

export interface SoldierVisual {
  texture: ImageKey;
  alpha: number;
  depth: number;
  /** Ground ring under the live soldier. */
  liveMarker: boolean;
  /** Lead-in shield ring ([D5]). */
  shield: boolean;
  /** "!" icon for interrupted echoes ([D24]). */
  interruptedIcon: boolean;
  /** TV-static overlay alpha (0 = none). */
  staticOverlay: number;
  /** Small ordinal label, or null. */
  label: string | null;
}

/** Deterministic flicker in [0, 1) that changes every ~60 ms, different per soldier. */
export function flickerNoise(seed: number, timeMs: number, periodMs = 60): number {
  let h =
    Math.imul(Math.floor(timeMs / periodMs) + 1, 0x9e3779b1) ^ Math.imul(seed + 7, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * How soldier `s` looks this frame. Pass `out` to fill (and get back) a reused object instead of
 * allocating one: the renderer calls this for every soldier every frame (06-c).
 */
export function soldierVisual(
  s: SoldierView,
  settings: SoldierStyleSettings,
  timeMs: number,
  out: SoldierVisual = emptyVisual(),
): SoldierVisual {
  const v = baseVisual(s, settings, timeMs, out);
  if (!settings.dimEchoes || (s.alive && s.role === 'live')) return v;
  // Dimmed: the live soldier (and incoming fire, drawn separately) stays the brightest thing.
  const level = settings.dimEchoesLevel ?? 0.25;
  const k = Math.min(1, level / Math.max(0.01, settings.echoOpacity));
  v.alpha = s.alive ? v.alpha * k : Math.min(v.alpha, level);
  v.staticOverlay = v.staticOverlay * k;
  v.label = null;
  return v;
}

export function emptyVisual(): SoldierVisual {
  return {
    texture: 'soldier_echo',
    alpha: 1,
    depth: DEPTH.echoes,
    liveMarker: false,
    shield: false,
    interruptedIcon: false,
    staticOverlay: 0,
    label: null,
  };
}

/** Echo ordinal labels as strings, cached (no per-frame number → string conversion). */
const ORDINAL_LABELS: string[] = [];
function ordinalLabel(n: number): string {
  return (ORDINAL_LABELS[n] ??= String(n));
}

function baseVisual(
  s: SoldierView,
  settings: SoldierStyleSettings,
  timeMs: number,
  v: SoldierVisual,
): SoldierVisual {
  v.texture = 'soldier_echo';
  v.alpha = settings.echoOpacity;
  v.depth = DEPTH.echoes;
  v.liveMarker = false;
  v.shield = s.alive && s.leadIn;
  v.interruptedIcon = false;
  v.staticOverlay = 0;
  v.label = settings.echoLabels ? ordinalLabel(s.ordinal) : null;
  if (!s.alive) {
    v.texture = 'soldier_corpse';
    v.alpha = 0.85;
    v.depth = DEPTH.corpses;
    v.shield = false;
    v.label = null;
    return v;
  }
  switch (s.role) {
    case 'live':
      v.texture = 'soldier_live';
      v.alpha = 1;
      v.depth = DEPTH.live;
      v.liveMarker = true;
      v.label = null;
      return v;
    case 'echo':
      return v;
    case 'interrupted':
      v.depth = DEPTH.interrupted;
      v.interruptedIcon = true;
      return v;
    case 'static': {
      const n = settings.staticFlicker ? flickerNoise(s.ordinal, timeMs) : 0.5;
      v.texture = 'soldier_static';
      v.depth = DEPTH.static;
      v.alpha = settings.staticFlicker ? 0.25 + n * 0.45 : 0.45;
      v.staticOverlay = settings.staticFlicker
        ? 0.35 + 0.5 * flickerNoise(s.ordinal + 101, timeMs, 45)
        : 0.4;
      return v;
    }
  }
}
