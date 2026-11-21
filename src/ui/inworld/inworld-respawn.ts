/**
 * (POC) In-world respawn: the respawn screen's job done on the battlefield. The battle replay
 * (`ReplayScene`) shows the current truth; this DOM layer adds the money at the scrub time, a
 * scrub bar marked with spawns and deaths, jump buttons (|◀ ◀◀ ▶ ▶▶ ▶|), and circles in the
 * world for every spawn option near the scrub time. Tapping a circle snaps to its time and
 * opens a small card: RESUME, or the roles + DEPLOY for a new soldier.
 *
 * Everything it deploys is a `SpawnOption` the game controller offered, so the rules are the
 * respawn screen's own; only the presentation changes.
 */
import { str } from '../../content/strings';
import { roleIconSvg } from '../../content/role-icons';
import { ROLES } from '../../content/roles';
import type { RoleId, SpawnOption } from '../../contracts/mission';
import type { ReplayControls } from '../../render/phaser/replay-scene';
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
  nearbyOptions,
  optionKeyOf,
  optionPlace,
  optionTick,
  stepStop,
  type Stop,
} from './inworld-model';

/** Spawn circles show this close to their time. TUNE */
const NEAR_TICKS = 3 * TICKS_PER_SECOND;
/** A death jump starts this long before the death and stops this long after. TUNE */
const DEATH_LEAD = 3 * TICKS_PER_SECOND;
const DEATH_TAIL = Math.round(0.75 * TICKS_PER_SECOND);
const BACK_TICKS = 5 * TICKS_PER_SECOND;
const FAST = 4;

const CSS = `
.aoo-iw { position: fixed; inset: 0; z-index: 24; pointer-events: none; font: 14px system-ui, sans-serif; color: #e6e9ec; }
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
.aoo-iw .scrub { position: relative; flex: 1; height: 32px; cursor: pointer; touch-action: none; min-width: 120px; }
.aoo-iw .scrub .track { position: absolute; left: 0; right: 0; top: 14px; height: 4px; background: #39424c; border-radius: 2px; }
.aoo-iw .scrub .fill { position: absolute; left: 0; top: 14px; height: 4px; background: #c8d0d8; border-radius: 2px; }
.aoo-iw .scrub .known { position: absolute; top: 14px; height: 4px; background: repeating-linear-gradient(90deg,#39424c 0 4px,transparent 4px 8px); }
.aoo-iw .scrub .mark { position: absolute; transform: translateX(-50%); pointer-events: none; }
.aoo-iw .scrub .mark.death { top: 6px; width: 3px; height: 20px; background: #ff4d4d; border-radius: 1px; }
.aoo-iw .scrub .mark.resume { top: 9px; width: 14px; height: 14px; border: 3px solid #4dd87a; border-radius: 50%; box-sizing: border-box; background: #0c0f13; }
.aoo-iw .scrub .mark.new { top: 10px; width: 12px; height: 12px; background: #5aa9ff; border-radius: 50%; }
.aoo-iw .scrub .head { position: absolute; top: 2px; width: 2px; height: 28px; margin-left: -1px; background: #ffd34d; }
.aoo-iw .time { min-width: 48px; text-align: right; font-variant-numeric: tabular-nums; color: #c8d0d8; }
.aoo-iw .spot { position: absolute; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%; pointer-events: auto;
  cursor: pointer; display: grid; place-items: center; background: rgba(12,15,19,.35); border: 4px solid #5aa9ff;
  color: #5aa9ff; box-shadow: 0 0 0 2px rgba(0,0,0,.5), 0 0 16px rgba(90,169,255,.6); animation: aoo-iw-pulse 1.2s ease-in-out infinite; }
.aoo-iw .spot.resume { border-color: #4dd87a; color: #4dd87a; box-shadow: 0 0 0 2px rgba(0,0,0,.5), 0 0 16px rgba(77,216,122,.6); }
.aoo-iw .spot.far { opacity: .45; animation: none; }
.aoo-iw .spot.sel { border-color: #ffd34d; color: #ffd34d; }
.aoo-iw .spot svg { width: 22px; height: 22px; }
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
.aoo-iw .go { width: 100%; min-height: 48px; border: 0; border-radius: 8px; background: #ffd34d; color: #1a1406;
  font: 900 18px system-ui, sans-serif; letter-spacing: .04em; cursor: pointer; }
.aoo-iw .go.resume { background: #4dd87a; }
@media (max-width: 760px) {
  .aoo-iw .bar { left: 6px; right: 6px; bottom: 6px; flex-wrap: wrap; padding: 6px; }
  .aoo-iw .scrub { flex-basis: 100%; order: -1; }
  .aoo-iw .time { display: none; }
  .aoo-iw .money { font-size: 24px; }
}
`;

