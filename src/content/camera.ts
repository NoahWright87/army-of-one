/**
 * (PHASE18) How far each class can look, and how much it zooms in when looking far ([D158]).
 * Render-side numbers: the sim never reads them.
 *
 * A soldier's look reach is its weapon's range (never less than `minReach`, a rifleman's), times
 * its class's `reach`, plus bonuses for standing still, bracing on cover and (Machine Gunner)
 * being mounted. Aiming further out pans the camera that way until the screen's edge reaches the
 * look reach; past `zoomFrom` of the way out it also zooms in, up to the class's `maxZoom`
 * (a scope: you see further, and less around you).
 *
 * Plain data only.
 */
import type { RoleId } from '../contracts/mission';

export interface ClassLook {
  /** × the weapon's range. */
  reach: number; // TUNE
  /** Extra × when mounted / set up (Machine Gunner on cover, Sniper rifle up). */
  setUp: number; // TUNE
  /** Most it zooms in when looking as far as it can (1 = never). */
  maxZoom: number; // TUNE
  /** The camera may go this far from the soldier, in half-screens (> 1: off screen). */
  maxPan: number; // TUNE
}

export const CAMERA = {
  /** Never less look reach than this (a rifleman's range): even a pistol sees a fight coming. */
  minReach: 520, // TUNE
  /** Look reach bonus standing still, and braced on cover (any class). */
  stillBonus: 0.07, // TUNE
  braceBonus: 0.15, // TUNE
  /** Zooming in starts this far out (share of the look reach). */
  zoomFrom: 0.55, // TUNE
  /**
   * Phones: zoom out until a rifleman's range fits on screen toward the aim: the shorter
   * half-screen covers at least this many world units.
   */
  minHalfView: 290, // TUNE
  /** Without a cursor (touch, auto-aim): look this far out (share of the reach). */
  defaultAim: 0.6, // TUNE
  /** How quickly the zoom follows (per second, 0..1 of the way). */
  zoomEase: 6, // TUNE
} as const;

const plain: ClassLook = { reach: 1, setUp: 1, maxZoom: 1.05, maxPan: 0.85 };

export const CLASS_LOOK: Record<RoleId, ClassLook> = {
  rifleman: plain,
  grenadier: plain,
  shield: plain,
  shotgun: plain,
  bazooka: { ...plain, maxZoom: 1.1 },
  gunner: { reach: 1.05, setUp: 1.2, maxZoom: 1.25, maxPan: 1.1 }, // a small zoom
  sniper: { reach: 1, setUp: 1.15, maxZoom: 2.4, maxPan: 3 }, // a scope: zooms a lot
  truck: plain,
  tank: { ...plain, maxZoom: 1.1 },
};
