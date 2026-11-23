/**
 * Pause state for a live battle: running → paused → resuming (short countdown) → running.
 * Pure logic. The scene asks `tick(deltaMs)` once per frame and only steps the sim when it
 * returns true, so a pause costs no battle time and nothing is recorded while it lasts.
 */

/** TUNE: grace after resuming, so the player can get their hands back before time moves (ms). */
export const RESUME_GRACE_MS = 1500;
/** Each number in the resume countdown shows for this long (ms). */
const RESUME_STEP_MS = 500;

export type PauseState = 'running' | 'paused' | 'resuming';

export class PauseModel {
  private st: PauseState = 'running';
  private graceLeftMs = 0;

  get state(): PauseState {
    return this.st;
  }

  get paused(): boolean {
    return this.st === 'paused';
  }

  /** The sim must not advance (paused, or counting back in). */
  get holding(): boolean {
    return this.st !== 'running';
  }

  /** Back to running (a new scene run). */
  reset(): void {
    this.st = 'running';
    this.graceLeftMs = 0;
  }

  /** Pauses at once (idempotent). Also cancels a resume countdown in progress. */
  pause(): void {
    this.st = 'paused';
    this.graceLeftMs = 0;
  }

  /** Starts the resume countdown (no-op unless paused). */
  resume(): void {
    if (this.st !== 'paused') return;
    this.st = 'resuming';
    this.graceLeftMs = RESUME_GRACE_MS;
  }

  /** Pause when running or resuming, resume when paused. */
  toggle(): void {
    if (this.st === 'paused') this.resume();
    else this.pause();
  }

  /** Advances the resume countdown by one frame. Returns true when the sim may step this frame. */
  tick(deltaMs: number): boolean {
    if (this.st === 'resuming') {
      this.graceLeftMs -= Math.max(0, deltaMs);
      if (this.graceLeftMs <= 0) {
        this.st = 'running';
        this.graceLeftMs = 0;
      }
      return false; // the frame the countdown ends still draws still: the next one steps
    }
    return this.st === 'running';
  }

  /** The resume countdown number to show (3, 2, 1), or null. */
  get countdownLabel(): number | null {
    return this.st === 'resuming'
      ? Math.max(1, Math.ceil(this.graceLeftMs / RESUME_STEP_MS))
      : null;
  }
}
