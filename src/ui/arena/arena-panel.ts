/**
 * (PHASE17) The dev arena's setup panel ([D142]): each side's preset and soldiers by role, cover
 * pieces to place by tapping the field, GO / reset / speed, and a batch of headless fights for
 * win rates. Icons over words. Dev tool: placeholder look.
 */
import { ROLES } from '../../content/roles';
import { roleIconSvg } from '../../content/role-icons';
import { str } from '../../content/strings';
import {
  ARENA_MAX_PER_SIDE,
  ARENA_PRESETS,
  type ArenaBatch,
  type ArenaConfig,
  type ArenaPiece,
  type ArenaPreset,
  type ArenaState,
} from '../../gen/arena';
import type { RoleId } from '../../contracts/mission';
import { el, injectStyle } from '../dom';

export interface ArenaPanelActions {
  change(cfg: ArenaConfig): void;
  go(): void;
  reset(): void;
  speed(x: number): void;
  batch(n: number): Promise<ArenaBatch>;
}

export type ArenaTool = ArenaPiece['kind'] | 'erase' | null;

const TOOLS: readonly { tool: ArenaTool; icon: string; key: Parameters<typeof str>[0] }[] = [
  { tool: null, icon: '✋', key: 'arena.tool.none' },
  { tool: 'sandbags', icon: '🟫', key: 'arena.tool.sandbags' },
  { tool: 'crate', icon: '📦', key: 'arena.tool.crate' },
  { tool: 'fence', icon: '🚧', key: 'arena.tool.fence' },
  { tool: 'halfWall', icon: '🧱', key: 'arena.tool.halfWall' },
  { tool: 'rock', icon: '🪨', key: 'arena.tool.rock' },
  { tool: 'erase', icon: '🧽', key: 'arena.tool.erase' },
];

const css = `
.aoo-arena { position: fixed; top: 0; right: 0; bottom: 0; width: 320px; overflow-y: auto;
  background: #161a1f; color: #e7e9ec; font: 13px/1.35 system-ui, sans-serif; padding: 10px;
  border-left: 1px solid #262c33; box-sizing: border-box; z-index: 20; }
@media (max-width: 719px) { .aoo-arena { top: auto; left: 0; width: auto; height: 45%;
  border-left: 0; border-top: 1px solid #262c33; } }
.aoo-arena nav { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-bottom: 8px; font-size: 12px; }
.aoo-arena nav a { color: #9cc7ff; text-decoration: none; }
.aoo-arena nav b { color: #ffd34d; }
.aoo-arena .side { border: 1px solid #2c333b; border-radius: 8px; padding: 6px; margin-bottom: 8px; }
.aoo-arena .side.left { border-color: #3b6fb6; }
.aoo-arena .side.right { border-color: #b64a3b; }
.aoo-arena .side header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.aoo-arena select { background: #20262d; color: inherit; border: 1px solid #39414a; border-radius: 6px;
  padding: 3px 6px; font: inherit; }
.aoo-arena .roles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.aoo-arena .role { display: flex; align-items: center; gap: 2px; background: #1d2228; border-radius: 6px;
  padding: 2px 3px; }
.aoo-arena .role .n { min-width: 16px; text-align: center; font-weight: 700; }
.aoo-arena .role.zero { opacity: .45; }
.aoo-arena button { background: #20262d; color: inherit; border: 1px solid #39414a; border-radius: 6px;
  cursor: pointer; font: inherit; padding: 2px 6px; }
.aoo-arena .role button { padding: 0 5px; }
.aoo-arena .tools { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.aoo-arena .tools button { font-size: 18px; padding: 2px 6px; }
.aoo-arena .tools button.on { border-color: #ffd34d; background: #2b2a1d; }
.aoo-arena .row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; align-items: center; }
.aoo-arena .go { background: #2f6b34; border-color: #4fa356; font-weight: 700; font-size: 15px; padding: 4px 14px; }
.aoo-arena .score { font-size: 18px; font-weight: 700; margin: 4px 0 8px; }
.aoo-arena .score .w { color: #ffd34d; }
.aoo-arena .batch { font-size: 13px; color: #c9d1d9; }
`;

export class ArenaPanel {
  private readonly root = el('div', 'aoo-arena');
  private cfg: ArenaConfig;
  tool: ArenaTool = null;
  vertical = false;
  private scoreEl = el('div', 'score');
  private batchEl = el('div', 'batch');

  constructor(
    host: HTMLElement,
    initial: ArenaConfig,
    private readonly actions: ArenaPanelActions,
    private readonly links: readonly { label: string; href: string; here?: boolean }[],
  ) {
    injectStyle('aoo-arena', css);
    this.cfg = structuredClone(initial);
    host.append(this.root);
    this.render();
  }

  get config(): ArenaConfig {
    return this.cfg;
  }

