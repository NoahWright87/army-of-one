/**
 * (06-b) The revealed map ([D29]): which parts of the battlefield the soldiers have seen in the
 * current timeline truth, plus what is known to be there. Pure and deterministic; UI only (the
 * sim never reads it). The respawn-screen map and the in-game minimap draw from it.
 *
 * Model: the map is a grid of `cellSize` cells. Every cell a soldier was *alive* in (its lane's
 * `alive` spans, positions from its recording, sampled every `sampleTicks`) is a "visited
 * centre"; a cell is revealed if a visited centre lies within `radius` of it (optionally only
 * with line of sight past static walls). Because it follows the truth, a soldier who now dies
 * earlier un-reveals what only its lost tail saw ([D2]).
 *
 * Incremental: each lane's visited centres are cached under a signature of its alive spans and
 * recording, and the grid keeps per-cell reference counts, so `update` only re-samples lanes
 * that changed and the result always equals a full recompute.
 */
import type { Tuning } from '../content/tuning';
import type {
  CaptureTruth,
  LaneTruth,
  RecordingSegment,
  SoldierId,
  SoldierRecord,
} from '../contracts/mission';
import { compareIds } from '../sim/core/ids';
import type { Tick } from '../sim/core/time';
import type { MapDef, Rect } from '../sim/world/map';

export interface RevealOptions {
  radius: number;
  cellSize: number;
  occludeByWalls: boolean;
  sampleTicks: number;
}

/** The reveal options a mission is played with, from `tuning.reveal`. */
export function revealOptions(tuning: Pick<Tuning, 'reveal'>): RevealOptions {
  const r = tuning.reveal;
  return {
    radius: Math.max(1, r.radius),
    cellSize: Math.max(8, r.cellSize),
    occludeByWalls: r.occludeByWalls,
    sampleTicks: Math.max(1, Math.round(r.sampleTicks)),
  };
}

export function sameRevealOptions(a: RevealOptions, b: RevealOptions): boolean {
  return (
    a.radius === b.radius &&
    a.cellSize === b.cellSize &&
    a.occludeByWalls === b.occludeByWalls &&
    a.sampleTicks === b.sampleTicks
  );
}

interface LaneCache {
  sig: string;
  centres: Int32Array;
}

