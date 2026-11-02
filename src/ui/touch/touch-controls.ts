/**
 * (07-b) On-screen touch controls ([D41]): a floating movement stick on the left half, a floating
 * aim stick on the right half (when auto-aim is off), a fire button, an interact button (only near
 * a lever), and a settings button. DOM only; `TouchInput` (src/render/input) turns its state into
 * a `SoldierInput` per tick.
 */
import { str } from '../../content/strings';
import type { Vec2 } from '../../sim/core/vec';
import { PressLatch } from '../../render/input/input-math';
import { el, injectStyle } from '../dom';
import { knobOffset, stickVector, type StickConfig } from './stick-math';

const STICK: StickConfig = { radius: 56, deadZone: 0.15 };

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
.aoo-touch button { position: absolute; pointer-events: auto; touch-action: none; border: 0;
  border-radius: 50%; font: 700 15px system-ui, sans-serif; color: #111; }
.aoo-touch .fire { right: 22px; bottom: 26px; width: 84px; height: 84px; background: rgba(255,90,60,0.8); }
.aoo-touch .fire.held { background: rgba(255,140,100,0.95); }
.aoo-touch .interact { right: 120px; bottom: 44px; width: 64px; height: 64px; background: rgba(120,220,140,0.85); }
/* Touch mode: the minimap moves up out of the fire button's way. */
body.aoo-touch-mode .aoo-minimap { bottom: auto; top: 64px; }
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
  fireHeld = false;
  /** (07-e) Sprint button held ([D49]). */
  sprintHeld = false;
  readonly interactLatch = new PressLatch();
  private left: Active | null = null;
  private right: Active | null = null;
  private readonly fireBtn = el('button', 'fire', str('touch.fire'));
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
    this.fireBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.fireHeld = true;
      this.fireBtn.classList.add('held');
      this.fireBtn.setPointerCapture?.(e.pointerId);
    });
    const release = () => {
      this.fireHeld = false;
      this.fireBtn.classList.remove('held');
    };
    this.fireBtn.addEventListener('pointerup', release);
    this.fireBtn.addEventListener('pointercancel', release);
    this.interactBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.interactLatch.press();
    });
    this.interactBtn.hidden = true;
    this.sprintBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.sprintHeld = true;
      this.sprintBtn.classList.add('held');
      this.sprintBtn.setPointerCapture?.(e.pointerId);
    });
    const stopSprint = () => {
      this.sprintHeld = false;
      this.sprintBtn.classList.remove('held');
    };
    this.sprintBtn.addEventListener('pointerup', stopSprint);
    this.sprintBtn.addEventListener('pointercancel', stopSprint);
    this.bindStick(leftZone, 'left');
    this.bindStick(rightZone, 'right');
    this.root.append(leftZone, rightZone, this.interactBtn, this.fireBtn, this.sprintBtn, gear);
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

  /** The right-hand aim stick (off while auto-aim aims for you). */
  setAimStick(on: boolean): void {
    this.aimStickOn = on;
    if (!on && this.right) this.endStick('right');
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
    this.fireHeld = false;
    this.fireBtn.classList.remove('held');
    this.sprintHeld = false;
    this.sprintBtn.classList.remove('held');
  }

  private bindStick(zone: HTMLDivElement, side: 'left' | 'right'): void {
    zone.addEventListener('pointerdown', (e) => {
      if (side === 'right' && !this.aimStickOn) return;
      if (this[side]) return;
      e.preventDefault();
      zone.setPointerCapture?.(e.pointerId);
      const stick = el('div', side === 'left' ? 'stick' : 'stick aim');
      stick.append(el('div', 'knob'));
      stick.style.left = `${e.clientX}px`;
      stick.style.top = `${e.clientY}px`;
      this.root.append(stick);
      const p = { x: e.clientX, y: e.clientY };
      this[side] = { pointerId: e.pointerId, origin: p, thumb: p, el: stick };
      this.update(side);
    });
    zone.addEventListener('pointermove', (e) => {
      const a = this[side];
      if (!a || a.pointerId !== e.pointerId) return;
      a.thumb = { x: e.clientX, y: e.clientY };
      this.update(side);
    });
    const end = (e: PointerEvent) => {
      const a = this[side];
      if (a && a.pointerId === e.pointerId) this.endStick(side);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  private update(side: 'left' | 'right'): void {
    const a = this[side];
    if (!a) return;
    const v = stickVector(a.origin, a.thumb, STICK);
    const k = knobOffset(a.origin, a.thumb, STICK.radius);
    (a.el.firstChild as HTMLElement).style.transform = `translate(${k.x}px, ${k.y}px)`;
    if (side === 'left') this.move = v;
    else this.aim = v;
  }

  private endStick(side: 'left' | 'right'): void {
    const a = this[side];
    if (a) a.el.remove();
    this[side] = null;
    if (side === 'left') this.move = { x: 0, y: 0 };
    else this.aim = null;
  }
}
