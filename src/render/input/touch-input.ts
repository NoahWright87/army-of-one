/**
 * (07-b) Touch input source ([D41]): reads the on-screen sticks and buttons (`TouchControls`).
 * - Move: the left stick.
 * - Aim: the right stick's direction; pushed past `AIM_FIRE` it also fires (twin-stick style),
 *   and its length sets the throw distance for the Grenadier. Without the aim stick, the soldier
 *   keeps the last aim, or faces the way it moves.
 * - (PHASE18) Tap mode: dragging the reticle aims (auto-aim yields while it's held); another
 *   finger fires.
 * - Fire: another finger (tap mode), or the pushed aim stick. Interact: the interact button, shown only
 *   while a lever is in reach.
 * Usually wrapped in `AutoAimInput`, which overrides the aim when it has a target.
 */
import { CAMERA } from '../../content/camera';
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
  /** The drag being turned into aim: its id, its reach, and the aim it started from (share). */
  private drag: { id: number; reach: number; f0: Vec2 } | null = null;

  constructor(
    private readonly controls: TouchControls,
    private readonly opts: {
      tuning: Tuning;
      /** (PHASE12-d) Screen (client px) → world, for tap-to-aim. */
      toWorld?: (clientX: number, clientY: number) => Vec2 | null;
      /**
       * (PHASE18) How far this soldier can look (world units): dragging half the screen, either
       * way, moves the aim this far.
       */
      aimReach?: () => number;
    },
  ) {}

  /** (PHASE12-d) Aiming by hand (a finger on the field): auto-aim yields. */
  manualAim(): boolean {
    return this.controls.tap !== null;
  }

  read(soldierPos: Vec2): SoldierInput {
    const c = this.controls;
    this.lastPos = soldierPos;
    const a = c.aim;
    const aLen = a ? Math.hypot(a.x, a.y) : 0;
    // (PHASE18) Aiming by finger ([D158]): it starts where the reticle was (or where the finger
    // came down), then moves with the finger, scaled so half the screen's short side is the full
    // look reach: a narrow phone aims as far sideways as up and down. One scale for both axes,
    // so the aim always goes the way the finger goes.
    const g = c.drag;
    if (!g) this.drag = null;
    if (g) {
      if (this.drag?.id !== g.id) {
        const reach = Math.max(1, this.opts.aimReach?.() ?? this.opts.tuning.rifle.range);
        const at = this.opts.toWorld?.(g.start.x, g.start.y) ?? null;
        const f0 = at
          ? { x: (at.x - soldierPos.x) / reach, y: (at.y - soldierPos.y) / reach }
          : {
              x: (Math.cos(this.aim) * this.aimDistance) / reach,
              y: (Math.sin(this.aim) * this.aimDistance) / reach,
            };
        this.drag = { id: g.id, reach, f0 };
      }
      const d = this.drag!;
      const h = c.screenHalf();
      const half = Math.min(h.x, h.y);
      let fx = d.f0.x + (g.finger.x - g.fingerStart.x) / half;
      let fy = d.f0.y + (g.finger.y - g.fingerStart.y) / half;
      const len = Math.hypot(fx, fy);
      if (len > CAMERA.maxAimShare) {
        fx *= CAMERA.maxAimShare / len;
        fy *= CAMERA.maxAimShare / len;
      }
      if (len > 1e-6) this.aim = Math.atan2(fy, fx);
      this.aimDistance = Math.max(30, Math.hypot(fx, fy) * d.reach);
    } else if (aLen > 0.2 && a) {
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
