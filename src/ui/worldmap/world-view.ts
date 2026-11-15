/**
 * (PHASE13-c) World map generator viewer ([D89]): the whole board, its frame (rivers, ridges)
 * and the levels carved from it; regenerate at will. Click a level to see it at any budget, and
 * playtest it for real. A testing tool for now: what a campaign's world map will be built on.
 */
import { BLOCK_CELLS, GROUND, isGroundKind } from '../../content/ground';
import { sideProfiles } from '../../gen/edges';
import { ROLES } from '../../content/roles';
import { str, type StringKey } from '../../content/strings';
import { isRectItem } from '../../gen/block';
import type { GeneratedLevel } from '../../gen/level';
import { orientBlock } from '../../gen/transform';
import type { GeneratedWorld, WorldLevel } from '../../gen/world';
import { el, injectStyle } from '../dom';
import { drawMapSketch, roleColor } from './map-draw';

export interface WorldViewActions {
  /** Makes a new world from this seed (null: a random one). */
  generate(seed: number | null): void;
  levelMap(index: number, budget: number): Omit<GeneratedLevel, 'attempts'>;
  playtest(index: number, budget: number): void;
  exit(): void;
  /** Opens a block in the editor (as is: nothing is copied). */
  openBlock(id: string): void;
  /** Whether worlds use your saved blocks as well as the official ones. */
  includeMine(): boolean;
  /** Opens the block connection graph ([D104]). */
  openGraph(): void;
  setIncludeMine(on: boolean): void;
}

/** What's drawn over the board (all off: just the map). */
interface Overlays {
  levels: boolean;
  labels: boolean;
  frame: boolean;
  mismatches: boolean;
}
const OVERLAYS_KEY = 'army-of-one.world.overlays';

const css = `
.aoo-wm { position: fixed; inset: 0; display: grid; grid-template-columns: 230px 1fr 400px;
  font: 13px/1.4 system-ui, sans-serif; color: #e7e9ec; background: #111418; }
.aoo-wm aside { overflow-y: auto; padding: 12px; background: #181c21; }
.aoo-wm aside.left { border-right: 1px solid #262c33; }
.aoo-wm aside.right { border-left: 1px solid #262c33; }
.aoo-wm h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #8b95a1;
  margin: 14px 0 6px; }
.aoo-wm h2:first-child { margin-top: 0; }
.aoo-wm .stage { position: relative; overflow: auto; }
.aoo-wm canvas.board { display: block; cursor: pointer; }
.aoo-wm button, .aoo-wm input { font: inherit; color: inherit; background: #232930;
  border: 1px solid #343c46; border-radius: 4px; padding: 5px 8px; }
.aoo-wm button { cursor: pointer; width: 100%; margin-bottom: 4px; }
.aoo-wm button:hover { background: #2c343d; }
.aoo-wm .go { background: #2f7a3d; border-color: #3f9a50; font-weight: 600; padding: 8px; }
.aoo-wm .row { display: flex; gap: 4px; }
.aoo-wm .row > * { flex: 1; }
.aoo-wm input[type=number] { width: 100%; box-sizing: border-box; }
.aoo-wm input[type=range] { width: 100%; padding: 0; }
.aoo-wm .hint { color: #7d8792; font-size: 12px; }
.aoo-wm dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 6px 0; }
.aoo-wm dt { color: #8b95a1; }
.aoo-wm dd { margin: 0; }
.aoo-wm .bad { color: #f0b37e; }
.aoo-wm dd.mono { font-family: ui-monospace, monospace; white-space: pre; font-size: 12px; }
.aoo-wm .ok { color: #8fd18f; }
.aoo-wm canvas.preview { width: 100%; background: #0b0d10; border-radius: 4px; }
.aoo-wm .legend span { display: inline-flex; align-items: center; gap: 4px; margin: 0 8px 4px 0; }
.aoo-wm .legend i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.aoo-wm label.check { display: flex; align-items: center; gap: 6px; margin: 3px 0; color: #c8d0d8; }
.aoo-wm label.check input { width: auto; }
@media (max-width: 900px) {
  .aoo-wm { display: flex; flex-direction: column; overflow-y: auto; }
  .aoo-wm > * { flex: none; }
  .aoo-wm aside.left, .aoo-wm aside.right { border: 0; overflow: visible; }
  .aoo-wm .stage { height: 75vh; }
}
`;

