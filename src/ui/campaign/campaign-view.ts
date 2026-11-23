/**
 * (PHASE13-d) The campaign map ([D106]): the world board with the levels you hold, the ones you
 * can attack and the ones still locked. Pick a level, see what's in it, attack. Placeholder look.
 */
import { BLOCK_CELLS } from '../../content/ground';
import { str } from '../../content/strings';
import { orientBlock } from '../../gen/transform';
import type { LevelTag, RoleCounts } from '../../gen/campaign';
import type { GeneratedWorld, WorldLevel } from '../../gen/world';
import { ROLES } from '../../content/roles';
import { roleIconSvg } from '../../content/role-icons';
import { helmetSvg } from '../../content/ui-icons';
import { DIFFICULTIES, DIFFICULTY, type Difficulty } from '../../content/difficulty';
import type { RoleId } from '../../contracts/mission';
import type { MapDef } from '../../sim/world/map';
import { el, injectStyle } from '../dom';
import { paintedPanelCss, tabletopBackground } from '../art-theme';
import {
  drawBoardGround,
  displayOwner,
  drawMapSketch,
  levelAnchors,
  levelOverlay,
  type Rgba,
} from '../worldmap/map-draw';

export interface CampaignViewModel {
  world: GeneratedWorld;
  taken: readonly number[];
  attackable: readonly number[];
  hq: number;
  won: boolean;
  /** (PHASE14) How far the enemy's funds have grown toward full (0–1, [D119]). */
  strength: number;
  /** (PHASE14) The level being fought ([D122]), or null. */
  active: number | null;
  /** (PHASE14) What carries into the next level ([D117], [D118], [D120]). */
  carry: { money: number; income: number; reserves: RoleCounts; roles: readonly RoleId[] };
  /** (PHASE14) Each level's tags ([D121]). */
  tags: readonly (readonly LevelTag[])[];
  /** (PHASE17) Tech points, and what each locked role costs ([D141]). */
  tech: number;
  roleCosts: Partial<Record<RoleId, number>>;
  /** (PHASE16) The campaign's difficulty, and whether it can still change ([D134]). */
  difficulty: Difficulty;
  difficultyOpen: boolean;
}

export interface CampaignViewActions {
  /** A level at this campaign's budget: the budget, its map and how many enemies it holds. */
  levelInfo(index: number): { budget: number; enemies: number; map: MapDef };
  attack(index: number): void;
  newCampaign(): void;
  menu(): void;
  /** (PHASE16) Before the first attack only ([D134]). */
  setDifficulty(d: Difficulty): void;
  /** (PHASE17) Buy a locked role with tech points ([D141]). */
  buyRole(role: RoleId): void;
}

const css = `
.aoo-cp { position: fixed; inset: 0; display: grid; grid-template-columns: 1fr 360px;
  font: 14px/1.4 system-ui, sans-serif; color: #e7e9ec; background: #0d1014; }
.aoo-cp .stage { position: relative; overflow: auto; }
.aoo-cp canvas.board { display: block; cursor: pointer; margin: 0 auto; }
.aoo-cp aside { overflow-y: auto; padding: 16px; background: #161a1f; border-left: 1px solid #262c33; }
.aoo-cp h1 { margin: 0 0 8px; font-size: 26px; color: #ffd34d; letter-spacing: .03em; }
.aoo-cp .diff { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 8px 0; }
.aoo-cp .diff .k { color: #9aa3ad; margin-right: 4px; }
.aoo-cp .diff button { padding: 4px 10px; border-radius: 6px; border: 1px solid #39414a;
  background: #20262d; color: #e7e9ec; cursor: pointer; font: inherit; }
.aoo-cp .diff button.on { border-color: #ffd34d; color: #ffd34d; }
.aoo-cp h2 { margin: 16px 0 6px; font-size: 17px; }
.aoo-cp .strip { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 10px; }
.aoo-cp .chip { background: #20262d; border: 1px solid #343c46; border-radius: 14px; padding: 2px 9px;
  font-weight: 700; font-size: 14px; white-space: nowrap; }
.aoo-cp .rolebar { display: flex; flex-wrap: wrap; gap: 5px; margin: 4px 0 10px; }
.aoo-cp .rolebar button.role { display: flex; width: auto; margin: 0; padding: 4px 6px; gap: 3px;
  align-items: center; opacity: .35; filter: grayscale(1); font-size: 12px; }
.aoo-cp .rolebar button.role.open { opacity: 1; filter: none; }
.aoo-cp .rolebar button.role.buy { opacity: .85; filter: none; border-color: #ffd34d; }
.aoo-cp .rolebar .n { font-size: 11px; }
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
${paintedPanelCss('.aoo-cp aside')}
.aoo-cp .stage { background: ${tabletopBackground('ui_campaign_background')}; }
.aoo-cp aside { box-sizing: border-box; }
`;

export class CampaignView {
  private readonly root = el('div', 'aoo-cp');
  private readonly stage = el('div', 'stage');
  private readonly board = el('canvas', 'board');
  private readonly side = el('aside');
  private m: CampaignViewModel | null = null;
  private oriented: ReturnType<typeof orientBlock>[][] = [];
  private selected: number | null = null;
  private disp: Int16Array = new Int16Array(0);
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

