/**
 * (PHASE19) The respawn controls over the battlefield. The battle scene is in respawn mode
 * (`TimeControls`): it plays the tape on a smooth clock; this DOM layer adds:
 * - the money at the shown time, big at the top;
 * - a timeline: spawn options as lettered chevrons stacked above it (A, B, C… = Alpha, Bravo,
 *   Charlie…; a saved soldier's number for a resume), the last-used one highlighted; deaths as
 *   red ticks; a hatched part past what has played;
 * - |◀ ▶| (previous / next spawn or death), ◀◀ (back 5 s), play / pause, ▶▶ (fast);
 * - circles in the world: every spawn point, and every saved soldier while they're on screen.
 *   Tapping one (or its chevron) glides time and the camera there and opens a small card: the
 *   roles + DEPLOY, or RESUME. Nothing ever jumps.
 * R / Space selects the last-used spawn (a second press deploys). Everything deployed is a
 * `SpawnOption` the game controller offered: the rules are the controller's.
 */
import { str, strDynamic } from '../../content/strings';
import { roleIconSvg } from '../../content/role-icons';
import { ROLES } from '../../content/roles';
import { DEFAULT_TUNING } from '../../content/tuning';
import { ROLE_CARD_CSS, roleCardHtml } from '../respawn/role-card-view';
import type { RoleId, SpawnOption } from '../../contracts/mission';
import type { TimeControls } from '../../render/time-controls';
import { formatBattleTime, TICKS_PER_SECOND, type Tick } from '../../sim/core/time';
import { availableAt, formatMoney } from '../../timeline/economy';
import { el, injectStyle } from '../dom';
import {
  ordinalFromId,
  roleLocked,
  roleMoney,
  shownEconomy,
  type RespawnProps,
  type RespawnUpdate,
} from '../respawn/respawn-model';
import {
  buildStops,
  chevrons,
  nearbyOptions,
  optionKeyOf,
  optionPlace,
  optionTick,
  spawnLabels,
  type SpawnLabel,
  stepStop,
  type Chevron,
  type Stop,
} from './inworld-model';

/** A resume circle shows on its soldier this long around their resume time. TUNE */
const NEAR_TICKS = 3 * TICKS_PER_SECOND;
/** A death jump lands this long before the death and plays it. TUNE */
const DEATH_LEAD = 2 * TICKS_PER_SECOND;
const BACK_TICKS = 5 * TICKS_PER_SECOND;
const FAST = 4;
/** A starting balance this big means money doesn't matter here (basic training). */
const UNLIMITED_MONEY = 1_000_000;

