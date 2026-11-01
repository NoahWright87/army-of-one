/**
 * (06-b) In-game minimap ([D29]): a corner DOM overlay with two canvases. The base canvas (fog,
 * seen terrain, objective, spawns, known threats) is redrawn only when the reveal changes; the
 * top canvas (soldier dots, turrets' live state, camera viewport) is redrawn per frame, only
 * when the tick or camera moved. The live soldier reveals as it explores (`revealLive`).
 *
 * It reads a source the app provides; it never touches the sim.
 */
import { str } from '../../content/strings';
import type { MapDef } from '../../sim/world/map';
import type { WorldView } from '../../sim/view';
import { revealedRuns, type RevealedMap, type RevealGrid } from '../../timeline/reveal';
import { el, injectStyle } from '../dom';
import { DOT_STYLE, dotKind, minimapBox, type MinimapBox } from './minimap-model';
import { DEFAULT_MINIMAP_SETTINGS, type MinimapSettings } from './minimap-settings';

export interface MinimapSource {
  map: MapDef;
  /** Reveal from the current truth; the minimap adds the live soldier's layer to it. */
  grid: RevealGrid;
  /** What's known (recomputed when the reveal changes). */
  known(): RevealedMap;
  view(): WorldView;
  liveId: string;
  /** Camera viewport in world units, or null if unknown. */
  camera(): { x: number; y: number; width: number; height: number } | null;
}

const CSS = `
.aoo-minimap { position: fixed; right: 12px; bottom: 12px; z-index: 10; pointer-events: none;
  border: 1px solid rgba(160, 175, 190, .55); border-radius: 4px; background: #07090c;
  box-shadow: 0 2px 10px rgba(0,0,0,.6); overflow: hidden; }
.aoo-minimap[hidden] { display: none; }
.aoo-minimap canvas { position: absolute; left: 0; top: 0; display: block; }
`;

export class Minimap {
  readonly root: HTMLDivElement;
  private readonly base: HTMLCanvasElement;
  private readonly top: HTMLCanvasElement;
  private src: MinimapSource | null = null;
  private settings: MinimapSettings = DEFAULT_MINIMAP_SETTINGS;
  private box: MinimapBox | null = null;
  private dpr = 1;
  private raf = 0;
  private drawnVersion = -1;
  private lastKey = '';

  constructor(parent: HTMLElement) {
    injectStyle('aoo-minimap-css', CSS);
    this.root = el('div', 'aoo-minimap');
    this.root.setAttribute('aria-label', str('respawn.map.title'));
    this.root.hidden = true;
    this.base = el('canvas');
    this.top = el('canvas');
    this.root.append(this.base, this.top);
    parent.appendChild(this.root);
    window.addEventListener('resize', () => this.relayout());
  }

  setSettings(s: MinimapSettings): void {
    this.settings = s;
    this.root.style.opacity = String(s.opacity);
    this.relayout();
    this.sync();
  }

  start(src: MinimapSource): void {
    this.src = src;
    this.drawnVersion = -1;
    this.lastKey = '';
    this.relayout();
    this.sync();
  }

  stop(): void {
    this.src?.grid.clearLive();
    this.src = null;
    this.sync();
  }

