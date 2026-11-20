import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import type { TouchControls } from '../../ui/touch/touch-controls';
import { TouchInput } from './touch-input';

/** A stand-in for the on-screen controls: a 400 × 800 portrait screen. */
function fakeControls() {
  const c = {
    move: { x: 0, y: 0 },
    aim: null,
    tap: null as { x: number; y: number } | null,
    drag: null as null | {
      id: number;
      start: { x: number; y: number };
      fingerStart: { x: number; y: number };
      finger: { x: number; y: number };
    },
    fireHeld: false,
    sprintHeld: false,
    interactLatch: { consume: () => false },
    screenHalf: () => ({ x: 200, y: 400 }),
    setInteractVisible: () => {},
  };
  return c;
}

describe('touch aiming by share of the screen (PHASE18, [D158])', () => {
  it("half the screen's short side reaches the full reach, sideways or up", () => {
    const c = fakeControls();
    const reach = 800;
    // The camera is centred on the soldier at (0, 0), 1 world unit per px.
    const input = new TouchInput(c as unknown as TouchControls, {
      tuning: DEFAULT_TUNING,
      toWorld: (x, y) => ({ x: x - 200, y: y - 400 }),
      aimReach: () => reach,
    });
    const me = { x: 0, y: 0 };
    // Grab right on the soldier, drag to the right edge (200 px): the full reach east.
    c.drag = {
      id: 1,
      start: { x: 200, y: 400 },
      fingerStart: { x: 200, y: 400 },
      finger: { x: 200, y: 400 },
    };
    input.read(me);
    c.drag = { ...c.drag, finger: { x: 400, y: 400 } };
    const east = input.read(me);
    expect(east.aim).toBeCloseTo(0);
    expect(east.aimDistance).toBeCloseTo(reach);
    // A new drag the same 200 px up: the same reach north.
    c.drag = {
      id: 2,
      start: { x: 200, y: 400 },
      fingerStart: { x: 200, y: 400 },
      finger: { x: 200, y: 200 },
    };
    const north = input.read(me);
    expect(north.aim).toBeCloseTo(-Math.PI / 2);
    expect(north.aimDistance).toBeCloseTo(reach);
  });

  it('starts where the reticle was: grabbing it without moving changes nothing', () => {
    const c = fakeControls();
    const input = new TouchInput(c as unknown as TouchControls, {
      tuning: DEFAULT_TUNING,
      toWorld: (x, y) => ({ x: x - 200, y: y - 400 }),
      aimReach: () => 800,
    });
    const p = { x: 300, y: 250 }; // reticle 100 east, 150 north of the soldier
    c.drag = { id: 1, start: p, fingerStart: { x: 310, y: 260 }, finger: { x: 310, y: 260 } };
    const r = input.read({ x: 0, y: 0 });
    expect(r.aim).toBeCloseTo(Math.atan2(-150, 100));
    expect(r.aimDistance).toBeCloseTo(Math.hypot(100, 150));
  });

  it('the aim goes the way the finger goes, at any angle', () => {
    const c = fakeControls();
    const input = new TouchInput(c as unknown as TouchControls, {
      tuning: DEFAULT_TUNING,
      toWorld: (x, y) => ({ x: x - 200, y: y - 400 }),
      aimReach: () => 1300,
    });
    for (const [dx, dy] of [
      [60, -110],
      [-90, -40],
      [30, 140],
    ] as const) {
      c.drag = {
        id: dx * 1000 + dy,
        start: { x: 200, y: 400 },
        fingerStart: { x: 200, y: 400 },
        finger: { x: 200 + dx, y: 400 + dy },
      };
      expect(input.read({ x: 0, y: 0 }).aim).toBeCloseTo(Math.atan2(dy, dx));
    }
  });
});
