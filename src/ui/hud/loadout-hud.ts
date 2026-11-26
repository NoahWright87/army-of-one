/**
 * (PHASE20, [D160]) The stance icon (bottom left) and the weapon icon (bottom right).
 *
 * - Weapon: a silhouette, muzzle up, along the right edge: a white outline with a black fill (the
 *   outline is cyan while the stance's aim bonus applies, blue while swapping). After a shot the
 *   fill turns yellow and fades back to black over the reload. No box around it. A Sniper taps it
 *   to swap guns.
 * - Stance: a soldier silhouette; shown only when the class has a stance of its own or cover is
 *   in reach. A ring fills while settling. Climbing and running are shown but not chosen.
 * - Right-click or long-press either one for auto (an "A" in its corner).
 * DOM only; the state comes from `LoadoutView` (pure, from the sim).
 */
import { str } from '../../content/strings';
import { stanceSvg, weaponSvg } from '../../content/ui-icons';
import type { LoadoutControls } from '../../render/input/loadout-controls';
import type { LoadoutView } from '../../sim/view';
import { el, injectStyle } from '../dom';

const LONG_PRESS_MS = 450;

const CSS = `
.aoo-loadout { position: fixed; inset: 0; z-index: 25; pointer-events: none; user-select: none;
  -webkit-user-select: none; -webkit-touch-callout: none; }
.aoo-loadout[hidden] { display: none; }
.aoo-loadout button { position: absolute; bottom: 14px; padding: 0; border: 2px solid rgba(255,255,255,.35);
  background: rgba(0,0,0,.45); border-radius: 10px; pointer-events: auto; touch-action: none;
  color: #e8ecef; cursor: pointer; }
.aoo-loadout button[hidden] { display: none; }
.aoo-loadout button:disabled { opacity: .45; cursor: default; }
.aoo-loadout .stance { left: 14px; width: 64px; height: 64px; }
.aoo-loadout .stance svg { position: absolute; inset: 6px; width: calc(100% - 12px); height: calc(100% - 12px); }
.aoo-loadout .stance.braced, .aoo-loadout .stance.prone, .aoo-loadout .stance.deployed { color: #35e0ff; border-color: #35e0ff; }
.aoo-loadout .stance.settling { color: #8fb4d8; border-color: #8fb4d8; }
.aoo-loadout .stance.climbing { color: #ffd34d; border-color: rgba(255,211,77,.7); }
.aoo-loadout .stance.sprinting { color: #78beff; border-color: rgba(120,190,255,.7); }
.aoo-loadout .weapon { right: 14px; width: 48px; height: 88px; border-color: transparent; background: none; }
.aoo-loadout .weapon.fixed { pointer-events: none; }
.aoo-loadout .weapon .wp { position: absolute; inset: 6px 8px; }
.aoo-loadout .weapon .wp > div { position: absolute; inset: 0; }
.aoo-loadout .weapon .wp svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.aoo-loadout .weapon.swapping .wp { animation: aoo-swap .35s ease-in-out infinite alternate; }
@keyframes aoo-swap { from { opacity: .55; } to { opacity: 1; } }
.aoo-loadout .ring { position: absolute; inset: -2px; border-radius: 10px; pointer-events: none;
  border: 3px solid transparent; }
.aoo-loadout .badge { position: absolute; top: -9px; right: -9px; width: 20px; height: 20px; border-radius: 50%;
  background: #ffd34d; color: #111; font: 800 12px/20px system-ui, sans-serif; text-align: center; }
.aoo-loadout .badge[hidden] { display: none; }
.aoo-loadout .key { position: absolute; left: 4px; bottom: 2px; font: 700 11px/1 system-ui, sans-serif;
  color: rgba(255,255,255,.7); text-shadow: 0 1px 2px #000; }
body.aoo-touch-mode .aoo-loadout .key { display: none; }
/* The minimap shares the bottom-right corner on a desktop: it moves up while the weapon shows. */
body.aoo-loadout-on .aoo-minimap { bottom: 114px; }
body.aoo-touch-mode.aoo-loadout-on .aoo-minimap { bottom: auto; }
/* Touch: the USE / RUN buttons stack above the weapon icon. */
body.aoo-loadout-on .aoo-touch .interact { bottom: 118px; }
body.aoo-loadout-on .aoo-touch .sprint { bottom: 198px; }
`;

const READY = '#ffffff';
const FIRED = '#ffd34d';
const BONUS = '#35e0ff';
const SWAP = '#8fb4d8';

export class LoadoutHud {
  readonly root = el('div', 'aoo-loadout');
  private readonly stanceBtn = el('button', 'stance');
  private readonly stanceBadge = el('span', 'badge', str('loadout.auto'));
  private readonly weaponBtn = el('button', 'weapon');
  private readonly weaponBadge = el('span', 'badge', str('loadout.auto'));
  private readonly wp = el('div', 'wp');
  private readonly base = el('div');
  private readonly fill = el('div', 'fill');
  private controls: LoadoutControls | null = null;
  private key = '';
  private weaponKind = '';
  private stanceKind = '';
  private shown = false;
  private hasView = false;
  private allowed = true;

