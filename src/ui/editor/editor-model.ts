/**
 * (PHASE13-a) Editor state and edits for blocks and scenarios ([D88]). No DOM: the view turns
 * pointer/keys into these calls. Every edit goes through `edit()`, which keeps the undo stack; a
 * drag is one undo step (`beginGesture` … `endGesture`).
 */
import { type GroundKind } from '../../content/ground';
import {
  ALWAYS_KINDS,
  MAX_MIST_COATS,
  blockCols,
  blockRows,
  isRectItem,
  newBlock,
  validSide,
  type BlockDef,
  type BlockItem,
  type CellPoint,
  type CellRect,
  type ItemKind,
  type Priority,
  type Side,
} from '../../gen/block';
import { blockTotalCost, spendBudget, type SpendResult } from '../../gen/budget';

import { EditHistory } from './edit-history';

export type Tool = 'select' | 'paint' | 'place';

/** Placement and drag snapping, in cells. */
export const SNAP = 0.5;

export const snap = (v: number) => Math.round(v / SNAP) * SNAP;

export class EditorModel {
  block: BlockDef;
  tool: Tool = 'paint';
  paintKind: GroundKind | 'mist' | 'eraseMist' = 'D';
  placeKind: ItemKind = 'rally';
  /** (PHASE13) The squad new rally points join (the last one touched). */
  activeGroup: string | null = null;
  selected: string | null = null;
  /** (13-b) The budget slider ([D85]): null = everything spawns. Not part of the block. */
  budget: number | null = null;
  /** Seed for the order within a priority (Reshuffle). */
  spendSeed = 1;
  private spendCache: {
    block: BlockDef;
    budget: number | null;
    seed: number;
    res: SpendResult;
  } | null = null;
  private history = new EditHistory<BlockDef>();
  private gesture: BlockDef | null = null;
  private readonly mistStroke = new Set<number>();
  private listeners: (() => void)[] = [];

