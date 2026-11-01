import type { Tuning } from '../../content/tuning';
import { distance, type Vec2 } from '../core/vec';
import type { World } from '../state';
import { dynamicBlockers } from './blockers';
import { circleOverlapsRect } from './collision';
import type { Rect } from './map';
import { simPerf } from '../perf';

/**
 * Walkability grid for pathfinding (echoes in PHASE03-a). A cell is open when a soldier
 * (`wallRadius` circle) centered on it touches no static solid and no active dynamic blocker
 * (closed gate, non-walkable bridge, turret, halted vehicle/wreck, objective).
 *
 * Static cells are computed once. Dynamic blockers are tracked as per-cell counters and synced
 * incrementally: only blockers that appeared/disappeared since the last sync touch the grid. The
 * grid lives outside `world.state` (it's derived), and syncing from state means a restored
 * snapshot just works.
 */
export interface NavGrid {
  cellSize: number;
  cols: number;
  rows: number;
  /** Soldier radius the grid is built for. */
  clearance: number;
  staticBlocked: Uint8Array;
  /** Number of active dynamic blockers covering each cell. */
  dynCount: Uint16Array;
  /** Blockers currently applied: id → (rect key, covered cells). */
  applied: Map<string, { key: string; cells: Int32Array }>;
}

export function createNavGrid(
  width: number,
  height: number,
  staticSolids: readonly Rect[],
  tuning: Tuning,
): NavGrid {
  const cellSize = tuning.nav.cellSize;
  const cols = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(height / cellSize));
  const nav: NavGrid = {
    cellSize,
    cols,
    rows,
    clearance: tuning.soldier.wallRadius,
    staticBlocked: new Uint8Array(cols * rows),
    dynCount: new Uint16Array(cols * rows),
    applied: new Map(),
  };
  for (const r of staticSolids) for (const c of cellsCovered(nav, r)) nav.staticBlocked[c] = 1;
  return nav;
}

/** Cells whose soldier-sized circle overlaps `r`. */
export function cellsCovered(nav: NavGrid, r: Rect): Int32Array {
  const { cellSize: cs, clearance: cl } = nav;
  const c0 = Math.max(0, Math.floor((r.x - cl) / cs));
  const c1 = Math.min(nav.cols - 1, Math.floor((r.x + r.w + cl) / cs));
  const r0 = Math.max(0, Math.floor((r.y - cl) / cs));
  const r1 = Math.min(nav.rows - 1, Math.floor((r.y + r.h + cl) / cs));
  const out: number[] = [];
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      if (circleOverlapsRect(cellCenter(nav, col, row), cl, r)) out.push(row * nav.cols + col);
    }
  }
  return Int32Array.from(out);
}

export function cellCenter(nav: NavGrid, col: number, row: number): Vec2 {
  return { x: (col + 0.5) * nav.cellSize, y: (row + 0.5) * nav.cellSize };
}

function indexCenter(nav: NavGrid, i: number): Vec2 {
  return cellCenter(nav, i % nav.cols, Math.floor(i / nav.cols));
}

export function cellIndexAt(nav: NavGrid, p: Vec2): number {
  const col = Math.floor(p.x / nav.cellSize);
  const row = Math.floor(p.y / nav.cellSize);
  if (col < 0 || row < 0 || col >= nav.cols || row >= nav.rows) return -1;
  return row * nav.cols + col;
}

export function isCellOpen(nav: NavGrid, i: number): boolean {
  return i >= 0 && nav.staticBlocked[i] === 0 && nav.dynCount[i] === 0;
}

/** Applies the difference between the applied blockers and `blockers`. */
export function syncNavBlockers(
  nav: NavGrid,
  blockers: readonly { id: string; rect: Rect }[],
): void {
  const wanted = new Map<string, Rect>();
  for (const b of blockers) wanted.set(b.id, b.rect);
  const key = (r: Rect) => `${r.x},${r.y},${r.w},${r.h}`;
  // Removals first (sorted ids: deterministic, though counters make order irrelevant anyway).
  for (const id of [...nav.applied.keys()].sort()) {
    const cur = nav.applied.get(id)!;
    const rect = wanted.get(id);
    if (rect && key(rect) === cur.key) continue;
    for (const c of cur.cells) nav.dynCount[c] = nav.dynCount[c]! - 1;
    nav.applied.delete(id);
  }
  for (const b of blockers) {
    if (nav.applied.has(b.id)) continue;
    const cells = cellsCovered(nav, b.rect);
    for (const c of cells) nav.dynCount[c] = nav.dynCount[c]! + 1;
    nav.applied.set(b.id, { key: key(b.rect), cells });
  }
}

