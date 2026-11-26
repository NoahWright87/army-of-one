/**
 * (07-b) On-screen touch controls ([D41]): a floating movement stick on the left half, a floating
 * aim stick on the right half (when auto-aim is off), an interact button (only near a lever), and
 * a settings button. (PHASE18, [D158]) Tap mode, the default: touching on or near the reticle
 * grabs it (drag to aim); a touch anywhere else is the move stick; another finger fires while
 * held. No fire button. DOM only; `TouchInput` (src/render/input) turns its state into
 * a `SoldierInput` per tick.
 */
import { str } from '../../content/strings';
import type { Vec2 } from '../../sim/core/vec';
import { PressLatch } from '../../render/input/input-math';
import { el, injectStyle } from '../dom';
import { knobOffset, sprintRingReached, stickVector, type StickConfig } from './stick-math';

const STICK: StickConfig = { radius: 56, deadZone: 0.15 };
/** (PHASE17) Pushing the move stick past this × its radius sprints ([D144]). */
const SPRINT_RING = 1.45;
/** (PHASE18) A touch this close to the reticle (client px) grabs it. */
const GRAB_RADIUS = 64; // TUNE

const CSS = `
.aoo-touch { position: fixed; inset: 0; z-index: 20; pointer-events: none; user-select: none;
  -webkit-user-select: none; -webkit-touch-callout: none; }
.aoo-touch[hidden] { display: none; }
.aoo-touch .zone { position: absolute; top: 0; bottom: 0; pointer-events: auto; touch-action: none; }
.aoo-touch .zone.left { left: 0; width: 50%; }
.aoo-touch .zone.right { right: 0; width: 50%; }
.aoo-touch .stick { position: absolute; width: ${STICK.radius * 2}px; height: ${STICK.radius * 2}px;
  margin: -${STICK.radius}px 0 0 -${STICK.radius}px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.35); background: rgba(0,0,0,0.18); pointer-events: none; }
.aoo-touch .knob { position: absolute; left: 50%; top: 50%; width: 46px; height: 46px;
  margin: -23px 0 0 -23px; border-radius: 50%; background: rgba(255,255,255,0.45); }
.aoo-touch .stick.aim { border-color: rgba(255,211,77,0.55); }
.aoo-touch .stick.aim .knob { background: rgba(255,211,77,0.6); }
/* (PHASE17) Tap-to-aim ([D144]): the first finger anywhere is the move stick; a second finger
   aims there (hold to fire). Pushing the stick out to its outer ring sprints. */
.aoo-touch.tap .zone.left { left: 0; width: 100%; z-index: 1; }
.aoo-touch.tap .zone.right { display: none; }
.aoo-touch.tap .sprint { display: none; }
.aoo-touch .ring { position: absolute; left: 50%; top: 50%;
  width: ${Math.round(STICK.radius * 2 * SPRINT_RING)}px; height: ${Math.round(STICK.radius * 2 * SPRINT_RING)}px;
  margin: -${Math.round(STICK.radius * SPRINT_RING)}px 0 0 -${Math.round(STICK.radius * SPRINT_RING)}px;
  border-radius: 50%; border: 2px dashed rgba(120,190,255,0.45); pointer-events: none; }
.aoo-touch .stick.sprinting .ring { border-style: solid; border-color: rgba(120,190,255,0.95);
  background: rgba(120,190,255,0.12); }
.aoo-touch .tapmark { position: absolute; width: 44px; height: 44px; margin: -22px 0 0 -22px;
  border-radius: 50%; border: 3px solid rgba(255,211,77,0.85); pointer-events: none; }
.aoo-touch .firemark { position: absolute; width: 56px; height: 56px; margin: -28px 0 0 -28px;
  border-radius: 50%; background: rgba(255,90,60,0.35); border: 2px solid rgba(255,120,90,0.9);
  pointer-events: none; }
.aoo-touch button { position: absolute; z-index: 2; pointer-events: auto; touch-action: none; border: 0;
  border-radius: 50%; font: 700 15px system-ui, sans-serif; color: #111; }
.aoo-touch .interact { right: 32px; bottom: 44px; width: 64px; height: 64px; background: rgba(120,220,140,0.85); }
/* Touch mode: the minimap moves up out of the buttons' way, and (PHASE18) shrinks and fades:
   on a phone it sits right where you aim to the side. */
body.aoo-touch-mode .aoo-minimap { bottom: auto; top: 64px; transform: scale(0.55);
  transform-origin: top right; opacity: 0.7; }
.aoo-touch .sprint { right: 32px; bottom: 124px; width: 64px; height: 64px; background: rgba(120,190,255,0.8); }
.aoo-touch .sprint.held { background: rgba(170,215,255,0.95); }
.aoo-touch .gear { left: 10px; top: 64px; width: 40px; height: 40px; background: rgba(255,255,255,0.25);
  color: #fff; font-size: 20px; }
`;

