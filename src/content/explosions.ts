/** Overhead VFX sheets: variations in rows, sequential frames in columns. */
export const EXPLOSION_SHEETS = {
  small: {
    key: 'fx_explosion_small',
    file: 'effects/explosion_small.png',
    frameWidth: 128,
    frameHeight: 128,
    columns: 8,
    rows: 3,
    frameRate: 20,
  },
  large: {
    key: 'fx_explosion_large',
    file: 'effects/explosion_large.png',
    frameWidth: 256,
    frameHeight: 256,
    columns: 8,
    rows: 3,
    frameRate: 14,
  },
} as const;

export type ExplosionSize = keyof typeof EXPLOSION_SHEETS;

export function explosionAnimationKey(size: ExplosionSize, variation: number): string {
  return `${EXPLOSION_SHEETS[size].key}_row_${variation}`;
}

export function explosionFrames(size: ExplosionSize, variation: number): number[] {
  const spec = EXPLOSION_SHEETS[size];
  if (!Number.isInteger(variation) || variation < 0 || variation >= spec.rows) {
    throw new Error(`Invalid ${size} explosion variation: ${variation}`);
  }
  return Array.from({ length: spec.columns }, (_, i) => variation * spec.columns + i);
}

/** Stable across replays; this never consumes simulation RNG. */
export function explosionVariation(id: string, tick: number, size: ExplosionSize): number {
  let hash = tick >>> 0;
  for (let i = 0; i < id.length; i++) hash = (Math.imul(hash, 31) + id.charCodeAt(i)) >>> 0;
  return hash % EXPLOSION_SHEETS[size].rows;
}

export function explosionDurationMs(size: ExplosionSize): number {
  const spec = EXPLOSION_SHEETS[size];
  return (spec.columns / spec.frameRate) * 1000;
}
