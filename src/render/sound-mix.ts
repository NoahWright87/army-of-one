/** Pure audio mixing rules: distance attenuation and per-key throttling (crowds of echoes). */

/** 1 within `near`, fading linearly to 0 at `far`. */
export function distanceGain(distance: number, near = 350, far = 1400): number {
  if (distance <= near) return 1;
  if (distance >= far) return 0;
  return 1 - (distance - near) / (far - near);
}

/**
 * Limits how often the same sound can start: at most `maxPerWindow` plays per `windowMs` per
 * key. Twenty echoes firing on the same tick should not be twenty times as loud.
 */
export class SoundThrottle {
  private readonly recent = new Map<string, number[]>();

  constructor(
    private readonly windowMs = 60,
    private readonly maxPerWindow = 3,
  ) {}

  allow(key: string, nowMs: number): boolean {
    const list = (this.recent.get(key) ?? []).filter((t) => nowMs - t < this.windowMs);
    if (list.length >= this.maxPerWindow) {
      this.recent.set(key, list);
      return false;
    }
    list.push(nowMs);
    this.recent.set(key, list);
    return true;
  }
}

export function effectiveVolume(master: number, muted: boolean, gain: number): number {
  if (muted) return 0;
  return Math.max(0, Math.min(1, master * gain));
}
