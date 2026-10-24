/**
 * (06-b) The respawn screen's revealed map ([D29]): a DOM/SVG panel, independent of Phaser.
 * Unseen ground is dark fog; seen ground shows walls and water simply; spawn points are
 * selectable markers (click picks that spawn, double-click deploys); known threats, X and O are
 * drawn on top. Markers keep a fixed on-screen size whatever the map's scale, and every
 * selectable marker has a ≥ 44 px hit target.
 *
 * All decisions live in map-panel-model.ts and src/timeline/reveal.ts; this file only renders.
 */
import { str } from '../../content/strings';
import type { MapDef } from '../../sim/world/map';
import { revealedRuns, type RevealGrid, type RevealedMap } from '../../timeline/reveal';
import { el } from '../dom';
import {
  isTallMap,
  labelsThatFit,
  mapMarkers,
  revealFor,
  tallMapWidth,
  unitsPerPx,
  type MapMarker,
} from './map-panel-model';
import type { OptionKey, RespawnProps } from './respawn-model';

export interface MapPanelHooks {
  select(key: OptionKey): void;
  deploy(key: OptionKey): void;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const r1 = (v: number) => Math.round(v * 10) / 10;
/** Map padding, in on-screen px, so edge markers aren't clipped. */
const PAD_PX = 10;
const HIT_PX = 22;
let uid = 0;

export class MapPanel {
  readonly root = el('section', 'rs-map');
  private readonly body = el('div', 'rs-map-body');
  private readonly pct = el('span', 'rs-map-pct');
  private readonly bar = el('div', 'rs-map-bar');
  private readonly legend = el('div', 'rs-map-legend');
  private readonly tip = el('div', 'rs-tip rs-map-tip');
  private readonly svg: SVGSVGElement;
  private readonly terrain: SVGGElement;
  private readonly marks: SVGGElement;
  private readonly id = `rsm${++uid}`;
  private props: RespawnProps | null = null;
  private selected: OptionKey | null = null;
  private grid: RevealGrid | null = null;
  private known: RevealedMap | null = null;
  /** What the terrain layer was drawn for. */
  private drawn = { version: -1, unit: 0, mapId: '' };
  private unit = 1;
  private tipTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly hooks: MapPanelHooks) {
    const bar = this.bar;
    bar.append(el('h2', '', str('respawn.map.title')), this.pct);
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'rs-map-svg');
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-label', str('respawn.map.label'));
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.terrain = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.marks = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.svg.append(this.terrain, this.marks);
    this.body.append(this.svg, this.tip);
    this.root.append(bar, this.body, this.legend);
    this.installInput();
  }

  /** Adds a button to the panel's title bar (the phone view toggle). */
  addBarButton(b: HTMLElement): void {
    this.bar.append(b);
  }

  /** New truth (lanes, options, captures …) or selection. Cheap when nothing changed. */
  render(props: RespawnProps, selected: OptionKey | null, showLegend: boolean): void {
    const truthChanged =
      !this.props ||
      this.props.lanes !== props.lanes ||
      this.props.soldiers !== props.soldiers ||
      this.props.captures !== props.captures ||
      this.props.map !== props.map;
    this.props = props;
    this.selected = selected;
    if (truthChanged || !this.grid) {
      const r = revealFor(props);
      this.grid = r.grid;
      this.known = r.known;
    }
    this.legend.hidden = !showLegend;
    if (showLegend && !this.legend.firstChild) this.renderLegend();
    this.layout();
    this.draw();
  }

  setSelected(key: OptionKey | null): void {
    this.selected = key;
    this.drawMarks();
  }

  /** Width for a tall map's column (null = let CSS size it). Call on resize. */
  layout(): void {
    const p = this.props;
    if (!p) return;
    const tall = isTallMap(p.map);
    const ratio = tall ? '' : `${p.map.width} / ${p.map.height}`;
    if (this.body.style.aspectRatio !== ratio) this.body.style.aspectRatio = ratio;
    if (tall) {
      const barH = 34 + (this.legend.hidden ? 0 : this.legend.offsetHeight);
      const avail = this.root.clientHeight - barH;
      const phone = window.innerWidth <= 760;
      const w = tallMapWidth(
        p.map,
        avail,
        phone ? 84 : 150,
        phone ? window.innerWidth * 0.42 : 320,
      );
      const css = `${w + 2}px`;
      if (this.root.style.width !== css) this.root.style.width = css;
    } else if (this.root.style.width) {
      this.root.style.width = '';
    }
  }

  /** Redraws for the current size (markers keep their pixel size). */
  resize(): void {
    this.layout();
    this.draw();
  }

  destroy(): void {
    if (this.tipTimer) clearTimeout(this.tipTimer);
    for (const c of this.cleanups) c();
    this.root.remove();
  }

  // ---------- drawing ----------

  private draw(): void {
    const p = this.props;
    const g = this.grid;
    if (!p || !g) return;
    const bw = this.body.clientWidth;
    const bh = this.body.clientHeight;
    if (bw <= 0 || bh <= 0) return;
    // Pad in map units so PAD_PX survives the fit.
    const u0 = unitsPerPx(p.map, bw, bh, 0);
    const pad = PAD_PX * u0;
    this.unit = unitsPerPx(p.map, bw, bh, pad);
    this.svg.setAttribute(
      'viewBox',
      `${r1(-pad)} ${r1(-pad)} ${r1(p.map.width + 2 * pad)} ${r1(p.map.height + 2 * pad)}`,
    );
    this.pct.textContent = str('respawn.map.revealed', { pct: Math.round(g.fraction * 100) });
    const d = this.drawn;
    if (d.version !== g.version || d.mapId !== p.map.id || Math.abs(d.unit - this.unit) > 1e-6) {
      this.terrain.innerHTML = terrainSvg(p.map, g, this.id, this.unit);
      this.drawn = { version: g.version, unit: this.unit, mapId: p.map.id };
    }
    this.drawMarks();
  }

  private drawMarks(): void {
    const p = this.props;
    if (!p || !this.known) return;
    const markers = mapMarkers(p, this.known, this.selected);
    const u = this.unit;
    const fit = labelsThatFit(markers, u);
    const parts = markers.map((m) =>
      markerSvg(m.kind === 'spawn' && !fit.has(m.id) ? { ...m, label: '' } : m, u, p.map),
    );
    // Hit targets on top, selectables last so they win overlaps.
    for (const m of [...markers.filter((x) => !x.select), ...markers.filter((x) => x.select)]) {
      const r = m.select ? HIT_PX : 12;
      parts.push(
        `<circle class="mp-hit" cx="${r1(m.x)}" cy="${r1(m.y)}" r="${r1(r * u)}" data-tip="${esc(m.tip)}"` +
          (m.select ? ` data-select="${esc(m.select)}"` : '') +
          `/>`,
      );
    }
    this.marks.innerHTML = parts.join('');
  }

  private renderLegend(): void {
    const sw = (inner: string) =>
      `<svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true">${inner}</svg>`;
    const item = (icon: string, label: string) =>
      `<span class="lg">${sw(icon)}${esc(label)}</span>`;
    this.legend.innerHTML = [
      item(spawnIcon(0, 0, 1, false, false), str('respawn.map.legend.spawn')),
      item(turretIcon(0, 0, 1, false), str('respawn.map.legend.threat')),
      item(xIcon(0, 0, 1), str('respawn.legend.death')),
      item(oIcon(0, 0, 1, false, false), str('respawn.legend.open')),
      item(
        '<rect x="-7" y="-6" width="14" height="12" rx="2" class="mp-fog-sw"/>',
        str('respawn.map.legend.fog'),
      ),
    ].join('');
  }

  // ---------- input ----------

  private installInput(): void {
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
    ) => {
      this.body.addEventListener(type, fn);
      this.cleanups.push(() => this.body.removeEventListener(type, fn));
    };
    const target = (e: Event) => (e.target as Element | null)?.closest?.('[data-tip]') ?? null;
    on('click', (e) => {
      const t = target(e);
      const sel = t?.getAttribute('data-select');
      if (sel) this.hooks.select(sel);
      const tip = t?.getAttribute('data-tip');
      if (tip) {
        this.showTip(tip, e.clientX, e.clientY);
        if (this.tipTimer) clearTimeout(this.tipTimer);
        this.tipTimer = setTimeout(() => this.hideTip(), 2600);
      } else this.hideTip();
    });
    on('dblclick', (e) => {
      const sel = target(e)?.getAttribute('data-select');
      if (sel) this.hooks.deploy(sel);
    });
    on('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const tip = target(e)?.getAttribute('data-tip');
      if (tip) this.showTip(tip, e.clientX, e.clientY);
      else this.hideTip();
    });
    on('pointerleave', () => this.hideTip());
  }

  private showTip(text: string, clientX: number, clientY: number): void {
    const box = this.body.getBoundingClientRect();
    if (this.tip.textContent !== text) this.tip.textContent = text;
    this.tip.classList.add('on');
    const w = this.tip.offsetWidth;
    const h = this.tip.offsetHeight;
    const x = Math.max(2, Math.min(box.width - w - 2, clientX - box.left - w / 2));
    let y = clientY - box.top - h - 18;
    if (y < 2) y = clientY - box.top + 20;
    this.tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  private hideTip(): void {
    this.tip.classList.remove('on');
  }
}

