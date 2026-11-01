/** Pure input helpers (unit-tested); the Phaser adapter only reads device state into these. */
import type { Vec2 } from '../../sim/core/vec';

export interface HeldDirections {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/** Each axis in {-1, 0, 1}. The sim clamps diagonal length to 1. */
export function moveFromKeys(k: HeldDirections): Vec2 {
  return { x: (k.right ? 1 : 0) - (k.left ? 1 : 0), y: (k.down ? 1 : 0) - (k.up ? 1 : 0) };
}

/** Aim = angle from the soldier's world position to the cursor's world position. */
export function aimAngle(soldier: Vec2, cursorWorld: Vec2): number {
  return Math.atan2(cursorWorld.y - soldier.y, cursorWorld.x - soldier.x);
}

/**
 * Remembers presses that happen between sim ticks, so a tap shorter than one tick (or one
 * rendered frame) is never lost. `consume` returns true once per press.
 */
export class PressLatch {
  private pending = false;
  press(): void {
    this.pending = true;
  }
  consume(): boolean {
    const p = this.pending;
    this.pending = false;
    return p;
  }
}
