/**
 * (aim test) A still hand must mean a still aim point. The old look ('world') reads the aim's
 * world distance through the moving camera, so the reticle creeps outward with the cursor still;
 * the 'screen' look depends only on where the cursor is on screen.
 */
import { describe, expect, it } from 'vitest';
import { CAMERA, CLASS_LOOK } from '../content/camera';
import { dragGainFor } from '../app/game-settings';
import {
  clampCameraCentre,
  lookView,
  screenAimWorld,
  screenLookView,
  type ScreenLookState,
} from './camera-look-ahead';
import { smoothFollow } from './interp';

const W = 1280;
const H = 720;
const FRAME_MS = 1000 / 60;
const MAP = 40_000;
const pos = { x: 20_000, y: 20_000 };
/** A scoped Sniper: the case that crept the most. */
const sniper: Omit<ScreenLookState, 'u'> = {
  range: 900,
  look: CLASS_LOOK.sniper,
  still: true,
  braced: true,
  setUp: true,
  scope: true,
  viewW: W,
  viewH: H,
  baseZoom: 1,
};
/** The cursor held still near the top-right of the screen. */
const hand = { x: 1180, y: 120 };

function zoomStep(now: number, goal: number): number {
  return now + (goal - now) * (1 - Math.exp((-FRAME_MS / 1000) * CAMERA.zoomEase));
}

/** The world point under a screen point for a camera centred on `cam` at `zoom`. */
function under(cam: { x: number; y: number }, zoom: number, p: { x: number; y: number }) {
  return { x: cam.x + (p.x - W / 2) / zoom, y: cam.y + (p.y - H / 2) / zoom };
}

describe('steady aim (aim test)', () => {
  it('the old look creeps: the aim point moves for seconds with the hand still', () => {
    let cam = { ...pos };
    let zoom = 1;
    const aims: { x: number; y: number }[] = [];
    for (let f = 0; f < 180; f++) {
      const a = under(cam, zoom, hand);
      aims.push(a);
      const v = lookView({
        ...sniper,
        aim: Math.atan2(a.y - pos.y, a.x - pos.x),
        aimDistance: Math.hypot(a.x - pos.x, a.y - pos.y),
      });
      cam = smoothFollow(cam, { x: pos.x + v.offset.x, y: pos.y + v.offset.y }, 0.85, FRAME_MS);
      zoom = zoomStep(zoom, v.zoom);
    }
    const a30 = aims[30]!;
    const a179 = aims[179]!;
    // Half a second after the hand stopped, the aim is still far from where it ends up.
    expect(Math.hypot(a179.x - a30.x, a179.y - a30.y)).toBeGreaterThan(30);
  });

  it('screen look: the aim point is fixed from the first frame, and the view settles under it', () => {
    const fixed = screenAimWorld(pos, sniper, hand.x, hand.y, MAP, MAP);
    let cam = { ...pos };
    let zoom = 1;
    for (let f = 0; f < 180; f++) {
      // Locked to the world: the same point every frame (a pure function of the hand).
      expect(screenAimWorld(pos, sniper, hand.x, hand.y, MAP, MAP)).toEqual(fixed);
      const u = { x: (hand.x - W / 2) / (W / 2), y: (hand.y - H / 2) / (H / 2) };
      const v = screenLookView({ ...sniper, u });
      cam = smoothFollow(cam, { x: pos.x + v.offset.x, y: pos.y + v.offset.y }, 0.85, FRAME_MS);
      zoom = zoomStep(zoom, v.zoom);
    }
    // Once the camera has settled, the cursor sits exactly on the locked aim point.
    const settled = under(cam, zoom, hand);
    expect(settled.x).toBeCloseTo(fixed.x, 0);
    expect(settled.y).toBeCloseTo(fixed.y, 0);
  });

  it('screen look: centred hand, centred view; at the edge the aim reaches the look reach', () => {
    const rifle = { ...sniper, look: CLASS_LOOK.rifleman, range: 520, scope: false };
    expect(screenLookView({ ...rifle, viewW: 390, viewH: 700, u: { x: 0, y: 0 } }).offset).toEqual({
      x: 0,
      y: 0,
    });
    // A phone held upright: the narrow side can't show a rifleman's reach, so it pans.
    const phone = { ...rifle, viewW: 390, viewH: 700, baseZoom: 1 };
    const edge = screenAimWorld(pos, phone, 390, 350, MAP, MAP);
    const v = screenLookView({ ...phone, u: { x: 1, y: 0 } });
    expect(edge.x - pos.x).toBeGreaterThan(195);
    // …and the soldier stays on screen.
    expect(v.offset.x).toBeLessThanOrEqual(195 * CAMERA.meOnScreen + 1e-9);
  });

  it('keeps the settled camera inside the map', () => {
    expect(clampCameraCentre({ x: -50, y: 900 }, 1, W, H, 4000, 1000)).toEqual({ x: 640, y: 640 });
    // A map narrower than the view: centred.
    expect(clampCameraCentre({ x: 0, y: 0 }, 1, W, H, 1000, 600).x).toBe(500);
  });

  it('trackpad drag: slow drags are finer than fast ones', () => {
    expect(dragGainFor(1.5, false, 0.05)).toBe(1.5);
    expect(dragGainFor(1.5, true, 0.05)).toBeLessThan(1.5);
    expect(dragGainFor(1.5, true, 2)).toBeGreaterThan(1.5);
  });
});
