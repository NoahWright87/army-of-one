/**
 * Battle time. The sim advances in fixed integer ticks; never accumulate float seconds in sim logic.
 */
export type Tick = number;

export const TICKS_PER_SECOND = 60;

/** Fixed sim step in seconds (for converting per-second tuning values to per-tick). */
export const DT = 1 / TICKS_PER_SECOND;

export function ticksToSeconds(ticks: Tick): number {
  return ticks / TICKS_PER_SECOND;
}

/** Converts seconds to ticks, rounding to the nearest tick (half rounds up). */
export function secondsToTicks(seconds: number): Tick {
  return Math.round(seconds * TICKS_PER_SECOND);
}

/** "m:ss" for battle clocks and timeline labels. Negative ticks render with a leading "-". */
export function formatBattleTime(tick: Tick): string {
  const sign = tick < 0 ? '-' : '';
  const totalSeconds = Math.floor(Math.abs(tick) / TICKS_PER_SECOND);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${sign}${minutes}:${seconds.toString().padStart(2, '0')}`;
}
