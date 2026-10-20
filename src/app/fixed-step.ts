/**
 * Fixed-timestep accumulator: the sim steps at exactly 60 Hz regardless of display refresh rate.
 * Pure logic so it can be unit-tested; the scene calls `advance` once per rendered frame.
 */
export interface FixedStepper {
  /** Accumulated, not-yet-simulated time in ms. */
  accumulatorMs: number;
  readonly stepMs: number;
  /** Max steps per frame; beyond this we drop time instead of spiralling. */
  readonly maxStepsPerFrame: number;
}

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
): { steps: number; alpha: number } {
  s.accumulatorMs += Math.min(frameMs, 250) * speed;
  let steps = Math.floor(s.accumulatorMs / s.stepMs);
  if (steps > s.maxStepsPerFrame) {
    steps = s.maxStepsPerFrame;
    s.accumulatorMs = 0;
  } else {
    s.accumulatorMs -= steps * s.stepMs;
  }
  return { steps, alpha: s.accumulatorMs / s.stepMs };
}
