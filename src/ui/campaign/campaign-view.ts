/**
 * (PHASE13-d) The campaign map ([D106]): the world board with the levels you hold, the ones you
 * can attack and the ones still locked. Pick a level, see what's in it, attack. Placeholder look.
 */
import { BLOCK_CELLS } from '../../content/ground';
import { str } from '../../content/strings';
import { weatherForLevel } from '../../gen/weather';
import { orientBlock } from '../../gen/transform';
import type { LevelTag, RoleCounts } from '../../gen/campaign';
import type { GeneratedWorld, WorldLevel } from '../../gen/world';
import { ROLES } from '../../content/roles';
import { roleIconSvg } from '../../content/role-icons';
import { DIFFICULTIES, DIFFICULTY, type Difficulty } from '../../content/difficulty';
import type { RoleId } from '../../contracts/mission';
import { el, injectStyle } from '../dom';
import {
  drawBoardGround,
  displayOwner,
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
  levelInfo(index: number): { budget: number; enemies: number };
  attack(index: number): void;
  newCampaign(): void;
  menu(): void;
  /** (PHASE16) Before the first attack only ([D134]). */
  setDifficulty(d: Difficulty): void;
  /** (PHASE17) Buy a locked role with tech points ([D141]). */
  buyRole(role: RoleId): void;
}

const css = `
.aoo-cp { position: fixed; inset: 0; font: 14px/1.4 system-ui, sans-serif;
  color: #e7e9ec; background: #0d1014; }
.aoo-cp .stage { position: absolute; inset: 0; overflow: auto; }
.aoo-cp canvas.board { display: block; cursor: pointer; margin: 0 auto; }
.aoo-cp .campaign-toolbar { position: absolute; top: max(12px, env(safe-area-inset-top));
  right: 16px; display: flex; align-items: center; gap: 8px; }
.aoo-cp .level-actions { position: absolute; display: flex; align-items: center; gap: 6px;
  transform: translate(-50%, -100%); }
.aoo-cp .level-actions button, .aoo-cp .campaign-toolbar button { width: auto; margin: 0; }
.aoo-cp .level-actions button.info { min-width: 44px; min-height: 44px; font-size: 20px; }
.aoo-cp aside { position: absolute; right: 16px; top: 68px; width: min(344px, calc(100% - 32px));
  max-height: calc(100% - 84px); overflow: auto; box-sizing: border-box; padding: 16px;
  background: #161a1f; border: 1px solid #39414a; border-radius: 10px;
  box-shadow: 0 8px 25px #0009; }
.aoo-cp aside h2 { margin-top: 0; }
.aoo-cp aside button.close { float: right; width: auto; margin: 0 0 6px 6px; }
.aoo-cp .legend { display: grid; grid-template-columns: auto 1fr; gap: 8px 10px;
  align-items: center; margin: 12px 0; }
.aoo-cp .legend dd { font-weight: normal; }
.aoo-cp .loading { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
  background: #161a1f; padding: 8px 14px; border-radius: 6px; white-space: nowrap; }
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
.aoo-cp button.go { color: #10140f; background: #ffd34d; border: 0; font-size: 18px; padding: 10px 15px; }
.aoo-cp button.confirm { background: #a33a2c; }
.aoo-cp .foot { margin-top: 18px; border-top: 1px solid #262c33; padding-top: 10px; }
`;

