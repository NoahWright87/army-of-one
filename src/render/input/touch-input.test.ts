import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import type { TouchControls } from '../../ui/touch/touch-controls';
import { TouchInput } from './touch-input';

function fakeControls() {
  return {
    move: { x: 0, y: 0 },
    aim: null,
    tap: null as { x: number; y: number } | null,
    fireHeld: false,
    sprintHeld: false,
    interactLatch: { consume: () => false },
    setInteractVisible: () => {},
  };
}

describe('touch aiming (PHASE18, [D158])', () => {
  it('the reticle is right under the finger, at any angle and distance', () => {
    const c = fakeControls();
    // Camera: 2 world units per px, the soldier at the screen centre (200, 400).
    const input = new TouchInput(c as unknown as TouchControls, {
      tuning: DEFAULT_TUNING,
      toWorld: (x, y) => ({ x: (x - 200) * 2, y: (y - 400) * 2 }),
    });
    for (const [fx, fy] of [
      [380, 120],
      [20, 390],
      [260, 760],
    ] as const) {
      c.tap = { x: fx, y: fy };
      input.read({ x: 0, y: 0 });
      const r = input.pointerWorld()!;
      expect(r.x).toBeCloseTo((fx - 200) * 2);
      expect(r.y).toBeCloseTo((fy - 400) * 2);
    }
  });

  it('letting go brings the reticle back to its walking distance, same direction', () => {
    const c = fakeControls();
    const input = new TouchInput(c as unknown as TouchControls, {
      tuning: DEFAULT_TUNING,
      toWorld: (x, y) => ({ x: (x - 200) * 2, y: (y - 400) * 2 }),
    });
    c.tap = { x: 380, y: 400 }; // far east
    input.read({ x: 0, y: 0 });
    expect(input.pointerWorld()!.x).toBeCloseTo(360);
    c.tap = null;
    const r = input.read({ x: 0, y: 0 });
    expect(r.aim).toBeCloseTo(0);
    const p = input.pointerWorld()!;
    expect(p.x).toBeLessThan(360);
    expect(p.x).toBeGreaterThan(0);
  });
});
