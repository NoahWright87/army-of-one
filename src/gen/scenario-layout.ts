import { isImageKey, type ImageKey } from '../content/assets';
import { GROUND, isGroundKind } from '../content/ground';
import { BLOCK_TUNING } from '../content/tuning';
import {
  borderWalls,
  type ConcealmentArea,
  type CoverMaterial,
  type MapDef,
  type Rect,
} from '../sim/world/map';
import type { Vec2 } from '../sim/core/vec';
import {
  addPaintedBushes,
  addPaintedTrenches,
  maskRects,
  solidRects,
  waterRects,
} from './assemble';

export const SCENARIO_CELL = BLOCK_TUNING.cellSize;
export const SCENARIO_MIN_CELLS = 3;
export const SCENARIO_MAX_CELLS = 256;
export const SCENARIO_MATERIALS = [
  'sandbags',
  'crate',
  'halfWall',
  'fence',
  'window',
  'bunkerWindow',
] as const satisfies readonly CoverMaterial[];
export const AREA_KINDS = ['water', 'raised', 'bush', 'trench', 'mist'] as const;
export type AreaKind = (typeof AREA_KINDS)[number];
export type LayoutItem = { rect: Rect; id?: string } & (
  | { kind: 'wall'; firingSurface?: string }
  | {
      kind: 'cover';
      material: CoverMaterial;
      firingSurface?: string;
      bullet?: number;
      lobbed?: number;
    }
  | { kind: AreaKind }
  | { kind: 'gate'; open: boolean }
  | { kind: 'ladder'; bottom: Vec2; top: Vec2 }
  | { kind: 'prop'; image: ImageKey }
  | { kind: 'target'; hp?: number }
);

export interface ScenarioLayout {
  format: 'scenario-layout';
  version: 1;
  ground: string[];
  cellSize?: number;
  items: LayoutItem[];
  /** Exact world dimensions for maps whose edges fall between grid lines. Their walls are explicit. */
  extent?: { width: number; height: number };
  /** Offset by half a cell so old integer-valued spawn cells retain their centers. */
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

export function scenarioCellSize(layout: ScenarioLayout): number {
  return layout.cellSize ?? SCENARIO_CELL;
}

export function layoutExtent(layout: ScenarioLayout) {
  const size = scenarioCellSize(layout);
  return (
    layout.extent ?? {
      width: layout.ground[0]!.length * size,
      height: layout.ground.length * size,
    }
  );
}

export function insideLayout(rect: Rect, cols: number, rows: number): boolean {
  const { x, y, w, h } = rect;
  return (
    [x, y, w, h].every(Number.isFinite) &&
    x >= 0 &&
    y >= 0 &&
    w > 0 &&
    h > 0 &&
    x + w <= cols + 1e-8 &&
    y + h <= rows + 1e-8
  );
}

export function insideLayoutCell(r: Rect, at: Vec2): boolean {
  return at.x >= r.x && at.x < r.x + r.w && at.y >= r.y && at.y < r.y + r.h;
}

const unitPoint = (p: Vec2) => p && [p.x, p.y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1);
const optionalFraction = (n: number | undefined) =>
  n === undefined || (Number.isFinite(n) && n >= 0 && n <= 1);

function validItem(item: LayoutItem, width: number, height: number): boolean {
  if (
    !item?.rect ||
    !insideLayout(item.rect, width, height) ||
    (item.id !== undefined &&
      (typeof item.id !== 'string' || !item.id || /^[SEVGR]\d+$/.test(item.id)))
  )
    return false;
  switch (item.kind) {
    case 'wall':
      return item.firingSurface === undefined || typeof item.firingSurface === 'string';
    case 'cover':
      return (
        SCENARIO_MATERIALS.includes(item.material) &&
        optionalFraction(item.bullet) &&
        optionalFraction(item.lobbed) &&
        (item.firingSurface === undefined || typeof item.firingSurface === 'string')
      );
    case 'gate':
      return typeof item.open === 'boolean';
    case 'ladder':
      return (
        unitPoint(item.bottom) &&
        unitPoint(item.top) &&
        (item.bottom.x !== item.top.x || item.bottom.y !== item.top.y)
      );
    case 'prop':
      return typeof item.image === 'string' && isImageKey(item.image);
    case 'target':
      return item.hp === undefined || (Number.isFinite(item.hp) && item.hp > 0);
    default:
      return AREA_KINDS.includes(item.kind);
  }
}

/** Older drafts and HQ may describe the same water as a tile and an exact rectangle. */
export function withoutDuplicateWater(layout: ScenarioLayout): ScenarioLayout {
  const cs = scenarioCellSize(layout);
  const { width, height } = layoutExtent(layout);
  const items = layout.items.filter((item) => {
    if (item.kind !== 'water') return true;
    const { x, y, w, h } = worldRect(item.rect, cs);
    const right = x + w;
    const bottom = y + h;
    if (x % cs || y % cs || (right !== width && right % cs) || (bottom !== height && bottom % cs))
      return true;
    for (let row = y / cs; row < Math.ceil(bottom / cs); row++)
      for (let col = x / cs; col < Math.ceil(right / cs); col++)
        if (layout.ground[row]?.[col] !== 'W') return true;
    return false;
  });
  return items.length === layout.items.length ? layout : { ...layout, items };
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
    const cs = scenarioCellSize(layout);
    if (
      !Number.isSafeInteger(cs) ||
      cs < 1 ||
      (layout.cellSize !== undefined && layout.cellSize !== cs)
    )
      return null;
    const { width, height } = layoutExtent(layout);
    if (
      layout.extent === null ||
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      Math.ceil(width / cs) !== cols ||
      Math.ceil(height / cs) !== rows ||
      !layout.ground.every(
        (row) => typeof row === 'string' && row.length === cols && [...row].every(isGroundKind),
      )
    )
      return null;
    if (!layout.items.every((item) => validItem(item, width / cs, height / cs))) return null;
    const ids = layout.items.map((item, i) => item.id ?? `layout-piece-${i}`);
    if (new Set(ids).size !== ids.length) return null;
    if (
      layout.spawn !== null &&
      (!layout.spawn ||
        !Number.isFinite(layout.spawn.x) ||
        !Number.isFinite(layout.spawn.y) ||
        !insideLayoutCell(
          { x: 0, y: 0, w: width / cs, h: height / cs },
          { x: layout.spawn.x + 0.5, y: layout.spawn.y + 0.5 },
        ))
    )
      return null;
    return withoutDuplicateWater(layout);
  } catch {
    return null;
  }
}

