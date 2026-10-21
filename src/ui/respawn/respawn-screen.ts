/**
 * The respawn screen ([E5]): a DOM/SVG overlay, independent of Phaser and of the sim. It shows the
 * timeline truth (one row per soldier on a shared battle-time axis), the scrubber ([D23]) and the
 * spawn panel, and reports the player's choice through `onDeploy`. All decisions live in pure
 * modules (respawn-model.ts, time-scale.ts, map-thumb.ts); this file only renders and wires input.
 *
 * Usage (PHASE04):
 *   const screen = RespawnScreen.mount(uiRoot, props, { onDeploy: (opt) => ... });
 *   screen.update({ lanes, changes, options, resolvedUntil }); // every scrubber step
 *   screen.setResolving(null);                                  // sweep done
 *   screen.destroy();
 */
import { str } from '../../content/strings';
import type { LaneChange, LaneSpanKind, SoldierId, SpawnOption } from '../../contracts/mission';
import { formatBattleTime, type Tick } from '../../sim/core/time';
import { el, injectStyle } from '../dom';
import { mapThumbSvg } from './map-thumb';
import {
  captionList,
  changeCaption,
  changedRanges,
  cycleSelection,
  defaultSelection,
  displaySpans,
  endStyle,
  endTooltip,
  findOption,
  headerItems,
  isEventMarker,
  laneRows,
  markerTooltip,
  optionKey,
  optionLabel,
  ordinalFromId,
  reconcileSelection,
  screenKeyAction,
  spanClass,
  spawnPointName,
  timelineDomain,
  unconfirmedRange,
  type LaneRow,
  type OptionKey,
  type RespawnProps,
  type RespawnUpdate,
} from './respawn-model';
import { DEFAULT_RESPAWN_SETTINGS, type RespawnViewSettings } from './respawn-settings';
import { RESPAWN_CSS } from './respawn-style';
import {
  clampView,
  fitView,
  isFitted,
  panBy,
  pinchFactor,
  tickToX,
  wheelZoomFactor,
  zoomAt,
  axisTicks,
  type TimeDomain,
  type TimeView,
} from './time-scale';

export interface RespawnScreenOptions {
  onDeploy?: (option: SpawnOption) => void;
  settings?: RespawnViewSettings;
}

const PULSE_MS = 1800;
const FLASH_MS = 1400;
const APPEAR_MS = 700;
const LEAVE_MS = 600;
const AXIS_H = 40;
const DRAG_SLOP_PX = 6;

/** Last zoom/pan, reused on the next open when auto-fit is off. */
let lastView: { view: TimeView; fitted: boolean } | null = null;

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const r1 = (v: number) => Math.round(v * 10) / 10;
const now = () => performance.now();

interface Anim {
  start: number;
}

export class RespawnScreen {
  readonly root: HTMLDivElement;
  private props: RespawnProps;
  private settings: RespawnViewSettings;
  private selected: OptionKey | null;
  private view: TimeView | null = null;
  private fitted = true;
  private domain: TimeDomain;
  private readonly deployListeners = new Set<(o: SpawnOption) => void>();
  private captions: string[] = [];
  private pulses = new Map<SoldierId, Anim>();
  private flashes = new Map<
    SoldierId,
    Anim & { ranges: { from: Tick; to: Tick; kind: LaneSpanKind }[] }
  >();
  private appear = new Map<OptionKey, Anim>();
  private leaving = new Map<OptionKey, Anim & { option: SpawnOption }>();
  private destroyed = false;
  private raf = 0;
  private animTimer: ReturnType<typeof setTimeout> | null = null;
  private tipTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly cleanups: (() => void)[] = [];

  // Elements
  private readonly head = el('header', 'rs-head');
  private readonly captionsEl = el('div', 'rs-captions');
  private readonly frame = el('div', 'rs-tl-frame');
  private readonly scroller = el('div', 'rs-tl-scroll');
  private readonly axisWrap = el('div', 'rs-axis');
  private readonly rowsWrap = el('div', 'rs-rows');
  private readonly emptyEl = el('div', 'rs-empty', str('respawn.timeline.empty'));
  private readonly legendEl = el('div', 'rs-legend');
  private readonly tip = el('div', 'rs-tip');
  private readonly optsEl = el('div', 'rs-opts');
  private readonly deployBtn = el('button', 'rs-deploy');

  static mount(root: HTMLElement, props: RespawnProps, opts: RespawnScreenOptions = {}) {
    return new RespawnScreen(root, props, opts);
  }