export class WorldView {
  private board: HTMLCanvasElement;
  private stage!: HTMLElement;
  private left: HTMLElement;
  private right: HTMLElement;
  private world: GeneratedWorld | null = null;
  private genMs = 0;
  private selected: number | null = null;
  private hover: number | null = null;
  private budget = 0;
  private px = 4;
  private origin = { x: 0, y: 0 };
  private oriented: ReturnType<typeof orientBlock>[][] = [];
  private picked: { r: number; c: number } | null = null;
  private shown = false;
  private overlays: Overlays = loadOverlays();

  constructor(
    host: HTMLElement,
    private readonly actions: WorldViewActions,
  ) {
    injectStyle('aoo-worldmap', css);
    const root = el('div', 'aoo-wm');
    this.left = el('aside', 'left');
    this.right = el('aside', 'right');
    const stage = el('div', 'stage');
    this.stage = stage;
    this.board = el('canvas', 'board');
    stage.append(this.board);
    root.append(this.left, stage, this.right);
    host.append(root);
    new ResizeObserver(() => this.drawBoard()).observe(stage);
    this.board.addEventListener('pointermove', (e) => {
      const lv = this.levelAt(e);
      if (lv !== this.hover) {
        this.hover = lv;
        this.drawBoard();
      }
    });
    this.board.addEventListener('pointerleave', () => {
      this.hover = null;
      this.drawBoard();
    });
    this.board.addEventListener('click', (e) => {
      const cell = this.cellAt(e);
      if (!cell) return;
      this.picked = cell;
      const lv = this.levelAt(e);
      if (lv !== null) this.select(lv);
      else this.renderRight();
    });
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (e.key === 'r' || e.key === 'R') this.actions.generate(null);
      if (e.key === 'ArrowRight' && this.world) this.actions.generate(this.world.seed + 1);
      if (e.key === 'ArrowLeft' && this.world)
        this.actions.generate(Math.max(0, this.world.seed - 1));
    });
  }

  show(world: GeneratedWorld, ms: number): void {
    const fresh = this.world?.seed !== world.seed || !this.shown;
    this.world = world;
    this.genMs = ms;
    this.oriented = world.grid.map((row) => row.map((g) => orientBlock(g.block, g.o)));
    if (this.selected !== null && !world.levels[this.selected]) this.selected = null;
    if (this.picked && (this.picked.r >= world.rows || this.picked.c >= world.cols)) {
      this.picked = null;
    }
    this.shown = true;
    this.renderLeft();
    this.drawBoard();
    if (fresh) this.stage.scrollTop = this.stage.scrollHeight;
    if (this.selected !== null) this.select(this.selected);
    else this.renderRight();
  }

  // ---------------------------------------------------------------- left: seed and stats

  private renderLeft(): void {
    const w = this.world!;
    const box = this.left;
    box.replaceChildren();
    const exit = el('button', '', str('editor.exit'));
    exit.onclick = () => this.actions.exit();
    box.append(exit, el('h2', '', str('world.title')));
    const seed = el('input');
    seed.type = 'number';
    seed.value = String(w.seed);
    seed.onchange = () => {
      const v = Number(seed.value);
      if (Number.isFinite(v) && v >= 0) this.actions.generate(Math.floor(v));
    };
    const regen = el('button', 'go', str('world.regenerate'));
    regen.onclick = () => this.actions.generate(null);
    const prev = el('button', '', '◀');
    prev.onclick = () => this.actions.generate(Math.max(0, w.seed - 1));
    const next = el('button', '', '▶');
    next.onclick = () => this.actions.generate(w.seed + 1);
    const nav = el('div', 'row');
    nav.append(prev, next);
    box.append(el('div', 'hint', str('world.seed')), seed, regen, nav);
    box.append(el('p', 'hint', str('world.keys')));

    // What's drawn on top of the map (off by default: just the map).
    box.append(el('h2', '', str('world.show')));
    const check = (label: string, on: boolean, set: (v: boolean) => void) => {
      const l = el('label', 'check');
      const c = el('input');
      c.type = 'checkbox';
      c.checked = on;
      c.onchange = () => set(c.checked);
      l.append(c, document.createTextNode(label));
      box.append(l);
    };
    const overlay = (k: keyof Overlays, key: StringKey) =>
      check(str(key), this.overlays[k], (v) => {
        this.overlays = { ...this.overlays, [k]: v };
        saveOverlays(this.overlays);
        this.drawBoard();
      });
    overlay('levels', 'world.show.levels');
    overlay('labels', 'world.show.labels');
    overlay('frame', 'world.show.cuts');
    overlay('mismatches', 'world.show.mismatches');
    check(str('world.includeMine'), this.actions.includeMine(), (v) =>
      this.actions.setIncludeMine(v),
    );
    const graph = el('button', '', str('world.graph'));
    graph.onclick = () => this.actions.openGraph();
    box.append(graph);

    const fallbacks = w.grid.flat().filter((g) => g.fit !== 'exact').length;
    const other = w.warnings.filter((x) => !x.includes('no block matches'));
    box.append(el('h2', '', str('world.stats')));
    const dl = el('dl');
    const add = (k: string, v: string, cls = '') => dl.append(el('dt', '', k), el('dd', cls, v));
    add(str('world.stat.size'), `${w.cols} × ${w.rows}`);
    add(str('world.stat.levels'), String(w.levels.length));
    add(str('world.stat.cut'), String(w.cut.length));
    add(str('world.stat.ms'), `${Math.round(this.genMs)} ms`);
    add(str('world.stat.fallbacks'), String(fallbacks), fallbacks ? 'bad' : 'ok');
    box.append(dl);
    for (const o of other) box.append(el('p', 'bad', o));
    box.append(el('p', 'hint', str('world.legend')));
  }

  // ---------------------------------------------------------------- board

  /**
   * The board fills the stage's width (a world is far taller than wide), at least 2 px per tile,
   * and the stage scrolls. Sets the canvas's own size.
   */
  private layout(): void {
    const w = this.world!;
    const pad = 12;
    const cells = { x: w.cols * BLOCK_CELLS, y: w.rows * BLOCK_CELLS };
    const room = this.stage.clientWidth - 2 * pad - 14; // leave room for a scrollbar
    this.px = Math.max(2, Math.floor(room / cells.x));
    this.origin = { x: pad, y: pad };
    const width = cells.x * this.px + 2 * pad;
    const height = cells.y * this.px + 2 * pad;
    this.board.style.width = `${width}px`;
    this.board.style.height = `${height}px`;
    this.board.style.margin = '0 auto';
  }

  private cellAt(e: PointerEvent | MouseEvent): { r: number; c: number } | null {
    const w = this.world;
    if (!w) return null;
    const r = this.board.getBoundingClientRect();
    const bs = BLOCK_CELLS * this.px;
    const c = Math.floor((e.clientX - r.left - this.origin.x) / bs);
    const row = Math.floor((e.clientY - r.top - this.origin.y) / bs);
    return row >= 0 && c >= 0 && row < w.rows && c < w.cols ? { r: row, c } : null;
  }

  private levelAt(e: PointerEvent | MouseEvent): number | null {
    const w = this.world;
    if (!w) return null;
    const r = this.board.getBoundingClientRect();
    const bs = BLOCK_CELLS * this.px;
    const col = Math.floor((e.clientX - r.left - this.origin.x) / bs);
    const row = Math.floor((e.clientY - r.top - this.origin.y) / bs);
    const lv = w.levels.find(
      (l) => row >= l.row && row < l.row + l.rows && col >= l.col && col < l.col + l.cols,
    );
    return lv ? lv.index : null;
  }

  private drawBoard(): void {
    const w = this.world;
    const c = this.board;
    if (!w || !this.stage.clientWidth) return;
    this.layout();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(c.clientWidth * dpr);
    c.height = Math.round(c.clientHeight * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.clientWidth, c.clientHeight);
    ctx.save();
    ctx.translate(this.origin.x, this.origin.y);
    const p = this.px;
    const bs = BLOCK_CELLS * p;
    // Ground and walls, block by block.
    this.oriented.forEach((row, br) =>
      row.forEach((b, bc) => {
        const ox = bc * bs;
        const oy = br * bs;
        b.ground.forEach((line, r) => {
          for (let col = 0; col < line.length; col++) {
            const ch = line[col]!;
            ctx.fillStyle = isGroundKind(ch)
              ? `#${GROUND[ch].color.toString(16).padStart(6, '0')}`
              : '#000';
            ctx.fillRect(ox + col * p, oy + r * p, p, p);
          }
        });
        ctx.fillStyle = '#1d2024';
        for (const it of b.items) {
          if (it.kind !== 'wall' || !isRectItem(it)) continue;
          const [x, y, ww, hh] = it.rect;
          ctx.fillRect(ox + x * p, oy + y * p, Math.max(1, ww * p), Math.max(1, hh * p));
        }
        if (this.overlays.mismatches && w.grid[br]![bc]!.fit !== 'exact') {
          ctx.strokeStyle = '#ff9f43';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(ox + 2, oy + 2, bs - 4, bs - 4);
          ctx.setLineDash([]);
        }
      }),
    );
    // Levels: outlines and labels only when asked; the selected one always.
    for (const lv of w.levels) {
      const x = lv.col * bs;
      const y = lv.row * bs;
      const ww = lv.cols * bs;
      const hh = lv.rows * bs;
      const sel = lv.index === this.selected;
      if (this.overlays.levels || sel) {
        ctx.strokeStyle = sel
          ? '#ffe14d'
          : lv.kind === 'base'
            ? '#ff8a80'
            : 'rgba(255,255,255,0.85)';
        ctx.lineWidth = sel ? 3 : 1.5;
        ctx.strokeRect(x + 1, y + 1, ww - 2, hh - 2);
      } else if (lv.index === this.hover) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1, y + 1, ww - 2, hh - 2);
      }
      if (this.overlays.labels) {
        const label = `${lv.index + 1}  $${lv.budget}`;
        ctx.font = 'bold 12px system-ui, sans-serif';
        const tw = ctx.measureText(label).width + 10;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(x + 6, y + 6, tw, 17);
        ctx.fillStyle = sel ? '#ffe14d' : '#fff';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + 11, y + 14.5);
      }
    }
    if (this.picked) {
      ctx.strokeStyle = '#4dd0ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.picked.c * bs + 1, this.picked.r * bs + 1, bs - 2, bs - 2);
    }
    // Tiles the generator cut to make a way through ([D102]).
    if (this.overlays.frame) {
      ctx.strokeStyle = '#ff4d4d';
      ctx.lineWidth = Math.max(1, p / 3);
      for (const [y, x] of w.cut) ctx.strokeRect(x * p, y * p, p, p);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- right: the selected level

  private select(index: number): void {
    const lv = this.world?.levels[index];
    if (!lv) return;
    if (this.selected !== index) this.budget = lv.budget;
    this.selected = index;
    this.drawBoard();
    this.renderRight();
  }

  private renderRight(): void {
    const box = this.right;
    box.replaceChildren();
    if (this.picked) box.append(this.blockPanel(this.picked.r, this.picked.c));
    const w = this.world;
    const lv = this.selected !== null ? w?.levels[this.selected] : undefined;
    if (!w || !lv) {
      box.append(el('h2', '', str('world.level')), el('p', 'hint', str('world.pickLevel')));
      return;
    }
    box.append(
      el(
        'h2',
        '',
        str(lv.kind === 'base' ? 'world.levelBase' : 'world.levelField', {
          n: lv.index + 1,
          cols: lv.cols,
          rows: lv.rows,
        }),
      ),
    );
    const range = el('input');
    range.type = 'range';
    range.min = '0';
    range.max = String(Math.max(10, lv.maxBudget));
    range.value = String(this.budget);
    const budgetLabel = el('div', 'hint');
    const preview = el('canvas', 'preview');
    const stats = el('div');
    const update = () => {
      budgetLabel.textContent = str('world.budget', {
        budget: this.budget,
        normal: lv.budget,
        max: lv.maxBudget,
      });
      const res = this.actions.levelMap(lv.index, this.budget);
      this.drawPreview(preview, res.map);
      this.renderStats(stats, res, lv);
    };
    range.oninput = () => {
      this.budget = Number(range.value);
      update();
    };
    const reset = el('button', '', str('world.resetBudget'));
    reset.onclick = () => {
      this.budget = lv.budget;
      range.value = String(this.budget);
      update();
    };
    const play = el('button', 'go', str('world.playtest'));
    play.onclick = () => this.actions.playtest(lv.index, this.budget);
    const legend = el('div', 'legend');
    for (const r of ROLES) {
      const sp = el('span');
      const i = el('i');
      i.style.background = roleColor(r.id);
      sp.append(i, document.createTextNode(str(r.nameKey)));
      legend.append(sp);
    }
    box.append(el('div', 'hint', str('world.budgetTitle')), range, budgetLabel, reset, play);
    box.append(preview, stats, legend);
    update();
  }

  /** The clicked block: which one, which way round, its edges; open it in the editor. */
  private blockPanel(r: number, c: number): HTMLElement {
    const box = el('div');
    const g = this.world!.grid[r]![c]!;
    const turned = (g.o % 4) * 90;
    const flipped = g.o >= 4;
    const edges = sideProfiles(this.oriented[r]![c]!);
    box.append(el('h2', '', str('world.block')));
    const dl = el('dl');
    const add = (k: string, v: string, cls = '') => dl.append(el('dt', '', k), el('dd', cls, v));
    add(str('world.block.name'), `${g.block.name} (${g.block.id})`);
    add(
      str('world.block.turn'),
      str(flipped ? 'world.block.turnFlipped' : 'world.block.turnPlain', { deg: turned }),
    );
    add(
      str('world.block.edges'),
      (['n', 'e', 's', 'w'] as const).map((sd) => `${sd.toUpperCase()} ${edges[sd]}`).join('\n'),
      'mono',
    );
    add(
      str('world.block.fit'),
      str(g.fit === 'exact' ? 'world.block.fitExact' : 'world.block.fitLoose'),
      g.fit === 'exact' ? 'ok' : 'bad',
    );
    const open = el('button', '', str('world.block.open'));
    open.onclick = () => this.actions.openBlock(g.block.id);
    box.append(dl, open);
    return box;
  }

  private drawPreview(c: HTMLCanvasElement, map: GeneratedLevel['map']): void {
    const dpr = window.devicePixelRatio || 1;
    const width = c.clientWidth || 370;
    // A level is far taller than wide: fit the width, but no taller than most screens.
    const k = Math.min(width / map.width, Math.max(400, window.innerHeight * 0.8) / map.height);
    const height = Math.round(map.height * k);
    c.style.height = `${height}px`;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(Math.round((width - map.width * k) / 2), 0);
    drawMapSketch(ctx, map, k);
  }

  private renderStats(
    host: HTMLElement,
    res: Omit<GeneratedLevel, 'attempts'>,
    lv: WorldLevel,
  ): void {
    const m = res.map;
    const byRole = new Map<string, number>();
    for (const sq of m.squads ?? []) {
      for (const mem of sq.members) {
        const role = mem.role ?? 'rifleman';
        byRole.set(role, (byRole.get(role) ?? 0) + 1);
      }
    }
    const dl = el('dl');
    const add = (k: string, v: string, cls = '') => dl.append(el('dt', '', k), el('dd', cls, v));
    add(str('world.stat.spent'), `$${res.spent} / $${this.budget}`);
    const soldiers = [...byRole.values()].reduce((a, b) => a + b, 0);
    add(
      str('world.stat.enemies'),
      [
        `${soldiers}`,
        ...ROLES.filter((r) => byRole.has(r.id)).map(
          (r) => `${byRole.get(r.id)} ${str(r.nameKey)}`,
        ),
      ].join(' · '),
    );
    add(str('world.stat.turrets'), `${m.turrets?.length ?? 0}`);
    add(str('world.stat.mines'), `${m.mines?.length ?? 0}`);
    add(
      str('world.stat.reachable'),
      str(res.reachable ? 'world.yes' : 'world.no'),
      res.reachable ? 'ok' : 'bad',
    );
    add(
      str('world.stat.blocks'),
      res.cells
        .flat()
        .map((c) => c.blockId.replace('starter-', ''))
        .join(', '),
    );
    void lv;
    host.replaceChildren(dl);
  }
}

function loadOverlays(): Overlays {
  const none: Overlays = { levels: false, labels: false, frame: false, mismatches: false };
  try {
    const raw = window.localStorage.getItem(OVERLAYS_KEY);
    return raw ? { ...none, ...(JSON.parse(raw) as Partial<Overlays>) } : none;
  } catch {
    return none;
  }
}

function saveOverlays(o: Overlays): void {
  try {
    window.localStorage.setItem(OVERLAYS_KEY, JSON.stringify(o));
  } catch {
    // per-viewer convenience only
  }
}
