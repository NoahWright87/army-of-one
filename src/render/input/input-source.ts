import type { Vec2 } from '../../sim/core/vec';
import type { SoldierInput } from '../../sim/entities/soldier';

/**
 * Source of per-tick soldier input: keyboard/mouse today; touch, gamepad and auto-aim later
 * (06-b). Called exactly once per sim tick for the live soldier.
 *
 * `read` has no side effects on the sim: the caller decides whether to apply the result. That
 * lets PHASE04's lead-in read (and preview) inputs during the countdown and apply the held
 * input on the tick control switches.
 */
export interface InputSource {
  /** `soldierPos` is the live soldier's world position, used to turn a cursor into an aim angle. */
  read(soldierPos: Vec2): SoldierInput;
  /** Cursor position in world space (for the reticle), if this source has one. */
  pointerWorld(): Vec2 | null;
  destroy(): void;
}