/** Brings the world's nav grid up to date with its current state. Cheap when nothing changed. */
export function syncNav(world: World): NavGrid {
  syncNavBlockers(world.nav, dynamicBlockers(world));
  return world.nav;
}

/** Can a soldier stand here (per the grid)? */
export function isWalkable(world: World, pos: Vec2): boolean {
  const nav = syncNav(world);
  return isCellOpen(nav, cellIndexAt(nav, pos));
}

/** Nearest open cell to `p` within `radius` cells (ties by index), or -1. */
export function nearestOpenCell(nav: NavGrid, p: Vec2, radius: number): number {
  const i = cellIndexAt(nav, p);
  if (isCellOpen(nav, i)) return i;
  const col = Math.floor(p.x / nav.cellSize);
  const row = Math.floor(p.y / nav.cellSize);
  let best = -1;
  let bestD = Infinity;
  for (let r = -radius; r <= radius; r++) {
    for (let c = -radius; c <= radius; c++) {
      const cc = col + c;
      const rr = row + r;
      if (cc < 0 || rr < 0 || cc >= nav.cols || rr >= nav.rows) continue;
      const idx = rr * nav.cols + cc;
      if (!isCellOpen(nav, idx)) continue;
      const d = distance(p, cellCenter(nav, cc, rr));
      if (d < bestD) {
        best = idx;
        bestD = d;
      }
    }
  }
  return best;
}

/**
 * Whether a straight walk from a to b stays on open cells (sampled every quarter cell). Samples in
 * the endpoints' own cells are exempt, since a soldier hugging a wall may stand in a closed cell.
 */
export function isSegmentOpen(nav: NavGrid, a: Vec2, b: Vec2): boolean {
  const ia = cellIndexAt(nav, a);
  const ib = cellIndexAt(nav, b);
  const len = distance(a, b);
  const n = Math.ceil(len / (nav.cellSize * 0.25));
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const i = cellIndexAt(nav, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    if (i === ia || i === ib) continue;
    if (!isCellOpen(nav, i)) return false;
  }
  return true;
}

export function isSegmentWalkable(world: World, a: Vec2, b: Vec2): boolean {
  return isSegmentOpen(syncNav(world), a, b);
}

const SQRT2 = Math.SQRT2;
// Fixed neighbour order (E, W, S, N, SE, SW, NE, NW) for deterministic expansion.
const NEIGHBOURS: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [-1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, -1, SQRT2],
];

interface HeapNode {
  f: number;
  h: number;
  i: number;
}

const before = (a: HeapNode, b: HeapNode) =>
  a.f !== b.f ? a.f < b.f : a.h !== b.h ? a.h < b.h : a.i < b.i;

function heapPush(heap: HeapNode[], n: HeapNode): void {
  heap.push(n);
  let k = heap.length - 1;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (!before(heap[k]!, heap[p]!)) break;
    [heap[k], heap[p]] = [heap[p]!, heap[k]!];
    k = p;
  }
}

function heapPop(heap: HeapNode[]): HeapNode | undefined {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length > 0 && last) {
    heap[0] = last;
    let k = 0;
    for (;;) {
      const l = 2 * k + 1;
      const r = l + 1;
      let m = k;
      if (l < heap.length && before(heap[l]!, heap[m]!)) m = l;
      if (r < heap.length && before(heap[r]!, heap[m]!)) m = r;
      if (m === k) break;
      [heap[k], heap[m]] = [heap[m]!, heap[k]!];
      k = m;
    }
  }
  return top;
}

/**
 * A* over cells: 8-connected, no corner cutting (a diagonal step needs both orthogonal
 * neighbours open), octile heuristic. Ties break on (f, h, cell index): deterministic.
 * Returns cell indices from start to goal, or null.
 */
