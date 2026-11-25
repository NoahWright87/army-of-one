/**
 * (PHASE18) The Sarge editor page ([D160]): a list on the left, the course on a canvas in the
 * middle, and a plain form for whatever is selected on the right. Zones are rectangles you draw on
 * the map; a rule says WHEN (conditions in sentences) and DO (say, wait, set a flag); Sarge's
 * position says where he likes to stand. Nothing here touches the game: it edits a script and
 * "Play from here" opens the game with it.
 */
import { checkWhen, lineDurationMs, validateScript, zoneIds } from '../../app/sarge-engine';
import { BT_H, BT_ROOM_RECTS, BT_W } from '../../content/maps/basic-training';
import {
  SARGE_ROOM_NAMES,
  SARGE_ROOMS,
  type SargeAt,
  type SargePref,
  type SargeRule,
  type SargeScript,
  type SargeStep,
  type SargeZone,
} from '../../content/sarge-script';
import { el, injectStyle } from '../dom';
import {
  COND_TYPES,
  GROUP_LABELS,
  describeWhen,
  newRow,
  optionLabel,
  paramOptions,
  parseWhen,
  rowsToWhen,
  type CondType,
} from './conditions';
import { drawMap, screenToWorld, worldToScreen, type View } from './map-draw';

/** What the editor needs from the page that hosts it. */
export interface SargeEditorHost {
  script(): SargeScript;
  /** Keep this (called after every change). */
  save(script: SargeScript): void;
  reset(): void;
  importJson(json: string): string | null;
  /** Open the game with the script, at a station. */
  play(stationId: string): void;
  stations: readonly { id: string; label: string; y: number }[];
  /** The gates that open from a mission rule: how long each waits, and what it waits for. */
  gateRules: readonly { gate: string; when: string }[];
  edited(): boolean;
  outdated(): boolean;
}

type Tab = 'lines' | 'position' | 'zones' | 'flags' | 'timing';
type Sel = { kind: 'rule' | 'pref' | 'zone'; id: string } | null;
type Tool = 'select' | 'zone' | 'point';

const css = `
.aoo-sg { position: fixed; inset: 0; display: flex; flex-direction: column; background: #12161b;
  color: #e6e9ec; font: 13px/1.35 system-ui, sans-serif; }
.aoo-sg * { box-sizing: border-box; }
.aoo-sg .top { display: flex; gap: 8px; align-items: center; padding: 8px 12px; background: #1a2027;
  border-bottom: 2px solid #ffd34d; flex-wrap: wrap; }
.aoo-sg .top h1 { margin: 0 8px 0 0; font-size: 16px; color: #ffd34d; }
.aoo-sg .top .sp { flex: 1; }
.aoo-sg .body { flex: 1; display: flex; min-height: 0; }
.aoo-sg .left { width: 310px; display: flex; flex-direction: column; border-right: 1px solid #2b343d; background: #161b21; }
.aoo-sg .right { width: 400px; overflow-y: auto; border-left: 1px solid #2b343d; background: #161b21; padding: 10px 12px 40px; }
.aoo-sg .mapwrap { flex: 1; position: relative; min-width: 0; }
.aoo-sg canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
.aoo-sg .tools { position: absolute; left: 10px; top: 10px; display: flex; gap: 6px; z-index: 2; }
.aoo-sg .hintbar { position: absolute; left: 10px; bottom: 10px; padding: 4px 8px; background: #000a; border-radius: 4px; z-index: 2; }
.aoo-sg button { font: 600 12px system-ui, sans-serif; padding: 5px 9px; border-radius: 5px; border: 1px solid #4b5763;
  background: #232b33; color: #e6e9ec; cursor: pointer; }
.aoo-sg button:hover { border-color: #ffd34d; }
.aoo-sg button.on, .aoo-sg button.go { background: #ffd34d; color: #1a1a1a; border-color: #ffd34d; }
.aoo-sg button.x { padding: 2px 7px; }
.aoo-sg input, .aoo-sg textarea, .aoo-sg select { background: #0f1318; color: #e6e9ec; border: 1px solid #3a444e;
  border-radius: 4px; padding: 4px 6px; font: 13px system-ui, sans-serif; max-width: 100%; }
.aoo-sg input[type=number] { width: 70px; }
.aoo-sg input[type=checkbox] { width: auto; }
.aoo-sg textarea { width: 100%; min-height: 60px; resize: vertical; }
.aoo-sg .tabs { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px; }
.aoo-sg .list { flex: 1; overflow-y: auto; padding: 0 8px 12px; }
.aoo-sg .list h4 { margin: 12px 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #8b96a1; }
.aoo-sg .item { padding: 6px 8px; border: 1px solid #28313a; border-radius: 6px; margin: 3px 0; cursor: pointer; background: #1a2027; }
.aoo-sg .item:hover { border-color: #5a6672; }
.aoo-sg .item.sel { border-color: #ffd34d; background: #262d22; }
.aoo-sg .item.off { opacity: .45; }
.aoo-sg .item .t { font-weight: 700; color: #ffd34d; }
.aoo-sg .item .s { color: #aab3bc; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.aoo-sg h2 { margin: 0 0 8px; font-size: 15px; color: #ffd34d; }
.aoo-sg h3 { margin: 16px 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #8b96a1; }
.aoo-sg .card { border: 1px solid #2d3740; border-radius: 6px; padding: 6px 8px; margin: 5px 0; background: #1b222a; }
.aoo-sg .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 4px 0; }
.aoo-sg .sentence { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; flex: 1; }
.aoo-sg .hint { color: #8b96a1; font-size: 12px; }
.aoo-sg .err { color: #ff8a80; font-size: 12px; margin: 2px 0; }
.aoo-sg .ok { color: #8fd694; }
.aoo-sg .long { color: #ffb86b; }
.aoo-sg .badge { padding: 2px 8px; border-radius: 10px; font-size: 12px; background: #3a2222; color: #ff8a80; cursor: pointer; }
.aoo-sg .badge.fine { background: #1f3326; color: #8fd694; cursor: default; }
.aoo-sg label { display: inline-flex; gap: 4px; align-items: center; }
.aoo-sg .tag { color: #ffd34d; font-weight: 700; min-width: 42px; }
`;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'zone';

export class SargeEditorView {
  private tab: Tab = 'lines';
  private sel: Sel = null;
  private tool: Tool = 'select';
  private filter = '';
  private view: View = { cx: BT_W / 2, cy: BT_H - 700, zoom: 0.3 };
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly left = el('div', 'left');
  private readonly right = el('div', 'right');
  private readonly top = el('div', 'top');
  private readonly hintbar = el('div', 'hintbar');
  private readonly toolButtons = new Map<Tool, HTMLButtonElement>();
  private drag:
    | null
    | { kind: 'pan'; sx: number; sy: number; cx: number; cy: number }
    | { kind: 'new'; x: number; y: number; w: number; h: number }
    | { kind: 'move'; zone: SargeZone; dx: number; dy: number }
    | { kind: 'resize'; zone: SargeZone; corner: 0 | 1 | 2 | 3 }
    | { kind: 'pin'; pref: SargePref } = null;
  private problemsNote = el('span', 'badge fine');

