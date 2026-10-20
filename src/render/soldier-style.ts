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

export function soldierVisual(
  s: SoldierView,
  settings: SoldierStyleSettings,
  timeMs: number,
): SoldierVisual {
  const label = settings.echoLabels ? String(s.ordinal) : null;
  const base: SoldierVisual = {
    texture: 'soldier_echo',
    alpha: settings.echoOpacity,
    depth: DEPTH.echoes,
    liveMarker: false,
    shield: s.alive && s.leadIn,
    interruptedIcon: false,
    staticOverlay: 0,
    label,
  };
  if (!s.alive) {
    return {
      ...base,
      texture: 'soldier_corpse',
      alpha: 0.85,
      depth: DEPTH.corpses,
      shield: false,
      label: null,
    };
  }
  switch (s.role) {
    case 'live':
      return {
        ...base,
        texture: 'soldier_live',
        alpha: 1,
        depth: DEPTH.live,
        liveMarker: true,
        label: null,
      };
    case 'echo':
      return base;
    case 'interrupted':
      return { ...base, depth: DEPTH.interrupted, interruptedIcon: true };
    case 'static': {
      const n = settings.staticFlicker ? flickerNoise(s.ordinal, timeMs) : 0.5;
      return {
        ...base,
        texture: 'soldier_static',
        depth: DEPTH.static,
        alpha: settings.staticFlicker ? 0.25 + n * 0.45 : 0.45,
        staticOverlay: settings.staticFlicker
          ? 0.35 + 0.5 * flickerNoise(s.ordinal + 101, timeMs, 45)
          : 0.4,
      };
    }
  }
}