export function findCellPath(
  nav: NavGrid,
  start: number,
  goal: number,
  maxCost = Infinity,
): number[] | null {
  if (!isCellOpen(nav, start) || !isCellOpen(nav, goal)) return null;
  if (simPerf.navBuffers) return findCellPathBuffered(nav, start, goal, maxCost);
  const n = nav.cols * nav.rows;
  const g = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const gc = goal % nav.cols;
  const gr = Math.floor(goal / nav.cols);
  const heur = (i: number) => {
    const dx = Math.abs((i % nav.cols) - gc);
    const dy = Math.abs(Math.floor(i / nav.cols) - gr);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  };
  const heap: HeapNode[] = [];
  g[start] = 0;
  heapPush(heap, { f: heur(start), h: heur(start), i: start });
  for (let node = heapPop(heap); node; node = heapPop(heap)) {
    const cur = node.i;
    if (closed[cur]) continue;
    // (03-a) Bounded search: nothing cheaper is left, so the goal is out of budget.
    if (node.f > maxCost) return null;
    if (cur === goal) {
      const path: number[] = [];
      for (let c = goal; c !== -1; c = parent[c]!) path.push(c);
      return path.reverse();
    }
    closed[cur] = 1;
    const col = cur % nav.cols;
    const row = Math.floor(cur / nav.cols);
    for (const [dc, dr, cost] of NEIGHBOURS) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nr < 0 || nc >= nav.cols || nr >= nav.rows) continue;
      const ni = nr * nav.cols + nc;
      if (closed[ni] || !isCellOpen(nav, ni)) continue;
      if (dc !== 0 && dr !== 0) {
        if (!isCellOpen(nav, row * nav.cols + nc) || !isCellOpen(nav, nr * nav.cols + col))
          continue;
      }
      const ng = g[cur]! + cost;
      if (ng < g[ni]!) {
        g[ni] = ng;
        parent[ni] = cur;
        const h = heur(ni);
        heapPush(heap, { f: ng + h, h, i: ni });
      }
    }
  }
  return null;
}

// ---------- (05-b) the same A*, without per-call allocation ----------

/**
 * Reusable search buffers per grid: g/parent/closed are "reset" by bumping a generation stamp
 * instead of refilling ~110k cells per call, and the open set is a binary heap in typed arrays.
 * The heap pops entries in the same strict (f, h, cell) order as `heapPush`/`heapPop` above, and
 * that order is total on distinct entries, so the search expands the same cells in the same
 * order and returns exactly the same path.
 */
interface SearchBuffers {
  g: Float64Array;
  parent: Int32Array;
  /** `gen` when g/parent of the cell are valid for the current search. */
  seen: Uint32Array;
  /** `gen` when the cell is closed. */
  closed: Uint32Array;
  gen: number;
  hf: Float64Array;
  hh: Float64Array;
  hi: Int32Array;
  size: number;
}

const searchBuffers = new WeakMap<NavGrid, SearchBuffers>();

function buffersFor(nav: NavGrid): SearchBuffers {
  let b = searchBuffers.get(nav);
  const n = nav.cols * nav.rows;
  if (!b) {
    b = {
      g: new Float64Array(n),
      parent: new Int32Array(n),
      seen: new Uint32Array(n),
      closed: new Uint32Array(n),
      gen: 0,
      hf: new Float64Array(1024),
      hh: new Float64Array(1024),
      hi: new Int32Array(1024),
      size: 0,
    };
    searchBuffers.set(nav, b);
  }
  b.gen++;
  if (b.gen >= 0xffffffff) {
    b.seen.fill(0);
    b.closed.fill(0);
    b.gen = 1;
  }
  b.size = 0;
  return b;
}

function tBefore(b: SearchBuffers, x: number, y: number): boolean {
  const fx = b.hf[x]!;
  const fy = b.hf[y]!;
  if (fx !== fy) return fx < fy;
  const hx = b.hh[x]!;
  const hy = b.hh[y]!;
  if (hx !== hy) return hx < hy;
  return b.hi[x]! < b.hi[y]!;
}

function tSwap(b: SearchBuffers, x: number, y: number): void {
  const f = b.hf[x]!;
  b.hf[x] = b.hf[y]!;
  b.hf[y] = f;
  const h = b.hh[x]!;
  b.hh[x] = b.hh[y]!;
  b.hh[y] = h;
  const i = b.hi[x]!;
  b.hi[x] = b.hi[y]!;
  b.hi[y] = i;
}

function tPush(b: SearchBuffers, f: number, h: number, i: number): void {
  if (b.size === b.hf.length) {
    const grow = <T extends Float64Array | Int32Array>(a: T, make: (n: number) => T): T => {
      const out = make(a.length * 2);
      out.set(a);
      return out;
    };
    b.hf = grow(b.hf, (n) => new Float64Array(n));
    b.hh = grow(b.hh, (n) => new Float64Array(n));
    b.hi = grow(b.hi, (n) => new Int32Array(n));
  }
  let k = b.size++;
  b.hf[k] = f;
  b.hh[k] = h;
  b.hi[k] = i;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (!tBefore(b, k, p)) break;
    tSwap(b, k, p);
    k = p;
  }
}