  constructor(
    root: HTMLElement,
    private readonly host: SargeEditorHost,
  ) {
    injectStyle('aoo-sarge-editor-page', css);
    const page = el('div', 'aoo-sg');
    const body = el('div', 'body');
    const mapwrap = el('div', 'mapwrap');
    this.canvas = el('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    const tools = el('div', 'tools');
    for (const [tool, label] of [
      ['select', '☝ Select / move'],
      ['zone', '▭ Draw a zone'],
    ] as const) {
      const b = el('button', undefined, label);
      b.addEventListener('click', () => this.setTool(tool));
      this.toolButtons.set(tool, b);
      tools.append(b);
    }
    mapwrap.append(this.canvas, tools, this.hintbar);
    body.append(this.left, mapwrap, this.right);
    page.append(this.top, body);
    root.append(page);
    this.bindCanvas();
    new ResizeObserver(() => this.resize()).observe(mapwrap);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.setTool('select');
    });
    this.render();
    this.resize();
  }

  private get script(): SargeScript {
    return this.host.script();
  }

  // --- Changes -----------------------------------------------------------------------------

  /** A small change: keep it, refresh the status and the map. */
  private changed(): void {
    this.host.save(this.script);
    this.drawStatus();
    this.draw();
  }

  /** A change to the shape of things (add, delete, move, select): rebuild the panels. */
  private restructure(): void {
    this.host.save(this.script);
    this.render();
  }

  private select(sel: Sel, tab?: Tab): void {
    this.host.save(this.script); // whatever was just added is kept
    this.sel = sel;
    if (tab) this.tab = tab;
    this.render();
  }

  private setTool(tool: Tool): void {
    this.tool = tool;
    for (const [t, b] of this.toolButtons) b.classList.toggle('on', t === tool);
    this.hintbar.textContent =
      tool === 'zone'
        ? 'Drag on the map to draw a zone. Esc to cancel.'
        : tool === 'point'
          ? 'Click on the map to put Sarge there. Esc to cancel.'
          : 'Drag zones and pins to move them · drag the map to scroll · mouse wheel scrolls, Ctrl+wheel zooms';
    this.canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
  }

  // --- Page ---------------------------------------------------------------------------------

  private render(): void {
    this.drawTop();
    this.drawLeft();
    this.drawRight();
    this.setTool(this.tool);
    this.draw();
  }

  private btn(label: string, run: () => void, cls?: string): HTMLButtonElement {
    const b = el('button', cls, label);
    b.addEventListener('click', run);
    return b;
  }

  private drawTop(): void {
    const t = this.top;
    t.textContent = '';
    t.append(el('h1', undefined, "Sarge's script"));
    const stations = el('select');
    for (const s of this.host.stations) stations.append(new Option(s.label, s.id));
    stations.addEventListener('change', () => {
      const s = this.host.stations.find((x) => x.id === stations.value);
      if (s) {
        this.view.cy = s.y;
        this.draw();
      }
    });
    const play = this.btn('▶ Play from here', () => this.host.play(stations.value), 'go');
    play.title = 'Opens the game at this station with your script (← Sarge editor comes back here)';
    t.append(el('span', 'hint', 'Station:'), stations, play);
    t.append(el('span', 'sp'));
    this.problemsNote.addEventListener('click', () => this.select(null));
    t.append(this.problemsNote);
    this.drawStatus();
    t.append(
      this.btn('Download', () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(
          new Blob([JSON.stringify(this.script, null, 2)], { type: 'application/json' }),
        );
        a.download = 'sarge-script.json';
        a.click();
        URL.revokeObjectURL(a.href);
      }),
      this.btn(
        'Copy',
        () => void navigator.clipboard?.writeText(JSON.stringify(this.script, null, 2)),
      ),
      this.btn('Paste…', () => {
        const text = window.prompt('Paste a script (JSON). This replaces the current one.');
        if (!text) return;
        const err = this.host.importJson(text);
        if (err) window.alert(err);
        else {
          this.sel = null;
          this.render();
        }
      }),
      this.btn('Back to default', () => {
        if (!window.confirm('Throw away your edits and use the default script?')) return;
        this.host.reset();
        this.sel = null;
        this.render();
      }),
    );
    if (this.host.outdated()) {
      t.append(
        el(
          'span',
          'err',
          'The default script changed since you edited yours. "Back to default" gets the new one (download yours first).',
        ),
      );
    }
  }

  private drawStatus(): void {
    const problems = validateScript(this.script);
    this.problemsNote.className = problems.length ? 'badge' : 'badge fine';
    this.problemsNote.textContent = problems.length
      ? `${problems.length} problem${problems.length === 1 ? '' : 's'}`
      : this.host.edited()
        ? 'Saved ✓'
        : 'Default script';
  }

  // --- Left: the lists ---------------------------------------------------------------------

  private drawLeft(): void {
    const l = this.left;
    l.textContent = '';
    const tabs = el('div', 'tabs');
    for (const [id, label] of [
      ['lines', 'Lines'],
      ['position', 'Sarge stands'],
      ['zones', 'Zones'],
      ['flags', 'Flags & gates'],
      ['timing', 'Timing'],
    ] as const) {
      const b = this.btn(
        label,
        () => {
          this.tab = id;
          this.sel = null;
          this.render();
        },
        this.tab === id ? 'on' : undefined,
      );
      tabs.append(b);
    }
    l.append(tabs);
    const list = el('div', 'list');
    l.append(list);
    switch (this.tab) {
      case 'lines':
        this.listRules(list);
        break;
      case 'position':
        this.listPrefs(list);
        break;
      case 'zones':
        this.listZones(list);
        break;
      case 'flags':
        this.listFlags(list);
        break;
      case 'timing':
        this.listTiming(list);
        break;
    }
  }

  private item(
    title: string,
    sub: string,
    selected: boolean,
    off: boolean,
    run: () => void,
  ): HTMLElement {
    const d = el('div', `item${selected ? ' sel' : ''}${off ? ' off' : ''}`);
    d.append(el('div', 't', title), el('div', 's', sub));
    d.addEventListener('click', run);
    return d;
  }

  /** Which heading a rule goes under in the list. */
  private groupOf(r: SargeRule): string {
    const rooms = SARGE_ROOMS as readonly string[];
    if (/respawn|hint:/.test(r.when)) return 'On the respawn view';
    if (/\bdied/.test(r.when)) return 'When you die';
    for (const m of r.when.matchAll(/(?<![!\w])(?:enter|in|leave|inFor|diedIn):([\w-]+)/g)) {
      const z = m[1]!;
      if (rooms.includes(z)) return SARGE_ROOM_NAMES[z as keyof typeof SARGE_ROOM_NAMES];
    }
    if (/captured:bt-a|gate:bt-g2/.test(r.when)) return SARGE_ROOM_NAMES.r2;
    if (/captured:bt-b/.test(r.when)) return SARGE_ROOM_NAMES.r4;
    if (/lifeStart/.test(r.when)) return 'When a life starts';
    return 'Anywhere';
  }

  private listRules(list: HTMLElement): void {
    const search = el('input');
    search.placeholder = 'Filter lines…';
    search.value = this.filter;
    search.style.width = '100%';
    const holder = el('div');
    const fill = () => {
      holder.textContent = '';
      const groups = new Map<string, SargeRule[]>();
      for (const r of this.script.rules) {
        const hay =
          `${r.id} ${r.steps.map((s) => (s.k === 'say' ? s.say.join(' ') : '')).join(' ')}`.toLowerCase();
        if (this.filter && !hay.includes(this.filter)) continue;
        const g = this.groupOf(r);
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g)!.push(r);
      }
      for (const [g, rules] of groups) {
        holder.append(el('h4', undefined, g));
        for (const r of rules) {
          const first = r.steps.find((s) => s.k === 'say');
          const text =
            first && first.k === 'say' ? first.say[0]!.replace(/\[[^\]]*\]/g, '') : '(no words)';
          holder.append(
            this.item(r.id, text, this.sel?.kind === 'rule' && this.sel.id === r.id, !!r.off, () =>
              this.select({ kind: 'rule', id: r.id }),
            ),
          );
        }
      }
    };
    search.addEventListener('input', () => {
      this.filter = search.value.toLowerCase();
      fill();
    });
    fill();
    const add = this.btn(
      '+ New line',
      () => {
        let n = 1;
        while (this.script.rules.some((r) => r.id === `line.${n}`)) n++;
        this.script.rules.push({
          id: `line.${n}`,
          when: 'enter:r1',
          steps: [{ k: 'say', say: ['…'] }],
        });
        this.select({ kind: 'rule', id: `line.${n}` });
      },
      'go',
    );
    list.append(search, holder, el('div'), add);
  }

  private prefWhere(p: SargePref): string {
    const a = p.at;
    switch (a.kind) {
      case 'point':
        return `at a spot (${Math.round(a.x)}, ${Math.round(a.y)})`;
      case 'zone':
        return `in ${optionLabel('zone', a.zone, this.script)}`;
      case 'nextTarget':
        return 'by the sandbags, opposite the next target';
      case 'player':
        return 'near you';
    }
  }

  private listPrefs(list: HTMLElement): void {
    list.append(
      el(
        'p',
        'hint',
        'Where Sarge likes to stand. The first one whose conditions are true wins, so put the specific ones above the general one at the bottom.',
      ),
    );
    for (const p of this.script.prefs) {
      list.append(
        this.item(
          `${p.id}: ${this.prefWhere(p)}`,
          describeWhen(p.when, this.script),
          this.sel?.kind === 'pref' && this.sel.id === p.id,
          false,
          () => this.select({ kind: 'pref', id: p.id }),
        ),
      );
    }
    list.append(
      this.btn(
        '+ New position',
        () => {
          let n = 1;
          while (this.script.prefs.some((p) => p.id === `pos.${n}`)) n++;
          this.script.prefs.unshift({
            id: `pos.${n}`,
            when: 'in:r1, alive',
            at: { kind: 'point', x: 600, y: 3600 },
            face: null,
          });
          this.select({ kind: 'pref', id: `pos.${n}` });
        },
        'go',
      ),
    );
  }

  private listZones(list: HTMLElement): void {
    list.append(
      el(
        'p',
        'hint',
        'Zones are rectangles on the map. The ten rooms are zones already. Draw your own with ▭ on the map, e.g. "by the sandbags" or "at the gate".',
      ),
    );
    for (const z of this.script.zones) {
      list.append(
        this.item(
          z.name || z.id,
          `id: ${z.id}`,
          this.sel?.kind === 'zone' && this.sel.id === z.id,
          false,
          () => {
            this.select({ kind: 'zone', id: z.id });
            this.view.cx = z.x + z.w / 2;
            this.view.cy = z.y + z.h / 2;
            this.draw();
          },
        ),
      );
    }
    list.append(this.btn('▭ Draw a new zone', () => this.setTool('zone'), 'go'));
  }

  private listFlags(list: HTMLElement): void {
    list.append(
      el(
        'p',
        'hint',
        'Flags are yes/no facts you make up ("Sarge explained cover"). A line can set one; any condition can check it.',
      ),
    );
    const s = this.script;
    for (const f of [...s.flags]) {
      const row = el('div', 'row');
      const name = el('input');
      name.value = f;
      name.addEventListener('change', () => this.renameFlag(f, name.value.trim()));
      const used = this.flagUses(f);
      row.append(name, el('span', 'hint', `${used} use${used === 1 ? '' : 's'}`));
      row.append(
        this.btn(
          '✕',
          () => {
            if (used && !window.confirm(`"${f}" is used in ${used} place(s). Delete it anyway?`))
              return;
            s.flags = s.flags.filter((x) => x !== f);
            this.restructure();
          },
          'x',
        ),
      );
      list.append(row);
    }
    const add = el('input');
    add.placeholder = 'New flag name…';
    const addRow = el('div', 'row');
    addRow.append(
      add,
      this.btn(
        '+ Add',
        () => {
          const n = add.value.trim();
          if (!n || s.flags.includes(n)) return;
          s.flags.push(n);
          this.restructure();
        },
        'go',
      ),
    );
    list.append(addRow);
    list.append(el('h3', undefined, 'Gates'));
    list.append(
      el(
        'p',
        'hint',
        'Each gate opens a few seconds after something is done. Time it against how long Sarge talks. Takes effect when the level loads (▶ Play).',
      ),
    );
    for (const g of this.host.gateRules) {
      const row = el('div', 'card');
      const n = el('input');
      n.type = 'number';
      n.min = '0';
      n.step = '0.5';
      n.value = String(s.gateDelays[g.gate] ?? 0);
      n.addEventListener('input', () => {
        s.gateDelays[g.gate] = Math.max(0, Number(n.value) || 0);
        this.changed();
      });
      row.append(el('div', 'tag', optionLabel('gate', g.gate, s)), el('div', 'row'));
      row.lastElementChild!.append(
        el('span', undefined, 'opens'),
        n,
        el('span', undefined, `seconds after ${g.when}`),
      );
      list.append(row);
    }
  }

  private listTiming(list: HTMLElement): void {
    const t = this.script.timing;
    list.append(
      el(
        'p',
        'hint',
        'How fast Sarge talks and moves. Each line shows how long it takes to say, on the right.',
      ),
    );
    const rows: [keyof typeof t, string][] = [
      ['holdMs', 'A finished line stays: base (ms)'],
      ['holdPerCharMs', '… plus per letter (ms)'],
      ['wordMs', 'Each word appears: base (ms)'],
      ['wordPerCharMs', '… plus per letter (ms)'],
      ['lineGapMs', 'Breath between lines (ms)'],
      ['staleMs', 'A line you outran is dropped after (ms)'],
      ['speed', 'Sarge runs at (units/s; sprint is about 360)'],
    ];
    for (const [k, label] of rows) {
      const r = el('div', 'row');
      const i = el('input');
      i.type = 'number';
      i.value = String(t[k]);
      i.addEventListener('input', () => {
        const n = Number(i.value);
        if (Number.isFinite(n)) {
          t[k] = n;
          this.changed();
        }
      });
      r.append(i, el('span', undefined, label));
      list.append(r);
    }
  }

  private flagUses(f: string): number {
    let n = 0;
    for (const r of this.script.rules) {
      if (new RegExp(`(?:flag|flagFor):${f}(?::|,|$)`).test(r.when.replace(/\s/g, ''))) n++;
      n += r.steps.filter((s) => (s.k === 'set' || s.k === 'clear') && s.flag === f).length;
    }
    return n;
  }

  private renameFlag(old: string, next: string): void {
    const s = this.script;
    if (!next || next === old || s.flags.includes(next)) {
      this.render();
      return;
    }
    s.flags = s.flags.map((f) => (f === old ? next : f));
    for (const r of s.rules) {
      r.when = r.when.replace(
        new RegExp(`((?:flag|flagFor):)${old}(?=:|,|\\s|$)`, 'g'),
        `$1${next}`,
      );
      for (const st of r.steps)
        if ((st.k === 'set' || st.k === 'clear') && st.flag === old) st.flag = next;
    }
    for (const p of s.prefs) {
      p.when = p.when.replace(
        new RegExp(`((?:flag|flagFor):)${old}(?=:|,|\\s|$)`, 'g'),
        `$1${next}`,
      );
    }
    this.restructure();
  }

  // --- Right: the form for what's selected -------------------------------------------------

  private drawRight(): void {
    const r = this.right;
    r.textContent = '';
    const sel = this.sel;
    if (sel?.kind === 'rule') {
      const rule = this.script.rules.find((x) => x.id === sel.id);
      if (rule) return this.ruleForm(r, rule);
    }
    if (sel?.kind === 'pref') {
      const pref = this.script.prefs.find((x) => x.id === sel.id);
      if (pref) return this.prefForm(r, pref);
    }
    if (sel?.kind === 'zone') {
      const zone = this.script.zones.find((x) => x.id === sel.id);
      if (zone) return this.zoneForm(r, zone);
    }
    this.helpPanel(r);
  }

  private helpPanel(r: HTMLElement): void {
    r.append(el('h2', undefined, 'How this works'));
    for (const t of [
      'Pick a line on the left to edit it, or press + New line.',
      'A line says WHEN (something happens, and these are true) → DO (say, wait, set a flag).',
      'Zones are rectangles on the map. Draw one with ▭, then use it in conditions ("you walk into …").',
      '"Sarge stands" decides where he waits; the Lines tab decides what he says.',
      'Press ▶ Play from here to try it in the game. ← Sarge editor brings you back.',
    ]) {
      r.append(el('p', undefined, t));
    }
    const problems = validateScript(this.script);
    r.append(el('h3', undefined, problems.length ? `Problems (${problems.length})` : 'Problems'));
    if (!problems.length) r.append(el('p', 'ok', 'None. Everything refers to things that exist.'));
    for (const p of problems) r.append(el('div', 'err', p));
  }

  // The conditions widget (rules and positions both use it).
  private conditions(
    title: string,
    get: () => string,
    set: (when: string) => void,
    onShape: () => void,
  ): HTMLElement {
    const box = el('div');
    box.append(el('h3', undefined, title));
    const rowsHost = el('div');
    const errs = el('div', 'err');
    const raw = el('input');
    raw.style.width = '100%';
    raw.style.display = 'none';
    raw.style.fontFamily = 'ui-monospace, monospace';
    let rows = parseWhen(get()).rows;
    const commit = () => {
      const when = rowsToWhen(rows);
      set(when);
      errs.textContent = checkWhen(when, this.script).join(' · ');
      raw.value = when;
      this.changed();
    };
    const drawRows = () => {
      rowsHost.textContent = '';
      rows.forEach((row, i) => {
        const card = el('div', 'card');
        const line = el('div', 'row');
        if ('raw' in row) {
          line.append(el('span', 'hint', `(typed) ${row.raw}`));
        } else {
          const sent = el('span', 'sentence');
          const canNot = row.type.group !== 'happens' && row.type.name !== 'waited';
          if (canNot) {
            const not = el('select');
            not.append(new Option('is', 'no'), new Option('is NOT', 'yes'));
            not.value = row.neg ? 'yes' : 'no';
            not.title = 'Flip this condition';
            not.addEventListener('change', () => {
              row.neg = not.value === 'yes';
              drawRows();
              commit();
            });
            if (row.type.notLabel) {
              // The sentence itself flips ("you're in" ↔ "you're not in").
              not.style.display = 'none';
              const flip = this.btn(
                '⇄',
                () => {
                  row.neg = !row.neg;
                  drawRows();
                  commit();
                },
                'x',
              );
              flip.title = row.neg ? 'Flip back to the opposite' : 'Flip to the opposite ("not")';
              sent.append(flip);
            } else {
              sent.append(not);
            }
          } else {
            sent.append(el('span', 'tag', row.type.group === 'happens' ? 'when' : ''));
          }
          const label = row.neg && row.type.notLabel ? row.type.notLabel : row.type.label;
          for (const part of label) {
            if (typeof part === 'string') {
              sent.append(el('span', undefined, part));
              continue;
            }
            const kind = row.type.params[part]!;
            if (kind === 'num') {
              const n = el('input');
              n.type = 'number';
              n.step = '0.5';
              n.value = row.args[part] ?? '';
              n.addEventListener('input', () => {
                row.args[part] = n.value;
                commit();
              });
              sent.append(n);
            } else {
              const s = el('select');
              const opts = paramOptions(kind, this.script);
              for (const o of opts) s.append(new Option(o.label, o.value));
              const cur = row.args[part] ?? '';
              if (!opts.some((o) => o.value === cur))
                s.append(new Option(`${cur || '—'} (?)`, cur));
              s.value = cur;
              s.addEventListener('change', () => {
                row.args[part] = s.value;
                commit();
              });
              sent.append(s);
            }
          }
          line.append(sent);
        }
        line.append(
          this.btn(
            '✕',
            () => {
              rows.splice(i, 1);
              drawRows();
              commit();
            },
            'x',
          ),
        );
        card.append(line);
        rowsHost.append(card);
      });
      if (!rows.length) rowsHost.append(el('div', 'hint', 'No conditions: always true.'));
    };
    drawRows();
    errs.textContent = checkWhen(get(), this.script).join(' · ');
    const add = el('select');
    add.append(new Option('+ Add a condition…', ''));
    for (const g of ['happens', 'timer', 'state'] as const) {
      const og = document.createElement('optgroup');
      og.label = GROUP_LABELS[g];
      for (const t of COND_TYPES.filter((c) => c.group === g)) {
        og.append(new Option(this.sentenceHint(t), t.id));
      }
      add.append(og);
    }
    add.addEventListener('change', () => {
      const t = COND_TYPES.find((c) => c.id === add.value);
      add.value = '';
      if (!t) return;
      rows = [...rows, newRow(t, this.script)];
      drawRows();
      commit();
      onShape();
    });
    const typed = this.btn('Type it instead', () => {
      raw.style.display = raw.style.display === 'none' ? 'block' : 'none';
      raw.value = get();
    });
    raw.addEventListener('input', () => {
      set(raw.value);
      errs.textContent = checkWhen(raw.value, this.script).join(' · ');
      rows = parseWhen(raw.value).rows;
      drawRows();
      this.changed();
    });
    box.append(rowsHost, errs, el('div', 'row'));
    box.lastElementChild!.append(add, typed);
    box.append(raw);
    return box;
  }

  private sentenceHint(t: CondType): string {
    return t.label.map((p) => (typeof p === 'string' ? p : '…')).join('');
  }

  // --- A rule ------------------------------------------------------------------------------

  private ruleForm(r: HTMLElement, rule: SargeRule): void {
    r.append(el('h2', undefined, `Line: ${rule.id}`));
    const nameRow = el('div', 'row');
    const name = el('input');
    name.value = rule.id;
    name.style.flex = '1';
    name.addEventListener('change', () => {
      const next = name.value.trim();
      if (!next || this.script.rules.some((x) => x !== rule && x.id === next)) {
        name.value = rule.id;
        return;
      }
      rule.id = next;
      this.sel = { kind: 'rule', id: next };
      this.restructure();
    });
    nameRow.append(el('span', 'hint', 'Name'), name);
    r.append(nameRow);

    r.append(
      this.conditions(
        'WHEN',
        () => rule.when,
        (w) => (rule.when = w),
        () => {},
      ),
    );

    r.append(el('h3', undefined, 'DO (in order)'));
    const steps = el('div');
    const drawSteps = () => {
      steps.textContent = '';
      rule.steps.forEach((st, i) => steps.append(this.stepCard(rule, st, i, drawSteps)));
    };
    drawSteps();
    r.append(steps);
    const addRow = el('div', 'row');
    addRow.append(
      this.btn('+ Say', () => {
        rule.steps.push({ k: 'say', say: [''] });
        drawSteps();
        this.changed();
      }),
      this.btn('+ Wait', () => {
        rule.steps.push({ k: 'wait', s: 2 });
        drawSteps();
        this.changed();
      }),
      this.btn('+ Set a flag', () => {
        rule.steps.push({ k: 'set', flag: this.script.flags[0] ?? '' });
        drawSteps();
        this.changed();
      }),
      this.btn('+ Clear a flag', () => {
        rule.steps.push({ k: 'clear', flag: this.script.flags[0] ?? '' });
        drawSteps();
        this.changed();
      }),
    );
    r.append(addRow);

    r.append(el('h3', undefined, 'Options'));
    const runs = el('select');
    runs.append(
      new Option('only the first time', 'once'),
      new Option('every time it becomes true', 'repeat'),
    );
    runs.value = rule.repeat ? 'repeat' : 'once';
    runs.addEventListener('change', () => {
      if (runs.value === 'repeat') rule.repeat = true;
      else delete rule.repeat;
      this.changed();
    });
    const o1 = el('div', 'row');
    o1.append(el('span', undefined, 'Runs'), runs);
    const gap = el('input');
    gap.type = 'number';
    gap.value = rule.cooldownS === undefined ? '' : String(rule.cooldownS);
    gap.placeholder = '–';
    gap.addEventListener('input', () => {
      const n = Number(gap.value);
      if (gap.value.trim() === '' || !Number.isFinite(n)) delete rule.cooldownS;
      else rule.cooldownS = n;
      this.changed();
    });
    const o2 = el('div', 'row');
    o2.append(
      el('span', undefined, 'Wait at least'),
      gap,
      el('span', undefined, 'seconds between runs'),
    );
    const flag = (key: 'urgent' | 'stop' | 'off', text: string) => {
      const l = el('label');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = !!rule[key];
      cb.addEventListener('change', () => {
        if (cb.checked) rule[key] = true;
        else delete rule[key];
        this.changed();
        if (key === 'off') this.drawLeft();
      });
      l.append(cb, document.createTextNode(text));
      const row = el('div', 'row');
      row.append(l);
      return row;
    };
    r.append(
      o1,
      o2,
      flag('urgent', 'Cut Sarge off mid-sentence to say this'),
      flag('stop', 'Rules below this one wait for the next moment (so only one of a pair runs)'),
      flag('off', 'Switched off'),
    );
    const note = el('input');
    note.style.width = '100%';
    note.placeholder = 'Note to self (Sarge never says it)';
    note.value = rule.note ?? '';
    note.addEventListener('input', () => {
      if (note.value) rule.note = note.value;
      else delete rule.note;
      this.changed();
    });
    r.append(note);
    const btns = el('div', 'row');
    btns.append(
      this.btn('↑ Earlier', () => this.moveRule(rule, -1)),
      this.btn('↓ Later', () => this.moveRule(rule, 1)),
      this.btn('Duplicate', () => {
        const copy = structuredClone(rule);
        copy.id = `${rule.id}.copy`;
        this.script.rules.splice(this.script.rules.indexOf(rule) + 1, 0, copy);
        this.select({ kind: 'rule', id: copy.id });
      }),
      this.btn('Delete', () => {
        if (!window.confirm(`Delete "${rule.id}"?`)) return;
        this.script.rules.splice(this.script.rules.indexOf(rule), 1);
        this.select(null);
      }),
    );
    r.append(
      el(
        'p',
        'hint',
        'Order matters when two lines run in the same moment: the earlier one is said first.',
      ),
      btns,
    );
  }

  private moveRule(rule: SargeRule, by: number): void {
    const list = this.script.rules;
    const i = list.indexOf(rule);
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    this.restructure();
  }

  private stepCard(rule: SargeRule, st: SargeStep, i: number, redraw: () => void): HTMLElement {
    const card = el('div', 'card');
    const head = el('div', 'row');
    const tag = { say: 'Say', wait: 'Wait', set: 'Set flag', clear: 'Clear flag' }[st.k];
    head.append(el('span', 'tag', tag));
    const spacer = el('span');
    spacer.style.flex = '1';
    head.append(spacer);
    const move = (by: number) => {
      const j = i + by;
      if (j < 0 || j >= rule.steps.length) return;
      [rule.steps[i], rule.steps[j]] = [rule.steps[j]!, rule.steps[i]!];
      redraw();
      this.changed();
    };
    head.append(
      this.btn('↑', () => move(-1), 'x'),
      this.btn('↓', () => move(1), 'x'),
      this.btn(
        '✕',
        () => {
          rule.steps.splice(i, 1);
          redraw();
          this.changed();
        },
        'x',
      ),
    );
    card.append(head);
    if (st.k === 'wait') {
      const n = el('input');
      n.type = 'number';
      n.step = '0.5';
      n.value = String(st.s);
      n.addEventListener('input', () => {
        st.s = Math.max(0, Number(n.value) || 0);
        this.changed();
      });
      const row = el('div', 'row');
      row.append(n, el('span', undefined, 'seconds, then the next step'));
      card.append(row);
    } else if (st.k === 'set' || st.k === 'clear') {
      const sel = el('select');
      for (const f of this.script.flags) sel.append(new Option(f, f));
      if (!this.script.flags.includes(st.flag))
        sel.append(new Option(`${st.flag || '—'} (?)`, st.flag));
      sel.value = st.flag;
      sel.addEventListener('change', () => {
        st.flag = sel.value;
        this.changed();
      });
      const row = el('div', 'row');
      row.append(sel);
      if (!this.script.flags.length)
        row.append(el('span', 'hint', 'Add a flag in the Flags & gates tab first.'));
      card.append(row);
    } else {
      st.say.forEach((text, v) => card.append(this.sayBox(st, text, v, redraw)));
      card.append(
        this.btn('+ another version', () => {
          st.say.push('');
          redraw();
          this.changed();
        }),
      );
      if (st.say.length > 1) card.append(el('div', 'hint', 'Versions are used one after another.'));
    }
    return card;
  }

  private sayBox(
    st: Extract<SargeStep, { k: 'say' }>,
    text: string,
    v: number,
    redraw: () => void,
  ): HTMLElement {
    const box = el('div');
    const ta = el('textarea');
    ta.value = text;
    const dur = el('span', 'hint');
    const showDur = () => {
      const secs = lineDurationMs(st.say[v] ?? '', this.script.timing) / 1000;
      dur.textContent = `≈ ${secs.toFixed(1)} s to say`;
      dur.className = secs > 5 ? 'long' : 'hint';
    };
    showDur();
    ta.addEventListener('input', () => {
      st.say[v] = ta.value;
      showDur();
      this.changed();
    });
    const wrap = (open: string, close: string) => {
      const a = ta.selectionStart;
      const b = ta.selectionEnd;
      ta.setRangeText(`${open}${ta.value.slice(a, b)}${close}`, a, b, 'end');
      ta.dispatchEvent(new Event('input'));
      ta.focus();
    };
    const bar = el('div', 'row');
    for (const [label, tag] of [
      ['Big', 'big'],
      ['Shake', 'shake'],
      ['Gold', 'gold'],
      ['Red', 'red'],
      ['Wave', 'wave'],
    ] as const) {
      const b = this.btn(label, () => wrap(`[${tag}]`, '[/]'), 'x');
      b.title = `Selected words get [${tag}]`;
      bar.append(b);
    }
    const pause = this.btn('Pause', () => wrap('[p=300]', ''), 'x');
    pause.title = 'Pauses the words for a moment (a pause tag like [p=300])';
    bar.append(pause, dur);
    if (st.say.length > 1) {
      bar.append(
        this.btn(
          '✕ this version',
          () => {
            st.say.splice(v, 1);
            redraw();
            this.changed();
          },
          'x',
        ),
      );
    }
    box.append(bar, ta);
    return box;
  }

  // --- A position --------------------------------------------------------------------------

  private prefForm(r: HTMLElement, pref: SargePref): void {
    r.append(el('h2', undefined, `Sarge stands: ${pref.id}`));
    r.append(
      el(
        'p',
        'hint',
        'While these are true, this is where Sarge likes to be. The first matching position in the list wins.',
      ),
    );
    r.append(
      this.conditions(
        'WHILE',
        () => pref.when,
        (w) => (pref.when = w),
        () => {},
      ),
    );
    r.append(el('h3', undefined, 'Sarge stands'));
    const kind = el('select');
    kind.append(
      new Option('at a spot I pick on the map', 'point'),
      new Option('in the middle of a zone', 'zone'),
      new Option('by the sandbags, opposite the next target', 'nextTarget'),
      new Option('near you', 'player'),
    );
    kind.value = pref.at.kind;
    kind.addEventListener('change', () => {
      const k = kind.value as SargeAt['kind'];
      pref.at =
        k === 'point'
          ? { kind: 'point', x: 600, y: 3600 }
          : k === 'zone'
            ? { kind: 'zone', zone: 'r1' }
            : k === 'nextTarget'
              ? { kind: 'nextTarget', x: 850 }
              : { kind: 'player', dx: -90, dy: 70 };
      this.restructure();
    });
    r.append(kind);
    const at = pref.at;
    const row = el('div', 'row');
    const num = (label: string, value: number, set: (n: number) => void) => {
      const i = el('input');
      i.type = 'number';
      i.value = String(Math.round(value));
      i.addEventListener('input', () => {
        set(Number(i.value) || 0);
        this.changed();
      });
      row.append(el('span', 'hint', label), i);
    };
    if (at.kind === 'point') {
      num('x', at.x, (n) => (at.x = n));
      num('y', at.y, (n) => (at.y = n));
      row.append(
        this.btn(
          'Pick on the map',
          () => {
            this.setTool('point');
          },
          'go',
        ),
      );
    } else if (at.kind === 'zone') {
      const z = el('select');
      for (const o of paramOptions('zone', this.script)) z.append(new Option(o.label, o.value));
      z.value = at.zone;
      z.addEventListener('change', () => {
        at.zone = z.value;
        this.changed();
      });
      row.append(z);
    } else if (at.kind === 'nextTarget') {
      num('x (west of the bags)', at.x, (n) => (at.x = n));
    } else {
      num('sideways (− is left)', at.dx, (n) => (at.dx = n));
      num('down (+ is south)', at.dy, (n) => (at.dy = n));
    }
    r.append(row);
    r.append(el('h3', undefined, 'He faces'));
    const face = el('select');
    face.append(
      new Option('toward you', 'you'),
      new Option('north', '-90'),
      new Option('east', '0'),
      new Option('south', '90'),
      new Option('west', '180'),
    );
    face.value = pref.face === null ? 'you' : String(pref.face);
    if (face.value === '' || ![...face.options].some((o) => o.value === face.value)) {
      face.append(new Option(`${pref.face}°`, String(pref.face)));
      face.value = String(pref.face);
    }
    face.addEventListener('change', () => {
      pref.face = face.value === 'you' ? null : Number(face.value);
      this.changed();
    });
    r.append(face);
    const btns = el('div', 'row');
    const move = (by: number) => {
      const list = this.script.prefs;
      const i = list.indexOf(pref);
      const j = i + by;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j]!, list[i]!];
      this.restructure();
    };
    btns.append(
      this.btn('↑ Earlier', () => move(-1)),
      this.btn('↓ Later', () => move(1)),
      this.btn('Delete', () => {
        if (!window.confirm(`Delete "${pref.id}"?`)) return;
        this.script.prefs.splice(this.script.prefs.indexOf(pref), 1);
        this.select(null);
      }),
    );
    r.append(btns);
  }

  // --- A zone ------------------------------------------------------------------------------

  private zoneForm(r: HTMLElement, zone: SargeZone): void {
    r.append(el('h2', undefined, `Zone: ${zone.name || zone.id}`));
    const nameRow = el('div', 'row');
    const name = el('input');
    name.value = zone.name;
    name.style.flex = '1';
    name.addEventListener('input', () => {
      zone.name = name.value;
      this.changed();
      this.drawLeft();
    });
    nameRow.append(el('span', 'hint', 'Name'), name);
    r.append(nameRow);
    r.append(el('p', 'hint', `id: ${zone.id} (conditions use this)`));
    const grid = el('div', 'row');
    for (const [label, key] of [
      ['x', 'x'],
      ['y', 'y'],
      ['width', 'w'],
      ['height', 'h'],
    ] as const) {
      const i = el('input');
      i.type = 'number';
      i.value = String(Math.round(zone[key]));
      i.addEventListener('input', () => {
        zone[key] = Number(i.value) || 0;
        this.changed();
      });
      grid.append(el('span', 'hint', label), i);
    }
    r.append(grid);
    r.append(el('p', 'hint', 'Or drag it on the map, and drag a corner to resize.'));
    r.append(el('h3', undefined, 'Used by'));
    const used = this.script.rules.filter((x) =>
      new RegExp(`:${zone.id}(?::|,|$)`).test(x.when.replace(/\s/g, '')),
    );
    if (!used.length)
      r.append(el('p', 'hint', 'No lines yet. Add a condition like "you walk into this zone".'));
    for (const u of used) {
      r.append(
        this.item(u.id, describeWhen(u.when, this.script), false, !!u.off, () =>
          this.select({ kind: 'rule', id: u.id }, 'lines'),
        ),
      );
    }
    r.append(
      this.btn('Delete zone', () => {
        if (
          used.length &&
          !window.confirm(`${used.length} line(s) use this zone. Delete it anyway?`)
        )
          return;
        this.script.zones.splice(this.script.zones.indexOf(zone), 1);
        this.select(null);
      }),
    );
  }

  // --- The map -----------------------------------------------------------------------------

  private resize(): void {
    const r = this.canvas.parentElement!.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    if (this.view.zoom === 0.3)
      this.view.zoom = Math.max(0.12, Math.min(0.6, (r.width - 40) / BT_W));
    this.draw();
  }

  private size(): { w: number; h: number } {
    const dpr = window.devicePixelRatio || 1;
    return { w: this.canvas.width / dpr, h: this.canvas.height / dpr };
  }

  /** Zones the selected rule or position talks about (they glow on the map). */
  private referenced(): Set<string> {
    const out = new Set<string>();
    const when =
      this.sel?.kind === 'rule'
        ? this.script.rules.find((r) => r.id === this.sel!.id)?.when
        : this.sel?.kind === 'pref'
          ? this.script.prefs.find((p) => p.id === this.sel!.id)?.when
          : undefined;
    const ids = zoneIds(this.script);
    for (const m of (when ?? '').matchAll(/(?:enter|leave|in|inFor|room):([\w-]+)/g)) {
      if (ids.has(m[1]!)) out.add(m[1]!);
    }
    return out;
  }

  private draw(): void {
    const { w, h } = this.size();
    const dpr = window.devicePixelRatio || 1;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#12161b';
    ctx.fillRect(0, 0, w, h);
    drawMap(ctx, this.view, w, h);
    const glow = this.referenced();
    const sx = (x: number) => worldToScreen(this.view, w, h, x, 0).x;
    const sy = (y: number) => worldToScreen(this.view, w, h, 0, y).y;
    const z = this.view.zoom;
    // Rooms that the selected line talks about.
    for (const r of SARGE_ROOMS) {
      if (!glow.has(r)) continue;
      const rc = BT_ROOM_RECTS[r];
      ctx.fillStyle = '#ffd34d22';
      ctx.fillRect(sx(rc.x), sy(rc.y), rc.w * z, rc.h * z);
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx(rc.x), sy(rc.y), rc.w * z, rc.h * z);
    }
    // The script's own zones.
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    for (const zone of this.script.zones) {
      const picked = this.sel?.kind === 'zone' && this.sel.id === zone.id;
      const lit = glow.has(zone.id);
      ctx.fillStyle = picked || lit ? '#ffd34d33' : '#4ea1ff2a';
      ctx.strokeStyle = picked || lit ? '#ffd34d' : '#4ea1ff';
      ctx.lineWidth = picked ? 3 : 2;
      ctx.fillRect(sx(zone.x), sy(zone.y), zone.w * z, zone.h * z);
      ctx.strokeRect(sx(zone.x), sy(zone.y), zone.w * z, zone.h * z);
      ctx.fillStyle = picked || lit ? '#ffd34d' : '#9ccbff';
      ctx.fillText(zone.name || zone.id, sx(zone.x) + 4, sy(zone.y) + 4);
      if (picked) {
        ctx.fillStyle = '#ffd34d';
        for (const [cx, cy] of this.corners(zone)) ctx.fillRect(sx(cx) - 5, sy(cy) - 5, 10, 10);
      }
    }
    // A zone being drawn.
    if (this.drag?.kind === 'new') {
      const d = this.drag;
      ctx.strokeStyle = '#ffd34d';
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(sx(d.x), sy(d.y), d.w * z, d.h * z);
      ctx.setLineDash([]);
    }
    // Sarge's spots.
    for (const p of this.script.prefs) {
      const picked = this.sel?.kind === 'pref' && this.sel.id === p.id;
      const pos = this.prefPoint(p);
      if (!pos) continue;
      const x = sx(pos.x);
      const y = sy(pos.y);
      ctx.fillStyle = picked ? '#ffd34d' : '#e8dfbd';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 9);
      ctx.lineTo(x + 8, y);
      ctx.lineTo(x, y + 9);
      ctx.lineTo(x - 8, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (picked) ctx.fillText(`Sarge: ${p.id}`, x + 11, y - 6);
    }
  }

  private corners(z: SargeZone): [number, number][] {
    return [
      [z.x, z.y],
      [z.x + z.w, z.y],
      [z.x + z.w, z.y + z.h],
      [z.x, z.y + z.h],
    ];
  }

  /** Where a position's pin is drawn (null: it has no fixed place). */
  private prefPoint(p: SargePref): { x: number; y: number } | null {
    const a = p.at;
    if (a.kind === 'point') return a;
    if (a.kind === 'zone') {
      const zone = this.script.zones.find((x) => x.id === a.zone);
      if (zone) return { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 };
      const room = BT_ROOM_RECTS[a.zone as keyof typeof BT_ROOM_RECTS] as
        { x: number; y: number; w: number; h: number } | undefined;
      return room ? { x: room.x + room.w / 2, y: room.y + room.h / 2 } : null;
    }
    return null;
  }

  private world(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const { w, h } = this.size();
    return screenToWorld(this.view, w, h, e.clientX - rect.left, e.clientY - rect.top);
  }

  private bindCanvas(): void {
    const snap = (n: number) => Math.round(n / 10) * 10;
    this.canvas.addEventListener('pointerdown', (e) => {
      const p = this.world(e);
      this.canvas.setPointerCapture(e.pointerId);
      const slop = 10 / this.view.zoom;
      if (this.tool === 'zone') {
        this.drag = { kind: 'new', x: snap(p.x), y: snap(p.y), w: 0, h: 0 };
        return;
      }
      if (this.tool === 'point') {
        const pref =
          this.sel?.kind === 'pref'
            ? this.script.prefs.find((x) => x.id === this.sel!.id)
            : undefined;
        if (pref) {
          pref.at = { kind: 'point', x: Math.round(p.x), y: Math.round(p.y) };
          this.tool = 'select';
          this.restructure();
        }
        return;
      }
      // Select: a pin, then a corner of the picked zone, then a zone, else pan.
      for (const pref of this.script.prefs) {
        const pos = this.prefPoint(pref);
        if (pos && pref.at.kind === 'point' && Math.hypot(pos.x - p.x, pos.y - p.y) < slop * 1.2) {
          this.select({ kind: 'pref', id: pref.id }, 'position');
          this.drag = { kind: 'pin', pref };
          return;
        }
      }
      const picked =
        this.sel?.kind === 'zone'
          ? this.script.zones.find((x) => x.id === this.sel!.id)
          : undefined;
      if (picked) {
        const c = this.corners(picked).findIndex(
          ([cx, cy]) => Math.hypot(cx - p.x, cy - p.y) < slop,
        );
        if (c >= 0) {
          this.drag = { kind: 'resize', zone: picked, corner: c as 0 | 1 | 2 | 3 };
          return;
        }
      }
      const hit = [...this.script.zones]
        .reverse()
        .find((z) => p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h);
      if (hit) {
        this.select({ kind: 'zone', id: hit.id }, 'zones');
        this.drag = { kind: 'move', zone: hit, dx: p.x - hit.x, dy: p.y - hit.y };
        return;
      }
      this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: this.view.cx, cy: this.view.cy };
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d) return;
      const p = this.world(e);
      if (d.kind === 'pan') {
        this.view.cx = d.cx - (e.clientX - d.sx) / this.view.zoom;
        this.view.cy = d.cy - (e.clientY - d.sy) / this.view.zoom;
      } else if (d.kind === 'new') {
        d.w = snap(p.x) - d.x;
        d.h = snap(p.y) - d.y;
      } else if (d.kind === 'move') {
        d.zone.x = snap(p.x - d.dx);
        d.zone.y = snap(p.y - d.dy);
      } else if (d.kind === 'resize') {
        const z = d.zone;
        const x2 = z.x + z.w;
        const y2 = z.y + z.h;
        const nx = snap(p.x);
        const ny = snap(p.y);
        if (d.corner === 0 || d.corner === 3) {
          z.x = Math.min(nx, x2 - 10);
          z.w = x2 - z.x;
        } else z.w = Math.max(10, nx - z.x);
        if (d.corner === 0 || d.corner === 1) {
          z.y = Math.min(ny, y2 - 10);
          z.h = y2 - z.y;
        } else z.h = Math.max(10, ny - z.y);
      } else if (d.kind === 'pin') {
        d.pref.at = { kind: 'point', x: Math.round(p.x), y: Math.round(p.y) };
      }
      this.draw();
    });
    const end = () => {
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      if (d.kind === 'new') {
        const w = Math.abs(d.w);
        const h = Math.abs(d.h);
        this.tool = 'select';
        if (w >= 20 && h >= 20) {
          const base = 'zone';
          let n = 1;
          while (zoneIds(this.script).has(`${base}-${n}`)) n++;
          const zone: SargeZone = {
            id: slug(`${base}-${n}`),
            name: `Zone ${n}`,
            x: Math.min(d.x, d.x + d.w),
            y: Math.min(d.y, d.y + d.h),
            w,
            h,
          };
          this.script.zones.push(zone);
          this.select({ kind: 'zone', id: zone.id }, 'zones');
          return;
        }
        this.render();
        return;
      }
      if (d.kind === 'move' || d.kind === 'resize' || d.kind === 'pin') {
        this.restructure();
      }
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (e.ctrlKey) {
          const before = this.world(e);
          this.view.zoom = Math.max(
            0.08,
            Math.min(1.5, this.view.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)),
          );
          const after = this.world(e);
          this.view.cx += before.x - after.x;
          this.view.cy += before.y - after.y;
        } else {
          this.view.cy += e.deltaY / this.view.zoom;
          this.view.cx += e.deltaX / this.view.zoom;
        }
        this.draw();
      },
      { passive: false },
    );
  }
}