export function scenarioSpawnProblem(layout: ScenarioLayout): 'missing' | 'blocked' | null {
  const at = layout.spawn;
  if (!at) return 'missing';
  const center = { x: at.x + 0.5, y: at.y + 0.5 };
  const tile = layout.ground[Math.floor(center.y)]?.[Math.floor(center.x)];
  if (
    !tile ||
    !isGroundKind(tile) ||
    !GROUND[tile].passable ||
    layout.items.some(
      (item) =>
        (item.kind === 'wall' ||
          item.kind === 'cover' ||
          item.kind === 'water' ||
          (item.kind === 'gate' && !item.open)) &&
        insideLayoutCell(item.rect, center),
    )
  )
    return 'blocked';
  return null;
}

export function scaleScenarioRect(rect: Rect, factor: number): Rect {
  return { x: rect.x * factor, y: rect.y * factor, w: rect.w * factor, h: rect.h * factor };
}

export function ladderPoint(rect: Rect, normalized: Vec2): Vec2 {
  return { x: rect.x + rect.w * normalized.x, y: rect.y + rect.h * normalized.y };
}

function worldRect(rect: Rect, cellSize: number): Rect {
  const scaled = scaleScenarioRect(rect, cellSize);
  const exact = (n: number) => (Math.abs(n - Math.round(n)) <= 1e-9 ? Math.round(n) : n);
  return { x: exact(scaled.x), y: exact(scaled.y), w: exact(scaled.w), h: exact(scaled.h) };
}

