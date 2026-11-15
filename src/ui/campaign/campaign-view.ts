/**
 * (PHASE13-d) The campaign map ([D106]): the world board with the levels you hold, the ones you
 * can attack and the ones still locked. Pick a level, see what's in it, attack. Placeholder look.
 */
import { BLOCK_CELLS } from '../../content/ground';
import { str } from '../../content/strings';
import { orientBlock } from '../../gen/transform';
import type { GeneratedWorld, WorldLevel } from '../../gen/world';
import type { MapDef } from '../../sim/world/map';
import { el, injectStyle } from '../dom';
import { drawBoardGround, drawMapSketch } from '../worldmap/map-draw';

export interface CampaignViewModel {
  world: GeneratedWorld;
  taken: readonly number[];
  attackable: readonly number[];
  hq: number;
  won: boolean;
  /** Enemy strength over the levels' own budgets (1.24 = +24%). */
  strength: number;
}

export interface CampaignViewActions {
  /** A level at this campaign's budget: the budget, its map and how many enemies it holds. */
  levelInfo(index: number): { budget: number; enemies: number; map: MapDef };
  attack(index: number): void;
  newCampaign(): void;
  menu(): void;
}

const css = `
.aoo-cp { position: fixed; inset: 0; display: grid; grid-template-columns: 1fr 360px;
  font: 14px/1.4 system-ui, sans-serif; color: #e7e9ec; background: #0d1014; }
.aoo-cp .stage { position: relative; overflow: auto; }
.aoo-cp canvas.board { display: block; cursor: pointer; margin: 0 auto; }
.aoo-cp aside { overflow-y: auto; padding: 16px; background: #161a1f; border-left: 1px solid #262c33; }
.aoo-cp h1 { margin: 0 0 8px; font-size: 26px; color: #ffd34d; letter-spacing: .03em; }
.aoo-cp h2 { margin: 16px 0 6px; font-size: 17px; }
.aoo-cp p { margin: 6px 0; color: #b4c0cc; }
.aoo-cp .won { color: #8be28b; font-weight: 700; }
.aoo-cp dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; margin: 6px 0 10px; }
.aoo-cp dt { color: #8b95a1; }
.aoo-cp dd { margin: 0; font-weight: 600; }
.aoo-cp .locked { color: #8b95a1; }
.aoo-cp .open { color: #ffd34d; }
.aoo-cp .done { color: #7fb6ff; }
.aoo-cp button { display: block; width: 100%; margin: 6px 0; font: 600 15px system-ui, sans-serif;
  color: #e7e9ec; background: #232930; border: 1px solid #343c46; border-radius: 6px; padding: 9px; cursor: pointer; }
.aoo-cp button:hover { background: #2c343d; }
.aoo-cp button.go { color: #10140f; background: #ffd34d; border: 0; font-size: 18px; padding: 12px; }
.aoo-cp button.confirm { background: #a33a2c; }
.aoo-cp canvas.sketch { display: block; width: 100%; margin: 8px 0; background: #0d1014; }
.aoo-cp .foot { margin-top: 18px; border-top: 1px solid #262c33; padding-top: 10px; }
@media (max-width: 760px) {
  .aoo-cp { display: flex; flex-direction: column; overflow-y: auto; }
  .aoo-cp .stage { height: 60vh; flex: none; }
  .aoo-cp aside { border-left: 0; border-top: 1px solid #262c33; overflow: visible; }
}
`;

export class CampaignView {
  private readonly root = el('div', 'aoo-cp');
  private readonly stage = el('div', 'stage');
  private readonly board = el('canvas', 'board');
  private readonly side = el('aside');
  private m: CampaignViewModel | null = null;
  private oriented: ReturnType<typeof orientBlock>[][] = [];
  private selected: number | null = null;
  private px = 4;
  private readonly pad = 12;

