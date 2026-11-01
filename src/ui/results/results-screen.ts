/**
 * (07-a) Results screen ([D42]): stats, a play-style radar ([D18]) and personal bests over the
 * after-action replay, plus the replay controls (play/pause, speed, a scrub bar marked with
 * deaths, captures, kills and the win, skip to end). DOM only; the replay itself is a Phaser
 * scene (`ReplayScene`) driven through `ReplayControls`.
 */
import { str, type StringKey } from '../../content/strings';
import { formatBattleTime, type Tick } from '../../sim/core/time';
import type { ReplayControls } from '../../render/phaser/replay-scene';
import { el, injectStyle } from '../dom';
import type { Bests, RadarAxis, ResultStats, ScrubMark } from './results-model';

const CSS = `
.aoo-results { position: fixed; inset: 0; z-index: 25; pointer-events: none; font: 14px system-ui, sans-serif;
  color: #e6e9ec; }
.aoo-results[hidden] { display: none; }
.aoo-results .card { position: absolute; left: 16px; top: 16px; width: 300px; max-height: calc(100% - 120px);
  overflow: auto; pointer-events: auto; background: rgba(12,15,19,.86); border: 1px solid #39424c;
  border-radius: 8px; padding: 14px 16px; box-shadow: 0 6px 24px rgba(0,0,0,.5); }
.aoo-results h1 { margin: 0 0 8px; font-size: 22px; color: #ffd34d; }
.aoo-results dl { display: grid; grid-template-columns: 1fr auto; gap: 3px 12px; margin: 0 0 10px; }
.aoo-results dt { color: #9aa6b2; }
.aoo-results dd { margin: 0; font-weight: 700; text-align: right; }
.aoo-results dd.best::after { content: ' ★'; color: #ffd34d; }
.aoo-results .radar { display: block; margin: 4px auto 8px; }
.aoo-results .radar text { fill: #9aa6b2; font-size: 10px; }
.aoo-results .btns { display: flex; gap: 8px; }
.aoo-results .btns button { flex: 1; min-height: 40px; font: 700 14px system-ui, sans-serif; border-radius: 6px;
  border: 0; cursor: pointer; background: #2a323b; color: #e6e9ec; }
.aoo-results .btns button.primary { background: #ffd34d; color: #1a1406; }
.aoo-results .card .toggle { position: absolute; right: 8px; top: 8px; background: none; border: 0; color: #9aa6b2;
  font-size: 18px; cursor: pointer; }
.aoo-results .card.min { width: auto; }
.aoo-results .card.min > :not(h1):not(.toggle):not(.btns) { display: none; }
.aoo-results .bar { position: absolute; left: 16px; right: 16px; bottom: 16px; pointer-events: auto;
  display: flex; gap: 8px; align-items: center; background: rgba(12,15,19,.86); border: 1px solid #39424c;
  border-radius: 8px; padding: 8px 10px; }
.aoo-results .bar button { min-width: 40px; min-height: 36px; border-radius: 5px; border: 1px solid #3c4650;
  background: #222a32; color: #e6e9ec; font: 700 13px system-ui, sans-serif; cursor: pointer; }
.aoo-results .bar button.on { border-color: #ffd34d; color: #ffd34d; }
.aoo-results .scrub { position: relative; flex: 1; height: 28px; cursor: pointer; touch-action: none; }
.aoo-results .scrub .track { position: absolute; left: 0; right: 0; top: 12px; height: 4px; background: #39424c; border-radius: 2px; }
.aoo-results .scrub .fill { position: absolute; left: 0; top: 12px; height: 4px; background: #ffd34d; border-radius: 2px; }
.aoo-results .scrub .mark { position: absolute; top: 6px; width: 3px; height: 16px; margin-left: -1px; border-radius: 1px; }
.aoo-results .scrub .mark.death { background: #ff4d4d; }
.aoo-results .scrub .mark.capture { background: #4dd87a; }
.aoo-results .scrub .mark.kill { background: #ff9a3d; height: 8px; top: 10px; }
.aoo-results .scrub .mark.objective { background: #ffd34d; width: 5px; }
.aoo-results .time { min-width: 92px; text-align: right; font-variant-numeric: tabular-nums; color: #c8d0d8; }
.aoo-results .quiet { color: #9aa6b2; font-size: 11px; }
@media (max-width: 760px) {
  .aoo-results .card { left: 8px; right: 8px; top: 8px; width: auto; max-height: 45%; padding: 10px 12px; }
  .aoo-results .bar { left: 8px; right: 8px; bottom: 8px; flex-wrap: wrap; }
  .aoo-results .scrub { flex-basis: 100%; order: -1; }
}
`;

