/**
 * DOM HUD overlay: soldier label, HP bar, battle clock, objective, damage vignette, mission
 * complete banner, plus the debug overlay. All text comes from pure models (hud-model.ts,
 * debug-model.ts); this file only touches the DOM.
 */
import { str } from '../../content/strings';
import { el, injectStyle, setText } from '../dom';
import { formatDebugLines, type DebugStats } from './debug-model';
import type { HudModel } from './hud-model';

const HUD_CSS = `
.aoo-hud { position: fixed; inset: 0; pointer-events: none; z-index: 10; color: #f1f3f5;
  font: 600 14px/1.2 system-ui, sans-serif; text-shadow: 0 1px 2px #000, 0 0 4px #000; }
.aoo-hud .tl { position: absolute; top: 12px; left: 12px; display: flex; flex-direction: column; gap: 4px; }
.aoo-hud .who { font-size: 16px; color: #ffd34d; }
.aoo-hud .hp { display: flex; align-items: center; gap: 6px; }
.aoo-hud .bar { width: 160px; height: 10px; background: rgba(0,0,0,.55); border: 1px solid #000;
  border-radius: 2px; overflow: hidden; }
.aoo-hud .fill { height: 100%; background: #4cd964; transition: width .08s linear; }
.aoo-hud .fill.low { background: #ff9f0a; } .aoo-hud .fill.crit { background: #ff3b30; }
.aoo-hud .hp .num { font-variant-numeric: tabular-nums; min-width: 70px; }
.aoo-hud.leadIn .bar { box-shadow: 0 0 6px 2px #35e0ff; }
.aoo-hud.dead .who { color: #ff6b6b; }
.aoo-hud .tr { position: absolute; top: 12px; right: 12px; font-size: 22px; font-variant-numeric: tabular-nums; }
.aoo-hud .obj { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); font-size: 14px;
  background: rgba(0,0,0,.35); padding: 3px 10px; border-radius: 3px; white-space: nowrap; }
.aoo-hud .vignette { position: absolute; inset: 0; opacity: 0; transition: opacity .35s ease-out; will-change: opacity;
  box-shadow: inset 0 0 120px 40px rgba(255, 30, 30, .85); }
.aoo-hud .banner { position: absolute; top: 30%; left: 0; right: 0; text-align: center; font-size: 44px;
  color: #ffd34d; letter-spacing: .04em; }
.aoo-hud .banner[hidden] { display: none; }
.aoo-debug { position: fixed; left: 12px; bottom: 12px; z-index: 11; pointer-events: none;
  font: 12px/1.35 ui-monospace, monospace; color: #b8f5c8; background: rgba(0,0,0,.6);
  padding: 6px 8px; border-radius: 3px; white-space: pre; }
.aoo-debug[hidden] { display: none; }
`;

export class Hud {
  readonly root: HTMLDivElement;
  private readonly who = el('div', 'who');
  private readonly fill = el('div', 'fill');
  private readonly hpNum = el('span', 'num');
  private readonly clock = el('div', 'tr');
  private readonly obj = el('div', 'obj');
  private readonly vignette = el('div', 'vignette');
  private readonly banner = el('div', 'banner');
  private vignetteTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(parent: HTMLElement) {
    injectStyle('aoo-hud-css', HUD_CSS);
    this.root = el('div', 'aoo-hud');
    const tl = el('div', 'tl');
    const hp = el('div', 'hp');
    const bar = el('div', 'bar');
    bar.append(this.fill);
    hp.append(el('span', '', str('hud.hp')), bar, this.hpNum);
    tl.append(this.who, hp);
    this.clock.title = str('hud.clockLabel');
    this.banner.hidden = true;
    this.root.append(this.vignette, tl, this.obj, this.clock, this.banner);
    parent.appendChild(this.root);
  }

  update(m: HudModel): void {
    setText(this.who, m.soldierLabel + (m.status === 'leadIn' ? ` · ${str('hud.leadIn')}` : ''));
    setText(this.hpNum, m.hpText);
    const w = `${(m.hpFraction * 100).toFixed(1)}%`;
    if (this.fill.style.width !== w) this.fill.style.width = w;
    const cls = m.hpFraction <= 0.25 ? 'fill crit' : m.hpFraction <= 0.5 ? 'fill low' : 'fill';
    if (this.fill.className !== cls) this.fill.className = cls;
    const rootCls = `aoo-hud ${m.status}`;
    if (this.root.className !== rootCls) this.root.className = rootCls;
    setText(this.clock, m.clock);
    setText(this.obj, m.objective);
    if (this.banner.hidden === m.missionComplete) this.banner.hidden = !m.missionComplete;
    if (m.missionComplete) setText(this.banner, str('mission.complete'));
  }

  /** Red edge flash when the live soldier is hit (intensity 0..1). */
  flashDamage(intensity = 1): void {
    this.vignette.style.transition = 'none';
    this.vignette.style.opacity = String(Math.max(0.25, Math.min(1, intensity)));
    if (this.vignetteTimer) clearTimeout(this.vignetteTimer);
    this.vignetteTimer = setTimeout(() => {
      this.vignette.style.transition = '';
      this.vignette.style.opacity = '0';
    }, 60);
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }
}

export class DebugOverlay {
  readonly root: HTMLDivElement;

  constructor(parent: HTMLElement) {
    injectStyle('aoo-hud-css', HUD_CSS);
    this.root = el('div', 'aoo-debug');
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  setVisible(v: boolean): void {
    this.root.hidden = !v;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  update(stats: DebugStats): void {
    if (this.root.hidden) return;
    setText(this.root, formatDebugLines(stats).join('\n'));
  }
}