const CSS = `
.aoo-iw { position: fixed; inset: 0; z-index: 24; pointer-events: none; font: 14px system-ui, sans-serif; color: #e6e9ec;
  opacity: 0; transition: opacity .45s ease; }
.aoo-iw.on { opacity: 1; }
.aoo-iw .vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 55%, rgba(8,12,18,.55) 100%); }
.aoo-iw .top { position: absolute; left: 50%; top: 10px; transform: translateX(-50%); text-align: center;
  text-shadow: 0 2px 6px rgba(0,0,0,.8); }
.aoo-iw .money { font: 800 30px system-ui, sans-serif; color: #ffd34d; }
.aoo-iw .money.debt { color: #ff6b6b; }
.aoo-iw .clock { font: 700 15px system-ui, sans-serif; font-variant-numeric: tabular-nums; color: #c8d0d8; }
.aoo-iw .back { position: absolute; left: 10px; top: 10px; pointer-events: auto; min-height: 36px; padding: 0 12px;
  border-radius: 6px; border: 1px solid #3c4650; background: rgba(12,15,19,.8); color: #e6e9ec; font: 700 13px system-ui; cursor: pointer; }
.aoo-iw .bar { position: absolute; left: 12px; right: 12px; bottom: 12px; pointer-events: auto; display: flex; gap: 6px;
  align-items: center; background: rgba(12,15,19,.86); border: 1px solid #39424c; border-radius: 8px; padding: 8px 10px; }
.aoo-iw .bar button { min-width: 42px; min-height: 40px; border-radius: 6px; border: 1px solid #3c4650; background: #222a32;
  color: #e6e9ec; font: 700 15px system-ui, sans-serif; cursor: pointer; }
.aoo-iw .bar button.on { border-color: #ffd34d; color: #ffd34d; }
.aoo-iw .scrub { position: relative; flex: 1; height: 32px; cursor: pointer; touch-action: none; min-width: 120px; margin: 0 14px; }
.aoo-iw .bar { padding-top: 38px; }
.aoo-iw .scrub .track { position: absolute; left: 0; right: 0; top: 14px; height: 4px; background: #39424c; border-radius: 2px; }
.aoo-iw .scrub .fill { position: absolute; left: 0; top: 14px; height: 4px; background: #c8d0d8; border-radius: 2px; }
.aoo-iw .scrub .unknown { position: absolute; top: 12px; height: 8px; right: 0;
  background: repeating-linear-gradient(135deg,#2a3038 0 4px,#14181d 4px 8px); border-radius: 2px; }
.aoo-iw .scrub .death { position: absolute; top: 8px; width: 3px; height: 16px; margin-left: -1px; background: #ff4d4d; border-radius: 1px; pointer-events: none; }
.aoo-iw .scrub .head { position: absolute; top: 2px; width: 2px; height: 28px; margin-left: -1px; background: #ffd34d; pointer-events: none; }
.aoo-iw .bar .chev { position: absolute; transform: translateX(-50%); width: 30px; height: 28px; min-width: 0; min-height: 0;
  pointer-events: auto; cursor: pointer; border: 0; border-radius: 0; padding: 0; background: none;
  font: 900 13px system-ui, sans-serif; color: #0c0f13; filter: drop-shadow(0 1px 2px rgba(0,0,0,.7)); }
.aoo-iw .chev svg { position: absolute; inset: 0; }
.aoo-iw .chev span { position: relative; top: 3px; }
.aoo-iw .chev.new svg path { fill: #5aa9ff; }
.aoo-iw .chev.resume svg path { fill: #4dd87a; }
.aoo-iw .chev.last svg path { fill: #ffd34d; }
.aoo-iw .bar .chev.sel { filter: drop-shadow(0 0 6px #fff); }
.aoo-iw .spot { position: absolute; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%; pointer-events: auto;
  cursor: pointer; display: grid; place-items: center; background: rgba(12,15,19,.35); border: 4px solid #5aa9ff;
  color: #e6e9ec; font: 900 18px system-ui, sans-serif; box-shadow: 0 0 0 2px rgba(0,0,0,.5), 0 0 16px rgba(90,169,255,.6); }
.aoo-iw .spot.resume { border-color: #4dd87a; box-shadow: 0 0 0 2px rgba(0,0,0,.5), 0 0 16px rgba(77,216,122,.7);
  animation: aoo-iw-pulse 1.2s ease-in-out infinite; }
.aoo-iw .spot.last { border-color: #ffd34d; }
.aoo-iw .spot.far { opacity: .55; }
.aoo-iw .spot.sel { border-color: #fff; opacity: 1; }
@keyframes aoo-iw-pulse { 50% { transform: scale(1.12); } }
.aoo-iw .card { position: absolute; pointer-events: auto; transform: translate(-50%, 0); background: rgba(12,15,19,.94);
  border: 1px solid #39424c; border-radius: 10px; padding: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.6); min-width: 200px; }
.aoo-iw .card .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; color: #c8d0d8; font-weight: 700; }
.aoo-iw .card .x { background: none; border: 0; color: #9aa6b2; font-size: 18px; cursor: pointer; }
.aoo-iw .roles { display: grid; grid-template-columns: repeat(5, 44px); gap: 6px; margin-bottom: 8px; }
.aoo-iw .roles button { position: relative; height: 44px; border-radius: 6px; border: 2px solid #3c4650; background: #222a32;
  color: #e6e9ec; cursor: pointer; display: grid; place-items: center; }
.aoo-iw .roles button.on { border-color: #ffd34d; color: #ffd34d; }
.aoo-iw .roles button:disabled { opacity: .3; cursor: default; }
.aoo-iw .roles button small { position: absolute; bottom: 0; right: 2px; font-size: 9px; color: #9aa6b2; }
.aoo-iw .rolecard { width: 262px; margin-bottom: 8px; }
.aoo-iw .rolecard .rs-card { margin-top: 0; }
${ROLE_CARD_CSS}
.aoo-iw .go { width: 100%; min-height: 48px; border: 0; border-radius: 8px; background: #ffd34d; color: #1a1406;
  font: 900 18px system-ui, sans-serif; letter-spacing: .04em; cursor: pointer; }
.aoo-iw .go.resume { background: #4dd87a; }
@media (max-width: 760px) {
  .aoo-iw .bar { left: 6px; right: 6px; bottom: 6px; flex-wrap: wrap; padding: 6px; padding-top: 30px; }
  .aoo-iw .scrub { flex-basis: 100%; order: -1; }
  .aoo-iw .time { display: none; }
  .aoo-iw .money { font-size: 24px; }
}
`;