interface Active {
  pointerId: number;
  origin: Vec2;
  thumb: Vec2;
  el: HTMLDivElement;
}

export class TouchControls {
  readonly root = el('div', 'aoo-touch');
  /** Movement stick output (each axis −1..1). */
  move: Vec2 = { x: 0, y: 0 };
  /** Aim stick output while touched, else null. */
  aim: Vec2 | null = null;
  /**
   * (PHASE18) Tap mode: the aiming finger (client px) while it's down, else null. The reticle
   * goes right under it.
   */
  tap: Vec2 | null = null;
  /** (PHASE18) Where the reticle is on screen (client px), for grabbing it. Set by the app. */
  reticle: (() => Vec2 | null) | null = null;
  private tapEl: HTMLDivElement | null = null;
  private tapPointer: number | null = null;
  private tapAimOn = false;
  /** (PHASE18) Fingers that fire while held (tap mode). */
  private readonly firing = new Map<number, HTMLDivElement>();
  /** The aiming finger also fires (it came down while moving, like the old tap-to-aim). */
  private tapFires = false;
  get fireHeld(): boolean {
    return this.firing.size > 0 || (this.tap !== null && this.tapFires);
  }
  /**
   * (PHASE20) Braced or deployed ([D160]): the soldier can't move, so the first finger is the
   * reticle (aiming, and firing while held) instead of the move stick.
   */
  private aimOnly = false;
  /** (07-e) Sprint button held ([D49]). */
  private sprintBtnHeld = false;
  /** (PHASE17) The move stick pushed out to its outer ring ([D144]). */
  private ringSprint = false;
  /** Sprinting: the button held, or the stick out at its ring. */
  get sprintHeld(): boolean {
    return this.sprintBtnHeld || this.ringSprint;
  }
  readonly interactLatch = new PressLatch();
  private left: Active | null = null;
  private right: Active | null = null;
  private readonly interactBtn = el('button', 'interact', str('touch.interact'));
  private readonly sprintBtn = el('button', 'sprint', str('touch.sprint'));
  private aimStickOn = true;

