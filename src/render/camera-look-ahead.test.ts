import { describe, expect, it } from 'vitest';
import { CAMERA, CLASS_LOOK } from '../content/camera';
import {
  AIM_PAN,
  capLookAhead,
  lookAheadOffset,
  lookReach,
  lookView,
  phoneFitZoom,
} from './camera-look-ahead';

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

  it('aim pans in proportion to how far out the cursor is, capped at the distance', () => {
    expect(lookAheadOffset('aim', 200, Math.PI / 2, 100).y).toBeCloseTo(100 * AIM_PAN);
    expect(lookAheadOffset('aim', 200, Math.PI / 2, 10_000).y).toBeCloseTo(200);
    // South is as visible as north.
    expect(lookAheadOffset('aim', 200, -Math.PI / 2, 10_000).y).toBeCloseTo(-200);
  });

  it('look reach: weapon range, never under a rifle, more still / braced / set up', () => {
    const base = { range: 340, look: CLASS_LOOK.shield, still: false, braced: false, setUp: false };
    expect(lookReach(base)).toBe(CAMERA.minReach);
    const sn = { ...base, range: 900, look: CLASS_LOOK.sniper };
    expect(lookReach({ ...sn, still: true, braced: true, setUp: true })).toBeGreaterThan(
      lookReach(sn) * 1.3,
    );
  });

  it('look view: pans toward the aim to the reach, zooms in only at the far end, per class', () => {
    const v = {
      range: 520,
      look: CLASS_LOOK.rifleman,
      still: false,
      braced: false,
      setUp: false,
      aim: -Math.PI / 2,
      viewW: 390,
      viewH: 700,
      baseZoom: phoneFitZoom(390, 700),
    };
    const near = lookView({ ...v, aimDistance: 50 });
    const far = lookView({ ...v, aimDistance: 5000 });
    expect(near.zoom).toBeCloseTo(v.baseZoom);
    expect(far.offset.y).toBeLessThan(near.offset.y);
    // At full aim the screen's top edge reaches the rifle's range.
    const half = 700 / 2 / far.zoom;
    expect(-far.offset.y + half).toBeGreaterThanOrEqual(519);
    // A sniper zooms much more than a rifleman, an MG a little.
    const zs = (look: typeof v.look) =>
      lookView({ ...v, look, aimDistance: 1e5 }).zoom / v.baseZoom;
    expect(zs(CLASS_LOOK.sniper)).toBeGreaterThan(2);
    expect(zs(CLASS_LOOK.gunner)).toBeGreaterThan(1.1);
    expect(zs(CLASS_LOOK.rifleman)).toBeLessThan(1.1);
  });

  it('aiming across a portrait phone, the camera keeps the aim point on screen', () => {
    const v = {
      range: 560,
      look: CLASS_LOOK.gunner,
      still: true,
      braced: true,
      setUp: true,
      aim: 0, // east: the narrow way
      aimDistance: 640,
      viewW: 390,
      viewH: 700,
      baseZoom: phoneFitZoom(390, 700),
    };
    const r = lookView(v);
    const half = 390 / 2 / r.zoom;
    expect(640 - r.offset.x).toBeLessThan(half); // the reticle is inside the screen
    expect(r.offset.x).toBeLessThan(half); // and so is the soldier (zoomed out to fit)
  });

  it('phones zoom out so a rifleman sees his range; big screens stay at 1', () => {
    expect(phoneFitZoom(390, 844)).toBeLessThan(0.7);
    expect(phoneFitZoom(1280, 760)).toBe(1);
  });
});