export class CampaignView {
  private readonly root = el('div', 'aoo-cp');
  private readonly stage = el('div', 'stage');
  private readonly board = el('canvas', 'board');
  private readonly side = el('aside');
  private readonly actionsBar = el('div', 'level-actions');
  private readonly toolbar = el('div', 'campaign-toolbar');
  private readonly loading = el('div', 'loading', str('loading.level'));
  private readonly terrain = el('canvas');
  private panel: 'campaign' | 'level' | null = null;
  private anchors: [number, number][] = [];
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
    this.loading.hidden = true;
    this.loading.setAttribute('role', 'status');
    this.side.hidden = true;
    this.root.append(this.stage, this.actionsBar, this.toolbar, this.side, this.loading);
    this.stage.addEventListener('scroll', () => this.positionActions(), { passive: true });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.root.inert) this.togglePanel(null);
    });
    host.append(this.root);
    this.board.addEventListener('click', (e) => {
      const lv = this.levelAt(e);
      if (lv) this.select(lv.index);
    });
    window.addEventListener('resize', () => {
      this.draw();
      this.positionActions();
    });
  }

  setInteractive(enabled: boolean): void {
    this.root.inert = !enabled;
    if (!enabled && this.panel) this.togglePanel(null);
  }

  setLoading(loading: boolean): void {
    this.loading.hidden = !loading;
  }

  /** Snapshot the board in viewport coordinates, including its current scroll position. */
  captureBoard(): {
    annotated: HTMLCanvasElement;
    terrain: HTMLCanvasElement;
    rect: DOMRect;
    px: number;
    pad: number;
  } {
    const copy = (source: HTMLCanvasElement) => {
      const image = el('canvas');
      image.width = source.width;
      image.height = source.height;
      image.getContext('2d')!.drawImage(source, 0, 0);
      return image;
    };
    return {
      terrain: copy(this.terrain),
      annotated: copy(this.board),
      rect: this.board.getBoundingClientRect(),
      px: this.px,
      pad: this.pad,
    };
  }

  show(m: CampaignViewModel, keepScroll = false): void {
    this.m = m;
    this.oriented = m.world.grid.map((row) => row.map((g) => orientBlock(g.block, g.o)));
    this.disp = displayOwner(m.world.owner, m.world.tiles.w, m.world.tiles.h);
    this.anchors = levelAnchors(m.world.owner, m.world.tiles.w, m.world.levels.length);
    this.selected = m.active ?? m.attackable[0] ?? m.taken[m.taken.length - 1] ?? null;
    this.draw();
    this.renderControls();
    if (!keepScroll) this.scrollToSelected();
    this.positionActions();
  }

  private select(index: number): void {
    this.selected = index;
    this.draw();
    this.renderControls();
    this.positionActions();
  }

  private scrollToSelected(): void {
    const lv = this.selected !== null ? this.m?.world.levels[this.selected] : undefined;
    if (!lv) return;
    const mid = this.pad + (this.anchors[lv.index]![0] + 0.5) * this.px;
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
    // Fit the width on phones and show a front of levels at a time on wide screens.
    const band = 9 * BLOCK_CELLS;
    const fitW = Math.floor((this.stage.clientWidth - 2 * this.pad - 14) / cells.x);
    const fitH = Math.floor(this.stage.clientHeight / band);
    this.px = Math.max(2, Math.min(fitW, fitH));
    const p = this.px;
    const width = cells.x * p + 2 * this.pad;
    const height = cells.y * p + 2 * this.pad;
    const c = this.board;
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
    // The board extends far beyond the viewport, and the zoom temporarily copies it.
    const dpr = Math.min(window.devicePixelRatio || 1, Math.sqrt(3_000_000 / (width * height)));
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(this.pad, this.pad);
    drawBoardGround(ctx, this.oriented, p);
    this.terrain.width = c.width;
    this.terrain.height = c.height;
    this.terrain.getContext('2d')!.drawImage(c, 0, 0);
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
    for (const lv of w.levels) {
      const [ay, ax] = this.anchors[lv.index]!;
      const markers = this.markers(lv)
        .map(({ icon }) => icon)
        .join(' ');
      const label = `${lv.index + 1}  ${markers}`;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      const width = ctx.measureText(label).width + 14;
      const x = (ax + 0.5) * p;
      const y = (ay + 0.5) * p;
      ctx.fillStyle = '#0d1014e8';
      ctx.fillRect(x - width / 2, y - 12, width, 24);
      ctx.fillStyle = lv.index === this.selected ? '#ffd34d' : '#e7e9ec';
      ctx.fillText(label, x, y);
    }
  }

  private markers(lv: WorldLevel): { icon: string; label: string }[] {
    const m = this.m!;
    const taken = m.taken.includes(lv.index);
    const active = m.active === lv.index;
    const open = m.attackable.includes(lv.index);
    const icon = taken ? '✓' : active ? '⏳' : open ? '⚔' : '🔒';
    const status =
      m.active !== null && !active && !taken
        ? str('campaign.status.busy', { n: m.active + 1 })
        : str(
            taken
              ? 'campaign.status.taken'
              : active
                ? 'campaign.status.active'
                : open
                  ? 'campaign.status.open'
                  : 'campaign.status.locked',
          );
    const markers = [{ icon, label: status }];
    if (lv.index === m.hq) markers.push({ icon: '⚑', label: str('campaign.label.hq') });
    if (weatherForLevel(m.world.seed, lv.index) === 'fog') {
      markers.push({ icon: '≋', label: str('campaign.fog') });
    }
    for (const tag of m.tags[lv.index] ?? []) {
      markers.push({ icon: tagIcon(tag), label: tagText(tag) });
    }
    return markers;
  }

  private togglePanel(panel: typeof this.panel): void {
    this.panel = this.panel === panel ? null : panel;
    this.renderControls();
    this.positionActions();
  }

  private positionActions(): void {
    if (this.selected === null) return;
    const [y, x] = this.anchors[this.selected]!;
    const rect = this.board.getBoundingClientRect();
    const anchorX = rect.left + this.pad + (x + 0.5) * this.px;
    const anchorY = rect.top + this.pad + (y + 0.5) * this.px;
    const inView = anchorY >= 0 && anchorY <= this.stage.clientHeight;
    this.actionsBar.style.visibility = inView ? 'visible' : 'hidden';
    const half = this.actionsBar.offsetWidth / 2 + 8;
    this.actionsBar.style.left = `${Math.max(half, Math.min(this.stage.clientWidth - half, anchorX))}px`;
    this.actionsBar.style.top = `${Math.max(52, anchorY - 17)}px`;
  }

  private renderControls(): void {
    const m = this.m;
    if (!m) return;
    this.toolbar.replaceChildren();
    this.actionsBar.replaceChildren();
    this.side.replaceChildren();
    this.side.hidden = !this.panel;
    if (m.won) this.toolbar.append(el('span', 'chip won', str('campaign.won')));
    const settings = el('button', '', '⚙');
    settings.setAttribute('aria-label', str('campaign.options'));
    settings.setAttribute('aria-expanded', String(this.panel === 'campaign'));
    settings.onclick = () => {
      this.togglePanel('campaign');
      this.toolbar.querySelector('button')?.focus({ preventScroll: true });
    };
    this.toolbar.append(settings);

    const lv = this.selected !== null ? m.world.levels[this.selected] : undefined;
    if (lv) {
      if (m.attackable.includes(lv.index)) {
        const go = el(
          'button',
          'go',
          str(m.active === lv.index ? 'campaign.resume' : 'campaign.attack'),
        );
        go.onclick = () => this.actions.attack(lv.index);
        this.actionsBar.append(go);
      }
      const info = el('button', 'info', 'ℹ');
      info.setAttribute('aria-label', str('campaign.levelInfo'));
      info.setAttribute('aria-expanded', String(this.panel === 'level'));
      info.onclick = () => {
        this.togglePanel('level');
        this.actionsBar.querySelector<HTMLButtonElement>('.info')?.focus({ preventScroll: true });
      };
      this.actionsBar.append(info);
    }

    if (this.panel) {
      const close = el('button', 'close', '×');
      close.setAttribute('aria-label', str('campaign.close'));
      close.onclick = () => {
        const panel = this.panel;
        this.togglePanel(null);
        const opener =
          panel === 'level'
            ? this.actionsBar.querySelector<HTMLButtonElement>('.info')
            : this.toolbar.querySelector('button');
        opener?.focus({ preventScroll: true });
      };
      this.side.append(close);
    }
    if (this.panel === 'campaign') this.renderCampaign(m);
    else if (this.panel === 'level' && lv) this.renderLevel(lv);
  }

  private renderLevel(lv: WorldLevel): void {
    this.side.append(el('h2', '', str('campaign.level', { n: lv.index + 1 })));
    const legend = el('dl', 'legend');
    for (const { icon, label } of this.markers(lv))
      legend.append(el('dt', '', icon), el('dd', '', label));
    this.side.append(legend);
    if (this.m!.taken.includes(lv.index)) return;
    const info = this.actions.levelInfo(lv.index);
    const facts = el('dl');
    for (const [label, value] of [
      [str('campaign.enemies'), String(info.enemies)],
      [str('campaign.budget'), String(info.budget)],
      [str('campaign.size'), str('campaign.sizeValue', { blocks: lv.blocks })],
    ])
      facts.append(el('dt', '', label), el('dd', '', value));
    this.side.append(facts);
  }

  private renderCampaign(m: CampaignViewModel): void {
    const box = this.side;
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