  constructor(parent: HTMLElement, props: RespawnProps, opts: RespawnScreenOptions = {}) {
    injectStyle('aoo-respawn-css', RESPAWN_CSS);
    this.props = { ...props };
    this.settings = opts.settings ?? DEFAULT_RESPAWN_SETTINGS;
    if (opts.onDeploy) this.deployListeners.add(opts.onDeploy);
    this.selected = defaultSelection(props.options);
    this.domain = timelineDomain(this.props);
    if (!this.settings.autoFit && lastView) {
      this.view = lastView.view;
      this.fitted = lastView.fitted;
    }

    this.root = el('div', 'aoo-respawn');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', str('respawn.title'));
    this.build();
    parent.appendChild(this.root);
    this.pushChanges(props.changes ?? []);
    this.installInput();
    this.renderAll();
    // Focus the selected option so keyboard users can act at once.
    this.optsEl.querySelector<HTMLElement>('.rs-opt.sel')?.focus({ preventScroll: true });
  }

  // ---------- Public API ----------

  /** Applies a (progressive) truth update. Omitted fields keep their values. */
  update(u: RespawnUpdate): void {
    if (this.destroyed) return;
    const prevLanes = new Map(this.props.lanes.map((l) => [l.soldierId, l]));
    const prevOptions = this.props.options;
    this.props = {
      ...this.props,
      ...Object.fromEntries(Object.entries(u).filter(([, v]) => v !== undefined)),
    };
    if (u.resolvedUntil === null) this.props.resolvedUntil = null;
    if (u.lanes && this.settings.animations) {
      const t = now();
      for (const l of u.lanes) {
        const ranges = changedRanges(prevLanes.get(l.soldierId)?.spans, l.spans);
        if (ranges.length > 0) this.flashes.set(l.soldierId, { start: t, ranges });
      }
    }
    if (u.options) this.diffOptions(prevOptions, u.options);
    if (u.changes) this.pushChanges(u.changes);
    this.selected = reconcileSelection(this.selected, this.props.options);
    this.updateDomain();
    this.renderAll();
  }

  /** Moves the scrubber ([D23]); null hides it (resolve finished or not running). */
  setResolving(tick: Tick | null): void {
    this.update({ resolvedUntil: tick });
  }

  setSettings(s: RespawnViewSettings): void {
    this.settings = s;
    this.renderAll();
  }

  /** Registers a deploy listener; returns an unsubscribe function. */
  onDeploy(cb: (option: SpawnOption) => void): () => void {
    this.deployListeners.add(cb);
    return () => this.deployListeners.delete(cb);
  }

  selectedOption(): SpawnOption | null {
    return findOption(this.props.options, this.selected);
  }

  select(key: OptionKey | null): void {
    this.selected = key !== null && findOption(this.props.options, key) ? key : null;
    this.renderOptions();
    this.renderTimeline();
    this.revealSelection();
  }

  /** Confirms the selected option (same as the Deploy button / Enter). */
  deploy(): void {
    const o = this.selectedOption();
    if (!o) return;
    for (const cb of this.deployListeners) cb(o);
  }

  fitAll(): void {
    if (!this.view) return;
    this.view = fitView(this.domain, this.view.width);
    this.fitted = true;
    this.scheduleRender();
  }