  /** Places or erases at a tap on the field. */
  tap(x: number, y: number): void {
    if (!this.tool) return;
    if (this.tool === 'erase') {
      let best = -1;
      let bestD = 60 * 60;
      this.cfg.pieces.forEach((p, i) => {
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best < 0) return;
      this.cfg.pieces.splice(best, 1);
    } else {
      this.cfg.pieces.push({
        kind: this.tool,
        x: Math.round(x),
        y: Math.round(y),
        ...(this.vertical ? { vertical: true } : {}),
      });
    }
    this.actions.change(this.cfg);
  }

  showState(s: ArenaState): void {
    const secs = (s.tick / 60).toFixed(1);
    const w =
      s.winner === 'left'
        ? ' <span class="w">🟦🏆</span>'
        : s.winner === 'right'
          ? ' <span class="w">🟥🏆</span>'
          : s.winner === 'draw'
            ? ' <span class="w">🤝</span>'
            : '';
    this.scoreEl.innerHTML = `🟦 ${s.left} : ${s.right} 🟥 · ${secs}s${w}`;
  }

  private render(): void {
    const r = this.root;
    r.replaceChildren();
    const nav = el('nav');
    for (const l of this.links) {
      if (l.here) nav.append(el('b', '', l.label));
      else {
        const a = el('a', '', l.label);
        a.href = l.href;
        nav.append(a);
      }
    }
    r.append(nav, this.side('left'), this.side('right'));

    const tools = el('div', 'tools');
    for (const t of TOOLS) {
      const b = el('button', t.tool === this.tool ? 'on' : '', t.icon);
      b.title = str(t.key);
      b.onclick = () => {
        this.tool = t.tool;
        this.render();
      };
      tools.append(b);
    }
    const rot = el('button', this.vertical ? 'on' : '', this.vertical ? '↕' : '↔');
    rot.title = str('arena.rotate');
    rot.onclick = () => {
      this.vertical = !this.vertical;
      this.render();
    };
    const clear = el('button', '', '🗑');
    clear.title = str('arena.clear');
    clear.onclick = () => {
      this.cfg.pieces = [];
      this.actions.change(this.cfg);
    };
    tools.append(rot, clear);
    r.append(tools);

    const row = el('div', 'row');
    const go = el('button', 'go', '▶ GO');
    go.onclick = () => this.actions.go();
    const reset = el('button', '', '↺');
    reset.title = str('arena.reset');
    reset.onclick = () => this.actions.reset();
    row.append(go, reset);
    for (const x of [1, 2, 4]) {
      const b = el('button', '', `×${x}`);
      b.onclick = () => this.actions.speed(x);
      row.append(b);
    }
    r.append(row, this.scoreEl);

    const brow = el('div', 'row');
    const batch = el('button', '', `🎲 ×20`);
    batch.title = str('arena.batch');
    batch.onclick = async () => {
      this.batchEl.textContent = '…';
      const b = await this.actions.batch(20);
      this.batchEl.textContent = str('arena.batchResult', {
        left: b.left,
        right: b.right,
        draws: b.draws,
        secs: b.meanSeconds.toFixed(1),
        left2: b.meanSurvivors.toFixed(1),
      });
    };
    brow.append(batch, this.batchEl);
    r.append(brow);
  }

  private side(which: 'left' | 'right'): HTMLElement {
    const s = this.cfg[which];
    const box = el('div', `side ${which}`);
    const head = el('header');
    head.append(el('span', '', which === 'left' ? '🟦' : '🟥'));
    const sel = el('select');
    for (const p of ARENA_PRESETS) {
      const o = el('option', '', str(`arena.preset.${p}` as Parameters<typeof str>[0]));
      o.value = p;
      if (p === s.preset) o.selected = true;
      sel.append(o);
    }
    sel.onchange = () => {
      s.preset = sel.value as ArenaPreset;
      this.actions.change(this.cfg);
    };
    head.append(sel);
    box.append(head);
    const grid = el('div', 'roles');
    const total = () => ROLES.reduce((n, x) => n + (s.units[x.id] ?? 0), 0);
    for (const role of ROLES) {
      const n = s.units[role.id] ?? 0;
      const cell = el('div', `role${n ? '' : ' zero'}`);
      cell.title = str(role.nameKey);
      const icon = el('span');
      icon.innerHTML = roleIconSvg(role.id, 20);
      const minus = el('button', '', '−');
      const plus = el('button', '', '+');
      const set = (v: number) => {
        const id: RoleId = role.id;
        const next = Math.max(0, Math.min(v, n + ARENA_MAX_PER_SIDE - total()));
        if (next === 0) delete s.units[id];
        else s.units[id] = next;
        this.actions.change(this.cfg);
        this.render();
      };
      minus.onclick = () => set(n - 1);
      plus.onclick = () => set(n + 1);
      cell.append(icon, minus, el('span', 'n', String(n)), plus);
      grid.append(cell);
    }
    box.append(grid);
    return box;
  }

  destroy(): void {
    this.root.remove();
  }
}
