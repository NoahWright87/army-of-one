import { GROUND, isGroundKind } from '../content/ground';
import { BLOCK_TUNING } from '../content/tuning';
import { borderWalls, type CoverMaterial, type MapDef, type Rect } from '../sim/world/map';
import type { Vec2 } from '../sim/core/vec';
import { addPaintedTrenches, maskRects, solidRects, waterRects } from './assemble';

export const SCENARIO_MIN_CELLS = 3;
export const SCENARIO_MAX_CELLS = 64;
export const SCENARIO_MATERIALS = [
  'sandbags',
  'crate',
  'halfWall',
  'fence',
  'window',
  'bunkerWindow',
] as const satisfies readonly CoverMaterial[];

export type LayoutItem = { rect: Rect } & (
  { kind: 'wall' } | { kind: 'cover'; material: CoverMaterial }
);

/** Positions and rectangles are in cells. The spawn is stored by its cell index. */
export interface ScenarioLayout {
  format: 'scenario-layout';
  version: 1;
  ground: string[];
  items: LayoutItem[];
  spawn: Vec2 | null;
}

export function newScenarioLayout(): ScenarioLayout {
  return {
    format: 'scenario-layout',
    version: 1,
    ground: Array.from({ length: 12 }, () => 'G'.repeat(16)),
    items: [],
    spawn: null,
  };
}

export function validScenarioSize(size: number): boolean {
  return Number.isInteger(size) && size >= SCENARIO_MIN_CELLS && size <= SCENARIO_MAX_CELLS;
}

export function insideLayout(rect: Rect, cols: number, rows: number): boolean {
  const { x, y, w, h } = rect;
  return (
    [x, y, w, h].every(Number.isInteger) &&
    x >= 0 &&
    y >= 0 &&
    w > 0 &&
    h > 0 &&
    x + w <= cols &&
    y + h <= rows
  );
}

export function insideLayoutCell(r: Rect, at: Vec2): boolean {
  return at.x >= r.x && at.x < r.x + r.w && at.y >= r.y && at.y < r.y + r.h;
}

export function parseScenarioLayout(json: string): ScenarioLayout | null {
  try {
    const layout = JSON.parse(json) as ScenarioLayout;
    if (
      layout?.format !== 'scenario-layout' ||
      layout.version !== 1 ||
      !Array.isArray(layout.ground) ||
      !validScenarioSize(layout.ground.length) ||
      typeof layout.ground[0] !== 'string' ||
      !validScenarioSize(layout.ground[0].length) ||
      !Array.isArray(layout.items)
    )
      return null;
    const rows = layout.ground.length;
    const cols = layout.ground[0].length;
    if (
      !layout.ground.every(
        (row) => typeof row === 'string' && row.length === cols && [...row].every(isGroundKind),
      )
    )
      return null;
    if (
      !layout.items.every(
        (item) =>
          item?.rect &&
          insideLayout(item.rect, cols, rows) &&
          (item.kind === 'wall' ||
            (item.kind === 'cover' && SCENARIO_MATERIALS.includes(item.material))),
      )
    )
      return null;
    if (
      layout.spawn !== null &&
      (!layout.spawn || !insideLayout({ ...layout.spawn, w: 1, h: 1 }, cols, rows))
    )
      return null;
    return layout;
  } catch {
    return null;
  }
}

export function scenarioSpawnProblem(layout: ScenarioLayout): 'missing' | 'blocked' | null {
  const at = layout.spawn;
  if (!at) return 'missing';
  const tile = layout.ground[at.y]?.[at.x];
  if (
    !tile ||
    !isGroundKind(tile) ||
    !GROUND[tile].passable ||
    layout.items.some(({ rect }) => insideLayoutCell(rect, at))
  )
    return 'blocked';
  return null;
}

export function scenarioPreviewMap(layout: ScenarioLayout, id: string): MapDef | undefined {
  const at = layout.spawn;
  if (!at || scenarioSpawnProblem(layout)) return undefined;
  const cs = BLOCK_TUNING.cellSize;
  const width = layout.ground[0]!.length * cs;
  const height = layout.ground.length * cs;
  const walls = [...borderWalls(width, height), ...solidRects(layout.ground, cs)];
  const cover: NonNullable<MapDef['cover']> = [];
  const concealment: NonNullable<MapDef['concealment']> = [];
  for (const [index, item] of layout.items.entries()) {
    const { x, y, w, h } = item.rect;
    const rect = { x: x * cs, y: y * cs, w: w * cs, h: h * cs };
    if (item.kind === 'wall') walls.push(rect);
    else cover.push({ id: `layout-cover-${index}`, rect, material: item.material });
  }
  addPaintedTrenches(
    maskRects(width / cs, height / cs, cs, (x, y) => layout.ground[y]?.[x] === 'T'),
    concealment,
  );
  return {
    id,
    nameKey: 'scenario.title',
    width,
    height,
    ground: { cellSize: cs, rows: layout.ground },
    walls,
    water: waterRects(layout.ground, cs),
    cover,
    concealment,
    spawnPoints: [
      {
        id: 'layout-start',
        nameKey: 'scenario.spawn',
        position: { x: (at.x + 0.5) * cs, y: (at.y + 0.5) * cs },
        facing: -Math.PI / 2,
        kind: 'initial',
      },
    ],
  };
}