// ---------- SVG builders (map units; `u` = map units per screen px) ----------

function terrainSvg(map: MapDef, grid: RevealGrid, id: string, u: number): string {
  const cs = grid.cellSize;
  const runs = revealedRuns(grid);
  let d = '';
  for (let i = 0; i < runs.length; i += 3) {
    // Slight overlap hides seams between runs.
    d += `M${runs[i]! * cs - 1} ${runs[i + 1]! * cs - 1}h${runs[i + 2]! * cs + 2}v${cs + 2}h${-(runs[i + 2]! * cs + 2)}z`;
  }
  const rects = (list: readonly { x: number; y: number; w: number; h: number }[], cls: string) =>
    list
      .map(
        (r) =>
          `<rect class="${cls}" x="${r1(r.x)}" y="${r1(r.y)}" width="${r1(Math.max(r.w, 2 * u))}" height="${r1(Math.max(r.h, 2 * u))}"/>`,
      )
      .join('');
  const blur = r1(Math.max(cs * 0.2, 2 * u));
  return (
    `<defs><filter id="${id}-soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${blur}"/></filter>` +
    `<mask id="${id}-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${map.width}" height="${map.height}">` +
    `<path d="${d}" fill="#fff" filter="url(#${id}-soft)"/></mask></defs>` +
    `<rect class="mp-fog" x="0" y="0" width="${map.width}" height="${map.height}"/>` +
    `<g mask="url(#${id}-mask)">` +
    `<rect class="mp-ground" x="0" y="0" width="${map.width}" height="${map.height}"/>` +
    rects(map.water, 'mp-water') +
    rects(map.walls, 'mp-wall') +
    `</g>` +
    `<rect class="mp-edge" x="0" y="0" width="${map.width}" height="${map.height}" stroke-width="${r1(1.5 * u)}"/>`
  );
}

