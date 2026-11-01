import { describe, expect, it } from 'vitest';
import { capLookAhead, lookAheadOffset } from './camera-look-ahead';

describe('camera look-ahead (06-a)', () => {
  it('off centres, up looks up the map, aim looks along the aim, upAim blends both', () => {
    expect(lookAheadOffset('off', 200, 0)).toEqual({ x: 0, y: 0 });
    expect(lookAheadOffset('up', 200, 0)).toEqual({ x: 0, y: -200 });
    const aim = lookAheadOffset('aim', 200, 0);
    expect(aim.x).toBeCloseTo(200);
    expect(aim.y).toBeCloseTo(0);
    const both = lookAheadOffset('upAim', 200, 0);
    expect(both.x).toBeCloseTo(100);
    expect(both.y).toBeCloseTo(-200);
    // Aiming back down with upAim still looks forward (half as far).
    expect(lookAheadOffset('upAim', 200, Math.PI / 2).y).toBeCloseTo(-100);
    expect(lookAheadOffset('unknown', 200, 0)).toEqual({ x: 0, y: 0 });
  });

  it('is capped so the soldier stays on screen', () => {
    expect(capLookAhead({ x: 0, y: -500 }, 640, 360)).toEqual({ x: 0, y: -288 });
    expect(capLookAhead({ x: 900, y: 10 }, 640, 360)).toEqual({ x: 512, y: 10 });
  });
});
