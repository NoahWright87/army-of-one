/**
 * Game-flow DOM overlays (PHASE04): title, mission complete, the death-beat caption, the
 * "Preparing…" spinner, the "History shifted" notice, plus dev-only widgets (dev bar, raw
 * timeline JSON panel). Placeholder look, same palette as the HUD and respawn screen. They know
 * nothing about the sim; app/main.ts wires them to the game controller.
 */
import { str, strDynamic } from '../../content/strings';
import { formatBattleTime, type Tick } from '../../sim/core/time';
import { el, injectStyle, setText } from '../dom';

const CSS = `
.aoo-screen { position: fixed; inset: 0; z-index: 22; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at center, rgba(20,26,32,.92), rgba(8,10,13,.98)); color: #e6e9ec;
  font: 15px/1.4 system-ui, sans-serif; }
.aoo-screen[hidden] { display: none; }
.aoo-screen .card { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 28px 32px;
  max-width: min(520px, calc(100% - 32px)); text-align: center; }
.aoo-screen h1 { margin: 0; font-size: 52px; letter-spacing: .04em; color: #ffd34d;
  text-shadow: 0 3px 0 #000, 0 0 24px rgba(255,211,77,.35); }
.aoo-screen .sub { color: #9fb3c8; margin: 0 0 8px; }
.aoo-screen button { min-width: 240px; min-height: 48px; font: 600 17px system-ui, sans-serif; color: #10140f;
  background: #ffd34d; border: 0; border-radius: 6px; cursor: pointer; padding: 0 18px; }
.aoo-screen button.secondary { background: #222a32; color: #e6e9ec; border: 1px solid #3c4650; }
.aoo-screen button:disabled { opacity: .35; cursor: default; }
.aoo-screen button.confirm { background: #ff6b5a; color: #fff; }
.aoo-screen dl { display: grid; grid-template-columns: auto auto; gap: 6px 28px; margin: 4px 0 10px; text-align: left; }
.aoo-screen dt { color: #8a96a3; text-transform: uppercase; font-size: 12px; letter-spacing: .06em; align-self: center; }
.aoo-screen dd { margin: 0; font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.aoo-caption { position: fixed; inset: 0; z-index: 21; display: flex; align-items: center; justify-content: center;
  pointer-events: none; }
.aoo-caption[hidden] { display: none; }
.aoo-caption span { font: 900 120px/1 system-ui, sans-serif; color: #ff4b3a; letter-spacing: .08em;
  text-shadow: 0 5px 0 #000, 0 0 30px rgba(255,40,30,.6); animation: aoo-cap-in .25s ease-out; }
.aoo-caption.complete span { color: #ffd34d; font-size: 72px; text-shadow: 0 4px 0 #000, 0 0 30px rgba(255,211,77,.6); }
.aoo-caption.kia { background: radial-gradient(ellipse at center, rgba(60,0,0,0) 30%, rgba(60,0,0,.55)); }
@keyframes aoo-cap-in { from { transform: scale(1.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.aoo-busy { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 26; display: flex;
  gap: 10px; align-items: center; background: rgba(10,13,16,.9); border: 1px solid #39424c; border-radius: 6px;
  padding: 12px 18px; color: #e6e9ec; font: 600 15px system-ui, sans-serif; }
.aoo-busy[hidden] { display: none; }
.aoo-busy i { width: 18px; height: 18px; border: 3px solid #3c4650; border-top-color: #ffd34d; border-radius: 50%;
  animation: aoo-spin .8s linear infinite; }
@keyframes aoo-spin { to { transform: rotate(360deg); } }
.aoo-notice { position: fixed; bottom: 72px; left: 50%; transform: translateX(-50%); z-index: 25; max-width: calc(100% - 32px);
  background: #3b1a12; border: 1px solid #ff8a5a; color: #ffe1d4; padding: 10px 16px; border-radius: 6px;
  font: 600 15px system-ui, sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,.6); }
.aoo-notice[hidden] { display: none; }
.aoo-leadin-hint { position: fixed; left: 50%; top: calc(11vh + 136px); transform: translateX(-50%); z-index: 20;
  pointer-events: none; color: #c8f4ff; font: 600 15px system-ui, sans-serif; text-shadow: 0 1px 2px #000, 0 0 6px #000; }
.aoo-leadin-hint[hidden] { display: none; }
.aoo-devbar { position: fixed; right: 96px; top: 4px; z-index: 29; display: flex; gap: 6px; align-items: center;
  background: rgba(16,20,24,.9); border: 1px solid #39424c; border-radius: 4px; padding: 4px 6px;
  font: 12px system-ui, sans-serif; color: #c8d0d8; }
.aoo-devbar button { font: inherit; background: #222a32; color: #e6e9ec; border: 1px solid #3c4650; border-radius: 3px;
  padding: 3px 8px; cursor: pointer; }
.aoo-devbar .tag { color: #ffd34d; font-weight: 700; }
.aoo-tljson { position: fixed; right: 8px; top: 40px; width: min(560px, calc(100% - 16px)); max-height: 55%; z-index: 28;
  overflow: auto; background: rgba(8,10,13,.92); border: 1px solid #39424c; border-radius: 4px; padding: 6px 8px;
  font: 11px/1.3 ui-monospace, monospace; color: #b8f5c8; white-space: pre; }
.aoo-tljson[hidden] { display: none; }
`;