  zoomBy(factor: number): void {
    if (!this.view) return;
    this.view = zoomAt(this.view, this.view.width / 2, factor, this.domain);
    this.fitted = isFitted(this.view, this.domain);
    this.scheduleRender();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.view) lastView = { view: this.view, fitted: this.fitted };
    cancelAnimationFrame(this.raf);
    if (this.animTimer) clearTimeout(this.animTimer);
    if (this.tipTimer) clearTimeout(this.tipTimer);
    for (const c of this.cleanups) c();
    this.root.remove();
  }

  // ---------- Build ----------

  private build(): void {
    const main = el('div', 'rs-main');
    const tl = el('section', 'rs-tl');
    const bar = el('div', 'rs-tl-bar');
    bar.append(el('h2', '', str('respawn.timeline.title')));
    bar.append(el('span', 'rs-hint', str('respawn.timeline.hint')));
    const tools = el('div', 'rs-tools');
    const mk = (label: string, text: string, run: () => void) => {
      const b = el('button', 'rs-tool', text);
      b.title = label;
      b.setAttribute('aria-label', label);
      b.onclick = run;
      return b;
    };
    tools.append(
      mk(str('respawn.timeline.zoomOut'), '−', () => this.zoomBy(1 / 1.6)),
      mk(str('respawn.timeline.zoomIn'), '+', () => this.zoomBy(1.6)),
      mk(str('respawn.timeline.fit'), str('respawn.timeline.fit'), () => this.fitAll()),
    );
    tools.lastElementChild!.classList.add('wide');
    bar.append(tools);
    this.scroller.append(this.axisWrap, this.rowsWrap);
    this.frame.append(this.scroller, this.emptyEl, this.tip);
    tl.append(bar, this.captionsEl, this.frame, this.legendEl);

    const spawn = el('aside', 'rs-spawn');
    spawn.append(el('h2', '', str('respawn.spawn.title')), this.optsEl);
    const dbar = el('div', 'rs-deploy-bar');
    this.deployBtn.onclick = () => this.deploy();
    dbar.append(this.deployBtn, el('div', 'rs-keys', str('respawn.keys')));
    spawn.append(dbar);

    main.append(tl, spawn);
    this.root.append(this.head, main);
  }

  // ---------- Input ----------

  private installInput(): void {
    const on = <K extends keyof HTMLElementEventMap>(
      t: HTMLElement,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      t.addEventListener(type, fn, opts);
      this.cleanups.push(() => t.removeEventListener(type, fn, opts));
    };

    // Keyboard: arrows/Tab cycle options, Enter deploys, +/-/0 zoom.
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, select, textarea') || t.closest('.aoo-settings'))) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const action = screenKeyAction(e.key, e.shiftKey);
      if (!action) return;
      e.preventDefault();
      if (action === 'next' || action === 'prev') {
        this.select(cycleSelection(this.props.options, this.selected, action === 'next' ? 1 : -1));
        this.optsEl.querySelector<HTMLElement>('.rs-opt.sel')?.focus({ preventScroll: true });
      } else if (action === 'deploy') this.deploy();
      else if (action === 'zoomIn') this.zoomBy(1.6);
      else if (action === 'zoomOut') this.zoomBy(1 / 1.6);
      else this.fitAll();
    };
    window.addEventListener('keydown', onKey);
    this.cleanups.push(() => window.removeEventListener('keydown', onKey));

    // Resize → keep the plot width current.
    const ro = new ResizeObserver(() => this.scheduleRender());
    ro.observe(this.frame);
    this.cleanups.push(() => ro.disconnect());

    // Option list clicks.
    on(this.optsEl, 'click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-opt]');
      if (b && b.dataset.opt) this.select(b.dataset.opt);
    });
    on(this.optsEl, 'dblclick', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-opt]');
      if (b && b.dataset.opt) {
        this.select(b.dataset.opt);
        this.deploy();
      }
    });

    // Timeline: drag to pan, pinch/wheel to zoom, tap an O to select, tap a marker for details.
    const pointers = new Map<number, { x: number; y: number }>();
    let dragStart: { x: number; y: number; target: HTMLElement | null } | null = null;
    let dragging = false;
    let pinchDist = 0;
    const plotX = (clientX: number) =>
      clientX - this.rowsWrap.getBoundingClientRect().left - this.labelWidth();

    on(this.scroller, 'pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        dragStart = { x: e.clientX, y: e.clientY, target: e.target as HTMLElement };
        dragging = false;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        dragging = true;
      }
    });
    on(this.scroller, 'pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === 'mouse') this.hoverTip(e);
        return;
      }
      const cur = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, cur);
      if (!this.view) return;
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        const mid = plotX((a!.x + b!.x) / 2);
        this.view = zoomAt(this.view, mid, pinchFactor(pinchDist, dist), this.domain);
        pinchDist = dist;
        this.fitted = isFitted(this.view, this.domain);
        this.scheduleRender();
        return;
      }
      if (!dragStart) return;
      if (!dragging && Math.abs(cur.x - dragStart.x) > DRAG_SLOP_PX) {
        dragging = true;
        this.scroller.setPointerCapture(e.pointerId);
        this.hideTip();
      }
      if (dragging) {
        this.view = panBy(this.view, cur.x - prev.x, this.domain);
        this.fitted = isFitted(this.view, this.domain);
        this.scheduleRender();
      }
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        if (!dragging && !cancelled && dragStart) this.tap(dragStart.target, e);
        dragStart = null;
        dragging = false;
      }
    };
    on(this.scroller, 'pointerup', (e) => end(e, false));
    on(this.scroller, 'pointercancel', (e) => end(e, true));
    on(this.scroller, 'pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.hideTip();
    });
    on(
      this.scroller,
      'wheel',
      (e) => {
        if (!this.view) return;
        const zoomMode = this.settings.wheel === 'zoom';
        const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
        if (horizontal && !e.shiftKey) {
          e.preventDefault();
          this.view = panBy(this.view, -e.deltaX, this.domain);
        } else if (zoomMode ? !e.shiftKey && !e.ctrlKey : e.ctrlKey) {
          e.preventDefault();
          this.view = zoomAt(this.view, plotX(e.clientX), wheelZoomFactor(e.deltaY), this.domain);
        } else if (zoomMode && e.ctrlKey) {
          // Trackpad pinch arrives as ctrl+wheel: zoom as well.
          e.preventDefault();
          this.view = zoomAt(
            this.view,
            plotX(e.clientX),
            wheelZoomFactor(e.deltaY * 3),
            this.domain,
          );
        } else if (e.shiftKey) {
          e.preventDefault();
          this.scroller.scrollTop += e.deltaY || e.deltaX;
          return;
        } else return; // native vertical scroll of the rows
        this.fitted = isFitted(this.view, this.domain);
        this.scheduleRender();
      },
      { passive: false },
    );
  }

  private tap(target: HTMLElement | null, e: PointerEvent): void {
    const hit = target?.closest<Element>('[data-select], [data-tip]');
    if (!hit) {
      this.hideTip();
      return;
    }
    const sel = hit.getAttribute('data-select');
    if (sel) this.select(sel);
    const tip = hit.getAttribute('data-tip');
    if (tip) {
      this.showTip(tip, e.clientX, e.clientY);
      if (e.pointerType !== 'mouse') {
        if (this.tipTimer) clearTimeout(this.tipTimer);
        this.tipTimer = setTimeout(() => this.hideTip(), 2600);
      }
    }
  }

  private hoverTip(e: PointerEvent): void {
    const hit = (e.target as Element | null)?.closest('[data-tip]');
    const tip = hit?.getAttribute('data-tip');
    if (tip) this.showTip(tip, e.clientX, e.clientY);
    else this.hideTip();
  }

  private showTip(text: string, clientX: number, clientY: number): void {
    const box = this.frame.getBoundingClientRect();
    if (this.tip.textContent !== text) this.tip.textContent = text;
    this.tip.classList.add('on');
    const w = this.tip.offsetWidth;
    const x = Math.max(4, Math.min(box.width - w - 4, clientX - box.left - w / 2));
    const y = clientY - box.top - 44;
    this.tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y < 4 ? y + 64 : y)}px)`;
  }

  private hideTip(): void {
    this.tip.classList.remove('on');
  }

  // ---------- State helpers ----------

  private pushChanges(changes: readonly LaneChange[]): void {
    const t = now();
    for (const c of changes) {
      const ordinal =
        this.props.soldiers.find((s) => s.id === c.soldierId)?.ordinal ??
        ordinalFromId(c.soldierId);
      const text = changeCaption(c, ordinal);
      if (this.captions[this.captions.length - 1] !== text) this.captions.push(text);
      if (this.settings.animations) this.pulses.set(c.soldierId, { start: t });
    }
  }

  private diffOptions(prev: readonly SpawnOption[], next: readonly SpawnOption[]): void {
    if (!this.settings.animations) return;
    const t = now();
    const nextKeys = new Set(next.map(optionKey));
    const prevKeys = new Set(prev.map(optionKey));
    for (const o of next)
      if (!prevKeys.has(optionKey(o))) this.appear.set(optionKey(o), { start: t });
    for (const o of prev) {
      const k = optionKey(o);
      if (!nextKeys.has(k)) this.leaving.set(k, { start: t, option: o });
    }
    for (const k of nextKeys) this.leaving.delete(k);
  }

  private updateDomain(): void {
    const d = timelineDomain(this.props);
    if (d.from === this.domain.from && d.to === this.domain.to) return;
    this.domain = d;
    if (this.view) this.view = this.fitted ? fitView(d, this.view.width) : clampView(this.view, d);
  }

  private labelWidth(): number {
    return this.frame.clientWidth < 560 ? 86 : 118;
  }

  private scheduleRender(): void {
    if (this.raf || this.destroyed) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.renderTimeline();
    });
  }

  /** Re-renders once more after running animations end, so their classes drop off. */
  private scheduleAnimCleanup(): void {
    if (this.animTimer) return;
    const t = now();
    let next = Infinity;
    const consider = (m: Map<string, Anim>, dur: number) => {
      for (const [k, a] of m) {
        const left = a.start + dur - t;
        if (left <= 0) m.delete(k);
        else next = Math.min(next, left);
      }
    };
    consider(this.pulses, PULSE_MS);
    consider(this.flashes, FLASH_MS);
    consider(this.appear, APPEAR_MS);
    consider(this.leaving, LEAVE_MS);
    if (next === Infinity) return;
    this.animTimer = setTimeout(() => {
      this.animTimer = null;
      if (!this.destroyed) this.renderAll();
    }, next + 20);
  }

  private revealSelection(): void {
    const o = this.selectedOption();
    this.optsEl.querySelector<HTMLElement>('.rs-opt.sel')?.scrollIntoView({ block: 'nearest' });
    if (o?.kind === 'resume') {
      const row = this.rowsWrap.querySelector<SVGElement>(
        `[data-row="${CSS.escape(o.soldierId)}"]`,
      );
      row?.scrollIntoView({ block: 'nearest' });
    }
  }

  // ---------- Render ----------

  private renderAll(): void {
    if (this.destroyed) return;
    this.renderHeader();
    this.renderCaptions();
    this.renderLegend();
    this.renderOptions();
    this.renderTimeline();
    this.scheduleAnimCleanup();
  }

  private renderHeader(): void {
    const h = headerItems(this.props);
    this.head.innerHTML =
      `<h1>${esc(h.title)}</h1><dl>` +
      h.items
        .map(
          (i) =>
            `<div class="${i.cls ?? ''}"><dt>${esc(i.label)}</dt><dd>${esc(i.value)}</dd></div>`,
        )
        .join('') +
      `</dl>`;
  }

  private renderCaptions(): void {
    if (this.captions.length === 0) {
      this.captionsEl.hidden = true;
      return;
    }
    this.captionsEl.hidden = false;
    const list = captionList(this.captions, 3);
    this.captionsEl.innerHTML =
      `<span class="rs-cap-title">${esc(str('respawn.change.title'))}</span>` +
      list
        .map((c, i) => `<span class="rs-cap${i === 0 ? ' newest' : ''}">${esc(c)}</span>`)
        .join('');
  }

  private renderLegend(): void {
    this.legendEl.hidden = !this.settings.legend;
    if (!this.settings.legend) return;
    const item = (sw: string, label: string) =>
      `<span class="lg"><svg width="26" height="16" aria-hidden="true">${sw}</svg>${esc(label)}</span>`;
    this.legendEl.innerHTML = [
      item(
        '<rect class="sp-alive" x="1" y="5" width="24" height="6" rx="3"/>',
        str('respawn.legend.alive'),
      ),
      item(glyphSvg('X', 13, 8, 6), str('respawn.legend.death')),
      item(glyphSvg('O', 13, 8, 6), str('respawn.legend.open')),
      item(glyphSvg('!', 13, 8, 6), str('respawn.legend.interrupted')),
      item('<line class="sp-lost" x1="1" y1="8" x2="25" y2="8"/>', str('respawn.legend.lost')),
      item(
        '<rect class="sp-unresolved" x="1" y="3" width="24" height="10" fill="url(#rs-hatch)"/>',
        str('respawn.legend.unresolved'),
      ),
    ].join('');
  }

  private renderOptions(): void {
    const p = this.props;
    const t = now();
    const anim = this.settings.animations;
    const items: string[] = [];
    const row = (o: SpawnOption, cls: string, delay: number | null) => {
      const lab = optionLabel(o, p);
      const sel = lab.key === this.selected;
      const icon =
        o.kind === 'new'
          ? mapThumbSvg(p.map, { pointId: o.spawnPointId, width: 84, height: 58 })
          : `<svg class="rs-o-icon" viewBox="0 0 40 40" width="44" height="44" aria-hidden="true">${glyphSvg('O', 20, 20, 13)}</svg>`;
      const style = delay !== null ? ` style="animation-delay:${-Math.round(delay)}ms"` : '';
      return (
        `<button type="button" class="rs-opt ${o.kind}${sel ? ' sel' : ''}${cls}" data-opt="${esc(lab.key)}"` +
        ` role="option" aria-selected="${sel}"${style}>` +
        `<span class="rs-opt-icon">${icon}</span>` +
        `<span class="rs-opt-text"><span class="t">${esc(lab.title)}</span>` +
        `<span class="d">${esc(lab.detail)}</span>` +
        (lab.unconfirmed ? `<span class="u">${esc(str('respawn.spawn.unconfirmed'))}</span>` : '') +
        `</span></button>`
      );
    };
    for (const o of p.options) {
      const a = anim ? this.appear.get(optionKey(o)) : undefined;
      const age = a ? t - a.start : null;
      items.push(row(o, age !== null && age < APPEAR_MS ? ' appear' : '', age));
    }
    if (anim) {
      for (const [, l] of this.leaving) {
        const age = t - l.start;
        if (age < LEAVE_MS)
          items.push(row(l.option, ' leaving', age).replace('data-opt=', 'data-gone='));
      }
    }
    if (p.options.length === 0)
      items.push(`<div class="rs-none">${esc(str('respawn.spawn.none'))}</div>`);
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.opt;
    this.optsEl.setAttribute('role', 'listbox');
    this.optsEl.innerHTML = items.join('');
    if (focused) {
      this.optsEl
        .querySelector<HTMLElement>(`[data-opt="${CSS.escape(focused)}"]`)
        ?.focus({ preventScroll: true });
    }
    const o = this.selectedOption();
    this.deployBtn.disabled = !o;
    this.deployBtn.textContent = o ? optionLabel(o, p).deployLabel : str('respawn.deploy.pick');
  }

  private renderTimeline(): void {
    if (this.destroyed) return;
    const p = this.props;
    const rows = laneRows(p.lanes, p.soldiers, p.map);
    this.emptyEl.hidden = rows.length > 0;
    const labelW = this.labelWidth();
    const totalW = this.frame.clientWidth;
    const plotW = Math.max(40, totalW - labelW);
    if (totalW <= 0) return;
    if (!this.view) {
      this.view = fitView(this.domain, plotW);
      this.fitted = true;
    } else if (Math.abs(this.view.width - plotW) > 0.5) {
      this.view = this.fitted
        ? fitView(this.domain, plotW)
        : clampView({ ...this.view, width: plotW }, this.domain);
    }
    const v = this.view;
    const rowH = this.settings.rowHeight;
    const t = now();
    const sel = this.selectedOption();
    const dim = unconfirmedRange(p.resolvedUntil, this.domain);
    const x = (tick: number) => r1(labelW + tickToX(v, tick));
    const plotRight = labelW + plotW;

    // Axis.
    const ax: string[] = [];
    ax.push(`<rect class="ax-bg" x="0" y="0" width="${totalW}" height="${AXIS_H}"/>`);
    ax.push(`<g clip-path="url(#rs-clip-axis)">`);
    if (dim)
      ax.push(
        `<rect class="dim" x="${x(dim.from)}" y="0" width="${Math.max(0, plotRight - x(dim.from))}" height="${AXIS_H}"/>`,
      );
    for (const a of axisTicks(v, 60)) {
      const ax1 = r1(labelW + a.x);
      ax.push(`<line class="ax-tick" x1="${ax1}" y1="${AXIS_H - 8}" x2="${ax1}" y2="${AXIS_H}"/>`);
      ax.push(`<text class="ax-lbl" x="${ax1}" y="${AXIS_H - 12}">${a.label}</text>`);
    }
    if (sel) {
      const gx = x(sel.kind === 'new' ? sel.entryTick : sel.resumeTick);
      const label =
        sel.kind === 'new'
          ? str('respawn.entry.marker', {
              point: spawnPointName(p.map, sel.spawnPointId),
              time: formatBattleTime(sel.entryTick),
            })
          : formatBattleTime(sel.resumeTick);
      const w = label.length * 7.4 + 12;
      const lx = Math.max(labelW + 1, Math.min(gx - 2, plotRight - w - 2));
      ax.push(
        `<line class="guide" x1="${gx}" y1="20" x2="${gx}" y2="${AXIS_H}"/>` +
          `<g class="guide-lbl"><rect x="${lx}" y="2" width="${w}" height="18" rx="3"/>` +
          `<text x="${lx + 6}" y="15">${esc(label)}</text></g>`,
      );
    }
    if (dim) {
      const sx = x(dim.from);
      const label = str('respawn.scrubber.label');
      const w = label.length * 7 + 16;
      const lx = Math.min(sx + 6, plotRight - w - 4);
      ax.push(`<line class="scrub" x1="${sx}" y1="0" x2="${sx}" y2="${AXIS_H}"/>`);
      ax.push(
        `<g class="scrub-lbl"><rect x="${lx}" y="1" width="${w}" height="19" rx="9"/><text x="${lx + 8}" y="15">${esc(label)}</text></g>`,
      );
    }
    ax.push(`</g>`);
    this.axisWrap.innerHTML =
      `<svg width="${totalW}" height="${AXIS_H}" class="rs-axis-svg">` +
      `<defs><clipPath id="rs-clip-axis"><rect x="${labelW}" y="0" width="${plotW}" height="${AXIS_H}"/></clipPath></defs>` +
      ax.join('') +
      `</svg>`;

    // Rows.
    const H = Math.max(rows.length * rowH, 1);
    const out: string[] = [];
    out.push(
      `<defs>` +
        `<pattern id="rs-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
        `<rect width="8" height="8" fill="#26303b"/><rect width="4" height="8" fill="#9aa7b6"/></pattern>` +
        `<clipPath id="rs-clip"><rect x="${labelW}" y="0" width="${plotW}" height="${H}"/></clipPath>` +
        `</defs>`,
    );
    rows.forEach((r, i) => out.push(this.rowSvg(r, i, rowH, labelW, totalW, x, sel, t)));
    // Guides and scrubber above the rows.
    out.push(`<g clip-path="url(#rs-clip)" class="overlay">`);
    if (dim) {
      out.push(
        `<rect class="dim" x="${x(dim.from)}" y="0" width="${Math.max(0, plotRight - x(dim.from))}" height="${H}"/>`,
      );
      out.push(`<line class="scrub" x1="${x(dim.from)}" y1="0" x2="${x(dim.from)}" y2="${H}"/>`);
    }
    if (sel) {
      const gx = x(sel.kind === 'new' ? sel.entryTick : sel.resumeTick);
      out.push(`<line class="guide" x1="${gx}" y1="0" x2="${gx}" y2="${H}"/>`);
    }
    out.push(`</g>`);
    // Labels (fixed column over the clipped plot).
    rows.forEach((r, i) => out.push(this.labelSvg(r, i, rowH, labelW, sel)));
    this.rowsWrap.innerHTML = `<svg class="rs-rows-svg" width="${totalW}" height="${H}">${out.join('')}</svg>`;
    this.rowsWrap.style.height = `${H}px`;
  }

  private rowSvg(
    r: LaneRow,
    i: number,
    rowH: number,
    labelW: number,
    totalW: number,
    x: (t: number) => number,
    sel: SpawnOption | null,
    t: number,
  ): string {
    const y0 = i * rowH;
    const cy = r1(y0 + rowH / 2);
    const lane = r.lane;
    const isSel = sel?.kind === 'resume' && sel.soldierId === r.soldierId;
    const pulse = this.pulses.get(r.soldierId);
    const pulseAge = pulse ? t - pulse.start : Infinity;
    const cls = [
      'row',
      i % 2 ? 'odd' : 'even',
      isSel ? 'sel' : '',
      r.neverSpawned ? 'never' : '',
      pulseAge < PULSE_MS ? 'pulse' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const delay = pulseAge < PULSE_MS ? ` style="animation-delay:${-Math.round(pulseAge)}ms"` : '';
    const s: string[] = [];
    s.push(`<g class="${cls}" data-row="${esc(r.soldierId)}">`);
    s.push(`<rect class="row-bg"${delay} x="0" y="${y0}" width="${totalW}" height="${rowH}"/>`);
    s.push(`<g clip-path="url(#rs-clip)">`);
    const bar = Math.max(4, Math.min(8, rowH * 0.18));
    for (const sp of displaySpans(lane.spans)) {
      const x1 = x(sp.from);
      const x2 = Math.max(x1 + 1, x(sp.to + 1));
      const c = spanClass(sp.kind);
      if (sp.kind === 'alive') {
        s.push(
          `<rect class="${c}" x="${x1}" y="${r1(cy - bar / 2)}" width="${r1(x2 - x1)}" height="${r1(bar)}" rx="${r1(bar / 2)}"/>`,
        );
      } else if (sp.kind === 'unresolved') {
        s.push(
          `<rect class="${c}" x="${x1}" y="${r1(cy - bar * 0.75)}" width="${r1(x2 - x1)}" height="${r1(bar * 1.5)}" fill="url(#rs-hatch)"/>`,
        );
      } else {
        s.push(`<line class="${c}" x1="${x1}" y1="${cy}" x2="${x2}" y2="${cy}"/>`);
      }
    }
    const flash = this.flashes.get(r.soldierId);
    if (flash && t - flash.start < FLASH_MS) {
      const d = -Math.round(t - flash.start);
      for (const fr of flash.ranges) {
        const x1 = x(fr.from);
        const x2 = Math.max(x1 + 2, x(fr.to + 1));
        s.push(
          `<rect class="flash fl-${fr.kind}" style="animation-delay:${d}ms" x="${x1}" y="${r1(cy - rowH * 0.32)}" width="${r1(x2 - x1)}" height="${r1(rowH * 0.64)}" rx="4"/>`,
        );
      }
    }
    // Spawn tick.
    if (!r.neverSpawned) {
      s.push(
        `<line class="start" x1="${x(lane.recordedFrom)}" y1="${r1(cy - bar)}" x2="${x(lane.recordedFrom)}" y2="${r1(cy + bar)}"/>`,
      );
    }
    // Subtle event markers.
    if (this.settings.eventMarkers && !r.neverSpawned) {
      for (const m of lane.markers) {
        if (!isEventMarker(m)) continue;
        const mx = x(m.tick);
        const tip = esc(markerTooltip(m, r.ordinal));
        s.push(
          `<g class="mk mk-${m.kind}" data-tip="${tip}"><circle class="hit" cx="${mx}" cy="${cy}" r="10"/>` +
            `<rect class="dot" x="${r1(mx - 3)}" y="${r1(cy - bar / 2 - 7)}" width="6" height="6" transform="rotate(45 ${mx} ${r1(cy - bar / 2 - 4)})"/></g>`,
        );
      }
    }
    // End glyph: X and O dominate.
    const es = endStyle(lane.end);
    if (es.glyph && es.tick !== null) {
      const gx = x(es.tick);
      const g = Math.max(8, Math.min(15, rowH * 0.34));
      const tip = esc(endTooltip(lane.end, r.ordinal));
      if (es.selectable) {
        const key = `resume:${r.soldierId}`;
        s.push(
          `<g class="end ${es.cls}${isSel ? ' sel' : ''}" data-select="${esc(key)}" data-tip="${tip}">` +
            (isSel ? `<circle class="sel-ring" cx="${gx}" cy="${cy}" r="${r1(g + 6)}"/>` : '') +
            glyphSvg(es.glyph, gx, cy, g) +
            `<circle class="hit" cx="${gx}" cy="${cy}" r="22"/></g>`,
        );
      } else {
        s.push(
          `<g class="end ${es.cls}" data-tip="${tip}">${glyphSvg(es.glyph, gx, cy, g)}<circle class="hit" cx="${gx}" cy="${cy}" r="14"/></g>`,
        );
      }
    } else if (lane.end.kind === 'unresolved') {
      s.push(
        `<g class="end" data-tip="${esc(endTooltip(lane.end, r.ordinal))}"><circle class="hit" cx="${x(lane.recordedTo)}" cy="${cy}" r="12"/><text class="q" x="${x(lane.recordedTo) + 8}" y="${cy + 5}">?</text></g>`,
      );
    }
    s.push(`</g></g>`);
    return s.join('');
  }

  private labelSvg(
    r: LaneRow,
    i: number,
    rowH: number,
    labelW: number,
    sel: SpawnOption | null,
  ): string {
    const y0 = i * rowH;
    const isSel = sel?.kind === 'resume' && sel.soldierId === r.soldierId;
    const two = rowH >= 36;
    const sub = r.neverSpawned ? str('respawn.timeline.neverSpawned') : r.spawnName;
    const tip = r.neverSpawned ? ` data-tip="${esc(endTooltip(r.lane.end, r.ordinal))}"` : '';
    return (
      `<g class="lbl${isSel ? ' sel' : ''}${r.neverSpawned ? ' never' : ''}"${tip}>` +
      `<rect x="0" y="${y0}" width="${labelW}" height="${rowH}"/>` +
      `<text class="name" x="10" y="${r1(y0 + (two ? rowH / 2 - 2 : rowH / 2 + 5))}">${esc(r.label)}</text>` +
      (two ? `<text class="sub" x="10" y="${r1(y0 + rowH / 2 + 12)}">${esc(sub)}</text>` : '') +
      `</g>`
    );
  }
}