export class RevealGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  /** 1 = revealed. Read-only for renderers; changes bump `version`. */
  readonly revealed: Uint8Array;
  /** Bumped whenever any cell's revealed state changes. */
  version = 0;
  /** Number of revealed cells. */
  revealedCount = 0;

  /** Sources (lanes + the live layer) that visited each cell. */
  private readonly visits: Uint16Array;
  /** Occlusion mode only: visited centres whose line-of-sight disc covers each cell. */
  private readonly cover: Uint16Array;
  private readonly discDx: Int32Array;
  private readonly discDy: Int32Array;
  /** Disc half-width (in cells) for each row offset 0..R. */
  private readonly halfWidth: Int32Array;
  /** Per-row prefix counts of visited cells (dilation scratch), (cols + 1) per row. */
  private readonly prefix: Int32Array;
  /** A cell's visited state flipped since the last dilation. */
  private dirty = false;
  private readonly blocked: Uint8Array | null;
  private readonly losCache = new Map<number, Int32Array>();
  private readonly lanes = new Map<SoldierId, LaneCache>();
  private readonly liveMark: Uint8Array;
  private liveCells: number[] = [];
  /** Scratch mark for de-duplicating a lane's centres. */
  private readonly scratch: Uint8Array;

  constructor(
    readonly map: Pick<MapDef, 'width' | 'height' | 'walls'>,
    readonly options: RevealOptions,
  ) {
    const cs = options.cellSize;
    this.cellSize = cs;
    this.cols = Math.max(1, Math.ceil(map.width / cs));
    this.rows = Math.max(1, Math.ceil(map.height / cs));
    const n = this.cols * this.rows;
    this.revealed = new Uint8Array(n);
    this.visits = new Uint16Array(n);
    this.cover = new Uint16Array(n);
    this.liveMark = new Uint8Array(n);
    this.scratch = new Uint8Array(n);
    const R = Math.ceil(options.radius / cs);
    const dx: number[] = [];
    const dy: number[] = [];
    const r2 = (options.radius / cs) ** 2;
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        if (x * x + y * y <= r2) {
          dx.push(x);
          dy.push(y);
        }
      }
    }
    this.discDx = Int32Array.from(dx);
    this.discDy = Int32Array.from(dy);
    this.halfWidth = new Int32Array(R + 1);
    // -1 = this row offset is outside the disc.
    for (let y = 0; y <= R; y++)
      this.halfWidth[y] = y * y <= r2 ? Math.floor(Math.sqrt(r2 - y * y)) : -1;
    this.prefix = new Int32Array((this.cols + 1) * this.rows);
    this.blocked = options.occludeByWalls
      ? blockedCells(map.walls, cs, this.cols, this.rows)
      : null;
  }

  get cellCount(): number {
    return this.cols * this.rows;
  }

  /** Fraction of the map revealed, 0..1. */
  get fraction(): number {
    return this.revealedCount / this.cellCount;
  }

  cellAt(x: number, y: number): number {
    const cx = clampInt(Math.floor(x / this.cellSize), 0, this.cols - 1);
    const cy = clampInt(Math.floor(y / this.cellSize), 0, this.rows - 1);
    return cy * this.cols + cx;
  }

  isRevealedAt(x: number, y: number): boolean {
    return this.revealed[this.cellAt(x, y)] === 1;
  }

  /** True if any cell overlapping the rect is revealed. */
  isRectRevealed(r: Rect): boolean {
    const cs = this.cellSize;
    const x0 = clampInt(Math.floor(r.x / cs), 0, this.cols - 1);
    const x1 = clampInt(Math.floor((r.x + r.w) / cs), 0, this.cols - 1);
    const y0 = clampInt(Math.floor(r.y / cs), 0, this.rows - 1);
    const y1 = clampInt(Math.floor((r.y + r.h) / cs), 0, this.rows - 1);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) if (this.revealed[y * this.cols + x]) return true;
    return false;
  }

  /** True if any point of the segment (clipped to the map) is in a revealed cell. */
  isSegmentRevealed(ax: number, ay: number, bx: number, by: number): boolean {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(len / (this.cellSize / 2)));
    for (let i = 0; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n;
      const y = ay + ((by - ay) * i) / n;
      if (x < 0 || y < 0 || x > this.map.width || y > this.map.height) continue;
      if (this.isRevealedAt(x, y)) return true;
    }
    return false;
  }

  /**
   * Brings the grid up to date with the truth: re-samples only lanes whose alive spans or
   * recording changed, and drops lanes that are gone. Returns how many lanes were re-sampled.
   */
  update(soldiers: readonly SoldierRecord[], lanes: readonly LaneTruth[]): number {
    const recs = new Map<SoldierId, SoldierRecord>();
    for (const s of soldiers) recs.set(s.id, s);
    const seen = new Set<SoldierId>();
    let changed = 0;
    // Stable order (the result is a union, but keep iteration deterministic anyway).
    const sorted = [...lanes].sort((a, b) => compareIds(a.soldierId, b.soldierId));
    for (const lane of sorted) {
      seen.add(lane.soldierId);
      const rec = recs.get(lane.soldierId);
      const sig = laneSignature(lane, rec);
      const old = this.lanes.get(lane.soldierId);
      if (old && old.sig === sig) continue;
      const centres = rec ? this.laneCentres(rec, lane) : new Int32Array(0);
      if (old) for (const c of old.centres) this.removeVisit(c);
      for (const c of centres) this.addVisit(c);
      this.lanes.set(lane.soldierId, { sig, centres });
      changed++;
    }
    for (const [id, old] of [...this.lanes].sort(([a], [b]) => compareIds(a, b))) {
      if (seen.has(id)) continue;
      for (const c of old.centres) this.removeVisit(c);
      this.lanes.delete(id);
      changed++;
    }
    this.flush();
    return changed;
  }

  /**
   * Live layer: what the live soldier sees while exploring (minimap). Returns true if this
   * revealed new cells. Cleared with `clearLive`.
   */
  revealLive(x: number, y: number): boolean {
    const c = this.cellAt(x, y);
    if (this.liveMark[c]) return false;
    this.liveMark[c] = 1;
    this.liveCells.push(c);
    const before = this.version;
    this.addVisit(c);
    this.flush();
    return this.version !== before;
  }

  clearLive(): void {
    for (const c of this.liveCells) {
      this.liveMark[c] = 0;
      this.removeVisit(c);
    }
    this.liveCells = [];
    this.flush();
  }

  /** A copy of the revealed cells (tests, fixtures). */
  snapshot(): Uint8Array {
    return this.revealed.slice();
  }

  // ---------- internals ----------

  private addVisit(c: number): void {
    if (this.visits[c]!++ === 0) {
      if (this.blocked) this.stamp(c, 1);
      else this.dirty = true;
    }
  }

  private removeVisit(c: number): void {
    if (this.visits[c] === 0) return;
    if (--this.visits[c]! === 0) {
      if (this.blocked) this.stamp(c, -1);
      else this.dirty = true;
    }
  }

  /**
   * Plain-radius mode: revealed = visited cells dilated by the disc, recomputed with per-row
   * prefix sums (O(cells × disc rows), independent of how many soldiers there are).
   */
  private flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const { cols, rows, visits, prefix, halfWidth, revealed } = this;
    const stride = cols + 1;
    for (let y = 0; y < rows; y++) {
      const row = y * stride;
      const vrow = y * cols;
      prefix[row] = 0;
      for (let x = 0; x < cols; x++)
        prefix[row + x + 1] = prefix[row + x]! + (visits[vrow + x] ? 1 : 0);
    }
    const R = halfWidth.length - 1;
    let count = 0;
    let changed = false;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let on = 0;
        const y0 = Math.max(0, y - R);
        const y1 = Math.min(rows - 1, y + R);
        for (let yy = y0; yy <= y1; yy++) {
          const w = halfWidth[yy > y ? yy - y : y - yy]!;
          if (w < 0) continue;
          const row = yy * stride;
          const lo = x - w < 0 ? 0 : x - w;
          const hi = x + w + 1 > cols ? cols : x + w + 1;
          if (prefix[row + hi]! - prefix[row + lo]! > 0) {
            on = 1;
            break;
          }
        }
        const i = y * cols + x;
        if (revealed[i] !== on) {
          revealed[i] = on;
          changed = true;
        }
        count += on;
      }
    }
    this.revealedCount = count;
    if (changed) this.version++;
  }

  private stamp(c: number, delta: 1 | -1): void {
    const cells = this.blocked ? this.visibleFrom(c) : null;
    let changed = false;
    if (cells) {
      for (const n of cells) changed = this.bump(n, delta) || changed;
    } else {
      const cx = c % this.cols;
      const cy = (c - cx) / this.cols;
      const dxs = this.discDx;
      const dys = this.discDy;
      for (let i = 0; i < dxs.length; i++) {
        const x = cx + dxs[i]!;
        const y = cy + dys[i]!;
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
        changed = this.bump(y * this.cols + x, delta) || changed;
      }
    }
    if (changed) this.version++;
  }

  private bump(n: number, delta: 1 | -1): boolean {
    if (delta > 0) {
      if (this.cover[n]!++ === 0) {
        this.revealed[n] = 1;
        this.revealedCount++;
        return true;
      }
      return false;
    }
    if (--this.cover[n]! === 0) {
      this.revealed[n] = 0;
      this.revealedCount--;
      return true;
    }
    return false;
  }

  /** Disc cells with line of sight from centre cell `c` past blocked (wall) cells. */
  private visibleFrom(c: number): Int32Array {
    const hit = this.losCache.get(c);
    if (hit) return hit;
    const blocked = this.blocked!;
    const cols = this.cols;
    const cx = c % cols;
    const cy = (c - cx) / cols;
    const out: number[] = [];
    for (let i = 0; i < this.discDx.length; i++) {
      const tx = cx + this.discDx[i]!;
      const ty = cy + this.discDy[i]!;
      if (tx < 0 || ty < 0 || tx >= cols || ty >= this.rows) continue;
      if (lineOfSight(blocked, cols, cx, cy, tx, ty)) out.push(ty * cols + tx);
    }
    const arr = Int32Array.from(out);
    this.losCache.set(c, arr);
    return arr;
  }

  /** Distinct cells the soldier was alive in, from its recording over its alive spans. */
  private laneCentres(rec: SoldierRecord, lane: LaneTruth): Int32Array {
    const out: number[] = [];
    const mark = this.scratch;
    const half = this.cellSize / 2;
    const step = this.options.sampleTicks;
    let px: number;
    let py = NaN;
    const visit = (x: number, y: number) => {
      const c = this.cellAt(x, y);
      if (!mark[c]) {
        mark[c] = 1;
        out.push(c);
      }
    };
    for (const span of lane.spans) {
      if (span.kind !== 'alive') continue;
      px = NaN;
      for (let t = span.from; ; t = Math.min(t + step, span.to)) {
        if (poseInto(rec, t, P)) {
          if (!Number.isNaN(px)) {
            // Fill gaps (sparse recordings, fast movers) so no cell between samples is skipped.
            const ddx = P.x - px;
            const ddy = P.y - py;
            const n = Math.ceil(Math.sqrt(ddx * ddx + ddy * ddy) / half);
            for (let k = 1; k < n; k++) visit(px + (ddx * k) / n, py + (ddy * k) / n);
          }
          visit(P.x, P.y);
          px = P.x;
          py = P.y;
        }
        if (t >= span.to) break;
      }
    }
    for (const c of out) mark[c] = 0;
    return Int32Array.from(out);
  }
}

