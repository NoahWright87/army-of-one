/**
 * (PHASE19) What the respawn overlay drives on the battlefield while the player picks a spawn:
 * the battle scene in respawn mode, playing the tape on a smooth clock with a free camera.
 */
import type { WorldView } from '../sim/view';

export interface TimeControls {
  /** Battle time shown (fractional ticks). */
  readonly tick: number;
  /** Earliest and latest time that has played. */
  readonly start: number;
  readonly frontier: number;
  readonly traveling: boolean;
  /** Where a glide is heading (or the time shown). */
  readonly destination: number;
  /** Play rate in battle-time multiples (0 = paused). */
  readonly rate: number;
  setRate(rate: number): void;
  /** Glides to `tick` (never jumps); resolves on arrival. */
  travelTo(tick: number): Promise<void>;
  /** Sets the time at once (scrub-bar dragging). */
  scrubTo(tick: number): void;
  /** Glides the camera to a world point (and zoom). */
  focus(x: number, y: number, zoom?: number): void;
  /** A world point in page CSS px. */
  worldToScreen(x: number, y: number): { x: number; y: number };
  /** The world as shown now. */
  readonly currentView: WorldView;
  /** Camera viewport in world units (for the minimap). */
  viewport(): { x: number; y: number; width: number; height: number };
}
