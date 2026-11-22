/**
 * (PHASE13-b) Builds a playable `MapDef` from blocks laid out on a grid: the editor's Play map
 * (one block) and generated levels (many) both go through here.
 *
 * Layout: `cols` × `rows` blocks, row 0 at the top (north), over a grass staging strip where
 * the player's three spawns are. Each placed block contributes the things that spawned
 * (`spawned`); ids get the block's `prefix` so blocks never clash. Soldiers in one group form one
 * enemy squad (holding the group's capture point, if any); a block's ungrouped soldiers share a
 * squad. Capture points get a forward spawn just south of them. One flag objective goes at
 * `objective` (world units): capture it to win.
 */
import { BLOCK_CELLS, GROUND, isGroundKind, type GroundKind } from '../content/ground';
import { BLOCK_TUNING } from '../content/tuning';
import type { Vec2 } from '../sim/core/vec';
import {
  borderWalls,
  type CapturePointDef,
  type CoverDef,
  type ConcealmentArea,
  type GateDef,
  type LeverDef,
  type MapDef,
  type MineDef,
  type Rect,
  type SpawnPointDef,
  type SquadDef,
  type TurretDef,
} from '../sim/world/map';
import { hash01 } from '../sim/core/hash';
import {
  MAX_MIST_COATS,
  unitId,
  type BlockDef,
  type BlockItem,
  type CellPoint,
  type CellRect,
} from './block';

export interface PlacedBlock {
  /** Already oriented. */
  block: BlockDef;
  col: number;
  row: number;
  spawned: ReadonlySet<string>;
  /** Prepended to every id from this block ('' for a lone block). */
  prefix: string;
}

export interface AssembleOptions {
  id: string;
  nameKey: string;
  cols: number;
  rows: number;
  placed: readonly PlacedBlock[];
  objective: Vec2;
}

export function assembleMap(opts: AssembleOptions): MapDef {
  const cs = BLOCK_TUNING.cellSize;
  const n = BLOCK_CELLS;
  const staging = BLOCK_TUNING.stagingCells;
  const width = opts.cols * n * cs;
  const height = (opts.rows * n + staging) * cs;

  // Ground: the blocks' rows side by side, then the staging strip.
  const groundRows: string[] = [];
  for (let br = 0; br < opts.rows; br++) {
    for (let r = 0; r < n; r++) {
      let line = '';
      for (let bc = 0; bc < opts.cols; bc++) {
        const pb = opts.placed.find((p) => p.row === br && p.col === bc);
        line += pb ? pb.block.ground[r]! : 'G'.repeat(n);
      }
      groundRows.push(line);
    }
  }
  for (let i = 0; i < staging; i++) groundRows.push('G'.repeat(opts.cols * n));

  const walls: Rect[] = [
    ...borderWalls(width, height, BLOCK_TUNING.borderThickness),
    // (PHASE13) Rock and wall tiles are solid ([D103]).
    ...solidRects(groundRows, cs),
  ];
  const cover: CoverDef[] = [];
  const concealment: ConcealmentArea[] = [];
  const gates: GateDef[] = [];
  const levers: LeverDef[] = [];
  const turrets: TurretDef[] = [];
  const mines: MineDef[] = [];
  const squads: SquadDef[] = [];
  const capturePoints: CapturePointDef[] = [];
  const spawnPoints: SpawnPointDef[] = (['west', 'centre', 'east'] as const).map((k, i) => ({
    id: `spawn-${k}`,
    nameKey: `spawn.block.${k}`,
    position: { x: (width * (i + 1)) / 4, y: (opts.rows * n + staging / 2) * cs },
    facing: -Math.PI / 2,
    kind: 'initial' as const,
  }));

  const acc: Content = {
    walls,
    cover,
    concealment,
    gates,
    levers,
    turrets,
    mines,
    squads,
    capturePoints,
    spawnPoints,
  };
  for (const pb of opts.placed) addBlockContent(pb, pb.col * n, pb.row * n, acc);
  addPaintedTrenches(
    tileRects(groundRows, cs, (kind) => kind === 'T'),
    concealment,
  );
  const mistBlocks = new Map(
    opts.placed
      .filter(({ block }) => block.mist)
      .map(({ col, row, block }) => [row * opts.cols + col, block.mist!]),
  );
  const mist = mistBlocks.size
    ? paintedMist(
        opts.cols * n,
        opts.rows * n,
        cs,
        (x, y) =>
          mistBlocks.get(Math.floor(y / n) * opts.cols + Math.floor(x / n))?.[y % n]?.[x % n],
      )
    : [];
  capturePoints.push({
    id: 'blk-objective',
    nameKey: 'capture.block.objective',
    position: opts.objective,
    objective: true,
  });

  return {
    id: opts.id,
    nameKey: opts.nameKey,
    width,
    height,
    ground: { cellSize: cs, rows: groundRows },
    ...(mist.length ? { mist } : {}),
    walls,
    water: waterRects(groundRows, cs),
    cover,
    concealment,
    gates,
    levers,
    turrets,
    mines,
    spawnPoints,
    capturePoints,
    squads,
  };
}

