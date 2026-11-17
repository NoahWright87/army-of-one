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
.aoo-hud .money { font-variant-numeric: tabular-nums; color: #9ee59a; }
.aoo-hud .money.debt { color: #ff8a80; } .aoo-hud .money[hidden] { display: none; }
.aoo-hud .money .rate { opacity: .75; font-weight: 500; margin-left: 6px; }
.aoo-hud.leadIn .bar { box-shadow: 0 0 6px 2px #35e0ff; }
.aoo-hud.dead .who { color: #ff6b6b; }
.aoo-hud .tr { position: absolute; top: 12px; right: 12px; font-size: 22px; font-variant-numeric: tabular-nums; }
.aoo-hud .obj { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); font-size: 14px;
  background: rgba(0,0,0,.35); padding: 3px 10px; border-radius: 3px; white-space: nowrap; }
.aoo-hud .icons { position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 10px; align-items: center; background: rgba(0,0,0,.35); padding: 3px 10px;
  border-radius: 6px; white-space: nowrap; }
.aoo-hud .icons .flags { display: flex; gap: 3px; }
.aoo-hud .icons .helmets { font-size: 16px; letter-spacing: -2px; }
.aoo-hud .icons .helmets.many { letter-spacing: 0; font-size: 15px; font-weight: 700; }
.aoo-hud .icons svg { display: block; }
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
  /** (PHASE11) Money ([D51]). */
  private readonly money = el('div', 'money');
  private readonly moneyNum = el('span', 'num');
  private readonly moneyRate = el('span', 'rate');
  private readonly obj = el('div', 'obj');
  /** (PHASE17) Flags and helmets instead of words ([D140]). */
  private readonly icons = el('div', 'icons');
  private readonly flagsEl = el('div', 'flags');
  private readonly helmetsEl = el('div', 'helmets');
  private iconKey = '';
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
    this.money.title = str('hud.moneyLabel');
    this.money.hidden = true;
    this.money.append(this.moneyNum, this.moneyRate);
    tl.append(this.who, hp, this.money);
    this.clock.title = str('hud.clockLabel');
    this.banner.hidden = true;
    this.icons.append(this.flagsEl, this.helmetsEl);
    this.icons.hidden = true;
    this.root.append(this.vignette, tl, this.obj, this.icons, this.clock, this.banner);
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
    if (this.money.hidden !== (m.money === null)) this.money.hidden = m.money === null;
    if (m.money !== null) {
      setText(this.moneyNum, m.money);
      setText(this.moneyRate, m.moneyRate ?? '');
      const cls = m.moneyDebt ? 'money debt' : 'money';
      if (this.money.className !== cls) this.money.className = cls;
    }
    // (PHASE17) Icons when there are flags or enemies to count; the text otherwise ([D140]).
    const useIcons = (m.flags.length > 0 || m.enemiesLeft !== null) && !m.missionComplete;
    if (this.icons.hidden === useIcons) this.icons.hidden = !useIcons;
    if (this.obj.hidden === useIcons) this.obj.hidden = useIcons;
    if (useIcons) this.renderIcons(m);
    else setText(this.obj, m.objective);
    if (this.banner.hidden === m.missionComplete) this.banner.hidden = !m.missionComplete;
    if (m.missionComplete) setText(this.banner, str('mission.complete'));
  }

  private renderIcons(m: HudModel): void {
    const key =
      m.flags.map((f) => `${f.state}${Math.round(f.progress * 8)}`).join(',') + `|${m.enemiesLeft}`;
    if (key === this.iconKey) return;
    this.iconKey = key;
    this.flagsEl.innerHTML = m.flags.map((f) => flagSvg(f.state, f.progress)).join('');
    const n = m.enemiesLeft;
    this.helmetsEl.hidden = n === null;
    if (n === null) return;
    const many = n > HELMETS_SHOWN;
    this.helmetsEl.className = many ? 'helmets many' : 'helmets';
    this.helmetsEl.textContent = many ? `🪖×${n}` : n === 0 ? '' : '🪖'.repeat(n);
    this.helmetsEl.title = str('hud.enemiesLeft', { n });
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

/** (PHASE17) Below this many enemies left, each is its own helmet ([D140]). */
const HELMETS_SHOWN = 10;

/** (PHASE17) A small flag: green when ours, white when theirs, filling green while taken. */
function flagSvg(state: 'ours' | 'taking' | 'theirs', progress: number): string {
  const fill = state === 'ours' ? '#4fd15a' : '#e9edf1';
  const h = Math.round(10 * progress);
  const taking =
    state === 'taking'
      ? `<rect x="5" y="${3 + 10 - h}" width="11" height="${h}" fill="#4fd15a"/>`
      : '';
  return (
    `<svg width="18" height="20" viewBox="0 0 18 20" aria-hidden="true">` +
    `<rect x="3" y="2" width="2" height="17" fill="#c9ced4"/>` +
    `<rect x="5" y="3" width="11" height="10" fill="${fill}"/>${taking}</svg>`
  );
}
