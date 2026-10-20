/**
 * Fixed quantization steps for recorded soldier state. PHASE03-a snaps soldier position/facing to
 * these steps every tick, so recordings hold exact multiples and the persistence codec can store
 * them losslessly as small integers. Powers of two keep `n * QUANTUM` exact in floating point.
 */
export const POSITION_QUANTUM = 1 / 256;
export const FACING_QUANTUM = 1 / 4096;

export const quantizePosition = (v: number): number =>
  Math.round(v / POSITION_QUANTUM) * POSITION_QUANTUM + 0; // + 0 turns -0 into 0
export const quantizeFacing = (v: number): number =>
  Math.round(v / FACING_QUANTUM) * FACING_QUANTUM + 0;