  constructor(
    host: HTMLElement,
    private readonly actions: CampaignViewActions,
  ) {
    injectStyle('aoo-campaign-css', css);
    this.stage.append(this.board);
    this.root.append(this.stage, this.side);
    host.append(this.root);
    this.board.addEventListener('click', (e) => {
      const lv = this.levelAt(e);
      if (lv) this.select(lv.index);
    });
    window.addEventListener('resize', () => this.draw());
  }

  show(m: CampaignViewModel): void {
    this.m = m;
    this.oriented = m.world.grid.map((row) => row.map((g) => orientBlock(g.block, g.o)));
    this.selected = m.attackable[0] ?? m.taken[m.taken.length - 1] ?? null;
    this.draw();
    this.renderSide();
    this.scrollToSelected();
  }

  private select(index: number): void {
    this.selected = index;
    this.draw();
    this.renderSide();
  }

  private scrollToSelected(): void {
    const lv = this.selected !== null ? this.m?.world.levels[this.selected] : undefined;
    if (!lv) return;
    const bs = BLOCK_CELLS * this.px;
    const mid = this.pad + (lv.row + lv.rows / 2) * bs;
    this.stage.scrollTop = Math.max(0, mid - this.stage.clientHeight / 2);
  }

  private levelAt(e: MouseEvent): WorldLevel | undefined {
    const m = this.m;
    if (!m) return undefined;
    const r = this.board.getBoundingClientRect();
    const bs = BLOCK_CELLS * this.px;
    const bc = Math.floor((e.clientX - r.left - this.pad) / bs);
    const br = Math.floor((e.clientY - r.top - this.pad) / bs);
    return m.world.levels.find(
      (l) => br >= l.row && br < l.row + l.rows && bc >= l.col && bc < l.col + l.cols,
    );
  }