/** Cache key for a lane's reveal: its alive spans and recorded extent. */
function laneSignature(lane: LaneTruth, rec: SoldierRecord | undefined): string {
  let s = rec ? `${rec.segments.length}:${rec.spawnTick}:${lane.recordedTo}` : 'none';
  for (const sp of lane.spans) if (sp.kind === 'alive') s += `|${sp.from}-${sp.to}`;
  return s;
}

/**
 * Where the recording says the soldier is at tick `t` (null outside the recording or with no
 * waypoints). Between sparse waypoints it interpolates linearly.
 */
export function poseAtRecord(rec: SoldierRecord, t: Tick): { x: number; y: number } | null {
  const out = { x: 0, y: 0 };
  return poseInto(rec, t, out) ? out : null;
}

/** Scratch pose for the sampler (no allocation per sample). */
const P = { x: 0, y: 0 };

/** `poseAtRecord` into `out`; false if there's no pose. */
function poseInto(rec: SoldierRecord, t: Tick, out: { x: number; y: number }): boolean {
  const segs = rec.segments;
  // Segments are contiguous and sorted; most lanes have one or two.
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i]!;
    if (t < seg.startTick) continue;
    if (t > seg.endTick && i !== segs.length - 1) return false;
    return poseInSegment(seg, t, out);
  }
  return false;
}

