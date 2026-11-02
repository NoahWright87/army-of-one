/**
 * (07-b) Touch input source ([D41]): reads the on-screen sticks and buttons (`TouchControls`).
 * - Move: the left stick.
 * - Aim: the right stick's direction; pushed past `AIM_FIRE` it also fires (twin-stick style),
 *   and its length sets the throw distance for the Grenadier. Without the aim stick, the soldier
 *   keeps the last aim, or faces the way it moves.
 * - Fire: the fire button (or the pushed aim stick). Interact: the interact button, shown only
 *   while a lever is in reach.
 * Usually wrapped in `AutoAimInput`, which overrides the aim when it has a target.
 */
import type { Tuning } from '../../content/tuning';
import type { Vec2 } from '../../sim/core/vec';
import type { SoldierInput } from '../../sim/entities/soldier';
import type { WorldView } from '../../sim/view';
import type { TouchControls } from '../../ui/touch/touch-controls';
import type { InputSource } from './input-source';

/** Aim stick pushed this far (0..1) also fires. */
export const AIM_FIRE = 0.6;
/** Reticle distance when nothing else says how far (world units). */
const DEFAULT_AIM_DISTANCE = 220;

export class TouchInput implements InputSource {
  private aim = -Math.PI / 2;
  private aimDistance = DEFAULT_AIM_DISTANCE;
  private lastPos: Vec2 | null = null;
  private view: WorldView | null = null;

  constructor(
    private readonly controls: TouchControls,
    private readonly opts: { tuning: Tuning },
  ) {}

  read(soldierPos: Vec2): SoldierInput {
    const c = this.controls;
    this.lastPos = soldierPos;
    const a = c.aim;
    const aLen = a ? Math.hypot(a.x, a.y) : 0;
    if (aLen > 0.2 && a) {
      this.aim = Math.atan2(a.y, a.x);
      this.aimDistance = Math.max(60, aLen * this.opts.tuning.grenade.maxRange);
    } else if (Math.hypot(c.move.x, c.move.y) > 0.3) {
      this.aim = Math.atan2(c.move.y, c.move.x);
      this.aimDistance = DEFAULT_AIM_DISTANCE;
    }
    this.updateInteract(soldierPos);
    return {
      move: { x: c.move.x, y: c.move.y },
      aim: this.aim,
      aimDistance: this.aimDistance,
      fire: c.fireHeld || aLen >= AIM_FIRE,
      interact: c.interactLatch.consume(),
      ...(c.sprintHeld ? { sprint: true } : {}),
    };
  }

  /** The reticle sits along the aim, at the aim distance. */
  pointerWorld(): Vec2 | null {
    if (!this.lastPos) return null;
    return {
      x: this.lastPos.x + Math.cos(this.aim) * this.aimDistance,
      y: this.lastPos.y + Math.sin(this.aim) * this.aimDistance,
    };
  }

  observe(view: WorldView): void {
    this.view = view;
  }

  destroy(): void {
    this.controls.setInteractVisible(false);
  }

  private updateInteract(p: Vec2): void {
    const view = this.view;
    const reach = this.opts.tuning.interact.reach;
    const near = !!view?.levers.some((l) => Math.hypot(l.x - p.x, l.y - p.y) <= reach);
    this.controls.setInteractVisible(near);
  }
}
