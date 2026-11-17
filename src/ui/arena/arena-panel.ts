/**
 * (PHASE17) The dev arena's setup panel ([D142]): each side's preset and soldiers by role,
 * barriers switched on per half at fixed spots, GO / reset / speed, and a batch of headless fights for
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
  type BarrierSides,
  BARRIER_SIDES,
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

/** Barrier buttons: an icon per kind ([D142]). */
const BARRIERS: readonly {
  kind: ArenaPiece['kind'];
  icon: string;
  key: Parameters<typeof str>[0];
}[] = [
  { kind: 'sandbags', icon: '🟫', key: 'arena.tool.sandbags' },
  { kind: 'crate', icon: '📦', key: 'arena.tool.crate' },
  { kind: 'fence', icon: '🚧', key: 'arena.tool.fence' },
  { kind: 'halfWall', icon: '🧱', key: 'arena.tool.halfWall' },
  { kind: 'rock', icon: '🪨', key: 'arena.tool.rock' },
];

/** What each side setting looks like on its button. */
const SIDE_MARK: Readonly<Record<BarrierSides, string>> = {
  none: '·',
  left: '◀',
  right: '▶',
  both: '◀▶',
};

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
.aoo-arena .tools button { font-size: 18px; padding: 2px 6px; min-width: 52px; }
.aoo-arena .tools small { font-size: 11px; margin-left: 2px; }
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

    // Barriers ([D142]): each kind at its fixed spots, off / left / right / both halves.
    const tools = el('div', 'tools');
    for (const b of BARRIERS) {
      const cur = this.cfg.barriers[b.kind] ?? 'none';
      const btn = el('button', cur === 'none' ? '' : 'on');
      btn.innerHTML = `${b.icon}<small>${SIDE_MARK[cur]}</small>`;
      btn.title = `${str(b.key)}: ${str(`arena.sides.${cur}` as Parameters<typeof str>[0])}`;
      btn.onclick = () => {
        const next = BARRIER_SIDES[(BARRIER_SIDES.indexOf(cur) + 1) % BARRIER_SIDES.length]!;
        if (next === 'none') delete this.cfg.barriers[b.kind];
        else this.cfg.barriers[b.kind] = next;
        this.actions.change(this.cfg);
        this.render();
      };
      tools.append(btn);
    }
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