/** The four end glyphs, centered at (cx, cy) with radius g. */
export function glyphSvg(glyph: '✓' | 'X' | 'O' | '!', cx: number, cy: number, g: number): string {
  const c = (v: number) => r1(v);
  switch (glyph) {
    case 'X': {
      const d = g * 0.8;
      return (
        `<circle class="g-back" cx="${c(cx)}" cy="${c(cy)}" r="${c(g + 1)}"/>` +
        `<path class="g-x" d="M${c(cx - d)} ${c(cy - d)}L${c(cx + d)} ${c(cy + d)}M${c(cx + d)} ${c(cy - d)}L${c(cx - d)} ${c(cy + d)}"/>`
      );
    }
    case 'O':
      return `<circle class="g-o" cx="${c(cx)}" cy="${c(cy)}" r="${c(g * 0.85)}"/>`;
    case '!':
      return (
        `<circle class="g-bang" cx="${c(cx)}" cy="${c(cy)}" r="${c(g * 0.9)}"/>` +
        `<text class="g-bang-t" x="${c(cx)}" y="${c(cy + g * 0.42)}" font-size="${c(g * 1.3)}">!</text>`
      );
    case '✓':
      return (
        `<circle class="g-check" cx="${c(cx)}" cy="${c(cy)}" r="${c(g * 0.9)}"/>` +
        `<path class="g-check-t" d="M${c(cx - g * 0.45)} ${c(cy)}L${c(cx - g * 0.1)} ${c(cy + g * 0.38)}L${c(cx + g * 0.5)} ${c(cy - g * 0.38)}"/>`
      );
  }
}