  private draw(): void {
    const m = this.m;
    if (!m || !this.stage.clientWidth) return;
    const w = m.world;
    const cells = { x: w.cols * BLOCK_CELLS, y: w.rows * BLOCK_CELLS };
    // Fit the width, but zoomed out enough to see about two bands of levels at once.
    const band = (w.levels[0]?.rows ?? 10) * BLOCK_CELLS;
    const fitW = Math.floor((this.stage.clientWidth - 2 * this.pad - 14) / cells.x);
    const fitH = Math.floor(this.stage.clientHeight / (2 * band));
    this.px = Math.max(2, Math.min(fitW, fitH));
    const p = this.px;
    const bs = BLOCK_CELLS * p;
    const width = cells.x * p + 2 * this.pad;
    const height = cells.y * p + 2 * this.pad;
    const c = this.board;
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(this.pad, this.pad);
    drawBoardGround(ctx, this.oriented, p);
    for (const lv of w.levels) {
      const x = lv.col * bs;
      const y = lv.row * bs;
      const ww = lv.cols * bs;
      const hh = lv.rows * bs;
      const taken = m.taken.includes(lv.index);
      const open = m.attackable.includes(lv.index);
      if (taken) {
        ctx.fillStyle = 'rgba(70,150,255,0.30)';
        ctx.fillRect(x, y, ww, hh);
      } else if (!open) {
        ctx.fillStyle = 'rgba(6,8,11,0.55)';
        ctx.fillRect(x, y, ww, hh);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, ww - 1, hh - 1);
      if (lv.index === m.hq) {
        ctx.strokeStyle = '#ff5a4a';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 2, y + 2, ww - 4, hh - 4);
      }
      if (open) {
        ctx.strokeStyle = '#ffd34d';
        ctx.lineWidth = 4;
        ctx.strokeRect(x + 3, y + 3, ww - 6, hh - 6);
      }
      if (lv.index === this.selected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 5]);
        ctx.strokeRect(x + 8, y + 8, ww - 16, hh - 16);
        ctx.setLineDash([]);
      }
      // Centred labels: the level's number and what it is to you.
      const status =
        lv.index === m.hq && !taken
          ? str('campaign.label.hq')
          : taken
            ? str('campaign.label.taken')
            : open
              ? str('campaign.label.attack')
              : '';
      const lines = [str('campaign.level', { n: lv.index + 1 }), ...(status ? [status] : [])];
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      const tw = Math.max(...lines.map((t) => ctx.measureText(t).width)) + 12;
      const cx = x + ww / 2;
      const cy = y + hh / 2;
      const bh = lines.length * 16 + 6;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(cx - tw / 2, cy - bh / 2, tw, bh);
      lines.forEach((t, i) => {
        ctx.fillStyle = i === 0 ? '#e7e9ec' : open ? '#ffd34d' : taken ? '#9cc7ff' : '#ff8a80';
        ctx.fillText(t, cx, cy - bh / 2 + 11 + i * 16);
      });
      ctx.textAlign = 'start';
    }
  }

  private renderSide(): void {
    const m = this.m;
    const box = this.side;
    box.replaceChildren();
    if (!m) return;
    box.append(el('h1', '', str('campaign.title')));
    if (m.won) box.append(el('p', 'won', str('campaign.won')));
    else box.append(el('p', '', str('campaign.hint')));
    const dl = el('dl');
    const add = (k: string, v: string, cls = '') => dl.append(el('dt', '', k), el('dd', cls, v));
    add(str('campaign.taken'), String(m.taken.length));
    add(str('campaign.strength'), `+${Math.round((m.strength - 1) * 100)}%`);
    box.append(dl);

    const lv = this.selected !== null ? m.world.levels[this.selected] : undefined;
    if (lv) {
      const taken = m.taken.includes(lv.index);
      const open = m.attackable.includes(lv.index);
      box.append(
        el(
          'h2',
          '',
          str(lv.index === m.hq ? 'campaign.levelHq' : 'campaign.level', { n: lv.index + 1 }),
        ),
      );
      const d = el('dl');
      const row = (k: string, v: string, cls = '') => d.append(el('dt', '', k), el('dd', cls, v));
      row(
        str('campaign.status'),
        str(
          taken
            ? 'campaign.status.taken'
            : open
              ? 'campaign.status.open'
              : 'campaign.status.locked',
        ),
        taken ? 'done' : open ? 'open' : 'locked',
      );
      row(str('campaign.size'), str('campaign.sizeValue', { cols: lv.cols, rows: lv.rows }));
      if (!taken) {
        const info = this.actions.levelInfo(lv.index);
        row(str('campaign.budget'), `$${info.budget}`);
        row(str('campaign.enemies'), String(info.enemies));
        box.append(d);
        if (open) {
          const go = el('button', 'go', str('campaign.attack'));
          go.onclick = () => this.actions.attack(lv.index);
          box.append(go);
        }
        const sketch = el('canvas', 'sketch');
        box.append(sketch);
        this.drawSketch(sketch, info.map);
      } else {
        box.append(d);
      }
    }

    const foot = el('div', 'foot');
    const fresh = el('button', '', str('campaign.new'));
    let armed = m.won;
    fresh.onclick = () => {
      if (!armed) {
        armed = true;
        fresh.className = 'confirm';
        fresh.textContent = str('campaign.newConfirm');
        return;
      }
      this.actions.newCampaign();
    };
    const menu = el('button', '', str('campaign.menu'));
    menu.onclick = () => this.actions.menu();
    foot.append(fresh, menu);
    box.append(foot);
  }

  private drawSketch(c: HTMLCanvasElement, map: MapDef): void {
    const dpr = window.devicePixelRatio || 1;
    const width = c.clientWidth || 320;
    const k = Math.min(width / map.width, Math.max(360, window.innerHeight * 0.7) / map.height);
    const height = Math.round(map.height * k);
    c.style.height = `${height}px`;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(Math.round((width - map.width * k) / 2), 0);
    drawMapSketch(ctx, map, k);
  }
}