const CHEVRON_SVG =
  '<svg viewBox="0 0 30 28" width="30" height="28" aria-hidden="true"><path d="M1 27 L15 1 L29 27 L15 21 Z"/></svg>';

/**
 * A coach-friendly key for an option, like the respawn screen's (`new:<spawn point>`,
 * `resume:<soldier>`): the chevron and circle carry it as `data-select`.
 */
export function selectKey(o: SpawnOption): string {
  return o.kind === 'new' ? `new:${o.spawnPointId}` : `resume:${o.soldierId}`;
}

export interface InWorldOptions {
  /** Deploy `o` (the caller glides into the lead-in first). */
  onDeploy(o: SpawnOption): void;
  /** A way out ("← HQ", "← Campaign"…). */
  back?: { label: string; run(): void };
}

export class InWorldRespawn {
  private readonly root = el('div', 'aoo-iw');
  private readonly money = el('div', 'money');
  private readonly clock = el('div', 'clock');
  private readonly spots = el('div', 'spots');
  private readonly cardLayer = el('div', 'cards');
  private readonly fill = el('div', 'fill');
  private readonly unknown = el('div', 'unknown');
  private readonly marks = el('div', 'marks');
  private readonly chevs = el('div', 'chevs');
  private readonly headEl = el('div', 'head');
  private readonly scrub = el('div', 'scrub');
  private readonly time = el('span', 'time');
  private readonly playBtn = el('button', '', '▶');
  private readonly fastBtn = el('button', '', '▶▶');
  private controls: TimeControls | null = null;
  private stops: Stop[] = [];
  private chevList: Chevron[] = [];
  private current: string | null = null;
  /** The option whose card is open. */
  private open: SpawnOption | null = null;
  private pauseAt: number | null = null;
  private spotEls = new Map<string, HTMLButtonElement>();
  private chevEls = new Map<string, HTMLButtonElement>();
  private raf = 0;
  private lastFrontier = -1;
  private destroyed = false;
  private readonly labels: Map<string, SpawnLabel>;

  constructor(
    parent: HTMLElement,
    private props: RespawnProps,
    private readonly opts: InWorldOptions,
  ) {
    injectStyle('aoo-iw-css', CSS);
    this.labels = spawnLabels(props.map, str('inworld.nato').split(','), strDynamic);
    const top = el('div', 'top');
    top.append(this.money, this.clock);
    this.root.append(el('div', 'vignette'), this.spots, top, this.cardLayer, this.buildBar());
    if (opts.back) {
      const b = el('button', 'back', opts.back.label);
      b.onclick = () => opts.back?.run();
      this.root.append(b);
    }
    parent.append(this.root);
    this.rebuild();
  }

