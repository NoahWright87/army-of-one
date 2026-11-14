/**
 * (PHASE13-a) Block editor state and edits ([D88]). No DOM: the view turns pointer/keys into
 * these calls. Every edit goes through `edit()`, which keeps the undo stack; a drag is one undo
 * step (`beginGesture` … `endGesture`).
 */
import { BLOCK_CELLS, type EdgeTag, type GroundKind } from '../../content/ground';
import {
  ALWAYS_KINDS,
  applyEdges,
  edgeLock,
  isRectItem,
  newBlock,
  type BlockDef,
  type BlockItem,
  type CellPoint,
  type ItemKind,
  type Priority,
  type Side,
} from '../../gen/block';
import { blockTotalCost, spendBudget, type SpendResult } from '../../gen/budget';

export type Tool = 'select' | 'paint' | 'place';

/** Placement and drag snapping, in cells. */
export const SNAP = 0.5;
const UNDO_LIMIT = 200;

export const snap = (v: number) => Math.round(v / SNAP) * SNAP;

export class EditorModel {
  block: BlockDef;
  tool: Tool = 'paint';
  paintKind: GroundKind = 'D';
  placeKind: ItemKind = 'soldier';
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
  private undoStack: BlockDef[] = [];
  private redoStack: BlockDef[] = [];
  private gesture: BlockDef | null = null;
  private listeners: (() => void)[] = [];

  constructor(block: BlockDef = newBlock()) {
    this.block = applyEdges(block);
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
    this.block = applyEdges(block);
    this.undoStack = [];
    this.redoStack = [];
    this.selected = null;
    this.touch();
  }

  /** Applies an edit. Outside a gesture each edit is one undo step. */
  edit(next: BlockDef): void {
    if (next === this.block) return;
    if (!this.gesture) this.pushUndo(this.block);
    this.block = next;
    this.touch();
  }

  beginGesture(): void {
    this.gesture = this.block;
  }

  endGesture(): void {
    if (this.gesture && this.gesture !== this.block) this.pushUndo(this.gesture);
    this.gesture = null;
  }

  private pushUndo(b: BlockDef): void {
    this.undoStack.push(b);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.block);
    this.block = prev;
    this.dropStaleSelection();
    this.touch();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.block);
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
    this.touch();
  }

  // ---- Ground and edges

  /** Paints one cell; cells set by an edge tag are locked. Returns whether anything changed. */
  paint(col: number, row: number): boolean {
    const n = BLOCK_CELLS;
    if (col < 0 || row < 0 || col >= n || row >= n) return false;
    if (edgeLock(this.block.edges, col, row)) return false;
    const line = this.block.ground[row]!;
    if (line[col] === this.paintKind) return false;
    const ground = [...this.block.ground];
    ground[row] = line.slice(0, col) + this.paintKind + line.slice(col + 1);
    this.edit({ ...this.block, ground });
    return true;
  }

  setEdge(side: Side, tag: EdgeTag): void {
    this.edit(applyEdges({ ...this.block, edges: { ...this.block.edges, [side]: tag } }));
  }

  setMeta(patch: Partial<Pick<BlockDef, 'id' | 'name'>>): void {
    this.edit({ ...this.block, ...patch });
  }

  // ---- Items

  /** Places a new thing of `placeKind` centred on (x, y) and selects it. */
  place(x: number, y: number): BlockItem {
    const it = defaultItem(this.placeKind, this.freshId(this.placeKind), snap(x), snap(y), this);
    this.edit({ ...this.block, items: [...this.block.items, it] });
    this.selected = it.id;
    this.touch();
    return it;
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

  /** The topmost thing under (x, y) in cells: points first (they sit on top), then rects. */
  hitTest(x: number, y: number): BlockItem | undefined {
    const items = [...this.block.items].reverse();
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
    case 'soldier':
      return { ...base, kind, at: [x, y], role: 'rifleman', facing: 90 };
    case 'capture':
    case 'objective':
      return { ...base, kind, at: [x, y] };
  }
}
