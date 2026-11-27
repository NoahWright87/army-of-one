/**
 * A scenario (`BlockDef` with `kind: 'scenario'`) as a playable map: the editor's Play for
 * scenarios. Unlike a block's Play (`preview.ts`), nothing is added around it (no staging strip,
 * no flag unless it has objective slots) and nothing is budgeted: everything in it spawns. The
 * player deploys at its spawn items.
 *
 * Pure TS: no DOM, no Phaser.
 */
import { BLOCK_TUNING } from '../content/tuning';
import { borderWalls, type MapDef, type Rect } from '../sim/world/map';
import {
  addBlockContent,
  addPaintedBushes,
  addPaintedTrenches,
  emptyContent,
  extraContent,
  maskRects,
  paintedMist,
  solidRects,
  waterRects,
} from './assemble';
import { blockCols, blockRows, spawnBlocked, unitId, type BlockDef } from './block';

export function scenarioCellSize(block: BlockDef): number {
  return block.cellSize ?? (BLOCK_TUNING.cellSize as number);
}

/** World size: the exact extent, or the ground's tiles. */
export function scenarioExtent(block: BlockDef): { width: number; height: number } {
  const cs = scenarioCellSize(block);
  return block.extent ?? { width: blockCols(block) * cs, height: blockRows(block) * cs };
}

/** The map, or undefined while it has no spawn on open ground. */
export function scenarioMap(
  block: BlockDef,
  id: string,
  nameKey = 'scenario.title',
): MapDef | undefined {
  const spawns = block.items.flatMap((i) => (i.kind === 'spawn' ? [i] : []));
  if (spawns.length === 0 || spawns.some((s) => spawnBlocked(block, s.at))) return undefined;
  const cs = scenarioCellSize(block);
  const { width, height } = scenarioExtent(block);
  const cols = blockCols(block);
  const rows = blockRows(block);
  const clip = (r: Rect): Rect => ({
    ...r,
    w: Math.min(r.w, width - r.x),
    h: Math.min(r.h, height - r.y),
  });

  const acc = emptyContent();
  acc.walls.push(
    ...(block.extent ? [] : borderWalls(width, height)),
    ...solidRects(block.ground, cs).map(clip),
  );
  const spawned = new Set([
    ...block.items.map((i) => i.id),
    ...block.groups.flatMap((g) => g.units.map((_, n) => unitId(g.id, n))),
  ]);
  addBlockContent({ block, col: 0, row: 0, spawned, prefix: '' }, 0, 0, acc, cs);

  const ground = block.ground;
  if (ground.some((row) => row.includes('U')))
    addPaintedBushes(
      maskRects(cols, rows, cs, (x, y) => ground[y]?.[x] === 'U').map(clip),
      acc.concealment,
    );
  if (ground.some((row) => row.includes('T')))
    addPaintedTrenches(
      maskRects(cols, rows, cs, (x, y) => ground[y]?.[x] === 'T').map(clip),
      acc.concealment,
    );
  // Older drafts describe some water twice: as tiles and as the same exact rect.
  const water = [...acc.water];
  for (const painted of waterRects(ground, cs).map(clip)) {
    if (
      !water.some(
        (w) => w.x === painted.x && w.y === painted.y && w.w === painted.w && w.h === painted.h,
      )
    )
      water.push(painted);
  }
  const mist = block.mist ? paintedMist(cols, rows, cs, (x, y) => block.mist?.[y]?.[x]) : [];
  // Objective slots are flags to capture, as on a block's Play.
  for (const it of block.items) {
    if (it.kind !== 'objective') continue;
    acc.capturePoints.push({
      id: it.id,
      nameKey: 'capture.block.objective',
      position: { x: it.at[0] * cs, y: it.at[1] * cs },
      objective: true,
    });
  }

  const some = <K extends string, T>(key: K, list: T[]) =>
    (list.length ? { [key]: list } : {}) as Partial<Record<K, T[]>>;
  return {
    id,
    nameKey,
    width,
    height,
    ground: { cellSize: cs, rows: ground },
    ...(mist.length ? { mist } : {}),
    walls: acc.walls,
    water,
    cover: acc.cover,
    concealment: acc.concealment,
    gates: acc.gates,
    ...extraContent(acc),
    ...some('levers', acc.levers),
    ...some('turrets', acc.turrets),
    ...some('mines', acc.mines),
    ...some('squads', acc.squads),
    ...some('capturePoints', acc.capturePoints),
    spawnPoints: [
      ...spawns.map((s) => ({
        id: s.id,
        nameKey: 'scenario.spawn',
        position: { x: s.at[0] * cs, y: s.at[1] * cs },
        facing: -Math.PI / 2,
        kind: 'initial' as const,
      })),
      ...acc.spawnPoints,
    ],
  };
}