  /**
   * Hooks up the battlefield's controls and fades in. `openPreferred`: open the suggested
   * spawn's card at once (a fresh mission: the winning move is one tap away).
   */
  attach(controls: TimeControls, openPreferred = false): void {
    this.controls = controls;
    this.renderMarks();
    const pref = this.props.preferred ?? this.props.options[0];
    if (openPreferred && pref) this.select(pref);
    requestAnimationFrame(() => this.root.classList.add('on'));
    const loop = () => {
      if (this.destroyed) return;
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  update(u: RespawnUpdate): void {
    this.props = { ...this.props, ...(u as Partial<RespawnProps>) };
    this.rebuild();
    this.renderMarks();
    if (this.open) {
      const k = optionKeyOf(this.open);
      const same = this.props.options.find((o) => optionKeyOf(o) === k) ?? null;
      if (!same) this.closeCard();
      else this.open = same;
    }
  }

  /** The option whose card is open (the coach checks it). */
  get selected(): SpawnOption | null {
    return this.open;
  }

  /** Fades out (the deploy's glide plays without the controls). */
  fadeOut(): void {
    this.root.classList.remove('on');
    this.root.style.pointerEvents = 'none';
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey, true);
    this.root.remove();
  }

  /**
   * R / Space: select the last-used spawn (the quick-redeploy choice): the view and time glide
   * there. Pressed again with it selected: deploy.
   */
  quickSelect(): void {
    const pref = this.props.preferred ?? this.props.options[0];
    if (!pref) return;
    if (this.open && optionKeyOf(this.open) === optionKeyOf(pref)) {
      this.deploy(this.open);
      return;
    }
    this.select(pref);
  }

  // ---------- setup ----------

  private rebuild(): void {
    this.stops = buildStops(this.props.options, this.props.lanes);
    this.chevList = chevrons(
      this.props.options,
      (id) => this.letterOf(id),
      (id) => this.props.soldiers.find((r) => r.id === id)?.ordinal ?? ordinalFromId(id),
      this.props.preferred,
    );
  }

  private buildBar(): HTMLElement {
    const bar = el('div', 'bar');
    const btn = (label: string, aria: Parameters<typeof str>[0], fn: () => void) => {
      const b = el('button', '', label);
      b.setAttribute('aria-label', str(aria));
      b.title = str(aria);
      b.onclick = fn;
      return b;
    };
    const prev = btn('|◀', 'inworld.prev', () => this.jump(-1));
    const back = btn('◀◀', 'inworld.back', () => this.nudge(-BACK_TICKS));
    this.playBtn.setAttribute('aria-label', str('results.playPause'));
    this.playBtn.onclick = () => this.togglePlay();
    this.fastBtn.setAttribute('aria-label', str('inworld.fast'));
    this.fastBtn.title = str('inworld.fast');
    this.fastBtn.onclick = () => this.toggleFast();
    const next = btn('▶|', 'inworld.next', () => this.jump(1));
    this.scrub.append(
      el('div', 'track'),
      this.fill,
      this.unknown,
      this.marks,
      this.headEl,
      this.chevs,
    );
    const tickAt = (clientX: number) => {
      const r = this.scrub.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * this.span();
    };
    let dragging = false;
    let moved = false;
    let downX = 0;
    this.scrub.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.chev')) return;
      dragging = true;
      moved = false;
      downX = e.clientX;
      this.scrub.setPointerCapture?.(e.pointerId);
    });
    this.scrub.addEventListener('pointermove', (e) => {
      if (!dragging || !this.controls) return;
      if (!moved && Math.abs(e.clientX - downX) < 6) return;
      moved = true;
      this.pauseAt = null;
      this.current = null;
      this.controls.setRate(0);
      // Dragging: the finger is the motion.
      this.controls.scrubTo(tickAt(e.clientX));
    });
    const up = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (!moved && this.controls) {
        // A tap: glide there.
        this.pauseAt = null;
        this.current = null;
        this.controls.setRate(0);
        void this.controls.travelTo(tickAt(e.clientX));
      }
    };
    this.scrub.addEventListener('pointerup', up);
    this.scrub.addEventListener('pointercancel', () => (dragging = false));
    window.addEventListener('keydown', this.onKey, true);
    bar.append(prev, back, this.playBtn, this.fastBtn, next, this.scrub, this.time);
    return bar;
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowRight') this.jump(1);
    else if (e.key === 'ArrowLeft') this.jump(-1);
    else if (e.key === 'Escape') this.closeCard();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  /** The timeline's length: what has played, plus room for spawns past it. */
  private span(): number {
    const c = this.controls;
    const latest = this.props.options.reduce((t, o) => Math.max(t, optionTick(o)), 0);
    return Math.max(60, c?.frontier ?? 0, latest, this.props.reachedTick ?? 0);
  }

  // ---------- controls ----------

  private togglePlay(): void {
    const c = this.controls;
    if (!c) return;
    this.pauseAt = null;
    c.setRate(c.rate === 0 ? 1 : 0);
  }

  private toggleFast(): void {
    const c = this.controls;
    if (!c) return;
    c.setRate(c.rate === FAST ? 1 : FAST);
  }

  private nudge(dt: Tick): void {
    const c = this.controls;
    if (!c) return;
    this.pauseAt = null;
    this.current = null;
    c.setRate(0);
    void c.travelTo(Math.max(c.start, c.destination + dt));
  }

  /** |◀ / ▶|: the previous / next spawn or death. */
  private jump(dir: 1 | -1): void {
    const c = this.controls;
    if (!c) return;
    const cur = this.current ? this.stops.find((s) => s.key === this.current) : undefined;
    const from = cur ? cur.tick : Math.round(c.tick);
    const s = stepStop(this.stops, from, dir, this.current);
    if (s) this.goTo(s);
  }

  private goTo(s: Stop): void {
    const c = this.controls;
    if (!c) return;
    this.current = s.key;
    if (s.kind === 'death') {
      this.closeCard();
      // Glide to just before the death, then watch it happen.
      c.setRate(0);
      this.pauseAt = s.tick + Math.round(TICKS_PER_SECOND / 2);
      const body = this.soldierPos(s.soldierId);
      if (body) c.focus(body.x, body.y);
      void c.travelTo(Math.max(c.start, s.tick - DEATH_LEAD)).then(() => {
        const at = this.soldierPos(s.soldierId);
        if (at) c.focus(at.x, at.y);
        if (this.current === s.key) c.setRate(1);
      });
      return;
    }
    if (s.option) this.select(s.option);
  }

  /** Glides time and the camera to an option and opens its card. */
  private select(o: SpawnOption): void {
    const c = this.controls;
    if (!c) return;
    this.pauseAt = null;
    this.current = optionKeyOf(o);
    c.setRate(0);
    this.openCard(o);
    const at = this.placeOf(o);
    if (at) c.focus(at.x, at.y);
    void c.travelTo(optionTick(o)).then(() => {
      // A resume circle rides on the soldier: look at where they are at that time.
      const there = this.placeOf(o);
      if (there) c.focus(there.x, there.y);
    });
  }

  private deploy(o: SpawnOption): void {
    this.closeCard();
    this.fadeOut();
    this.opts.onDeploy(o);
  }

  // ---------- per frame ----------

  private frame(): void {
    const c = this.controls;
    if (!c) return;
    if (this.pauseAt !== null && c.tick >= this.pauseAt) {
      c.setRate(0);
      this.pauseAt = null;
    }
    const span = this.span();
    const pct = (t: number) => `${Math.min(100, (t / span) * 100).toFixed(2)}%`;
    this.fill.style.width = pct(c.tick);
    this.headEl.style.left = pct(c.tick);
    const f = c.frontier;
    if (f !== this.lastFrontier) {
      this.lastFrontier = f;
      this.unknown.style.left = pct(f);
      this.renderMarks();
    }
    const t = formatBattleTime(Math.round(c.tick));
    if (this.time.textContent !== t) this.time.textContent = t;
    if (this.clock.textContent !== t) this.clock.textContent = t;
    const icon = c.rate !== 0 && !c.traveling ? '❚❚' : '▶';
    if (this.playBtn.textContent !== icon) this.playBtn.textContent = icon;
    this.fastBtn.classList.toggle('on', c.rate === FAST);
    this.renderMoney(c.tick);
    this.renderSpots(c.tick);
    this.placeCard();
  }

  /** Money that can't run out (basic training) isn't shown: it isn't a choice. */
  private moneyShown() {
    const l = shownEconomy(this.props);
    return l && l.start < UNLIMITED_MONEY ? l : null;
  }

  private renderMoney(tick: number): void {
    const l = this.moneyShown();
    if (!l) {
      this.money.hidden = true;
      return;
    }
    this.money.hidden = false;
    const v = availableAt(l, Math.round(tick));
    const text = formatMoney(v);
    if (this.money.textContent !== text) this.money.textContent = text;
    this.money.classList.toggle('debt', v < 0);
  }

  private renderMarks(): void {
    const span = this.span();
    const pct = (t: number) => `${Math.min(100, (t / span) * 100).toFixed(2)}%`;
    this.marks.replaceChildren(
      ...this.stops
        .filter((s) => s.kind === 'death')
        .map((s) => {
          const m = el('div', 'death');
          m.style.left = pct(s.tick);
          return m;
        }),
    );
    const seen = new Set<string>();
    for (const ch of this.chevList) {
      seen.add(ch.key);
      let b = this.chevEls.get(ch.key);
      if (!b) {
        b = el('button', 'chev');
        b.onclick = (e) => {
          e.stopPropagation();
          const o = this.chevList.find((x) => x.key === ch.key)?.option;
          if (o) this.select(o);
        };
        this.chevs.append(b);
        this.chevEls.set(ch.key, b);
      }
      b.className = `chev ${ch.kind}${ch.last ? ' last' : ''}`;
      b.dataset['select'] = selectKey(ch.option);
      b.innerHTML = `${CHEVRON_SVG}<span>${ch.label}</span>`;
      b.title = this.optionTitle(ch.option);
      b.style.left = pct(ch.tick);
      b.style.top = `${-26 - ch.stack * 27}px`;
    }
    for (const [k, b] of this.chevEls) {
      if (!seen.has(k)) {
        b.remove();
        this.chevEls.delete(k);
      }
    }
  }

  private optionTitle(o: SpawnOption): string {
    const time = formatBattleTime(optionTick(o));
    return o.kind === 'new'
      ? str('inworld.pointAt', {
          name: this.labels.get(o.spawnPointId)?.name ?? o.spawnPointId,
          time,
        })
      : str('inworld.resumeHere', { n: ordinalFromId(o.soldierId), time });
  }

  private soldierPos(id: string | undefined): { x: number; y: number } | null {
    if (!id) return null;
    const s = this.controls?.currentView.soldiers.find((x) => x.id === id);
    return s ? { x: s.x, y: s.y } : null;
  }

  private letterOf(spawnPointId: string): string {
    return this.labels.get(spawnPointId)?.letter ?? '?';
  }

  private soldierAlive(id: string): { x: number; y: number } | null {
    const s = this.controls?.currentView.soldiers.find((x) => x.id === id);
    return s && s.alive ? { x: s.x, y: s.y } : null;
  }

  private placeOf(o: SpawnOption): { x: number; y: number } | null {
    const recs = this.props.soldiers;
    return optionPlace(
      o,
      this.props.map,
      (id) => {
        const s = this.controls?.currentView.soldiers.find((x) => x.id === id);
        return s && s.alive ? { x: s.x, y: s.y } : null;
      },
      (id) => recs.find((r) => r.id === id)?.spawnPointId ?? null,
    );
  }

  /**
   * Circles: every new-soldier spawn point (lettered); a saved soldier near their resume time,
   * riding on them; and any saved soldier visible right now (tap: glide to their resume).
   */
  private renderSpots(tick: number): void {
    const c = this.controls!;
    const near = nearbyOptions(this.props.options, tick, NEAR_TICKS);
    const view = c.currentView;
    for (const o of this.props.options) {
      if (o.kind !== 'resume' || near.includes(o)) continue;
      if (view.soldiers.some((s) => s.id === o.soldierId && s.alive)) near.push(o);
    }
    if (this.open && !near.some((o) => optionKeyOf(o) === optionKeyOf(this.open!))) {
      near.push(this.open);
    }
    // One circle per spawn point: its nearest slot in time.
    const seenPoint = new Set<string>();
    const seen = new Set<string>();
    const prefKey = this.props.preferred ? optionKeyOf(this.props.preferred) : null;
    for (const o of near) {
      if (o.kind === 'new') {
        if (seenPoint.has(o.spawnPointId)) continue;
        seenPoint.add(o.spawnPointId);
      }
      const key = optionKeyOf(o);
      // A saved soldier's circle is on the soldier, never parked on a spawn point (it read as
      // that spawn point's circle): only while they're alive on screen.
      const at = o.kind === 'resume' ? this.soldierAlive(o.soldierId) : this.placeOf(o);
      if (!at) continue;
      seen.add(key);
      let b = this.spotEls.get(key);
      if (!b) {
        b = el('button', `spot ${o.kind}`);
        b.innerHTML =
          o.kind === 'resume'
            ? roleIconSvg(this.props.soldiers.find((r) => r.id === o.soldierId)?.roleId, 22, '')
            : this.letterOf(o.spawnPointId);
        b.dataset['select'] = selectKey(o);
        b.title = this.optionTitle(o);
        b.onclick = () => {
          const opt = this.props.options.find((x) => optionKeyOf(x) === key);
          if (opt) this.select(opt);
        };
        this.spots.append(b);
        this.spotEls.set(key, b);
      }
      const p = c.worldToScreen(at.x, at.y);
      b.style.left = `${p.x.toFixed(1)}px`;
      b.style.top = `${p.y.toFixed(1)}px`;
      b.classList.toggle('far', Math.abs(optionTick(o) - tick) > 1);
      b.classList.toggle('last', key === prefKey);
      b.classList.toggle('sel', !!this.open && optionKeyOf(this.open) === key);
    }
    for (const [k, b] of this.spotEls) {
      if (!seen.has(k)) {
        b.remove();
        this.spotEls.delete(k);
      }
    }
    for (const [k, b] of this.chevEls) {
      b.classList.toggle('sel', !!this.open && optionKeyOf(this.open) === k);
    }
  }

  // ---------- the card ----------

  private openCard(o: SpawnOption): void {
    this.open = o;
    const card = el('div', 'card');
    const head = el('div', 'head');
    head.append(el('span', '', this.optionTitle(o)));
    const x = el('button', 'x', '×');
    x.setAttribute('aria-label', str('inworld.close'));
    x.onclick = () => this.closeCard();
    head.append(x);
    card.append(head);
    if (o.kind === 'new' && this.props.onRole) card.append(this.rolePicker(o));
    const go = el(
      'button',
      o.kind === 'resume' ? 'go resume' : 'go',
      str(o.kind === 'resume' ? 'inworld.resume' : 'inworld.deploy'),
    );
    go.onclick = () => {
      const cur = this.props.options.find((x) => optionKeyOf(x) === optionKeyOf(o)) ?? o;
      this.deploy(cur);
    };
    card.append(go);
    this.cardLayer.replaceChildren(card);
    this.placeCard();
  }

  private rolePicker(o: SpawnOption): HTMLElement {
    const wrap = el('div', 'roles');
    const info = el('div', 'rolecard');
    let statOpen: string | null = null;
    const showCard = () => {
      const id = this.props.roleId ?? 'rifleman';
      info.innerHTML = roleCardHtml(
        this.props.tuning ?? DEFAULT_TUNING,
        id,
        money.get(id)?.price,
        statOpen,
      );
      this.placeCard();
    };
    info.onclick = (e) => {
      const st = (e.target as HTMLElement).closest<HTMLElement>('[data-stat]');
      if (!st) return;
      statOpen = statOpen === st.dataset['stat'] ? null : (st.dataset['stat'] ?? null);
      showCard();
    };
    const money = new Map(roleMoney(o, this.props).map((m) => [m.roleId, m]));
    const buttons: [RoleId, HTMLButtonElement][] = [];
    const pick = (id: RoleId) => {
      this.props = { ...this.props, roleId: id };
      this.props.onRole?.(id);
      for (const [rid, b] of buttons) b.classList.toggle('on', rid === id);
      showCard();
    };
    for (const r of ROLES) {
      const m = money.get(r.id);
      const b = el('button', r.id === (this.props.roleId ?? 'rifleman') ? 'on' : '');
      b.innerHTML = roleIconSvg(r.id, 22, '');
      b.dataset['role'] = r.id;
      b.title = `${str(r.nameKey)}${m ? ` · ${m.price}` : ''}`;
      b.disabled = roleLocked(this.props, r.id) || (m ? !m.affordable : false);
      if (m && m.price && this.moneyShown()) b.append(el('small', '', m.price));
      b.onclick = () => pick(r.id);
      buttons.push([r.id, b]);
      wrap.append(b);
    }
    const both = el('div', 'rolepick');
    both.append(wrap, info);
    showCard();
    return both;
  }

  /** Keeps the card under its circle (clamped to the screen). */
  private placeCard(): void {
    const card = this.cardLayer.firstElementChild as HTMLElement | null;
    if (!card || !this.open || !this.controls) return;
    const at = this.placeOf(this.open);
    if (!at) return;
    const p = this.controls.worldToScreen(at.x, at.y);
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const x = Math.max(w / 2 + 8, Math.min(window.innerWidth - w / 2 - 8, p.x));
    let y = p.y + 36;
    if (y + h > window.innerHeight - 110) y = Math.max(8, p.y - 36 - h);
    card.style.left = `${x.toFixed(1)}px`;
    card.style.top = `${y.toFixed(1)}px`;
  }

  private closeCard(): void {
    this.open = null;
    this.cardLayer.replaceChildren();
  }
}
