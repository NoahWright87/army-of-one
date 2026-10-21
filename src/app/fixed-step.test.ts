import { describe, expect, it } from 'vitest';
import { advance, createFixedStepper } from './fixed-step';

describe('fixed stepper', () => {
  it('steps at the fixed rate independent of frame time', () => {
    const s = createFixedStepper(60);
    let total = 0;
    for (let i = 0; i < 144; i++) total += advance(s, 1000 / 144).steps; // 1s at 144 Hz
    expect(total).toBeGreaterThanOrEqual(59);
    expect(total).toBeLessThanOrEqual(60);
  });
  it('caps catch-up steps', () => {
    const s = createFixedStepper(60, 4);
    expect(advance(s, 200).steps).toBe(4);
    expect(s.accumulatorMs).toBe(0);
  });
  it('reports interpolation alpha', () => {
    const s = createFixedStepper(60);
    const { steps, alpha } = advance(s, (1000 / 60) * 1.5);
    expect(steps).toBe(1);
    expect(alpha).toBeCloseTo(0.5);
  });
});