export interface ResultsData {
  stats: ResultStats;
  radar: RadarAxis[] | null;
  bests: Bests;
  improved: (keyof Bests)[];
  marks: ScrubMark[];
}

const RADAR_LABEL: Record<RadarAxis['key'], StringKey> = {
  speed: 'results.radar.speed',
  economy: 'results.radar.economy',
  teamwork: 'results.radar.teamwork',
  aggression: 'results.radar.aggression',
  survival: 'results.radar.survival',
  tactics: 'results.radar.tactics',
};

/** Radar chart as an SVG string (pure). */
export function radarSvg(axes: readonly RadarAxis[], size = 180): string {
  const c = size / 2;
  const r = size / 2 - 26;
  const n = axes.length;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v] as const;
  };
  const ring = (v: number) =>
    axes
      .map((_, i) =>
        pt(i, v)
          .map((x) => x.toFixed(1))
          .join(','),
      )
      .join(' ');
  const shape = axes
    .map((a, i) =>
      pt(i, Math.max(0.04, a.value))
        .map((x) => x.toFixed(1))
        .join(','),
    )
    .join(' ');
  const labels = axes
    .map((a, i) => {
      const [x, y] = pt(i, 1.22);
      return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle">${str(RADAR_LABEL[a.key])}</text>`;
    })
    .join('');
  return (
    `<svg class="radar" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img">` +
    [0.33, 0.66, 1]
      .map((v) => `<polygon points="${ring(v)}" fill="none" stroke="#39424c" stroke-width="1"/>`)
      .join('') +
    `<polygon points="${shape}" fill="rgba(255,211,77,.35)" stroke="#ffd34d" stroke-width="2"/>` +
    labels +
    `</svg>`
  );
}

export class ResultsScreen {
  private readonly root = el('div', 'aoo-results');
  private readonly card = el('div', 'card');
  private readonly bar = el('div', 'bar');
  private controls: ReplayControls | null = null;
  private raf = 0;
  private marks: ScrubMark[] = [];
  private readonly fill = el('div', 'fill');
  private readonly marksEl = el('div', 'marks');
  private readonly time = el('span', 'time');
  private readonly playBtn = el('button', '', '❚❚');
  private readonly speedBtns: HTMLButtonElement[] = [];
  private readonly quietEl = el('span', 'quiet');