  constructor(block: BlockDef = newBlock()) {
    this.block = block;
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  /** Something other than the block changed (tool, selection). */
  touch(): void {
    for (const fn of this.listeners) fn();
  }

  /** Replaces the block (new / open): clears history and selection. */
  load(block: BlockDef): void {
    this.block = block;
    this.history = new EditHistory<BlockDef>();
    this.selected = null;
    this.touch();
  }

  /** Applies an edit. Outside a gesture each edit is one undo step. */
  edit(next: BlockDef): void {
    if (next === this.block) return;
    if (!this.gesture) this.history.record(this.block);
    this.block = next;
    this.touch();
  }

  beginGesture(): void {
    this.gesture = this.block;
    this.mistStroke.clear();
  }

  endGesture(): void {
    if (this.gesture && this.gesture !== this.block) this.history.record(this.gesture);
    this.gesture = null;
    this.mistStroke.clear();
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  get cols(): number {
    return blockCols(this.block);
  }

  get rows(): number {
    return blockRows(this.block);
  }

  undo(): void {
    const prev = this.history.undo(this.block);
    if (!prev) return;
    this.block = prev;
    this.dropStaleSelection();
    this.touch();
  }

  redo(): void {
    const next = this.history.redo(this.block);
    if (!next) return;
    this.block = next;
    this.dropStaleSelection();
    this.touch();
  }

  private dropStaleSelection(): void {
    if (this.selected && !this.item(this.selected)) this.selected = null;
  }

  /** What spawns at the current budget (cached per block/budget/seed). */
  spend(): SpendResult {
    const c = this.spendCache;
    if (c && c.block === this.block && c.budget === this.budget && c.seed === this.spendSeed) {
      return c.res;
    }
    const res = spendBudget(this.block, this.budget, this.spendSeed);
    this.spendCache = { block: this.block, budget: this.budget, seed: this.spendSeed, res };
    return res;
  }

  totalCost(): number {
    return blockTotalCost(this.block);
  }

  item(id: string): BlockItem | undefined {
    return this.block.items.find((i) => i.id === id);
  }

  get selectedItem(): BlockItem | undefined {
    return this.selected ? this.item(this.selected) : undefined;
  }

  select(id: string | null): void {
    this.selected = id;
    const g = id ? this.item(id)?.group : undefined;
    if (g) this.activeGroup = g;
    this.touch();
  }

  // ---- Ground and edges

  /** Paints one tile. Returns whether anything changed. */
  paint(col: number, row: number): boolean {
    const { cols, rows } = this;
    if (col < 0 || row < 0 || col >= cols || row >= rows) return false;
    if (this.paintKind === 'mist' || this.paintKind === 'eraseMist') {
      const key = row * cols + col;
      if (this.gesture && this.mistStroke.has(key)) return false;
      if (this.gesture) this.mistStroke.add(key);
      const mist = this.block.mist
        ? [...this.block.mist]
        : Array<string>(rows).fill('0'.repeat(cols));
      const line = mist[row]!;
      const depth = Number(line[col]);
      const next = this.paintKind === 'eraseMist' ? 0 : Math.min(MAX_MIST_COATS, depth + 1);
      if (next === depth) return false;
      mist[row] = line.slice(0, col) + next + line.slice(col + 1);
      this.edit({ ...this.block, mist: mist.some((r) => /[1-3]/.test(r)) ? mist : undefined });
      return true;
    }
    const line = this.block.ground[row]!;
    if (line[col] === this.paintKind) return false;
    const ground = [...this.block.ground];
    ground[row] = line.slice(0, col) + this.paintKind + line.slice(col + 1);
    this.edit({ ...this.block, ground });
    return true;
  }

  /**
   * (PHASE13) Paints a side's outer row of tiles with a preset edge ([D101]), read clockwise:
   * north west→east, east north→south, south east→west, west south→north.
   */
  applyEdgePreset(side: Side, profile: string): void {
    const n = profile.length;
    if (this.cols !== n || this.rows !== n) return;
    const rows = this.block.ground.map((r) => [...r]);
    for (let i = 0; i < n; i++) {
      const ch = profile[i]!;
      if (side === 'n') rows[0]![i] = ch;
      else if (side === 'e') rows[i]![n - 1] = ch;
      else if (side === 's') rows[n - 1]![n - 1 - i] = ch;
      else rows[n - 1 - i]![0] = ch;
    }
    this.edit({ ...this.block, ground: rows.map((r) => r.join('')) });
  }

  setMeta(patch: Partial<Pick<BlockDef, 'id' | 'name' | 'role' | 'kind'>>): void {
    const next = { ...this.block, ...patch };
    // Absent, not undefined: keeps saved JSON and the "unsaved changes" check stable.
    if (next.role === undefined) delete next.role;
    if (next.kind === undefined) delete next.kind;
    this.edit(next);
  }

  /**
   * Changes the ground to `cols` × `rows` tiles (new tiles grass), keeping the north-west
   * corner. False (nothing changes) when something placed would end up outside.
   */
  resize(cols: number, rows: number): boolean {
    if (!validSide(cols) || !validSide(rows)) return false;
    if (cols === this.cols && rows === this.rows) return true;
    const fits = this.block.items.every((it) => {
      const [x, y, w, h] = isRectItem(it) ? it.rect : [...it.at, 0, 0];
      return (
        x + w <= cols + 1e-8 && y + h <= rows + 1e-8 && (isRectItem(it) || (x < cols && y < rows))
      );
    });
    if (!fits) return false;
    const fit = (lines: readonly string[], pad: string) =>
      Array.from({ length: rows }, (_, y) => (lines[y] ?? '').slice(0, cols).padEnd(cols, pad));
    const next: BlockDef = { ...this.block, ground: fit(this.block.ground, 'G') };
    if (this.block.mist) next.mist = fit(this.block.mist, '0');
    // A resized map is tiles again: an exact extent only described the old edge.
    delete next.extent;
    this.edit(next);
    return true;
  }

  // ---- Items

  // ---- Squads ([Q54])

  group(id: string) {
    return this.block.groups.find((g) => g.id === id);
  }

  /** A new squad (two riflemen to start) that new rally points join. */
  addGroup(): string {
    let n = this.block.groups.length + 1;
    while (this.group(`squad-${n}`)) n++;
    const id = `squad-${n}`;
    this.activeGroup = id;
    this.edit({
      ...this.block,
      groups: [
        ...this.block.groups,
        {
          id,
          units: [
            { role: 'rifleman', priority: 1 },
            { role: 'rifleman', priority: 2 },
          ],
        },
      ],
    });
    return id;
  }

  setGroupUnits(id: string, units: BlockDef['groups'][number]['units']): void {
    this.edit({
      ...this.block,
      groups: this.block.groups.map((g) => (g.id === id ? { ...g, units } : g)),
    });
  }

  /** Renames a squad, taking its rally points and held capture point along. */
  renameGroup(id: string, to: string): void {
    if (!to || to === id || this.group(to)) return;
    this.edit({
      ...this.block,
      groups: this.block.groups.map((g) => (g.id === id ? { ...g, id: to } : g)),
      items: this.block.items.map((i) => (i.group === id ? ({ ...i, group: to } as BlockItem) : i)),
    });
    if (this.activeGroup === id) this.activeGroup = to;
  }

  /** Deletes a squad and its rally points (a capture point it held stays, unheld). */
  deleteGroup(id: string): void {
    if (this.activeGroup === id) this.activeGroup = null;
    if (this.selected && this.item(this.selected)?.group === id) this.selected = null;
    this.edit({
      ...this.block,
      groups: this.block.groups.filter((g) => g.id !== id),
      items: this.block.items.flatMap((i) => {
        if (i.group !== id) return [i];
        if (i.kind === 'rally') return [];
        const { group: _g, ...rest } = i;
        void _g;
        return [rest as BlockItem];
      }),
    });
  }

  /** Places a new thing of `placeKind` centred on (x, y) and selects it. */
  place(x: number, y: number): BlockItem {
    // A rally point joins the active squad, or starts one.
    if (this.placeKind === 'rally' && !(this.activeGroup && this.group(this.activeGroup))) {
      this.beginGesture();
      this.addGroup();
      const it = this.placeItem(x, y);
      this.endGesture();
      return it;
    }
    return this.placeItem(x, y);
  }

  private placeItem(x: number, y: number): BlockItem {
    const it = defaultItem(this.placeKind, this.freshId(this.placeKind), snap(x), snap(y), this);
    this.edit({ ...this.block, items: [...this.block.items, it] });
    this.selected = it.id;
    this.touch();
    return it;
  }

  /**
   * Adds a drawn thing (the drag tools: walls, cover, areas, props…) with a fresh id and the
   * default priority, and selects it.
   */
  addItem(item: DistributiveOmit<BlockItem, 'id' | 'priority'>): BlockItem {
    const it = {
      ...item,
      id: this.freshId(item.kind),
      priority: ALWAYS_KINDS.has(item.kind) || !PRICED.has(item.kind) ? 0 : 1,
    } as BlockItem;
    this.edit({ ...this.block, items: [...this.block.items, it] });
    this.selected = it.id;
    this.touch();
    return it;
  }

  /** Deletes one thing by id. */
  deleteItem(id: string): void {
    if (this.selected === id) this.selected = null;
    this.edit({ ...this.block, items: this.block.items.filter((i) => i.id !== id) });
  }

  freshId(kind: ItemKind): string {
    for (let n = 1; ; n++) {
      const id = `${kind}-${n}`;
      if (!this.item(id)) return id;
    }
  }

  updateItem(id: string, patch: Partial<BlockItem>): void {
    const items = this.block.items.map((i) =>
      i.id === id ? ({ ...i, ...patch } as BlockItem) : i,
    );
    this.edit({ ...this.block, items });
  }

  /** Renames an item, keeping levers that open it pointed at it. */
  renameItem(id: string, to: string): void {
    if (!to || to === id || this.item(to)) return;
    const items = this.block.items.map((i) => {
      let out = i.id === id ? ({ ...i, id: to } as BlockItem) : i;
      if (out.kind === 'lever' && out.target === id) out = { ...out, target: to };
      return out;
    });
    this.edit({ ...this.block, items });
    if (this.selected === id) this.selected = to;
  }

  /** Moves an item so its anchor point (rect: top-left, point: position) is at (x, y), snapped. */
  moveItemTo(id: string, x: number, y: number): void {
    const it = this.item(id);
    if (!it) return;
    const sx = snap(x);
    const sy = snap(y);
    if (isRectItem(it)) {
      const [, , w, h] = it.rect;
      if (it.rect[0] === sx && it.rect[1] === sy) return;
      this.updateItem(id, { rect: [sx, sy, w, h] });
    } else {
      if (it.at[0] === sx && it.at[1] === sy) return;
      this.updateItem(id, { at: [sx, sy] as CellPoint });
    }
  }

  deleteSelected(): void {
    const id = this.selected;
    if (!id) return;
    this.selected = null;
    this.edit({ ...this.block, items: this.block.items.filter((i) => i.id !== id) });
  }

  /** Rects swap width and height around their centre; facings turn 45° clockwise. */
  rotateSelected(): void {
    const it = this.selectedItem;
    if (!it) return;
    if (isRectItem(it)) {
      const [x, y, w, h] = it.rect;
      const cx = x + w / 2;
      const cy = y + h / 2;
      this.updateItem(it.id, { rect: [cx - h / 2, cy - w / 2, h, w] });
    } else if ('facing' in it) {
      this.updateItem(it.id, { facing: (it.facing + 45) % 360 });
    }
  }

  /**
   * The topmost thing under (x, y) in cells: points first (they sit on top), then rects.
   * `only` limits it to some things (the view's current layer).
   */
  hitTest(x: number, y: number, only?: (it: BlockItem) => boolean): BlockItem | undefined {
    const items = [...this.block.items].reverse().filter((i) => !only || only(i));
    const pts = items.find((i) => !isRectItem(i) && Math.hypot(i.at[0] - x, i.at[1] - y) <= 0.45);
    if (pts) return pts;
    return items.find((i) => {
      if (!isRectItem(i)) return false;
      const [rx, ry, w, h] = i.rect;
      const pad = 0.15; // thin walls are still clickable
      return x >= rx - pad && x <= rx + w + pad && y >= ry - pad && y <= ry + h + pad;
    });
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Things a budget pays for: new ones start at priority 1 ([D85]). */
const PRICED: ReadonlySet<ItemKind> = new Set(['turret', 'mine']);

/** A new item with sensible defaults (the author tweaks them in the panel). */
export function defaultItem(
  kind: ItemKind,
  id: string,
  x: number,
  y: number,
  model?: EditorModel,
): BlockItem {
  const base = { id, priority: (ALWAYS_KINDS.has(kind) ? 0 : 1) as Priority };
  switch (kind) {
    case 'wall':
      return { ...base, priority: 0, kind, rect: [snap(x - 1), snap(y - 0.25), 2, 0.5] };
    case 'cover':
      return {
        ...base,
        priority: 0,
        kind,
        rect: [snap(x - 1.25), snap(y - 0.25), 2.5, 0.5],
        material: 'sandbags',
      };
    case 'bush':
    case 'trench':
      return { ...base, priority: 0, kind, rect: [snap(x - 1.5), snap(y - 0.75), 3, 1.5] };
    case 'gate':
      return { ...base, priority: 0, kind, rect: [snap(x - 1.5), snap(y - 0.25), 3, 0.5] };
    case 'lever': {
      const gate = model?.block.items.find((i) => i.kind === 'gate');
      return { ...base, priority: 0, kind, at: [x, y], target: gate?.id ?? '' };
    }
    case 'turret':
      return { ...base, priority: 2, kind, at: [x, y], facing: 90 };
    case 'mine':
      return { ...base, priority: 3, kind, at: [x, y] };
    case 'rally':
      return { ...base, kind, at: [x, y], group: model?.activeGroup ?? 'squad-1' };
    case 'capture':
    case 'objective':
    case 'spawn':
      return { ...base, kind, at: [x, y] };
    case 'raised':
    case 'water':
    case 'mist':
      return { ...base, priority: 0, kind, rect: rectAround(x, y, 2, 2) };
    case 'target':
      return { ...base, priority: 0, kind, rect: rectAround(x, y, 1, 1) };
    case 'ladder':
      return {
        ...base,
        priority: 0,
        kind,
        rect: rectAround(x, y, 1, 2),
        bottom: [0.5, 0.85],
        top: [0.5, 0.15],
      };
    case 'prop':
      return { ...base, priority: 0, kind, rect: rectAround(x, y, 1, 1), image: 'hub_banner' };
  }
}

function rectAround(x: number, y: number, w: number, h: number): CellRect {
  return [snap(x - w / 2), snap(y - h / 2), w, h];
}