/** Everything a map collects from its blocks. */
export interface Content {
  walls: Rect[];
  cover: CoverDef[];
  concealment: ConcealmentArea[];
  gates: GateDef[];
  levers: LeverDef[];
  turrets: TurretDef[];
  mines: MineDef[];
  squads: SquadDef[];
  capturePoints: CapturePointDef[];
  spawnPoints: SpawnPointDef[];
}

/**
 * Adds one placed block's spawned things to `acc`, the block's top-left at tile (`ox`, `oy`) of
 * the map.
 */
export function addBlockContent(pb: PlacedBlock, ox: number, oy: number, acc: Content): void {
  const cs = BLOCK_TUNING.cellSize;
  const n = BLOCK_CELLS;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const {
    walls,
    cover,
    concealment,
    gates,
    levers,
    turrets,
    mines,
    squads,
    capturePoints,
    spawnPoints,
  } = acc;
  {
    const pt = ([x, y]: CellPoint): Vec2 => ({ x: (ox + x) * cs, y: (oy + y) * cs });
    const rect = ([x, y, w, h]: CellRect): Rect => ({
      x: (ox + x) * cs,
      y: (oy + y) * cs,
      w: w * cs,
      h: h * cs,
    });
    const id = (s: string) => `${pb.prefix}${s}`;
    const items = pb.block.items.filter((i) => pb.spawned.has(i.id));
    for (const it of items) {
      switch (it.kind) {
        case 'wall':
          walls.push(rect(it.rect));
          break;
        case 'cover':
          cover.push({ id: id(it.id), rect: rect(it.rect), material: it.material });
          break;
        case 'bush':
        case 'trench':
          concealment.push({ id: id(it.id), rect: rect(it.rect), kind: it.kind });
          break;
        case 'gate':
          gates.push({ id: id(it.id), rect: rect(it.rect), initiallyOpen: !!it.open });
          break;
        case 'lever':
          if (items.some((g) => g.id === it.target && g.kind === 'gate')) {
            levers.push({ id: id(it.id), position: pt(it.at), targetId: id(it.target) });
          }
          break;
        case 'turret':
          turrets.push({ id: id(it.id), position: pt(it.at), facing: rad(it.facing) });
          break;
        case 'mine':
          mines.push({ id: id(it.id), position: pt(it.at) });
          break;
        case 'capture':
          capturePoints.push({
            id: id(it.id),
            nameKey: 'capture.block.point',
            position: pt(it.at),
          });
          spawnPoints.push({
            id: id(`spawn-${it.id}`),
            nameKey: 'spawn.block.forward',
            position: pt([it.at[0], Math.min(it.at[1] + 1.5, n - 0.5)]),
            facing: -Math.PI / 2,
            kind: 'capture',
            capturePointId: id(it.id),
          });
          break;
        default:
          break;
      }
    }
    squads.push(...blockSquads(pb.block, items, pb.spawned, pt, id));
  }
}

/**
 * (PHASE13) Each squad with units bought and rally points becomes an enemy squad ([Q54]): every
 * unit starts at a seeded random rally point, fanned out around it so nobody stacks, facing
 * south (toward the attacker).
 */