/** Pops the top entry into slot `size` (read hf/hh/hi there); false when empty. */
function tPop(b: SearchBuffers): boolean {
  if (b.size === 0) return false;
  const last = --b.size;
  // Move the top to the end (as the reference pops it) and sift the old last entry down.
  tSwap(b, 0, last);
  let k = 0;
  const n = last;
  for (;;) {
    const l = 2 * k + 1;
    const r = l + 1;
    let m = k;
    if (l < n && tBefore(b, l, m)) m = l;
    if (r < n && tBefore(b, r, m)) m = r;
    if (m === k) break;
    tSwap(b, k, m);
    k = m;
  }
  return true;
}

function findCellPathBuffered(
  nav: NavGrid,
  start: number,
  goal: number,
  maxCost: number,
): number[] | null {
  const b = buffersFor(nav);
  const gen = b.gen;
  const { g, parent, seen, closed } = b;
  const cols = nav.cols;
  const gc = goal % cols;
  const gr = Math.floor(goal / cols);
  const heur = (i: number) => {
    const dx = Math.abs((i % cols) - gc);
    const dy = Math.abs(Math.floor(i / cols) - gr);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  };
  const gOf = (i: number) => (seen[i] === gen ? g[i]! : Infinity);
  g[start] = 0;
  parent[start] = -1;
  seen[start] = gen;
  tPush(b, heur(start), heur(start), start);
  while (tPop(b)) {
    const slot = b.size;
    const f = b.hf[slot]!;
    const cur = b.hi[slot]!;
    if (closed[cur] === gen) continue;
    if (f > maxCost) return null;
    if (cur === goal) {
      const path: number[] = [];
      for (let c = goal; c !== -1; c = parent[c]!) path.push(c);
      return path.reverse();
    }
    closed[cur] = gen;
    const col = cur % cols;
    const row = Math.floor(cur / cols);
    for (const [dc, dr, cost] of NEIGHBOURS) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= nav.rows) continue;
      const ni = nr * cols + nc;
      if (closed[ni] === gen || !isCellOpen(nav, ni)) continue;
      if (dc !== 0 && dr !== 0) {
        if (!isCellOpen(nav, row * cols + nc) || !isCellOpen(nav, nr * cols + col)) continue;
      }
      const ng = g[cur]! + cost;
      if (ng < gOf(ni)) {
        g[ni] = ng;
        parent[ni] = cur;
        seen[ni] = gen;
        const h = heur(ni);
        tPush(b, ng + h, h, ni);
      }
    }
  }
  return null;
}

/** Greedy string-pulling: drop every point that a straight open segment can skip. */
function smooth(nav: NavGrid, pts: Vec2[]): Vec2[] {
  if (pts.length <= 2) return pts;
  const out: Vec2[] = [pts[0]!];
  let anchor = pts[0]!;
  for (let k = 2; k < pts.length; k++) {
    if (!isSegmentOpen(nav, anchor, pts[k]!)) {
      anchor = pts[k - 1]!;
      out.push(anchor);
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

/**
 * Smoothed walkable path from `from` to `to`, including both endpoints, or null when there is
 * none. A blocked start/goal (e.g. a soldier hugging a wall) snaps to the nearest open cell within
 * `tuning.nav.snapRadiusCells`; the returned path still ends exactly at `to`.
 *
 * (03-a) `opts.maxLength` bounds the search: paths longer than that (approximately, in grid
 * terms) return null, so "can I get there in time?" queries stay cheap on a big map.
 */
export function findPath(
  world: World,
  from: Vec2,
  to: Vec2,
  opts: { maxLength?: number } = {},
): Vec2[] | null {
  const nav = syncNav(world);
  const snap = world.tuning.nav.snapRadiusCells;
  const s = nearestOpenCell(nav, from, snap);
  const g = nearestOpenCell(nav, to, snap);
  if (s < 0 || g < 0) return null;
  const a = { x: from.x, y: from.y };
  const b = { x: to.x, y: to.y };
  if (s === g || isSegmentOpen(nav, a, b)) return [a, b];
  const maxCost =
    opts.maxLength === undefined ? Infinity : opts.maxLength / nav.cellSize + 2 * SQRT2;
  const cells = findCellPath(nav, s, g, maxCost);
  if (!cells) return null;
  // Keep the snapped start/goal cell centers when the endpoints themselves sit in closed cells.
  const first = cellIndexAt(nav, a) === s ? 1 : 0;
  const last = cellIndexAt(nav, b) === g ? cells.length - 1 : cells.length;
  const pts = [a, ...cells.slice(first, last).map((c) => indexCenter(nav, c)), b];
  return smooth(nav, pts);
}

export function pathLength(path: readonly Vec2[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += distance(path[i - 1]!, path[i]!);
  return len;
}