  private sync(): void {
    const on = !!this.src && this.settings.enabled;
    this.root.hidden = !on;
    if (on && !this.raf) this.raf = requestAnimationFrame(() => this.frame());
    if (!on && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private relayout(): void {
    const src = this.src;
    if (!src) return;
    const box = minimapBox(
      src.map,
      this.settings.size,
      window.innerWidth * 0.4,
      window.innerHeight * 0.45,
    );
    this.box = box;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [this.base, this.top]) {
      c.width = Math.round(box.w * this.dpr);
      c.height = Math.round(box.h * this.dpr);
      c.style.width = `${box.w}px`;
      c.style.height = `${box.h}px`;
    }
    this.root.style.width = `${box.w}px`;
    this.root.style.height = `${box.h}px`;
    this.drawnVersion = -1;
    this.lastKey = '';
  }

  private frame(): void {
    this.raf = 0;
    const src = this.src;
    if (!src || !this.settings.enabled || !this.box) return;
    const view = src.view();
    const live = view.soldiers.find((s) => s.id === src.liveId);
    if (live?.alive) src.grid.revealLive(live.x, live.y);
    if (src.grid.version !== this.drawnVersion) {
      this.drawBase(src);
      this.drawnVersion = src.grid.version;
      this.lastKey = '';
    }
    const cam = src.camera();
    const key = `${view.tick}|${cam ? `${Math.round(cam.x)},${Math.round(cam.y)},${Math.round(cam.width)}` : ''}`;
    if (key !== this.lastKey) {
      this.drawTop(src, view, cam);
      this.lastKey = key;
    }
    this.raf = requestAnimationFrame(() => this.frame());
  }

  private ctx(c: HTMLCanvasElement): CanvasRenderingContext2D | null {
    const ctx = c.getContext('2d');
    if (!ctx || !this.box) return null;
    const k = this.box.scale * this.dpr;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    return ctx;
  }

  private drawBase(src: MinimapSource): void {
    const ctx = this.ctx(this.base);
    if (!ctx || !this.box) return;
    const { map, grid } = src;
    const u = 1 / this.box.scale; // world units per CSS px
    ctx.clearRect(0, 0, map.width, map.height);
    ctx.fillStyle = '#07090c';
    ctx.fillRect(0, 0, map.width, map.height);
    // Seen terrain, clipped to the revealed cells.
    const cs = grid.cellSize;
    const runs = revealedRuns(grid);
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < runs.length; i += 3) {
      ctx.rect(runs[i]! * cs, runs[i + 1]! * cs, runs[i + 2]! * cs, cs);
    }
    ctx.clip();
    ctx.fillStyle = '#2c3829';
    ctx.fillRect(0, 0, map.width, map.height);
    ctx.fillStyle = '#2f6390';
    for (const r of map.water) ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#8a949f';
    for (const r of map.walls) ctx.fillRect(r.x, r.y, Math.max(r.w, u), Math.max(r.h, u));
    ctx.restore();

    const k = src.known();
    ctx.lineWidth = 1.5 * u;
    for (const t of k.threats) {
      if (t.kind === 'traffic') {
        ctx.strokeStyle = 'rgba(255, 174, 66, .7)';
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
      } else if (t.kind === 'mine' && !t.destroyed) {
        ctx.fillStyle = '#ff8a3d';
        ctx.fillRect(t.x - u, t.y - u, 2 * u, 2 * u);
      } else if (t.kind === 'gate') {
        ctx.fillStyle = '#ffae42';
        ctx.fillRect(t.rect.x, t.rect.y, Math.max(t.rect.w, 2 * u), Math.max(t.rect.h, 2 * u));
      }
    }
    for (const s of k.spawns) {
      ctx.fillStyle = s.open ? '#4fd1ff' : '#6f7b88';
      ctx.fillRect(s.x - 3 * u, s.y - 3 * u, 6 * u, 6 * u);
    }
    for (const o of k.objectives) {
      ctx.strokeStyle = o.done ? '#5ee38a' : '#ffd34d';
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.arc(o.x, o.y, 4.5 * u, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillRect(o.x - 1.2 * u, o.y - 1.2 * u, 2.4 * u, 2.4 * u);
    }
  }

  private drawTop(
    src: MinimapSource,
    view: WorldView,
    cam: { x: number; y: number; width: number; height: number } | null,
  ): void {
    const ctx = this.ctx(this.top);
    if (!ctx || !this.box) return;
    const u = 1 / this.box.scale;
    ctx.clearRect(0, 0, src.map.width, src.map.height);
    // Turrets as the battle has them now (destroyed this attempt shows at once), if seen.
    for (const t of view.turrets) {
      if (!src.grid.isRevealedAt(t.x, t.y)) continue;
      ctx.fillStyle = t.state === 'destroyed' ? '#59626c' : '#ff4d5e';
      ctx.fillRect(t.x - 2.5 * u, t.y - 2.5 * u, 5 * u, 5 * u);
    }
    let live: { x: number; y: number } | null = null;
    for (const s of view.soldiers) {
      const kind = dotKind(s, src.liveId);
      if (!kind) continue;
      if (kind === 'live') {
        live = s;
        continue;
      }
      const st = DOT_STYLE[kind];
      ctx.fillStyle = st.fill;
      ctx.fillRect(s.x - st.r * u, s.y - st.r * u, 2 * st.r * u, 2 * st.r * u);
    }
    if (cam) {
      ctx.strokeStyle = 'rgba(255, 255, 255, .8)';
      ctx.lineWidth = 1 * u;
      ctx.strokeRect(cam.x, cam.y, cam.width, cam.height);
    }
    if (live) {
      const st = DOT_STYLE.live;
      ctx.fillStyle = st.fill;
      ctx.strokeStyle = '#1a1406';
      ctx.lineWidth = 1 * u;
      ctx.beginPath();
      ctx.arc(live.x, live.y, st.r * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}