  constructor(parent: HTMLElement) {
    injectStyle('aoo-loadout-css', CSS);
    this.stanceBtn.append(this.stanceBadge, el('span', 'key', 'Z'));
    this.stanceBadge.textContent = 'A';
    this.weaponBadge.textContent = 'A';
    this.wp.append(this.base, this.fill);
    this.weaponBtn.append(this.wp, this.weaponBadge, el('span', 'key', 'Q'));
    this.stanceBtn.type = 'button';
    this.weaponBtn.type = 'button';
    this.root.append(this.stanceBtn, this.weaponBtn);
    this.root.hidden = true;
    this.bindButton(this.stanceBtn, 'stance');
    this.bindButton(this.weaponBtn, 'weapon');
    parent.append(this.root);
  }

  /** Taps press; right-click and long-press toggle auto. */
  private bindButton(btn: HTMLButtonElement, which: 'stance' | 'weapon'): void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let long = false;
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      long = false;
      cancel();
      timer = setTimeout(() => {
        long = true;
        this.controls?.toggleAuto(which);
      }, LONG_PRESS_MS);
    });
    btn.addEventListener('pointerup', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      cancel();
      if (long) return;
      if (which === 'stance') this.controls?.pressStance();
      else this.controls?.pressSwap();
    });
    btn.addEventListener('pointercancel', cancel);
    btn.addEventListener('pointerleave', cancel);
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      cancel();
      this.controls?.toggleAuto(which);
    });
  }

  bind(controls: LoadoutControls): void {
    this.controls = controls;
  }

  /** The HUD as a whole is shown or hidden (menus, the respawn view). */
  setAllowed(on: boolean): void {
    this.allowed = on;
    this.show();
  }

  private show(): void {
    const on = this.allowed && this.hasView && !!this.controls;
    if (on === this.shown) return;
    this.shown = on;
    this.root.hidden = !on;
    document.body.classList.toggle('aoo-loadout-on', on);
  }

  /** `undefined`: no live soldier (hidden). */
  update(v: LoadoutView | undefined): void {
    this.hasView = !!v;
    this.show();
    if (!v || !this.controls) return;
    const c = this.controls;
    const key = [
      v.stance,
      v.settling !== undefined ? Math.round(v.settling * 20) : '',
      v.canStance,
      v.stanceEnabled,
      v.weapon,
      v.cooldown !== undefined ? Math.round(v.cooldown * 50) : '',
      v.swapping !== undefined ? 's' : '',
      v.canSwap,
      v.bonus,
      c.autoStance,
      c.autoWeapon,
    ].join('|');
    if (key === this.key) return;
    this.key = key;

    // Stance.
    this.stanceBtn.hidden = !v.canStance && v.stance === 'standing';
    this.stanceBtn.disabled = !v.stanceEnabled;
    const settling = v.settling !== undefined;
    this.stanceBtn.className = `stance ${v.stance}${settling ? ' settling' : ''}`;
    if (this.stanceKind !== v.stance) {
      this.stanceKind = v.stance;
      this.stanceBtn.querySelector('svg')?.remove();
      this.stanceBtn.insertAdjacentHTML('afterbegin', stanceSvg(v.stance));
    }
    this.stanceBtn.title =
      `${str(`loadout.stance.${v.stance}`)} · ${str('loadout.stance.hintKey')} · ` +
      str(c.autoStance ? 'loadout.autoOn' : 'loadout.autoOff');
    this.stanceBadge.hidden = !c.autoStance;
    this.stanceBtn.style.background = settling
      ? `conic-gradient(rgba(143,180,216,.5) ${Math.round((v.settling ?? 0) * 360)}deg, rgba(0,0,0,.45) 0)`
      : '';

    // Weapon: a white outline round a black fill; a shot turns the fill yellow, then it fades.
    if (this.weaponKind !== v.weapon) {
      this.weaponKind = v.weapon;
      this.base.innerHTML = weaponSvg(v.weapon, '#000', 'currentColor');
      this.fill.innerHTML = weaponSvg(v.weapon, FIRED);
    }
    this.base.style.color = v.swapping !== undefined ? SWAP : v.bonus ? BONUS : READY;
    this.fill.style.opacity =
      v.cooldown !== undefined ? String(Math.round(v.cooldown * 50) / 50) : '0';
    this.weaponBtn.className = `weapon${v.swapping !== undefined ? ' swapping' : ''}${v.canSwap ? '' : ' fixed'}`;
    this.weaponBtn.title = v.canSwap
      ? `${str(`loadout.weapon.${v.weapon}`)} · ${str('loadout.weapon.swapKey')} · ` +
        str(c.autoWeapon ? 'loadout.autoOn' : 'loadout.autoOff')
      : str(`loadout.weapon.${v.weapon}`);
    this.weaponBadge.hidden = !(v.canSwap && c.autoWeapon);
  }
}