export function scenarioPreviewMap(layout: ScenarioLayout, id: string): MapDef | undefined {
  const at = layout.spawn;
  if (!at || scenarioSpawnProblem(layout)) return undefined;
  const cs = scenarioCellSize(layout);
  const { width, height } = layoutExtent(layout);
  const clip = (r: Rect) => ({
    ...r,
    w: Math.min(r.w, width - r.x),
    h: Math.min(r.h, height - r.y),
  });
  const walls: MapDef['walls'] = [
    ...(layout.extent ? [] : borderWalls(width, height)),
    ...solidRects(layout.ground, cs).map(clip),
  ];
  const map = {
    id,
    nameKey: 'scenario.title',
    width,
    height,
    ground: { cellSize: cs, rows: layout.ground },
    walls,
    water: [] as Rect[],
    cover: [] as NonNullable<MapDef['cover']>,
    concealment: [] as NonNullable<MapDef['concealment']>,
    gates: [] as NonNullable<MapDef['gates']>,
    raisedGround: [] as Rect[],
    groundMist: [] as Rect[],
    ladders: [] as NonNullable<MapDef['ladders']>,
    scenery: [] as NonNullable<MapDef['scenery']>,
    objectives: [] as NonNullable<MapDef['objectives']>,
    spawnPoints: [
      {
        id: 'layout-start',
        nameKey: 'scenario.spawn',
        position: { x: (at.x + 0.5) * cs, y: (at.y + 0.5) * cs },
        facing: -Math.PI / 2,
        kind: 'initial' as const,
      },
    ],
  };
  const surfaces = new Map(
    layout.items.flatMap((item) =>
      item.kind === 'raised' && item.id ? [[item.id, worldRect(item.rect, cs)] as const] : [],
    ),
  );
  for (const [index, item] of layout.items.entries()) {
    const rect = worldRect(item.rect, cs);
    const id = item.id ?? `layout-piece-${index}`;
    const fireOverFrom =
      'firingSurface' in item && item.firingSurface ? surfaces.get(item.firingSurface) : undefined;
    switch (item.kind) {
      case 'wall':
        map.walls.push({ ...rect, ...(fireOverFrom ? { fireOverFrom } : {}) });
        break;
      case 'cover': {
        const { material, bullet, lobbed } = item;
        map.cover.push({
          id,
          rect,
          material,
          ...(fireOverFrom ? { fireOverFrom } : {}),
          ...(bullet === undefined ? {} : { bullet }),
          ...(lobbed === undefined ? {} : { lobbed }),
        });
        break;
      }
      case 'water':
        map.water.push(rect);
        break;
      case 'gate':
        map.gates.push({ id, rect, initiallyOpen: item.open });
        break;
      case 'raised':
        map.raisedGround.push(rect);
        break;
      case 'mist':
        map.groundMist.push(rect);
        break;
      case 'bush':
      case 'trench':
        map.concealment.push({ id, rect, kind: item.kind });
        break;
      case 'ladder':
        map.ladders.push({
          id,
          bottom: ladderPoint(rect, item.bottom),
          top: ladderPoint(rect, item.top),
        });
        break;
      case 'target':
        map.objectives.push({
          id,
          target: true,
          position: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
          radius: Math.min(rect.w, rect.h) / 2,
          ...(item.hp === undefined ? {} : { maxHp: item.hp }),
        });
        break;
      case 'prop':
        map.scenery.push({ image: item.image, rect });
        break;
    }
  }
  for (const painted of waterRects(layout.ground, cs).map(clip)) {
    if (
      !map.water.some(
        (water) =>
          water.x === painted.x &&
          water.y === painted.y &&
          water.w === painted.w &&
          water.h === painted.h,
      )
    )
      map.water.push(painted);
  }
  addScenarioPaintedConcealment(layout, map.concealment);
  return map.objectives.length ? map : { ...map, objectives: undefined };
}

export function addScenarioPaintedConcealment(
  layout: ScenarioLayout,
  concealment: ConcealmentArea[],
): void {
  const cs = scenarioCellSize(layout);
  const { width, height } = layoutExtent(layout);
  const cols = layout.ground[0]!.length;
  const rows = layout.ground.length;
  const clip = (r: Rect) => ({
    ...r,
    w: Math.min(r.w, width - r.x),
    h: Math.min(r.h, height - r.y),
  });
  if (layout.ground.some((row) => row.includes('U')))
    addPaintedBushes(
      maskRects(cols, rows, cs, (x, y) => layout.ground[y]?.[x] === 'U').map(clip),
      concealment,
    );
  if (layout.ground.some((row) => row.includes('T')))
    addPaintedTrenches(
      maskRects(cols, rows, cs, (x, y) => layout.ground[y]?.[x] === 'T').map(clip),
      concealment,
    );
}
