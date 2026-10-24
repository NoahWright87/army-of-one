/**
 * Fixed-timestep accumulator: the sim steps at exactly 60 Hz regardless of display refresh rate.
 * Pure logic so it can be unit-tested; the scene calls `advance` once per rendered frame.
 *
 * Catch-up (06-c): a frame never runs more than `maxSteps` sim steps. The backlog (up to
 * `MAX_BACKLOG_MS` of battle time) carries over and is caught up a few steps per frame, so
 * frame-time jitter on a slow machine doesn't lose battle time; anything beyond that (a real
 * hitch: tab switch, long GC) is dropped instead of being replayed as a burst of steps in one
 * frame, which would make that frame slow too.
 */
export interface FixedStepper {
  /** Accumulated, not-yet-simulated time in ms. */
  accumulatorMs: number;
  readonly stepMs: number;
  /** Default max steps per frame; beyond this we drop time instead of spiralling. */
  readonly maxStepsPerFrame: number;
}

/** Frame times above this are treated as a hitch and clamped (ms of real time). */
export const MAX_FRAME_MS = 250;
/** Most not-yet-simulated battle time carried into later frames (ms). */
export const MAX_BACKLOG_MS = 200;

export function createFixedStepper(ticksPerSecond: number, maxStepsPerFrame = 8): FixedStepper {
  return { accumulatorMs: 0, stepMs: 1000 / ticksPerSecond, maxStepsPerFrame };
}

/**
 * Adds `frameMs` (scaled by `speed`) and returns how many sim steps to run now, plus the
 * interpolation alpha in [0, 1) for rendering between the last two sim states.
 */
export function advance(
  s: FixedStepper,
  frameMs: number,
  speed = 1,
  maxSteps = s.maxStepsPerFrame,
): { steps: number; alpha: number } {
  const cap = Math.max(1, Math.floor(maxSteps));
  s.accumulatorMs += Math.min(Math.max(0, frameMs), MAX_FRAME_MS) * speed;
  const steps = Math.min(cap, Math.floor(s.accumulatorMs / s.stepMs));
  s.accumulatorMs -= steps * s.stepMs;
  // Carry a bounded backlog (caught up over the next frames); drop the rest.
  const backlog = Math.max(MAX_BACKLOG_MS * speed, s.stepMs);
  if (s.accumulatorMs > backlog) s.accumulatorMs = backlog;
  return { steps, alpha: Math.min(s.accumulatorMs / s.stepMs, 0.999) };
}

/** (06-c) Steps allowed per frame: the setting, scaled by sim speed (4× needs 4× the steps). */
export function catchUpCap(maxCatchUpSteps: number, speed: number): number {
  return Math.max(1, Math.ceil(maxCatchUpSteps * Math.max(1, speed)));
}