function blockSquads(
  block: BlockDef,
  items: BlockItem[],
  spawned: ReadonlySet<string>,
  pt: (p: CellPoint) => Vec2,
  id: (s: string) => string,
): SquadDef[] {
  const out: SquadDef[] = [];
  const cs = BLOCK_TUNING.cellSize;
  for (const g of block.groups) {
    const rally = items.flatMap((i) => (i.kind === 'rally' && i.group === g.id ? [pt(i.at)] : []));
    if (rally.length === 0) continue;
    const members = g.units.flatMap((u, i) => {
      if (!spawned.has(unitId(g.id, i))) return [];
      const at = rally[Math.floor(hash01(id(unitId(g.id, i))) * rally.length)]!;
      // Golden-angle fan around the point.
      const a = i * 2.399963;
      const r = cs * (0.35 + 0.25 * Math.floor(i / 6));
      return [
        {
          role: u.role,
          position: { x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r },
          facing: Math.PI / 2,
        },
      ];
    });
    if (members.length === 0) continue;
    const hold = items.find((i) => i.kind === 'capture' && i.group === g.id);
    out.push({
      id: id(`sq-${g.id}`),
      members,
      order: { kind: 'guard' },
      rally,
      ...(hold ? { capturePointId: id(hold.id) } : {}),
    });
  }
  return out;
}

export function addPaintedTrenches(rects: readonly Rect[], concealment: ConcealmentArea[]): void {
  const used = new Set(concealment.map(({ id }) => id));
  let next = 0;
  for (const rect of rects) {
    while (used.has(`painted-trench-${next}`)) next++;
    concealment.push({ id: `painted-trench-${next++}`, kind: 'trench', rect, painted: true });
  }
}

export function paintedMist(
  w: number,
  h: number,
  cs: number,
  coat: (x: number, y: number) => string | undefined,
): Rect[] {
  const mist: Rect[] = [];
  for (let layer = 1; layer <= MAX_MIST_COATS; layer++) {
    mist.push(...maskRects(w, h, cs, (x, y) => Number(coat(x, y) ?? 0) >= layer));
  }
  return mist;
}

/** Water tiles (impassable but not solid: shots cross) → rects. */
export function waterRects(rows: readonly string[], cs: number): Rect[] {
  return tileRects(rows, cs, (k) => !GROUND[k].passable && !GROUND[k].solid);
}

/** (PHASE13) Rocks and wall tiles (solid: block movement and shots, [D103]) → wall rects. */
export function solidRects(rows: readonly string[], cs: number): Rect[] {
  return tileRects(rows, cs, (k) => GROUND[k].solid);
}

/** (PHASE13-d) Tiles where `want(x, y)` → rects (same merging as the ground). */
export function maskRects(
  w: number,
  h: number,
  cs: number,
  want: (x: number, y: number) => boolean,
): Rect[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let line = '';
    for (let x = 0; x < w; x++) line += want(x, y) ? 'X' : 'G';
    rows.push(line);
  }
  return tileRects(rows, cs, (k) => k === 'X');
}

/** Tiles of some kinds → rects: runs along each row, merged down while the run below matches. */
function tileRects(rows: readonly string[], cs: number, want: (k: GroundKind) => boolean): Rect[] {
  const open: Rect[] = [];
  const done: Rect[] = [];
  rows.forEach((row, r) => {
    const runs: [number, number][] = [];
    let start = -1;
    for (let c = 0; c <= row.length; c++) {
      const ch = row[c];
      const wet = ch !== undefined && isGroundKind(ch) && want(ch);
      if (wet && start < 0) start = c;
      if (!wet && start >= 0) {
        runs.push([start, c]);
        start = -1;
      }
    }
    const still: Rect[] = [];
    for (const [a, b] of runs) {
      const prev = open.find((o) => o.x === a * cs && o.w === (b - a) * cs);
      if (prev) {
        prev.h += cs;
        still.push(prev);
      } else still.push({ x: a * cs, y: r * cs, w: (b - a) * cs, h: cs });
    }
    for (const o of open) if (!still.includes(o)) done.push(o);
    open.length = 0;
    open.push(...still);
  });
  return [...done, ...open];
}