function set(out: { x: number; y: number }, x: number, y: number): true {
  out.x = x;
  out.y = y;
  return true;
}

function poseInSegment(seg: RecordingSegment, t: Tick, out: { x: number; y: number }): boolean {
  const wps = seg.waypoints;
  if (wps.length === 0) return false;
  const first = wps[0]!;
  if (t <= first.t) return set(out, first.x, first.y);
  const last = wps[wps.length - 1]!;
  if (t >= last.t) return set(out, last.x, last.y);
  // Lossless recordings ([E7]) have one waypoint per tick.
  if (wps.length === last.t - first.t + 1) {
    const w = wps[t - first.t]!;
    return set(out, w.x, w.y);
  }
  let lo = 0;
  let hi = wps.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (wps[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = wps[lo]!;
  const b = wps[hi]!;
  if (a.t === t) return set(out, a.x, a.y);
  const k = (t - a.t) / (b.t - a.t);
  return set(out, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
}

/** Cells any static wall overlaps (used for line of sight). */
function blockedCells(walls: readonly Rect[], cs: number, cols: number, rows: number): Uint8Array {
  const out = new Uint8Array(cols * rows);
  for (const w of walls) {
    const x0 = clampInt(Math.floor(w.x / cs), 0, cols - 1);
    const x1 = clampInt(Math.ceil((w.x + w.w) / cs) - 1, 0, cols - 1);
    const y0 = clampInt(Math.floor(w.y / cs), 0, rows - 1);
    const y1 = clampInt(Math.ceil((w.y + w.h) / cs) - 1, 0, rows - 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out[y * cols + x] = 1;
  }
  return out;
}

/** Grid line of sight (DDA through cell centres); the end cells themselves don't block. */
function lineOfSight(
  blocked: Uint8Array,
  cols: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const n = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
  let prev = -1;
  for (let i = 1; i < n; i++) {
    const x = Math.round(ax + (dx * i) / n);
    const y = Math.round(ay + (dy * i) / n);
    const c = y * cols + x;
    if (c === prev || (x === ax && y === ay) || (x === bx && y === by)) continue;
    prev = c;
    if (blocked[c]) return false;
  }
  return true;
}

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---------- Known things ----------

export interface Destroyed {
  tick: Tick;
  by: SoldierId;
}

export type KnownThreat =
  | { kind: 'turret' | 'mine'; id: string; x: number; y: number; destroyed: Destroyed | null }
  | { kind: 'traffic'; id: string; x: number; y: number; x2: number; y2: number }
  | { kind: 'gate'; id: string; rect: Rect; initiallyOpen: boolean }
  | {
      kind: 'bridge';
      id: string;
      rect: Rect;
      bridgeKind: 'draw' | 'destructible';
      destroyed: Destroyed | null;
    };

export interface KnownSpawn {
  id: string;
  nameKey: string;
  x: number;
  y: number;
  kind: 'initial' | 'capture';
  /** Initial points are always open; capture points while ours in the truth. */
  open: boolean;
}

export interface KnownObjective {
  kind: 'destroy' | 'flag';
  id: string;
  nameKey?: string;
  x: number;
  y: number;
  /** Destroyed / captured in the current truth (with when and by whom, if known). */
  done: Destroyed | null;
}

export interface KnownCapturePoint {
  id: string;
  nameKey: string;
  x: number;
  y: number;
  /** Tick it became ours in the truth, or null. */
  oursTick: Tick | null;
}

export interface KnownSoldierEnd {
  soldierId: SoldierId;
  ordinal: number;
  /** X: died here; O: alive here at the end of its recording (resumable); !: froze here. */
  kind: 'death' | 'open' | 'interrupted';
  tick: Tick;
  x: number;
  y: number;
}

export interface RevealedMap {
  /** Spawn points to show: initial ones always, forward ones once open or revealed. */
  spawns: KnownSpawn[];
  /** Threats in revealed cells. */
  threats: KnownThreat[];
  /** Always shown, so you know which way is forward. */
  objectives: KnownObjective[];
  /** Non-objective capture points that are revealed or ours. */
  capturePoints: KnownCapturePoint[];
  /** Where each lane ends in the current truth (X / O / !). */
  ends: KnownSoldierEnd[];
}

/** What the truth knows is on the map (respawn-screen map, minimap). */
export function knownThings(
  map: MapDef,
  grid: RevealGrid,
  soldiers: readonly SoldierRecord[],
  lanes: readonly LaneTruth[],
  captures: readonly CaptureTruth[] = [],
): RevealedMap {
  const destroyed = destroyedRefs(lanes);
  const ours = new Map<string, Tick>();
  const oursBy = new Map<string, SoldierId>();
  for (const c of captures) {
    if (c.stage !== 'ours') continue;
    ours.set(c.pointId, c.tick);
    if (c.by[0]) oursBy.set(c.pointId, c.by[0]);
  }

  const spawns: KnownSpawn[] = [];
  for (const p of map.spawnPoints) {
    const open =
      p.kind === 'initial' || (p.capturePointId !== undefined && ours.has(p.capturePointId));
    if (!open && !grid.isRevealedAt(p.position.x, p.position.y)) continue;
    spawns.push({
      id: p.id,
      nameKey: p.nameKey,
      x: p.position.x,
      y: p.position.y,
      kind: p.kind,
      open,
    });
  }

  const threats: KnownThreat[] = [];
  for (const t of map.turrets ?? []) {
    if (!grid.isRevealedAt(t.position.x, t.position.y)) continue;
    threats.push({
      kind: 'turret',
      id: t.id,
      x: t.position.x,
      y: t.position.y,
      destroyed: destroyed.get(t.id) ?? null,
    });
  }
  for (const m of map.mines ?? []) {
    if (!grid.isRevealedAt(m.position.x, m.position.y)) continue;
    threats.push({
      kind: 'mine',
      id: m.id,
      x: m.position.x,
      y: m.position.y,
      destroyed: destroyed.get(m.id) ?? null,
    });
  }
  for (const l of map.trafficLanes ?? []) {
    if (!grid.isSegmentRevealed(l.from.x, l.from.y, l.to.x, l.to.y)) continue;
    const a = clampPoint(l.from, map);
    const b = clampPoint(l.to, map);
    threats.push({ kind: 'traffic', id: l.id, x: a.x, y: a.y, x2: b.x, y2: b.y });
  }
  for (const g of map.gates ?? []) {
    if (!grid.isRectRevealed(g.rect)) continue;
    threats.push({ kind: 'gate', id: g.id, rect: g.rect, initiallyOpen: g.initiallyOpen });
  }
  for (const b of map.bridges ?? []) {
    if (!grid.isRectRevealed(b.rect)) continue;
    threats.push({
      kind: 'bridge',
      id: b.id,
      rect: b.rect,
      bridgeKind: b.kind,
      destroyed: destroyed.get(b.id) ?? null,
    });
  }

  const objectives: KnownObjective[] = [];
  for (const o of map.objectives ?? []) {
    objectives.push({
      kind: 'destroy',
      id: o.id,
      x: o.position.x,
      y: o.position.y,
      done: destroyed.get(o.id) ?? null,
    });
  }
  const capturePoints: KnownCapturePoint[] = [];
  for (const c of map.capturePoints ?? []) {
    const tick = ours.get(c.id) ?? null;
    if (c.objective) {
      objectives.push({
        kind: 'flag',
        id: c.id,
        nameKey: c.nameKey,
        x: c.position.x,
        y: c.position.y,
        done: tick !== null ? { tick, by: oursBy.get(c.id) ?? '' } : null,
      });
    } else if (tick !== null || grid.isRevealedAt(c.position.x, c.position.y)) {
      capturePoints.push({
        id: c.id,
        nameKey: c.nameKey,
        x: c.position.x,
        y: c.position.y,
        oursTick: tick,
      });
    }
  }

  const recs = new Map(soldiers.map((s) => [s.id, s]));
  const ends: KnownSoldierEnd[] = [];
  for (const lane of [...lanes].sort((a, b) => compareIds(a.soldierId, b.soldierId))) {
    const e = lane.end;
    if (e.kind !== 'death' && e.kind !== 'open' && e.kind !== 'interrupted') continue;
    const rec = recs.get(lane.soldierId);
    const p = rec ? poseAtRecord(rec, e.tick) : null;
    if (!rec || !p) continue;
    ends.push({
      soldierId: lane.soldierId,
      ordinal: rec.ordinal,
      kind: e.kind,
      tick: e.tick,
      x: p.x,
      y: p.y,
    });
  }

  return { spawns, threats, objectives, capturePoints, ends };
}

/**
 * Entities destroyed in the current truth: the earliest kill / hazardDestroyed / objective
 * marker naming them. Lane markers are already cut to what still happens ([D2]).
 */
export function destroyedRefs(lanes: readonly LaneTruth[]): Map<string, Destroyed> {
  const out = new Map<string, Destroyed>();
  for (const lane of lanes) {
    if (lane.end.kind === 'neverSpawned') continue;
    for (const m of lane.markers) {
      if (m.refId === undefined) continue;
      if (m.kind !== 'kill' && m.kind !== 'hazardDestroyed' && m.kind !== 'objective') continue;
      const prev = out.get(m.refId);
      if (
        !prev ||
        m.tick < prev.tick ||
        (m.tick === prev.tick && compareIds(m.soldierId, prev.by) < 0)
      ) {
        out.set(m.refId, { tick: m.tick, by: m.soldierId });
      }
    }
  }
  return out;
}

function clampPoint(p: { x: number; y: number }, map: Pick<MapDef, 'width' | 'height'>) {
  return {
    x: Math.max(0, Math.min(map.width, p.x)),
    y: Math.max(0, Math.min(map.height, p.y)),
  };
}

/**
 * Revealed cells as merged horizontal runs [x, y, length] in cell units (cheap to draw as SVG
 * rects or canvas fills).
 */
export function revealedRuns(grid: RevealGrid): number[] {
  const out: number[] = [];
  const { cols, rows, revealed } = grid;
  for (let y = 0; y < rows; y++) {
    let x = 0;
    while (x < cols) {
      if (!revealed[y * cols + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < cols && revealed[y * cols + x]) x++;
      out.push(start, y, x - start);
    }
  }
  return out;
}
