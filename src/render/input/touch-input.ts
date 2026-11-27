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
/** (aim test) Drag aim goes no further than this (world units; the camera caps the view). */
const MAX_DRAG_AIM_DISTANCE = 3000;

export class TouchInput implements InputSource {
  private aim = -Math.PI / 2;
  private aimDistance = DEFAULT_AIM_DISTANCE;
  private lastPos: Vec2 | null = null;
  /** A finger was aiming last read. */
  private aiming = false;
  private view: WorldView | null = null;
  /** (PHASE20) Settled into a stance last view (so a new one turns the reticle across cover). */
  private wasSteady = false;

  constructor(
    private readonly controls: TouchControls,
    private readonly opts: {
      tuning: Tuning;
      /** (PHASE12-d) Screen (client px) → world, for tap-to-aim. */
      toWorld?: (clientX: number, clientY: number) => Vec2 | null;
      /** (aim test) Screen (client px) → canvas px, for `aimScreen`. */
      toCanvas?: (clientX: number, clientY: number) => Vec2 | null;
      /** (aim test) World units per client px right now (drag aim). */
      pxToWorld?: () => number;
    },
  ) {}

  /** (aim test) The finger on the reticle (tap mode, not drag), in canvas px. */
  aimScreen(): Vec2 | null {
    const c = this.controls;
    if (!c.tap || c.dragAim) return null;
    return this.opts.toCanvas?.(c.tap.x, c.tap.y) ?? null;
  }

  /** (PHASE12-d) Aiming by hand (a finger on the field): auto-aim yields. */
  manualAim(): boolean {
    return this.controls.tap !== null;
  }

  read(soldierPos: Vec2): SoldierInput {
    const c = this.controls;
    this.lastPos = soldierPos;
    const a = c.aim;
    const aLen = a ? Math.hypot(a.x, a.y) : 0;
    // (PHASE18) Aiming by finger ([D158]): the reticle is wherever the finger is, like a mouse
    // cursor. The camera pans and zooms toward the aim, so holding near the edge looks further.
    // (aim test) Drag aim: the reticle moves by the finger's movement, never sits under it.
    const dragging = c.dragAim && c.tap !== null;
    const under = c.tap && !c.dragAim ? (this.opts.toWorld?.(c.tap.x, c.tap.y) ?? null) : null;
    // (PHASE18) Letting go: the reticle comes back to its walking distance (same direction), so
    // the camera comes back to you. (Drag aim keeps it where you left it.)
    if (this.aiming && !c.tap && !c.dragAim) this.aimDistance = DEFAULT_AIM_DISTANCE;
    this.aiming = c.tap !== null;
    if (dragging) {
      // Start from wherever the reticle was drawn (auto-aim's, if it had one).
      if (c.dragStart) {
        const w = c.dragStart;
        this.aim = Math.atan2(w.y - soldierPos.y, w.x - soldierPos.x);
        this.aimDistance = Math.max(30, Math.hypot(w.x - soldierPos.x, w.y - soldierPos.y));
        c.dragStart = null;
      }
      const d = c.takeDrag();
      const k = this.opts.pxToWorld?.() ?? 1;
      const ax = Math.cos(this.aim) * this.aimDistance + d.x * k;
      const ay = Math.sin(this.aim) * this.aimDistance + d.y * k;
      const len = Math.hypot(ax, ay);
      if (len > 1e-6) this.aim = Math.atan2(ay, ax);
      this.aimDistance = Math.min(MAX_DRAG_AIM_DISTANCE, Math.max(30, len));
    } else if (under) {
      this.aim = Math.atan2(under.y - soldierPos.y, under.x - soldierPos.x);
      this.aimDistance = Math.max(30, Math.hypot(under.x - soldierPos.x, under.y - soldierPos.y));
    } else if (aLen > 0.2 && a) {
      this.aim = Math.atan2(a.y, a.x);
      this.aimDistance = Math.max(60, aLen * this.opts.tuning.grenade.maxRange);
    } else if (Math.hypot(c.move.x, c.move.y) > 0.3) {
      this.aim = Math.atan2(c.move.y, c.move.x);
      this.aimDistance = DEFAULT_AIM_DISTANCE;
    }
    this.updateInteract(soldierPos);
    // (PHASE20) Braced or deployed, a soldier doesn't walk ([D160]).
    const still = this.holdsStill();
    return {
      move: still ? { x: 0, y: 0 } : { x: c.move.x, y: c.move.y },
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
    const live = this.liveSoldier();
    this.controls.setAimOnly(this.holdsStill());
    // (PHASE20) Just braced on cover: the reticle swings across it, where you'd be shooting.
    const steady = !!live?.steady;
    if (steady && !this.wasSteady && live?.braceAim !== undefined) {
      this.aim = live.braceAim;
      this.aimDistance = DEFAULT_AIM_DISTANCE;
    }
    this.wasSteady = steady;
  }

  /** Braced on cover or deployed (settling too): no walking. */
  private holdsStill(): boolean {
    const st = this.liveSoldier()?.loadout?.stance;
    return st === 'braced' || st === 'deployed';
  }

  private liveSoldier() {
    return this.view?.soldiers.find((s) => s.role === 'live');
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
