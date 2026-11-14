/**
 * (PHASE13-a) Block editor screen ([D88]): tools on the left, the block on a 2D canvas in the
 * middle, block settings / the selected thing / problems / file actions on the right.
 * Desktop first (mouse + keyboard). Plays the block in the real game via `actions.play`.
 */
import {
  BLOCK_CELLS,
  EDGE_TAGS,
  EDGE_TAG_IDS,
  GROUND,
  GROUND_KINDS,
  type EdgeTag,
} from '../../content/ground';
import { ROLES } from '../../content/roles';
import { str, strDynamic, type StringKey } from '../../content/strings';
import type { RoleId } from '../../contracts/mission';
import {
  ALWAYS_KINDS,
  edgeLock,
  groupIds,
  isRectItem,
  ITEM_KINDS,
  PRIORITIES,
  SIDES,
  validateBlock,
  type BlockItem,
  type Priority,
  type Side,
} from '../../gen/block';
import type { CoverMaterial } from '../../sim/world/map';
import { el, injectStyle } from '../dom';
import type { EditorModel } from './editor-model';
import { snap, type Tool } from './editor-model';

export interface EditorActions {
  newBlock(): void;
  download(): void;
  copy(): Promise<boolean>;
  upload(file: File): void;
  play(): void;
}

const MATERIALS: CoverMaterial[] = [
  'sandbags',
  'crate',
  'halfWall',
  'fence',
  'window',
  'bunkerWindow',
];
const FACINGS = [0, 45, 90, 135, 180, 225, 270, 315];
const MARGIN = 26;

const COVER_COLOR: Record<CoverMaterial, string> = {
  sandbags: '#b39b6b',
  crate: '#8a6a3d',
  halfWall: '#9a9a92',
  fence: '#d0d0d0',
  window: '#6fa0c0',
  bunkerWindow: '#4a4f55',
};

const css = `
.aoo-ed { position: fixed; inset: 0; display: grid; grid-template-columns: 210px 1fr 300px;
  font: 13px/1.35 system-ui, sans-serif; color: #e7e9ec; background: #111418; }
.aoo-ed aside { overflow-y: auto; padding: 10px; background: #181c21; }
.aoo-ed aside.left { border-right: 1px solid #262c33; }
.aoo-ed aside.right { border-left: 1px solid #262c33; }
.aoo-ed h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #8b95a1;
  margin: 14px 0 6px; }
.aoo-ed h2:first-child { margin-top: 0; }
.aoo-ed .stage { position: relative; overflow: hidden; }
.aoo-ed canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
.aoo-ed button, .aoo-ed select, .aoo-ed input { font: inherit; color: inherit; background: #232930;
  border: 1px solid #343c46; border-radius: 4px; padding: 4px 6px; }
.aoo-ed button { cursor: pointer; }
.aoo-ed label input, .aoo-ed label select, .aoo-ed .grid2 input { width: 100%; min-width: 0;
  box-sizing: border-box; }
.aoo-ed label.inline input { width: auto; }
.aoo-ed button:hover { background: #2c343d; }
.aoo-ed button.on { background: #2f5b86; border-color: #4a86bd; }
.aoo-ed .col { display: flex; flex-direction: column; gap: 4px; }
.aoo-ed .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.aoo-ed .swatch { display: flex; align-items: center; gap: 6px; text-align: left; }
.aoo-ed .swatch i { width: 14px; height: 14px; border-radius: 2px; display: inline-block;
  border: 1px solid #0006; }
.aoo-ed label { display: flex; flex-direction: column; gap: 2px; margin-bottom: 6px;
  color: #aeb6c0; }
.aoo-ed label.inline { flex-direction: row; align-items: center; gap: 6px; }
.aoo-ed .hint { color: #7d8792; font-size: 12px; }
.aoo-ed .problems li { color: #f0b37e; margin-bottom: 4px; cursor: pointer; }
.aoo-ed .problems { padding-left: 16px; margin: 0; }
.aoo-ed .ok { color: #8fd18f; }
.aoo-ed .play { background: #2f7a3d; border-color: #3f9a50; font-weight: 600; padding: 8px; }
.aoo-ed .play:hover { background: #378a47; }
`;

