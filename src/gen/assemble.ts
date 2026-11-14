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
import { BLOCK_CELLS, GROUND, isGroundKind } from '../content/ground';
import { BLOCK_TUNING } from '../content/tuning';
import type { Vec2 } from '../sim/core/vec';
import {
  borderWalls,
  type CapturePointDef,
  type CoverDef,
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
import { unitId, type BlockDef, type BlockItem, type CellPoint, type CellRect } from './block';

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
  const rad = (deg: number) => (deg * Math.PI) / 180;

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

  const walls: Rect[] = [...borderWalls(width, height, BLOCK_TUNING.borderThickness)];
  const cover: CoverDef[] = [];
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

  for (const pb of opts.placed) {
    const ox = pb.col * n;
    const oy = pb.row * n;
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
    walls,
    water: waterRects(groundRows, cs),
    cover,
    gates,
    levers,
    turrets,
    mines,
    spawnPoints,
    capturePoints,
    squads,
  };
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

/** Water cells → rects: runs along each row, merged down while the run below is identical. */
export function waterRects(rows: readonly string[], cs: number): Rect[] {
  const open: Rect[] = [];
  const done: Rect[] = [];
  rows.forEach((row, r) => {
    const runs: [number, number][] = [];
    let start = -1;
    for (let c = 0; c <= row.length; c++) {
      const ch = row[c];
      const wet = ch !== undefined && isGroundKind(ch) && !GROUND[ch].passable;
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