export interface InWorldOptions {
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
  private readonly known = el('div', 'known');
  private readonly marks = el('div', 'marks');
  private readonly headEl = el('div', 'head');
  private readonly time = el('span', 'time');
  private readonly playBtn = el('button', '', '▶');
  private readonly fastBtn = el('button', '', '▶▶');
  private controls: ReplayControls | null = null;
  private stops: Stop[] = [];
  private current: string | null = null;
  /** The option whose card is open. */
  private open: SpawnOption | null = null;
  /** Stop playing here (a death jump). */
  private pauseAt: Tick | null = null;
  private spotEls = new Map<string, HTMLButtonElement>();
  private raf = 0;
  private endTick: Tick = 1;
  private destroyed = false;

  constructor(
    parent: HTMLElement,
    private props: RespawnProps,
    private readonly opts: InWorldOptions,
  ) {
    injectStyle('aoo-iw-css', CSS);
    const top = el('div', 'top');
    top.append(this.money, this.clock);
    this.root.append(this.spots, top, this.cardLayer, this.buildBar());
    if (opts.back) {
      const b = el('button', 'back', opts.back.label);
      b.onclick = () => opts.back?.run();
      this.root.append(b);
    }
    parent.append(this.root);
    this.rebuild();
  }

  /** Hooks up the replay once its scene is ready; `endTick` is how far it runs. */
  attach(controls: ReplayControls, endTick: Tick): void {
    this.controls = controls;
    this.endTick = Math.max(1, endTick);
    controls.setSkipQuiet(false);
    controls.setSpeed(1);
    this.renderMarks();
    this.openingShot();
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
    // The open card's option may have moved or gone (history changed under it).
    if (this.open) {
      const k = optionKeyOf(this.open);
      const same = this.props.options.find((o) => optionKeyOf(o) === k) ?? null;
      if (!same) this.closeCard();
    }
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey, true);
    this.root.remove();
  }

  // ---------- setup ----------

  private rebuild(): void {
    this.stops = buildStops(this.props.options, this.props.lanes);
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
    const scrub = el('div', 'scrub');
    scrub.append(el('div', 'track'), this.known, this.fill, this.marks, this.headEl);
    const seekAt = (clientX: number) => {
      const c = this.controls;
      if (!c) return;
      const r = scrub.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      this.pauseAt = null;
      this.current = null;
      c.setPlaying(false);
      c.seek(Math.round(f * this.endTick));
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
    window.addEventListener('keydown', this.onKey, true);
    bar.append(prev, back, this.playBtn, this.fastBtn, next, scrub, this.time);
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

  /** Where the camera starts: on the death that just happened, or on the suggested spawn. */
  private openingShot(): void {
    const c = this.controls;
    if (!c) return;
    const v = c.currentView;
    // The newest soldier is the one who just died (or was just saved).
    const newest = [...this.props.soldiers].sort((a, b) => b.ordinal - a.ordinal)[0];
    const s = newest ? v.soldiers.find((x) => x.id === newest.id) : undefined;
    if (s && this.props.reachedTick !== null) {
      c.focus(s.x, s.y);
      return;
    }
    const pref = this.props.preferred ?? this.props.options[0];
    const at = pref ? this.placeOf(pref) : null;
    if (at) c.focus(at.x, at.y);
  }

  // ---------- controls ----------

  private togglePlay(): void {
    const c = this.controls;
    if (!c) return;
    this.pauseAt = null;
    c.setPlaying(!c.playing);
  }

  private toggleFast(): void {
    const c = this.controls;
    if (!c) return;
    const fast = c.speed !== FAST;
    c.setSpeed(fast ? FAST : 1);
    if (fast) c.setPlaying(true);
  }

  private nudge(dt: Tick): void {
    const c = this.controls;
    if (!c) return;
    this.pauseAt = null;
    this.current = null;
    c.seek(Math.max(0, c.tick + dt));
  }

  /** |◀ / ▶|: the previous / next spawn or death. */
  private jump(dir: 1 | -1): void {
    const c = this.controls;
    if (!c) return;
    // On a death jump the replay sits a little before the stop's own tick: step from the stop.
    const cur = this.current ? this.stops.find((s) => s.key === this.current) : undefined;
    const from = cur ? cur.tick : c.tick;
    const s = stepStop(this.stops, from, dir, this.current);
    if (s) this.goTo(s);
  }

  private goTo(s: Stop): void {
    const c = this.controls;
    if (!c) return;
    this.current = s.key;
    this.closeCard();
    c.setSpeed(1);
    if (s.kind === 'death') {
      // Find where they fell, then play it from a little before.
      c.seek(s.tick);
      const body = s.soldierId ? c.currentView.soldiers.find((x) => x.id === s.soldierId) : null;
      c.seek(Math.max(0, s.tick - DEATH_LEAD));
      if (body) c.focus(body.x, body.y);
      this.pauseAt = s.tick + DEATH_TAIL;
      c.setPlaying(true);
      return;
    }
    this.pauseAt = null;
    c.setPlaying(false);
    c.seek(s.tick);
    if (s.option) this.openCard(s.option);
  }

  // ---------- per frame ----------

  private frame(): void {
    const c = this.controls;
    if (!c) return;
    if (this.pauseAt !== null && c.tick >= this.pauseAt) {
      c.setPlaying(false);
      this.pauseAt = null;
    }
    const tick = c.tick;
    const f = Math.min(1, tick / this.endTick);
    this.fill.style.width = `${(f * 100).toFixed(2)}%`;
    this.headEl.style.left = `${(f * 100).toFixed(2)}%`;
    const t = formatBattleTime(tick);
    if (this.time.textContent !== t) this.time.textContent = t;
    if (this.clock.textContent !== t) this.clock.textContent = t;
    const icon = c.playing ? '❚❚' : '▶';
    if (this.playBtn.textContent !== icon) this.playBtn.textContent = icon;
    this.fastBtn.classList.toggle('on', c.playing && c.speed === FAST);
    this.renderMoney(tick);
    this.renderSpots(tick);
    this.placeCard();
  }

  private renderMoney(tick: Tick): void {
    const l = shownEconomy(this.props);
    if (!l) {
      this.money.hidden = true;
      return;
    }
    this.money.hidden = false;
    const v = availableAt(l, tick);
    const text = formatMoney(v);
    if (this.money.textContent !== text) this.money.textContent = text;
    this.money.classList.toggle('debt', v < 0);
  }

  private renderMarks(): void {
    const end = this.endTick;
    const pct = (t: Tick) => `${Math.min(100, (t / end) * 100).toFixed(2)}%`;
    this.marks.replaceChildren(
      ...this.stops.map((s) => {
        const m = el('div', `mark ${s.kind}`);
        m.style.left = pct(s.tick);
        return m;
      }),
    );
    const r = this.props.resolvedUntil;
    this.known.hidden = r === null || r === undefined;
    if (!this.known.hidden) {
      this.known.style.left = pct(r!);
      this.known.style.right = '0';
    }
  }

  private placeOf(o: SpawnOption): { x: number; y: number } | null {
    const c = this.controls;
    const recs = this.props.soldiers;
    return optionPlace(
      o,
      this.props.map,
      (id) => {
        const s = c?.currentView.soldiers.find((x) => x.id === id);
        return s && s.alive ? { x: s.x, y: s.y } : null;
      },
      (id) => recs.find((r) => r.id === id)?.spawnPointId ?? null,
    );
  }

  private renderSpots(tick: Tick): void {
    const c = this.controls!;
    const near = nearbyOptions(this.props.options, tick, NEAR_TICKS);
    if (this.open && !near.some((o) => optionKeyOf(o) === optionKeyOf(this.open!))) {
      near.push(this.open);
    }
    const seen = new Set<string>();
    for (const o of near) {
      const key = optionKeyOf(o);
      const at = this.placeOf(o);
      if (!at) continue;
      seen.add(key);
      let b = this.spotEls.get(key);
      if (!b) {
        b = el('button', `spot ${o.kind}`);
        b.innerHTML =
          o.kind === 'resume'
            ? roleIconSvg(this.props.soldiers.find((r) => r.id === o.soldierId)?.roleId, 22, '')
            : roleIconSvg(this.props.roleId, 22, '');
        b.onclick = () => {
          const s = this.stops.find((x) => x.key === key);
          if (s) this.goTo(s);
        };
        this.spots.append(b);
        this.spotEls.set(key, b);
      }
      const p = c.worldToScreen(at.x, at.y);
      b.style.left = `${p.x.toFixed(1)}px`;
      b.style.top = `${p.y.toFixed(1)}px`;
      b.classList.toggle('far', optionTick(o) !== tick);
      b.classList.toggle('sel', !!this.open && optionKeyOf(this.open) === key);
    }
    for (const [k, b] of this.spotEls) {
      if (!seen.has(k)) {
        b.remove();
        this.spotEls.delete(k);
      }
    }
  }

  // ---------- the card ----------

  private openCard(o: SpawnOption): void {
    this.open = o;
    const c = this.controls;
    const at = this.placeOf(o);
    if (c && at) c.focus(at.x, at.y);
    const card = el('div', 'card');
    const head = el('div', 'head');
    const when = formatBattleTime(optionTick(o));
    head.append(
      el(
        'span',
        '',
        o.kind === 'resume'
          ? str('inworld.resumeHere', { n: ordinalFromId(o.soldierId), time: when })
          : str('inworld.newHere', { time: when }),
      ),
    );
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
    go.onclick = () => this.opts.onDeploy(o);
    card.append(go);
    this.cardLayer.replaceChildren(card);
    this.placeCard();
    go.focus();
  }

  private rolePicker(o: SpawnOption): HTMLElement {
    const wrap = el('div', 'roles');
    const money = new Map(roleMoney(o, this.props).map((m) => [m.roleId, m]));
    const buttons: [RoleId, HTMLButtonElement][] = [];
    const pick = (id: RoleId) => {
      this.props = { ...this.props, roleId: id };
      this.props.onRole?.(id);
      for (const [rid, b] of buttons) b.classList.toggle('on', rid === id);
      const spot = this.spotEls.get(optionKeyOf(o));
      if (spot) spot.innerHTML = roleIconSvg(id, 22, '');
    };
    for (const r of ROLES) {
      const m = money.get(r.id);
      const b = el('button', r.id === (this.props.roleId ?? 'rifleman') ? 'on' : '');
      b.innerHTML = roleIconSvg(r.id, 22, '');
      b.title = `${str(r.nameKey)}${m ? ` · ${m.price}` : ''}`;
      b.disabled = roleLocked(this.props, r.id) || (m ? !m.affordable : false);
      if (m && m.price) b.append(el('small', '', m.price));
      b.onclick = () => pick(r.id);
      buttons.push([r.id, b]);
      wrap.append(b);
    }
    return wrap;
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
    let y = p.y + 40;
    if (y + h > window.innerHeight - 80) y = Math.max(8, p.y - 40 - h);
    card.style.left = `${x.toFixed(1)}px`;
    card.style.top = `${y.toFixed(1)}px`;
  }

  private closeCard(): void {
    this.open = null;
    this.cardLayer.replaceChildren();
  }
}
