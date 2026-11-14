/**
 * (PHASE13-a) Turns one block into a playable `MapDef`: the editor's Play button.
 *
 * The block sits above a short grass staging strip where the player's spawns go. Its first
 * objective slot becomes a flag objective (capture it to win); without one, the flag goes at the
 * top centre. Soldiers in the same group form one enemy squad (holding the group's capture point,
 * if it has one); ungrouped soldiers form one squad. Pure TS.
 */
import { BLOCK_CELLS, GROUND, isGroundKind } from '../content/ground';
import { BLOCK_TUNING } from '../content/tuning';
import {
  borderWalls,
  type CapturePointDef,
  type MapDef,
  type Rect,
  type SpawnPointDef,
  type SquadDef,
} from '../sim/world/map';
import type { Vec2 } from '../sim/core/vec';
import { type BlockDef, type BlockItem, type CellPoint, type CellRect } from './block';

export interface PreviewOptions {
  /** Map id (and save slot) to use. */
  id: string;
  nameKey: string;
  /** Only items up to this priority spawn (the budget slider, later). Default: everything. */
  maxPriority?: number;
}

export function blockToPreviewMap(block: BlockDef, opts: PreviewOptions): MapDef {
  const cs = BLOCK_TUNING.cellSize;
  const n = BLOCK_CELLS;
  const staging = BLOCK_TUNING.stagingCells;
  const width = n * cs;
  const height = (n + staging) * cs;
  const maxP = opts.maxPriority ?? 5;
  const items = block.items.filter((i) => i.priority <= maxP && anchorSpawns(block, i, maxP));

  const pt = ([x, y]: CellPoint): Vec2 => ({ x: x * cs, y: y * cs });
  const rect = ([x, y, w, h]: CellRect): Rect => ({ x: x * cs, y: y * cs, w: w * cs, h: h * cs });
  const rad = (deg: number) => (deg * Math.PI) / 180;

  const groundRows = [...block.ground, ...Array.from({ length: staging }, () => 'G'.repeat(n))];

  const capturePoints: CapturePointDef[] = [];
  const spawnPoints: SpawnPointDef[] = (['west', 'centre', 'east'] as const).map((k, i) => ({
    id: `spawn-${k}`,
    nameKey: `spawn.block.${k}`,
    position: { x: (width * (i + 1)) / 4, y: (n + staging / 2) * cs },
    facing: -Math.PI / 2,
    kind: 'initial' as const,
  }));
  for (const it of items) {
    if (it.kind !== 'capture') continue;
    capturePoints.push({ id: it.id, nameKey: 'capture.block.point', position: pt(it.at) });
    spawnPoints.push({
      id: `spawn-${it.id}`,
      nameKey: 'spawn.block.forward',
      position: { x: it.at[0] * cs, y: Math.min(it.at[1] + 1.5, n - 0.5) * cs },
      facing: -Math.PI / 2,
      kind: 'capture',
      capturePointId: it.id,
    });
  }
  const slot = items.find((i) => i.kind === 'objective');
  capturePoints.push({
    id: 'blk-objective',
    nameKey: 'capture.block.objective',
    position: slot && 'at' in slot ? pt(slot.at) : { x: width / 2, y: 1.5 * cs },
    objective: true,
  });

  return {
    id: opts.id,
    nameKey: opts.nameKey,
    width,
    height,
    ground: { cellSize: cs, rows: groundRows },
    walls: [
      ...borderWalls(width, height, BLOCK_TUNING.borderThickness),
      ...items.flatMap((i) => (i.kind === 'wall' ? [rect(i.rect)] : [])),
    ],
    water: waterRects(groundRows, cs),
    cover: items.flatMap((i) =>
      i.kind === 'cover' ? [{ id: i.id, rect: rect(i.rect), material: i.material }] : [],
    ),
    gates: items.flatMap((i) =>
      i.kind === 'gate' ? [{ id: i.id, rect: rect(i.rect), initiallyOpen: !!i.open }] : [],
    ),
    levers: items.flatMap((i) =>
      i.kind === 'lever' && items.some((g) => g.id === i.target)
        ? [{ id: i.id, position: pt(i.at), targetId: i.target }]
        : [],
    ),
    turrets: items.flatMap((i) =>
      i.kind === 'turret' ? [{ id: i.id, position: pt(i.at), facing: rad(i.facing) }] : [],
    ),
    mines: items.flatMap((i) => (i.kind === 'mine' ? [{ id: i.id, position: pt(i.at) }] : [])),
    spawnPoints,
    capturePoints,
    squads: squads(items, pt, rad),
  };
}

/** A grouped item spawns only if its group's anchor does ([D85]). Priority 0 always spawns. */
function anchorSpawns(block: BlockDef, it: BlockItem, maxP: number): boolean {
  if (!it.group || it.anchor || it.priority === 0) return true;
  const anchor = block.items.find((a) => a.group === it.group && a.anchor);
  return !anchor || anchor.priority <= maxP;
}

function squads(
  items: BlockItem[],
  pt: (p: CellPoint) => Vec2,
  rad: (d: number) => number,
): SquadDef[] {
  const out: SquadDef[] = [];
  const keys: string[] = [];
  for (const it of items) {
    if (it.kind !== 'soldier') continue;
    const k = it.group ?? '';
    if (!keys.includes(k)) keys.push(k);
  }
  for (const k of keys) {
    const members = items.flatMap((i) =>
      i.kind === 'soldier' && (i.group ?? '') === k
        ? [{ role: i.role, position: pt(i.at), facing: rad(i.facing) }]
        : [],
    );
    const hold = k ? items.find((i) => i.kind === 'capture' && i.group === k) : undefined;
    out.push({
      id: k ? `sq-${k}` : 'sq-loose',
      members,
      order: { kind: 'guard' },
      ...(hold ? { capturePointId: hold.id } : {}),
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