export class EditorView {
  readonly root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private left: HTMLElement;
  private right: HTMLElement;
  private cellPx = 32;
  private origin = { x: MARGIN, y: MARGIN };
  private hover: { x: number; y: number } | null = null;
  private drag: { id: string; dx: number; dy: number } | null = null;
  private painting = false;

  constructor(
    host: HTMLElement,
    private readonly model: EditorModel,
    private readonly actions: EditorActions,
  ) {
    injectStyle('aoo-editor', css);
    this.root = el('div', 'aoo-ed');
    this.left = el('aside', 'left');
    this.right = el('aside', 'right');
    const stage = el('div', 'stage');
    this.canvas = el('canvas');
    stage.append(this.canvas);
    this.root.append(this.left, stage, this.right);
    host.append(this.root);
    this.ctx = this.canvas.getContext('2d')!;

    new ResizeObserver(() => this.draw()).observe(stage);
    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', () => this.onUp());
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.draw();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    model.onChange(() => this.refresh());
    this.refresh();
  }

  private refresh(): void {
    this.renderLeft();
    this.renderRight();
    this.draw();
  }

  // ---------------------------------------------------------------- input

  private toCell(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - this.origin.x) / this.cellPx,
      y: (e.clientY - r.top - this.origin.y) / this.cellPx,
    };
  }

  private onDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    const p = this.toCell(e);
    const m = this.model;
    if (m.tool === 'paint') {
      m.beginGesture();
      this.painting = true;
      m.paint(Math.floor(p.x), Math.floor(p.y));
      return;
    }
    const hit = m.hitTest(p.x, p.y);
    if (m.tool === 'place' && !hit) {
      if (p.x < 0 || p.y < 0 || p.x > BLOCK_CELLS || p.y > BLOCK_CELLS) return;
      m.place(p.x, p.y);
      return;
    }
    if (!hit) {
      m.select(null);
      return;
    }
    m.select(hit.id);
    const [ax, ay] = isRectItem(hit) ? hit.rect : hit.at;
    this.drag = { id: hit.id, dx: p.x - ax, dy: p.y - ay };
    m.beginGesture();
  }

  private onMove(e: PointerEvent): void {
    const p = this.toCell(e);
    this.hover = p;
    if (this.painting) this.model.paint(Math.floor(p.x), Math.floor(p.y));
    else if (this.drag) this.model.moveItemTo(this.drag.id, p.x - this.drag.dx, p.y - this.drag.dy);
    this.draw();
  }

  private onUp(): void {
    if (this.painting || this.drag) this.model.endGesture();
    this.painting = false;
    this.drag = null;
  }

  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    const m = this.model;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) m.redo();
      else m.undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      m.redo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      m.deleteSelected();
    } else if (e.key.toLowerCase() === 'r' && !mod) {
      m.rotateSelected();
    } else if (e.key === 'Escape') {
      m.select(null);
    }
  }

  // ---------------------------------------------------------------- left: tools

  private renderLeft(): void {
    const m = this.model;
    const box = this.left;
    box.replaceChildren();
    box.append(el('h2', '', str('editor.tools')));
    const tools = el('div', 'col');
    const tool = (t: Tool, key: StringKey) => {
      const b = el('button', m.tool === t ? 'on' : '', str(key));
      b.onclick = () => {
        m.tool = t;
        m.touch();
      };
      tools.append(b);
    };
    tool('select', 'editor.tool.select');
    tool('paint', 'editor.tool.paint');
    tool('place', 'editor.tool.place');
    box.append(tools);

    box.append(el('h2', '', str('editor.ground')));
    const ground = el('div', 'grid2');
    for (const k of GROUND_KINDS) {
      const b = el('button', `swatch ${m.tool === 'paint' && m.paintKind === k ? 'on' : ''}`);
      const i = el('i');
      i.style.background = hex(GROUND[k].color);
      b.append(i, document.createTextNode(strDynamic(GROUND[k].nameKey)));
      b.onclick = () => {
        m.tool = 'paint';
        m.paintKind = k;
        m.touch();
      };
      ground.append(b);
    }
    box.append(ground);

    box.append(el('h2', '', str('editor.place')));
    const things = el('div', 'col');
    for (const { kind } of ITEM_KINDS) {
      const b = el(
        'button',
        m.tool === 'place' && m.placeKind === kind ? 'on' : '',
        strDynamic(`editor.kind.${kind}`),
      );
      b.onclick = () => {
        m.tool = 'place';
        m.placeKind = kind;
        m.touch();
      };
      things.append(b);
    }
    box.append(things);
    box.append(el('p', 'hint', str('editor.help')));
  }

  // ---------------------------------------------------------------- right: block, selection, file

  private renderRight(): void {
    const m = this.model;
    // Fields commit on change (Enter / leaving the field), never per keystroke, so rebuilding
    // here never eats half-typed text.
    const box = this.right;
    box.replaceChildren();

    box.append(el('h2', '', str('editor.block')));
    box.append(
      field(
        str('editor.blockName'),
        input(m.block.name, (v) => m.setMeta({ name: v })),
      ),
      field(
        str('editor.blockId'),
        input(m.block.id, (v) => v.trim() && m.setMeta({ id: v.trim() })),
      ),
    );
    box.append(el('h2', '', str('editor.edges')));
    const edges = el('div', 'grid2');
    for (const side of SIDES) {
      edges.append(
        field(
          str(`editor.edge.${side}` as StringKey),
          select(
            EDGE_TAG_IDS.map((t) => [t, strDynamic(EDGE_TAGS[t].nameKey)]),
            m.block.edges[side],
            (v) => m.setEdge(side as Side, v as EdgeTag),
          ),
        ),
      );
    }
    box.append(edges);

    box.append(el('h2', '', str('editor.selected')));
    box.append(this.selectionPanel());

    box.append(el('h2', '', str('editor.problems')));
    box.append(el('div', 'problems-host'));
    this.renderProblems();

    box.append(el('h2', '', str('editor.file')));
    const file = el('div', 'col');
    const play = el('button', 'play', str('editor.play'));
    play.onclick = () => this.actions.play();
    const dl = el('button', '', str('editor.download'));
    dl.onclick = () => this.actions.download();
    const cp = el('button', '', str('editor.copy'));
    cp.onclick = () => {
      void this.actions.copy().then((ok) => {
        if (ok) cp.textContent = str('editor.copied');
        setTimeout(() => (cp.textContent = str('editor.copy')), 1200);
      });
    };
    const up = el('input');
    up.type = 'file';
    up.accept = '.json,application/json';
    up.style.display = 'none';
    up.onchange = () => {
      const f = up.files?.[0];
      if (f) this.actions.upload(f);
      up.value = '';
    };
    const open = el('button', '', str('editor.upload'));
    open.onclick = () => up.click();
    const fresh = el('button', '', str('editor.new'));
    fresh.onclick = () => this.actions.newBlock();
    file.append(play, dl, cp, open, up, fresh);
    box.append(file);
  }

  private renderProblems(): void {
    const host = this.right.querySelector('.problems-host');
    if (!host) return;
    const problems = validateBlock(this.model.block);
    if (!problems.length) {
      host.replaceChildren(el('p', 'ok', str('editor.noProblems')));
      return;
    }
    const ul = el('ul', 'problems');
    for (const p of problems) {
      const li = el('li', '', strDynamic(p.key, p.params));
      if (p.itemId) li.onclick = () => this.model.select(p.itemId!);
      ul.append(li);
    }
    host.replaceChildren(ul);
  }

  private selectionPanel(): HTMLElement {
    const m = this.model;
    const it = m.selectedItem;
    const box = el('div');
    if (!it) {
      box.append(el('p', 'hint', str('editor.nothingSelected')));
      return box;
    }
    box.append(
      el('div', 'hint', strDynamic(`editor.kind.${it.kind}`)),
      field(
        str('editor.prop.id'),
        input(it.id, (v) => m.renameItem(it.id, v.trim())),
      ),
    );
    if (!ALWAYS_KINDS.has(it.kind)) {
      box.append(
        field(
          str('editor.prop.priority'),
          select(
            PRIORITIES.map((p) => [String(p), String(p)]),
            String(it.priority),
            (v) => m.updateItem(it.id, { priority: Number(v) as Priority }),
          ),
        ),
        el('div', 'hint', str('editor.prop.priorityHint')),
      );
    }
    const groups = groupIds(m.block);
    const g = input(it.group ?? '', (v) =>
      m.updateItem(it.id, {
        group: v.trim() || undefined,
        anchor: v.trim() ? it.anchor : undefined,
      }),
    );
    const listId = 'aoo-ed-groups';
    g.setAttribute('list', listId);
    const dl = el('datalist');
    dl.id = listId;
    for (const name of groups) {
      const o = el('option');
      o.value = name;
      dl.append(o);
    }
    box.append(field(str('editor.prop.group'), g), dl);
    if (it.group) {
      box.append(
        checkbox(str('editor.prop.anchor'), !!it.anchor, (on) => {
          // One anchor per group: taking it clears the others.
          const items = m.block.items.map((i) =>
            i.group === it.group
              ? ({ ...i, anchor: i.id === it.id ? on || undefined : undefined } as BlockItem)
              : i,
          );
          m.edit({ ...m.block, items });
        }),
      );
    }

    if (it.kind === 'soldier') {
      box.append(
        field(
          str('editor.prop.role'),
          select(
            ROLES.map((r) => [r.id, str(r.nameKey)]),
            it.role,
            (v) => m.updateItem(it.id, { role: v as RoleId }),
          ),
        ),
      );
    }
    if (it.kind === 'cover') {
      box.append(
        field(
          str('editor.prop.material'),
          select(
            MATERIALS.map((x) => [x, strDynamic(`editor.material.${x}`)]),
            it.material,
            (v) => m.updateItem(it.id, { material: v as CoverMaterial }),
          ),
        ),
      );
    }
    if (it.kind === 'soldier' || it.kind === 'turret') {
      box.append(
        field(
          str('editor.prop.facing'),
          select(
            FACINGS.map((d) => [String(d), strDynamic(`editor.facing.${d}`)]),
            String((((Math.round(it.facing / 45) * 45) % 360) + 360) % 360),
            (v) => m.updateItem(it.id, { facing: Number(v) }),
          ),
        ),
      );
    }
    if (it.kind === 'gate') {
      box.append(
        checkbox(str('editor.prop.open'), !!it.open, (on) => m.updateItem(it.id, { open: on })),
      );
    }
    if (it.kind === 'lever') {
      const gates = m.block.items.filter((i) => i.kind === 'gate');
      box.append(
        field(
          str('editor.prop.target'),
          select(
            [['', str('editor.none')], ...gates.map((x) => [x.id, x.id] as [string, string])],
            it.target,
            (v) => m.updateItem(it.id, { target: v }),
          ),
        ),
      );
    }
    if (isRectItem(it)) {
      const [x, y, w, h] = it.rect;
      const size = el('div', 'grid2');
      size.append(
        numberInput(w, (v) => m.updateItem(it.id, { rect: [x, y, v, h] })),
        numberInput(h, (v) => m.updateItem(it.id, { rect: [x, y, w, v] })),
      );
      box.append(field(str('editor.prop.size'), size));
    }
    const pos = el('div', 'grid2');
    const [px, py] = isRectItem(it) ? it.rect : it.at;
    pos.append(
      numberInput(px, (v) => m.moveItemTo(it.id, v, py)),
      numberInput(py, (v) => m.moveItemTo(it.id, px, v)),
    );
    box.append(field(str('editor.prop.position'), pos));

    const row = el('div', 'grid2');
    const rot = el('button', '', str('editor.rotate'));
    rot.onclick = () => m.rotateSelected();
    const del = el('button', '', str('editor.delete'));
    del.onclick = () => m.deleteSelected();
    row.append(rot, del);
    box.append(row);
    return box;
  }

  // ---------------------------------------------------------------- canvas

  private draw(): void {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const n = BLOCK_CELLS;
    this.cellPx = Math.max(8, Math.floor(Math.min(w - 2 * MARGIN, h - 2 * MARGIN) / n));
    const size = this.cellPx * n;
    this.origin = { x: Math.round((w - size) / 2), y: Math.round((h - size) / 2) };
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(this.origin.x, this.origin.y);
    const cp = this.cellPx;
    const block = this.model.block;

    // Ground.
    for (let r = 0; r < n; r++) {
      for (let col = 0; col < n; col++) {
        const k = block.ground[r]?.[col] ?? 'G';
        ctx.fillStyle = hex(GROUND[k as keyof typeof GROUND]?.color ?? 0x000000);
        ctx.fillRect(col * cp, r * cp, cp, cp);
        if (edgeLock(block.edges, col, r)) {
          // Locked by the edge tag: light stripes.
          ctx.save();
          ctx.beginPath();
          ctx.rect(col * cp, r * cp, cp, cp);
          ctx.clip();
          ctx.strokeStyle = 'rgba(255,255,255,0.13)';
          ctx.lineWidth = 2;
          for (let d = -cp; d < cp; d += 7) {
            ctx.beginPath();
            ctx.moveTo(col * cp + d, r * cp + cp);
            ctx.lineTo(col * cp + d + cp, r * cp);
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }
    // Grid.
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cp + 0.5, 0);
      ctx.lineTo(i * cp + 0.5, size);
      ctx.moveTo(0, i * cp + 0.5);
      ctx.lineTo(size, i * cp + 0.5);
      ctx.stroke();
    }
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);

    // Edge tag labels outside the block.
    ctx.fillStyle = '#aeb6c0';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = (s: Side) => strDynamic(EDGE_TAGS[block.edges[s]].nameKey);
    ctx.fillText(`▲ ${label('n')}`, size / 2, -MARGIN / 2);
    ctx.fillText(`${label('s')} ▼`, size / 2, size + MARGIN / 2);
    ctx.save();
    ctx.translate(size + MARGIN / 2, size / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(label('e'), 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(-MARGIN / 2, size / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(label('w'), 0, 0);
    ctx.restore();

    // Items: rects under points.
    const items = block.items;
    for (const it of items) if (isRectItem(it)) this.drawItem(it);
    for (const it of items) if (!isRectItem(it)) this.drawItem(it);

    // Lever → gate lines.
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(242,193,78,0.8)';
    ctx.lineWidth = 1.5;
    for (const it of items) {
      if (it.kind !== 'lever') continue;
      const gate = items.find((g) => g.id === it.target);
      if (!gate || !isRectItem(gate)) continue;
      const [gx, gy, gw, gh] = gate.rect;
      ctx.beginPath();
      ctx.moveTo(it.at[0] * cp, it.at[1] * cp);
      ctx.lineTo((gx + gw / 2) * cp, (gy + gh / 2) * cp);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Hover hint.
    const m = this.model;
    if (this.hover) {
      const { x, y } = this.hover;
      if (m.tool === 'paint' && x >= 0 && y >= 0 && x < n && y < n) {
        const col = Math.floor(x);
        const r = Math.floor(y);
        const locked = !!edgeLock(block.edges, col, r);
        ctx.strokeStyle = locked ? 'rgba(255,80,80,0.9)' : 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(col * cp + 1, r * cp + 1, cp - 2, cp - 2);
      } else if (m.tool === 'place') {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(snap(x) * cp, snap(y) * cp, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawItem(it: BlockItem): void {
    const ctx = this.ctx;
    const cp = this.cellPx;
    const sel = this.model.selected === it.id;
    const gc = it.group ? groupColor(it.group) : null;
    if (isRectItem(it)) {
      const [x, y, w, h] = it.rect;
      const fill =
        it.kind === 'wall' ? '#2b2f33' : it.kind === 'gate' ? '#d08a2a' : COVER_COLOR[it.material];
      ctx.globalAlpha = it.kind === 'gate' && it.open ? 0.45 : 1;
      ctx.fillStyle = fill;
      ctx.fillRect(x * cp, y * cp, w * cp, h * cp);
      ctx.globalAlpha = 1;
      ctx.lineWidth = gc ? 3 : 1.5;
      ctx.strokeStyle = gc ?? '#111';
      ctx.strokeRect(x * cp, y * cp, w * cp, h * cp);
      if (sel) {
        ctx.strokeStyle = '#ffe14d';
        ctx.lineWidth = 2;
        ctx.strokeRect(x * cp - 3, y * cp - 3, w * cp + 6, h * cp + 6);
      }
      this.badge(it, (x + w) * cp, y * cp);
      return;
    }
    const px = it.at[0] * cp;
    const py = it.at[1] * cp;
    const r = Math.max(6, cp * 0.32);
    ctx.lineWidth = 2;
    switch (it.kind) {
      case 'soldier':
      case 'turret': {
        ctx.fillStyle = it.kind === 'turret' ? '#8e2b22' : '#c9473f';
        ctx.beginPath();
        if (it.kind === 'turret') ctx.rect(px - r, py - r, 2 * r, 2 * r);
        else ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        const a = (it.facing * Math.PI) / 180;
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * r * 1.7, py + Math.sin(a) * r * 1.7);
        ctx.stroke();
        if (it.kind === 'soldier') {
          ctx.fillStyle = '#fff';
          ctx.font = `bold ${Math.max(9, Math.round(r * 0.9))}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const role = ROLES.find((x) => x.id === it.role);
          ctx.fillText(role ? str(role.nameKey).slice(0, 2) : '?', px, py + 1);
        }
        break;
      }
      case 'mine':
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath();
        ctx.arc(px, py, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'lever':
        ctx.fillStyle = '#f2c14e';
        ctx.fillRect(px - r * 0.5, py - r * 0.5, r, r);
        break;
      case 'capture':
        ctx.strokeStyle = '#7fb6ff';
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(px, py, cp * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#7fb6ff';
        ctx.beginPath();
        ctx.moveTo(px, py + r);
        ctx.lineTo(px, py - r);
        ctx.lineTo(px + r, py - r * 0.5);
        ctx.lineTo(px, py);
        ctx.fill();
        break;
      case 'objective':
        ctx.fillStyle = '#ffd34d';
        star(ctx, px, py, r);
        break;
    }
    if (gc) {
      ctx.strokeStyle = gc;
      ctx.lineWidth = it.anchor ? 4 : 2;
      ctx.beginPath();
      ctx.arc(px, py, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (sel) {
      ctx.strokeStyle = '#ffe14d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, r + 8, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.badge(it, px + r, py - r);
  }

  /** Priority (and an A for a group anchor) next to a thing; nothing for priority 0. */
  private badge(it: BlockItem, x: number, y: number): void {
    const text = `${it.priority > 0 ? it.priority : ''}${it.anchor ? 'A' : ''}`;
    if (!text) return;
    const ctx = this.ctx;
    ctx.font = 'bold 11px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 6;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x - 2, y - 8, w, 14);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 1, y - 1);
  }
}

// ---------------------------------------------------------------- helpers

function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

function groupColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 80%, 62%)`;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function field(label: string, control: HTMLElement): HTMLElement {
  const l = el('label');
  l.append(document.createTextNode(label), control);
  return l;
}

function input(value: string, onCommit: (v: string) => void): HTMLInputElement {
  const i = el('input');
  i.value = value;
  i.onchange = () => onCommit(i.value);
  return i;
}

function numberInput(value: number, onCommit: (v: number) => void): HTMLInputElement {
  const i = el('input');
  i.type = 'number';
  i.step = '0.5';
  i.value = String(value);
  i.onchange = () => {
    const v = Number(i.value);
    if (Number.isFinite(v)) onCommit(v);
  };
  return i;
}

function select(
  options: [string, string][],
  value: string,
  onChange: (v: string) => void,
): HTMLSelectElement {
  const s = el('select');
  for (const [v, text] of options) {
    const o = el('option', '', text);
    o.value = v;
    s.append(o);
  }
  s.value = value;
  s.onchange = () => onChange(s.value);
  return s;
}

function checkbox(label: string, on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const l = el('label', 'inline');
  const c = el('input');
  c.type = 'checkbox';
  c.checked = on;
  c.onchange = () => onChange(c.checked);
  l.append(c, document.createTextNode(label));
  return l;
}