  setInteractive(enabled: boolean): void {
    this.root.inert = !enabled;
  }

  /** Snapshot the board in viewport coordinates, including its current scroll position. */
  captureBoard(): {
    image: HTMLCanvasElement;
    rect: DOMRect;
    stage: DOMRect;
    px: number;
    pad: number;
  } {
    const image = el('canvas');
    image.width = this.board.width;
    image.height = this.board.height;
    image.getContext('2d')!.drawImage(this.board, 0, 0);
    return {
      image,
      rect: this.board.getBoundingClientRect(),
      stage: this.stage.getBoundingClientRect(),
      px: this.px,
      pad: this.pad,
    };
  }

  show(m: CampaignViewModel, keepScroll = false): void {
    this.m = m;
    this.oriented = m.world.grid.map((row) => row.map((g) => orientBlock(g.block, g.o)));
    this.disp = displayOwner(m.world.owner, m.world.tiles.w, m.world.tiles.h);
    this.selected = m.active ?? m.attackable[0] ?? m.taken[m.taken.length - 1] ?? null;
    this.draw();
    this.renderSide();
    if (!keepScroll) this.scrollToSelected();
  }

  private select(index: number): void {
    this.selected = index;
    this.draw();
    this.renderSide();
  }

  private scrollToSelected(): void {
    const lv = this.selected !== null ? this.m?.world.levels[this.selected] : undefined;
    if (!lv) return;
    const mid = this.pad + (lv.box.y + lv.box.h / 2) * this.px;
    this.stage.scrollTop = Math.max(0, mid - this.stage.clientHeight / 2);
  }

