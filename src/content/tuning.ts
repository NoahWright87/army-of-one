/**
 * Every gameplay number lives here. Values marked `// TUNE` are first guesses meant to be
 * adjusted by feel. The sim receives a `Tuning` object explicitly (never imports a global), so
 * tests, headless tools and the in-game settings panel can all run with different values.
 *
 * Units: distances in world units (≈ px at zoom 1), speeds in units/second, times in seconds
 * unless the name says Ticks.
 */
export interface Tuning {
  soldier: {
    maxHp: number;
    /** Walking speed, units/second. */
    speed: number;
    /** Visual size of the sprite ([D14]: largest). */
    spriteRadius: number;
    /** Damage hitbox ([D14]: a bit smaller than the sprite). */
    hitboxRadius: number;
    /** Tiny soldier-vs-soldier blocker so soldiers can't fully overlap ([D14]). */
    blockerRadius: number;
    /** Radius used against walls and other static geometry. */
    wallRadius: number;
  };
}

export const DEFAULT_TUNING: Tuning = {
  soldier: {
    maxHp: 100, // TUNE
    speed: 150, // TUNE
    spriteRadius: 16, // TUNE
    hitboxRadius: 11, // TUNE
    blockerRadius: 4, // TUNE
    wallRadius: 10, // TUNE
  },
};

/** Deep-merges partial overrides onto a tuning object (used by tests and the settings panel). */
export function withTuning(base: Tuning, overrides: DeepPartial<Tuning>): Tuning {
  return deepMerge(base, overrides) as Tuning;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function deepMerge(base: unknown, over: unknown): unknown {
  if (over === undefined) return structuredClone(base);
  if (typeof base !== 'object' || base === null || typeof over !== 'object' || over === null) {
    return over;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over)) {
    out[k] = deepMerge((base as Record<string, unknown>)[k], v);
  }
  return out;
}