function markerSvg(m: MapMarker, u: number, map: Pick<MapDef, 'width' | 'height'>): string {
  const { x, y } = m;
  switch (m.kind) {
    case 'spawn': {
      const s = spawnIcon(x, y, u, m.selected, m.inactive);
      // Below the marker, or above it near the bottom edge; kept inside the map horizontally.
      const ly = y + 24 * u > map.height + PAD_PX * u ? y - 19 * u : y + 22 * u;
      const half = ((m.label?.length ?? 0) * 3.6 + 2) * u;
      const lx = Math.max(half - PAD_PX * u, Math.min(map.width + PAD_PX * u - half, x));
      const label = m.label
        ? `<text class="mp-label${m.selected ? ' sel' : ''}" x="${r1(lx)}" y="${r1(ly)}" font-size="${r1(12 * u)}" stroke-width="${r1(3 * u)}">${esc(m.label)}</text>`
        : '';
      return s + label;
    }
    case 'open':
      return oIcon(x, y, u, m.selected, m.inactive);
    case 'death':
      return xIcon(x, y, u);
    case 'interrupted':
      return (
        `<circle class="mp-bang" cx="${r1(x)}" cy="${r1(y)}" r="${r1(6 * u)}"/>` +
        `<text class="mp-bang-t" x="${r1(x)}" y="${r1(y + 3.5 * u)}" font-size="${r1(10 * u)}">!</text>`
      );
    case 'turret':
      return turretIcon(x, y, u, m.inactive);
    case 'mine':
      return `<circle class="mp-mine${m.inactive ? ' off' : ''}" cx="${r1(x)}" cy="${r1(y)}" r="${r1(3.5 * u)}" stroke-width="${r1(1.5 * u)}"/>`;
    case 'traffic':
      return `<line class="mp-traffic" x1="${r1(x)}" y1="${r1(y)}" x2="${r1(m.x2!)}" y2="${r1(m.y2!)}" stroke-width="${r1(2 * u)}" stroke-dasharray="${r1(5 * u)} ${r1(4 * u)}"/>`;
    case 'gate':
    case 'bridge': {
      const r = m.rect!;
      const minW = 3 * u;
      const w = Math.max(r.w, minW);
      const h = Math.max(r.h, minW);
      const cls = m.kind === 'gate' ? 'mp-gate' : `mp-bridge${m.inactive ? ' off' : ''}`;
      return `<rect class="${cls}" x="${r1(r.x + r.w / 2 - w / 2)}" y="${r1(r.y + r.h / 2 - h / 2)}" width="${r1(w)}" height="${r1(h)}" stroke-width="${r1(1.5 * u)}"/>`;
    }
    case 'capture':
      return `<circle class="mp-cap${m.inactive ? '' : ' ours'}" cx="${r1(x)}" cy="${r1(y)}" r="${r1(8 * u)}" stroke-width="${r1(2.5 * u)}"/>`;
    case 'objective':
      return (
        `<circle class="mp-obj${m.inactive ? ' done' : ''}" cx="${r1(x)}" cy="${r1(y)}" r="${r1(10 * u)}" stroke-width="${r1(2.5 * u)}"/>` +
        `<circle class="mp-obj-in${m.inactive ? ' done' : ''}" cx="${r1(x)}" cy="${r1(y)}" r="${r1(4 * u)}"/>`
      );
    case 'flag': {
      const h = 18 * u;
      return (
        `<circle class="mp-obj${m.inactive ? ' done' : ''}" cx="${r1(x)}" cy="${r1(y)}" r="${r1(10 * u)}" stroke-width="${r1(2.5 * u)}"/>` +
        `<path class="mp-flag${m.inactive ? ' done' : ''}" d="M${r1(x - 2 * u)} ${r1(y + 6 * u)}V${r1(y - h / 2)}L${r1(x + 8 * u)} ${r1(y - h / 2 + 4 * u)}L${r1(x - 2 * u)} ${r1(y - h / 2 + 8 * u)}" stroke-width="${r1(1.5 * u)}"/>`
      );
    }
  }
}