  constructor(parent: HTMLElement, onSettings: () => void) {
    injectStyle('aoo-touch-css', CSS);
    const leftZone = el('div', 'zone left');
    const rightZone = el('div', 'zone right');
    const gear = el('button', 'gear', '⚙');
    gear.setAttribute('aria-label', str('touch.settings'));
    gear.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onSettings();
    });
    this.interactBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.interactLatch.press();
    });
    this.interactBtn.hidden = true;
    this.sprintBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.sprintBtnHeld = true;
      this.sprintBtn.classList.add('held');
      this.sprintBtn.setPointerCapture?.(e.pointerId);
    });
    const stopSprint = () => {
      this.sprintBtnHeld = false;
      this.sprintBtn.classList.remove('held');
    };
    this.sprintBtn.addEventListener('pointerup', stopSprint);
    this.sprintBtn.addEventListener('pointercancel', stopSprint);
    this.bindStick(leftZone, 'left');
    this.bindStick(rightZone, 'right');
    this.root.append(leftZone, rightZone, this.interactBtn, this.sprintBtn, gear);
    this.root.hidden = true;
    // No scrolling, pinch-zoom or pull-to-refresh while the controls are up.
    this.root.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    parent.append(this.root);
  }

  setVisible(on: boolean): void {
    this.root.hidden = !on;
    document.body.classList.toggle('aoo-touch-mode', on);
    if (!on) this.reset();
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /** (PHASE12-d, PHASE18) Tap mode (grab the reticle) instead of the aim stick. */
  setTapAim(on: boolean): void {
    this.tapAimOn = on;
    this.root.classList.toggle('tap', on);
    if (!on) this.endTap();
  }

  private endTap(): void {
    this.tapEl?.remove();
    this.tapEl = null;
    this.tap = null;
    this.tapPointer = null;
    this.tapFires = false;
  }

  /** The right-hand aim stick (off while auto-aim aims for you). */
  setAimStick(on: boolean): void {
    this.aimStickOn = on;
    if (!on && this.right) this.endStick('right');
  }

  /** (PHASE20) Braced or deployed: no move stick; the first finger aims and fires. */
  setAimOnly(on: boolean): void {
    if (this.aimOnly === on) return;
    this.aimOnly = on;
    if (on) this.endStick('left');
  }

  setInteractVisible(on: boolean): void {
    if (this.interactBtn.hidden === on) this.interactBtn.hidden = !on;
  }

  destroy(): void {
    this.root.remove();
  }

  private reset(): void {
    this.endStick('left');
    this.endStick('right');
    this.sprintBtnHeld = false;
    this.ringSprint = false;
    this.sprintBtn.classList.remove('held');
    this.endTap();
    for (const id of [...this.firing.keys()]) this.endFire(id);
  }

  private endFire(id: number): void {
    this.firing.get(id)?.remove();
    this.firing.delete(id);
  }

  /** (PHASE18) Is this touch on or near the reticle? */
  private nearReticle(x: number, y: number): Vec2 | null {
    const r = this.reticle?.() ?? null;
    if (!r) return null;
    return Math.hypot(x - r.x, y - r.y) <= GRAB_RADIUS ? r : null;
  }

  private bindStick(zone: HTMLDivElement, side: 'left' | 'right'): void {
    zone.addEventListener('pointerdown', (e) => {
      // (PHASE18) Tap mode, one zone ([D158]): on the reticle grabs it; elsewhere the first
      // finger is the move stick. While moving, a second finger aims there and fires while held
      // (on the reticle: drags it, firing); any other finger fires while held.
      if (this.tapAimOn) {
        e.preventDefault();
        zone.setPointerCapture?.(e.pointerId);
        const free = this.tapPointer === null;
        const r = free ? this.nearReticle(e.clientX, e.clientY) : null;
        const moving = this.left !== null;
        // (PHASE20) Braced: the first finger is the reticle and fires while held ([D160]).
        if (r || (free && (moving || this.aimOnly))) {
          this.tapPointer = e.pointerId;
          this.tapFires = moving || this.aimOnly;
          this.tap = { x: e.clientX, y: e.clientY };
          this.tapEl = el('div', 'tapmark');
          this.root.append(this.tapEl);
          this.placeTap();
          return;
        }
        if (this.left || this.tapPointer !== null) {
          const mark = el('div', 'firemark');
          mark.style.left = `${e.clientX}px`;
          mark.style.top = `${e.clientY}px`;
          this.root.append(mark);
          this.firing.set(e.pointerId, mark);
          return;
        }
      }
      if (side === 'right' && !this.aimStickOn) return;
      if (side === 'left' && this.aimOnly) return; // nowhere to walk
      if (this[side]) return;
      e.preventDefault();
      zone.setPointerCapture?.(e.pointerId);
      const stick = el('div', side === 'left' ? 'stick' : 'stick aim');
      if (side === 'left' && this.tapAimOn) stick.append(el('div', 'ring'));
      stick.append(el('div', 'knob'));
      stick.style.left = `${e.clientX}px`;
      stick.style.top = `${e.clientY}px`;
      this.root.append(stick);
      const p = { x: e.clientX, y: e.clientY };
      this[side] = { pointerId: e.pointerId, origin: p, thumb: p, el: stick };
      this.update(side);
    });
    zone.addEventListener('pointermove', (e) => {
      if (this.tapPointer === e.pointerId) {
        this.tap = { x: e.clientX, y: e.clientY };
        this.placeTap();
        return;
      }
      const a = this[side];
      if (!a || a.pointerId !== e.pointerId) return;
      a.thumb = { x: e.clientX, y: e.clientY };
      this.update(side);
    });
    const end = (e: PointerEvent) => {
      if (this.tapPointer === e.pointerId) {
        this.endTap();
        return;
      }
      if (this.firing.has(e.pointerId)) {
        this.endFire(e.pointerId);
        return;
      }
      const a = this[side];
      if (a && a.pointerId === e.pointerId) this.endStick(side);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  private placeTap(): void {
    if (!this.tapEl || !this.tap) return;
    this.tapEl.style.left = `${this.tap.x}px`;
    this.tapEl.style.top = `${this.tap.y}px`;
  }

  private update(side: 'left' | 'right'): void {
    const a = this[side];
    if (!a) return;
    const v = stickVector(a.origin, a.thumb, STICK);
    // (PHASE17) In tap mode the knob follows the thumb out to the sprint ring ([D144]).
    const reach = side === 'left' && this.tapAimOn ? STICK.radius * SPRINT_RING : STICK.radius;
    const k = knobOffset(a.origin, a.thumb, reach);
    (a.el.lastChild as HTMLElement).style.transform = `translate(${k.x}px, ${k.y}px)`;
    if (side === 'left') {
      this.move = v;
      this.ringSprint =
        this.tapAimOn && sprintRingReached(a.origin, a.thumb, STICK.radius * SPRINT_RING);
      a.el.classList.toggle('sprinting', this.ringSprint);
    } else this.aim = v;
  }

  private endStick(side: 'left' | 'right'): void {
    const a = this[side];
    if (a) a.el.remove();
    this[side] = null;
    if (side === 'left') {
      this.move = { x: 0, y: 0 };
      this.ringSprint = false;
    } else this.aim = null;
  }
}