  private levelAt(e: MouseEvent): WorldLevel | undefined {
    const m = this.m;
    if (!m) return undefined;
    const w = m.world;
    const r = this.board.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left - this.pad) / this.px);
    const y = Math.floor((e.clientY - r.top - this.pad) / this.px);
    if (x < 0 || y < 0 || x >= w.tiles.w || y >= w.tiles.h) return undefined;
    const lv = this.disp[y * w.tiles.w + x]!;
    return lv >= 0 ? w.levels[lv] : undefined;
  }

  private draw(): void {
    const m = this.m;
    if (!m || !this.stage.clientWidth) return;
    const w = m.world;
    const cells = { x: w.cols * BLOCK_CELLS, y: w.rows * BLOCK_CELLS };
    // Fit the width, but zoomed out enough to see about two fronts of levels at once.
    const band = 9 * BLOCK_CELLS;
    const fitW = Math.floor((this.stage.clientWidth - 2 * this.pad - 14) / cells.x);
    const fitH = Math.floor(this.stage.clientHeight / (2 * band));
    this.px = Math.max(2, Math.min(fitW, fitH));
    const p = this.px;
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
    // Levels ([D109]): taken tinted blue, attackable outlined yellow, locked dimmed, the HQ red.
    const overlay = levelOverlay(this.disp, w.tiles.w, w.tiles.h, (lv) => {
      const taken = m.taken.includes(lv);
      const open = m.attackable.includes(lv);
      const sel = lv === this.selected;
      const fill: Rgba | null = taken
        ? [70, 150, 255, 80]
        : open
          ? sel
            ? [255, 211, 77, 60]
            : null
          : [6, 8, 11, 140];
      const edge: Rgba = sel
        ? [255, 255, 255, 255]
        : open
          ? [255, 211, 77, 255]
          : lv === m.hq
            ? [255, 90, 74, 255]
            : [0, 0, 0, 160];
      return { fill, edge };
    });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(overlay, 0, 0, w.tiles.w * p, w.tiles.h * p);
    // Ways in: crossings from ground you hold into levels you can attack.
    const held = (lv: number) => lv === -1 || m.taken.includes(lv);
    for (const c of w.crossings) {
      const into =
        held(c.a) && m.attackable.includes(c.b)
          ? c.b
          : held(c.b) && m.attackable.includes(c.a)
            ? c.a
            : -2;
      if (into === -2) continue;
      const x = ((c.atA[1] + c.atB[1]) / 2 + 0.5) * p;
      const y = ((c.atA[0] + c.atB[0]) / 2 + 0.5) * p;
      ctx.fillStyle = '#5be37d';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(4, 1.6 * p), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    const anchors = levelAnchors(w.owner, w.tiles.w, w.levels.length);
    for (const lv of w.levels) {
      const taken = m.taken.includes(lv.index);
      const open = m.attackable.includes(lv.index);
      const [ay, ax] = anchors[lv.index]!;
      // Labels: the level's number and what it is to you.
      const status =
        lv.index === m.hq && !taken
          ? str('campaign.label.hq')
          : taken
            ? str('campaign.label.taken')
            : lv.index === m.active
              ? str('campaign.label.active')
              : open
                ? str('campaign.label.attack')
                : '';
      // (PHASE17) What it offers or warns about, as icons ([D140], [D141]).
      const icons = (m.tags[lv.index] ?? []).map(tagIcon).join(' ');
      const head = `${lv.index + 1}${icons ? `  ${icons}` : ''}`;
      const lines = [head, ...(status ? [status] : [])];
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      const tw = Math.max(...lines.map((t) => ctx.measureText(t).width)) + 12;
      const cx = (ax + 0.5) * p;
      const cy = (ay + 0.5) * p;
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
    // (PHASE17) Icons over words ([D140]): hover for what each means.
    const strip = el('div', 'strip');
    const chip = (icon: string, v: string, tip: string) => {
      const c = el('span', 'chip', `${icon} ${v}`);
      c.title = tip;
      strip.append(c);
    };
    chip('🏴', String(m.taken.length), str('campaign.taken'));
    chip('💰', `$${m.carry.money}`, str('campaign.money'));
    chip('📈', `$${m.carry.income}/s`, str('campaign.income'));
    chip('🔬', String(m.tech), str('campaign.tech'));
    chip('⚔️', `${Math.round(m.strength * 100)}%`, str('campaign.strength'));
    box.append(strip);

    // Roles: open ones bright, the rest greyed with their tech price; tap to buy ([D141]).
    const roles = el('div', 'rolebar');
    for (const r of ROLES) {
      const open = m.carry.roles.includes(r.id);
      const cost = m.roleCosts[r.id] ?? 0;
      const can = !open && cost > 0 && m.tech >= cost;
      const b = el('button', `role${open ? ' open' : can ? ' buy' : ''}`);
      b.innerHTML =
        roleIconSvg(r.id, 26) +
        (open
          ? m.carry.reserves[r.id]
            ? `<span class="n">×${m.carry.reserves[r.id]}</span>`
            : ''
          : `<span class="n">🔬${cost}</span>`);
      b.title = open ? str(r.nameKey) : str('campaign.buyRole', { role: str(r.nameKey), n: cost });
      b.disabled = !can;
      b.onclick = () => this.actions.buyRole(r.id);
      roles.append(b);
    }
    box.append(roles);

    // (PHASE16) Difficulty ([D134]): picked before the first attack, then fixed.
    const diff = el('div', 'diff');
    diff.append(el('span', 'k', str('campaign.difficulty')));
    if (m.difficultyOpen) {
      for (const d of DIFFICULTIES) {
        const b = el('button', d === m.difficulty ? 'on' : '', str(DIFFICULTY[d].nameKey));
        b.title = str(DIFFICULTY[d].blurbKey);
        b.onclick = () => this.actions.setDifficulty(d);
        diff.append(b);
      }
    } else {
      diff.append(el('span', 'v', str(DIFFICULTY[m.difficulty].nameKey)));
    }
    box.append(diff);

    const lv = this.selected !== null ? m.world.levels[this.selected] : undefined;
    if (lv) {
      const taken = m.taken.includes(lv.index);
      const open = m.attackable.includes(lv.index);
      const active = m.active === lv.index;
      const busy = m.active !== null && !active && !taken;
      const title = el(
        'h2',
        '',
        str(lv.index === m.hq ? 'campaign.levelHq' : 'campaign.level', { n: lv.index + 1 }),
      );
      box.append(title);
      const tags = el('div', 'strip');
      for (const t of m.tags[lv.index] ?? []) {
        const c = el('span', 'chip', tagIcon(t));
        c.title = tagText(t);
        tags.append(c);
      }
      const status = taken ? '✅' : active ? '⏳' : busy ? '🔒' : open ? '🎯' : '🔒';
      const st = el('span', 'chip', status);
      st.title = busy
        ? str('campaign.status.busy', { n: m.active! + 1 })
        : str(
            taken
              ? 'campaign.status.taken'
              : active
                ? 'campaign.status.active'
                : open
                  ? 'campaign.status.open'
                  : 'campaign.status.locked',
          );
      tags.prepend(st);
      if (!taken) {
        const info = this.actions.levelInfo(lv.index);
        const e = el('span', 'chip');
        e.innerHTML = `${helmetSvg(16)}<span>×${info.enemies}</span>`;
        e.style.display = 'inline-flex';
        e.style.alignItems = 'center';
        e.style.gap = '3px';
        e.title = str('campaign.enemies');
        tags.append(e);
      }
      box.append(tags);
      if (!taken) {
        const info = this.actions.levelInfo(lv.index);
        if (open) {
          const go = el('button', 'go', str(active ? 'campaign.resume' : 'campaign.attack'));
          go.onclick = () => this.actions.attack(lv.index);
          box.append(go);
        }
        const sketch = el('canvas', 'sketch');
        box.append(sketch);
        this.drawSketch(sketch, info.map);
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

/** A level tag's words (tooltips) ([D121]). */
function tagText(t: LevelTag): string {
  if (t.kind === 'tech') return str('campaign.tag.tech', { n: t.n });
  return str(t.kind === 'elite' ? 'campaign.tag.elite' : 'campaign.tag.income');
}

/** (PHASE17) A level tag as an icon ([D140]). */
function tagIcon(t: LevelTag): string {
  return t.kind === 'elite' ? '💀' : t.kind === 'income' ? '💰' : `🔬${t.n}`;
}