function screen(parent: HTMLElement): { root: HTMLDivElement; card: HTMLDivElement } {
  injectStyle('aoo-flow-css', CSS);
  const root = el('div', 'aoo-screen');
  root.hidden = true;
  const card = el('div', 'card');
  root.append(card);
  parent.append(root);
  return { root, card };
}

export interface TitleProps {
  canContinue: boolean;
  missionNameKey: string;
  onNew(): void;
  onContinue(): void;
}

export class TitleScreen {
  private readonly s;

  constructor(parent: HTMLElement) {
    this.s = screen(parent);
  }

  show(p: TitleProps): void {
    const { root, card } = this.s;
    card.replaceChildren();
    const cont = el('button', '', str('title.continue'));
    cont.disabled = !p.canContinue;
    cont.onclick = () => p.onContinue();
    const fresh = el('button', p.canContinue ? 'secondary' : '', str('title.new'));
    let armed = false;
    fresh.onclick = () => {
      // Starting over wipes the save: ask once.
      if (p.canContinue && !armed) {
        armed = true;
        fresh.className = 'confirm';
        fresh.textContent = str('title.newConfirm');
        return;
      }
      p.onNew();
    };
    card.append(
      el('h1', '', str('title.name')),
      el('p', 'sub', str('title.tagline')),
      el('p', 'sub', str('title.mission', { name: strDynamic(p.missionNameKey) })),
      ...(p.canContinue ? [cont, fresh] : [fresh]),
    );
    root.hidden = false;
    (p.canContinue ? cont : fresh).focus();
  }

  hide(): void {
    this.s.root.hidden = true;
  }
}

export interface CompleteStats {
  battleTicks: Tick;
  soldiersUsed: number;
  rescues: number;
  attempts: number;
}

export class CompleteScreen {
  private readonly s;

  constructor(parent: HTMLElement) {
    this.s = screen(parent);
  }

  show(stats: CompleteStats, onPlayAgain: () => void): void {
    const { root, card } = this.s;
    card.replaceChildren();
    const dl = el('dl');
    const row = (label: string, value: string) =>
      dl.append(el('dt', '', label), el('dd', '', value));
    row(str('complete.battleTime'), formatBattleTime(stats.battleTicks));
    row(str('complete.soldiers'), String(stats.soldiersUsed));
    row(str('complete.rescues'), String(stats.rescues));
    row(str('complete.attempts'), String(stats.attempts));
    const again = el('button', '', str('complete.playAgain'));
    again.onclick = () => onPlayAgain();
    card.append(el('h1', '', str('complete.title')), dl, again);
    root.hidden = false;
    again.focus();
  }

  hide(): void {
    this.s.root.hidden = true;
  }
}

/** Big centered caption over the battlefield (death beat). */
export class Caption {
  private readonly root = el('div', 'aoo-caption');
  private readonly text = el('span');

  constructor(parent: HTMLElement) {
    injectStyle('aoo-flow-css', CSS);
    this.root.hidden = true;
    this.root.append(this.text);
    parent.append(this.root);
  }

