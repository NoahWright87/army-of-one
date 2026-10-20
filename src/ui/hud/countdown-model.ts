/**
 * Countdown logic for the lead-in ([D5]/[D25]). Driven by remaining BATTLE TICKS (not wall
 * clock), so it stays in sync with the sim, pauses with it, and works for the frozen pre-battle
 * hold (where the caller just keeps decrementing its own counter).
 */
import { str } from '../../content/strings';
import { TICKS_PER_SECOND, type Tick } from '../../sim/core/time';

/** "5", "4", … "1" while ticks remain; the GO label at or below zero. */
export function countdownLabel(remainingTicks: Tick): string {
  if (remainingTicks <= 0) return str('countdown.go');
  return String(Math.ceil(remainingTicks / TICKS_PER_SECOND));
}

/** 0..1 progress through the current second (0 = number just appeared). For a pulse animation. */
export function countdownPhase(remainingTicks: Tick): number {
  if (remainingTicks <= 0) return 0;
  const r = remainingTicks % TICKS_PER_SECOND;
  return r === 0 ? 0 : 1 - r / TICKS_PER_SECOND;
}

export type CountdownCue = 'tick' | 'go' | null;

/** Remembers the last label so the caller can play a sound exactly once per number. */
export class CountdownTracker {
  private last: string | null = null;

  /** Pass null to clear (no countdown active). */
  update(remainingTicks: Tick | null): {
    label: string | null;
    changed: boolean;
    cue: CountdownCue;
  } {
    const label = remainingTicks === null ? null : countdownLabel(remainingTicks);
    const changed = label !== this.last;
    this.last = label;
    let cue: CountdownCue = null;
    if (changed && label !== null && remainingTicks !== null) {
      cue = remainingTicks <= 0 ? 'go' : 'tick';
    }
    return { label, changed, cue };
  }
}