  constructor(parent: HTMLElement) {
    injectStyle('aoo-results-css', CSS);
    this.root.hidden = true;
    this.root.append(this.card, this.bar);
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(d: ResultsData, actions: { onWatchAgain(): void; onPlayAgain(): void }): void {
    this.marks = d.marks;
    const s = d.stats;
    this.card.replaceChildren();
    this.card.className = 'card';
    const toggle = el('button', 'toggle', '–');
    toggle.setAttribute('aria-label', str('results.toggle'));
    toggle.onclick = () => {
      this.card.classList.toggle('min');
      toggle.textContent = this.card.classList.contains('min') ? '+' : '–';
    };
    const dl = el('dl');
    const row = (key: StringKey, value: string, best = false) => {
      const dd = el('dd', best ? 'best' : '', value);
      dl.append(el('dt', '', str(key)), dd);
    };
    const imp = new Set(d.improved);
    row('complete.battleTime', formatBattleTime(s.battleTicks), imp.has('fastestTicks'));
    row('complete.soldiers', String(s.soldiersUsed), imp.has('fewestSoldiers'));
    row('complete.attempts', String(s.attempts));
    row('results.deaths', String(s.deaths));
    row('complete.rescues', String(s.rescues), imp.has('mostRescues'));
    row('results.captures', String(s.captures));
    row('results.kills', String(s.kills));
    row('results.shots', String(s.shots));
    row('results.longestLife', formatBattleTime(s.longestLifeTicks));
    if (s.mvp) row('results.mvp', str('hud.soldier', { n: s.mvp.ordinal }));
    const bestsDl = el('dl');
    const b = d.bests;
    const brow = (key: StringKey, v: string | undefined) => {
      if (v !== undefined) bestsDl.append(el('dt', '', str(key)), el('dd', '', v));
    };
    brow(
      'results.best.fastest',
      b.fastestTicks !== undefined ? formatBattleTime(b.fastestTicks) : undefined,
    );
    brow('results.best.fewest', b.fewestSoldiers?.toString());
    brow('results.best.rescues', b.mostRescues?.toString());
    const btns = el('div', 'btns');
    const watch = el('button', '', str('results.watchAgain'));
    watch.onclick = () => actions.onWatchAgain();
    const again = el('button', 'primary', str('complete.playAgain'));
    again.onclick = () => actions.onPlayAgain();
    btns.append(watch, again);
    this.card.append(toggle, el('h1', '', str('complete.title')), dl);
    if (d.radar) {
      const wrap = el('div');
      wrap.innerHTML = radarSvg(d.radar);
      this.card.append(wrap);
    }
    if (bestsDl.childElementCount > 0) {
      this.card.append(el('div', 'quiet', str('results.bests')), bestsDl);
    }
    this.card.append(btns);
    this.buildBar();
    // Phones: start collapsed (title + buttons), so the replay has the screen.
    if (window.matchMedia?.('(max-width: 760px)').matches) {
      this.card.classList.add('min');
      toggle.textContent = '+';
    }
    this.root.hidden = false;
    again.focus();
  }

  /**
   * Screen px the card and bar cover on each side, for the replay camera: the bar covers the
   * bottom; the card covers the left on wide screens, the top on narrow ones.
   */
  insets(): { top: number; right: number; bottom: number; left: number } {
    const out = { top: 0, right: 0, bottom: 0, left: 0 };
    if (this.root.hidden) return out;
    const vh = window.innerHeight;
    const bar = this.bar.getBoundingClientRect();
    out.bottom = Math.max(0, vh - bar.top);
    const card = this.card.getBoundingClientRect();
    if (card.width > window.innerWidth * 0.6) out.top = card.bottom;
    else out.left = card.right;
    return out;
  }

  /** Hooks the bar up to the replay once its scene is ready. */
  attach(controls: ReplayControls): void {
    this.controls = controls;
    this.renderMarks();
    cancelAnimationFrame(this.raf);
    const tick = () => {
      this.refresh();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  hide(): void {
    this.root.hidden = true;
    this.controls = null;
    cancelAnimationFrame(this.raf);
  }

  private buildBar(): void {
    this.bar.replaceChildren();
    this.playBtn.onclick = () => this.controls?.togglePlay();
    this.playBtn.setAttribute('aria-label', str('results.playPause'));
    const scrub = el('div', 'scrub');
    scrub.append(el('div', 'track'), this.fill, this.marksEl);
    const seekAt = (clientX: number) => {
      const c = this.controls;
      if (!c) return;
      const r = scrub.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      c.seek(Math.round(f * c.endTick));
    };
    let dragging = false;
    scrub.addEventListener('pointerdown', (e) => {
      dragging = true;
      scrub.setPointerCapture?.(e.pointerId);
      seekAt(e.clientX);
    });
    scrub.addEventListener('pointermove', (e) => {
      if (dragging) seekAt(e.clientX);
    });
    const stop = () => (dragging = false);
    scrub.addEventListener('pointerup', stop);
    scrub.addEventListener('pointercancel', stop);
    this.speedBtns.length = 0;
    const speeds = [1, 2, 4];
    const speedEls = speeds.map((x) => {
      const b = el('button', x === 1 ? 'on' : '', `${x}×`);
      b.onclick = () => {
        this.controls?.setSpeed(x);
        this.speedBtns.forEach((o, i) => o.classList.toggle('on', speeds[i] === x));
      };
      this.speedBtns.push(b);
      return b;
    });
    const end = el('button', '', '⏭');
    end.setAttribute('aria-label', str('results.skipEnd'));
    end.onclick = () => this.controls?.skipToEnd();
    this.bar.append(this.playBtn, scrub, this.time, ...speedEls, end, this.quietEl);
  }

  private renderMarks(): void {
    const c = this.controls;
    if (!c) return;
    const end = Math.max(1, c.endTick);
    this.marksEl.replaceChildren(
      ...this.marks.map((m) => {
        const d = el('div', `mark ${m.kind}`);
        d.style.left = `${(m.tick / end) * 100}%`;
        return d;
      }),
    );
  }

  private refresh(): void {
    const c = this.controls;
    if (!c) return;
    const f = c.endTick > 0 ? c.tick / c.endTick : 1;
    this.fill.style.width = `${(f * 100).toFixed(2)}%`;
    const t = `${formatBattleTime(c.tick as Tick)} / ${formatBattleTime(c.endTick)}`;
    if (this.time.textContent !== t) this.time.textContent = t;
    const icon = c.playing ? '❚❚' : '▶';
    if (this.playBtn.textContent !== icon) this.playBtn.textContent = icon;
    const q = c.quiet && c.playing ? str('results.quiet') : '';
    if (this.quietEl.textContent !== q) this.quietEl.textContent = q;
  }
}