  show(kind: 'kia' | 'complete' | null): void {
    if (!kind) {
      this.root.hidden = true;
      return;
    }
    this.root.className = `aoo-caption ${kind}`;
    setText(this.text, str(kind === 'kia' ? 'caption.kia' : 'caption.complete'));
    // Restart the pop-in animation.
    this.text.style.animation = 'none';
    void this.text.offsetWidth;
    this.text.style.animation = '';
    this.root.hidden = false;
  }
}

export class Busy {
  private readonly root = el('div', 'aoo-busy');
  private readonly label = el('span', '', str('busy.preparing'));

  constructor(parent: HTMLElement) {
    injectStyle('aoo-flow-css', CSS);
    this.root.hidden = true;
    this.root.append(el('i'), this.label);
    parent.append(this.root);
  }

  /** `text` replaces "Preparing…" while shown (e.g. stress-mode progress). */
  set(on: boolean, text?: string): void {
    this.root.hidden = !on;
    this.label.textContent = text ?? str('busy.preparing');
  }
}

/** A short toast ("History shifted"); hides by itself. */
export class Notice {
  private readonly root = el('div', 'aoo-notice');
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(parent: HTMLElement) {
    injectStyle('aoo-flow-css', CSS);
    this.root.hidden = true;
    this.root.setAttribute('role', 'status');
    parent.append(this.root);
  }

  show(text: string | null, ms = 5000): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!text) {
      this.root.hidden = true;
      return;
    }
    setText(this.root, text);
    this.root.hidden = false;
    this.timer = setTimeout(() => {
      this.root.hidden = true;
      this.timer = null;
    }, ms);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }
}

/** "Get ready" line under the countdown. */
export class LeadInHint {
  private readonly root = el('div', 'aoo-leadin-hint', str('leadIn.hint'));

  constructor(parent: HTMLElement) {
    injectStyle('aoo-flow-css', CSS);
    this.root.hidden = true;
    parent.append(this.root);
  }

  set(on: boolean): void {
    if (this.root.hidden === on) this.root.hidden = !on;
  }
}

export interface DevBarActions {
  reset(): void;
  kill(): void;
  toggleTimeline?(): void;
}

/** Dev-only strip: speed readout, Reset mission, Kill, timeline JSON toggle. */
export class DevBar {
  private readonly root = el('div', 'aoo-devbar');
  private readonly tag = el('span', 'tag', 'DEV');
  private readonly speed = el('span');
  private readonly auto = el('span');

  constructor(parent: HTMLElement, actions: DevBarActions) {
    injectStyle('aoo-flow-css', CSS);
    const reset = el('button', '', str('dev.reset'));
    reset.onclick = () => actions.reset();
    const kill = el('button', '', str('dev.kill'));
    kill.onclick = () => actions.kill();
    this.root.append(this.tag, this.speed, this.auto, kill, reset);
    if (actions.toggleTimeline) {
      const tl = el('button', '', str('dev.timeline'));
      tl.onclick = () => actions.toggleTimeline!();
      this.root.append(tl);
    }
    parent.append(this.root);
  }

  setSpeed(x: string): void {
    setText(this.speed, str('dev.speed', { x }));
  }

  setAutoplay(left: number | null): void {
    setText(this.auto, left === null ? '' : str('dev.autoplay', { left }));
  }
}

/** `?debugTimeline=1`: raw lanes / last observation as JSON. */
export class TimelineJsonPanel {
  private readonly root = el('pre', 'aoo-tljson');
  private last = '';

  constructor(parent: HTMLElement, visible: boolean) {
    injectStyle('aoo-flow-css', CSS);
    this.root.hidden = !visible;
    parent.append(this.root);
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
    this.last = '';
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /** Top-level fields one per line; arrays one element per line (compact but still raw JSON). */
  update(data: Record<string, unknown>): void {
    if (this.root.hidden) return;
    const lines: string[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (Array.isArray(v)) {
        lines.push(`"${k}": [`, ...v.map((x) => `  ${JSON.stringify(x)},`), ']');
      } else lines.push(`"${k}": ${JSON.stringify(v)}`);
    }
    const text = lines.join('\n');
    if (text !== this.last) {
      this.last = text;
      this.root.textContent = text;
    }
  }
}