function spawnIcon(x: number, y: number, u: number, selected: boolean, inactive: boolean): string {
  const s = 8 * u;
  const ring = selected
    ? `<circle class="mp-sel-ring" cx="${r1(x)}" cy="${r1(y)}" r="${r1(15 * u)}" stroke-width="${r1(2.5 * u)}" stroke-dasharray="${r1(4 * u)} ${r1(3 * u)}"/>`
    : '';
  // A chevron pointing up: forward ([D27]).
  return (
    ring +
    `<rect class="mp-spawn${selected ? ' sel' : ''}${inactive ? ' off' : ''}" x="${r1(x - s)}" y="${r1(y - s)}" width="${r1(2 * s)}" height="${r1(2 * s)}" rx="${r1(3 * u)}" stroke-width="${r1(2 * u)}"/>` +
    `<path class="mp-spawn-a" d="M${r1(x - 4 * u)} ${r1(y + 2.5 * u)}L${r1(x)} ${r1(y - 2.5 * u)}L${r1(x + 4 * u)} ${r1(y + 2.5 * u)}" stroke-width="${r1(2 * u)}"/>`
  );
}

function turretIcon(x: number, y: number, u: number, off: boolean): string {
  const s = 5.5 * u;
  const body = `<rect class="mp-turret${off ? ' off' : ''}" x="${r1(x - s)}" y="${r1(y - s)}" width="${r1(2 * s)}" height="${r1(2 * s)}" stroke-width="${r1(1.5 * u)}"/>`;
  if (!off) return body;
  const d = s * 0.8;
  return (
    body +
    `<path class="mp-dead" d="M${r1(x - d)} ${r1(y - d)}L${r1(x + d)} ${r1(y + d)}M${r1(x + d)} ${r1(y - d)}L${r1(x - d)} ${r1(y + d)}" stroke-width="${r1(1.5 * u)}"/>`
  );
}

function xIcon(x: number, y: number, u: number): string {
  const d = 5 * u;
  return (
    `<path class="mp-x-back" d="M${r1(x - d)} ${r1(y - d)}L${r1(x + d)} ${r1(y + d)}M${r1(x + d)} ${r1(y - d)}L${r1(x - d)} ${r1(y + d)}" stroke-width="${r1(5 * u)}"/>` +
    `<path class="mp-x" d="M${r1(x - d)} ${r1(y - d)}L${r1(x + d)} ${r1(y + d)}M${r1(x + d)} ${r1(y - d)}L${r1(x - d)} ${r1(y + d)}" stroke-width="${r1(2.5 * u)}"/>`
  );
}

function oIcon(x: number, y: number, u: number, selected: boolean, inactive: boolean): string {
  const ring = selected
    ? `<circle class="mp-sel-ring" cx="${r1(x)}" cy="${r1(y)}" r="${r1(13 * u)}" stroke-width="${r1(2.5 * u)}" stroke-dasharray="${r1(4 * u)} ${r1(3 * u)}"/>`
    : '';
  return (
    ring +
    `<circle class="mp-o${inactive ? ' off' : ''}" cx="${r1(x)}" cy="${r1(y)}" r="${r1(6 * u)}" stroke-width="${r1(3 * u)}"/>`
  );
}
