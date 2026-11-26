/**
 * The scenario editor's old document (before blocks and scenarios shared one editor). Still read
 * so old drafts and downloaded files open, and the HQ / basic training templates are written in
 * it; `layoutToBlock` turns one into the unified format.
 */
import { isImageKey, type ImageKey } from '../content/assets';
import { isGroundKind } from '../content/ground';
import { BLOCK_TUNING } from '../content/tuning';
import type { CoverMaterial, MapDef, Rect } from '../sim/world/map';
import type { Vec2 } from '../sim/core/vec';
import { BLOCK_VERSION, spawnBlocked, type BlockDef, type BlockItem, type CellRect } from './block';
import { scenarioMap } from './scenario';

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
  return spawnBlocked(layoutToBlock(layout), [at.x + 0.5, at.y + 0.5]) ? 'blocked' : null;
}

/**
 * The unified editor's document for an old scenario layout (drafts from before blocks and
 * scenarios shared one editor, and the HQ / basic training templates). Lossless: the map it
 * plays is the layout's map.
 */
export function layoutToBlock(
  layout: ScenarioLayout,
  id = 'scenario-1',
  name = 'Scenario',
): BlockDef {
  const cell = ({ x, y, w, h }: Rect): CellRect => [x, y, w, h];
  const items = layout.items.map((item, i): BlockItem => {
    const base = {
      id: item.id ?? `layout-piece-${i}`,
      priority: 0 as const,
      rect: cell(item.rect),
    };
    switch (item.kind) {
      case 'ladder':
        return {
          ...base,
          kind: 'ladder',
          bottom: [item.bottom.x, item.bottom.y],
          top: [item.top.x, item.top.y],
        };
      case 'wall':
        return {
          ...base,
          kind: 'wall',
          ...(item.firingSurface ? { firingSurface: item.firingSurface } : {}),
        };
      case 'cover': {
        const { kind, material, firingSurface, bullet, lobbed } = item;
        return {
          ...base,
          kind,
          material,
          ...(firingSurface ? { firingSurface } : {}),
          ...(bullet === undefined ? {} : { bullet }),
          ...(lobbed === undefined ? {} : { lobbed }),
        };
      }
      case 'gate':
        return { ...base, kind: 'gate', open: item.open };
      case 'prop':
        return { ...base, kind: 'prop', image: item.image };
      case 'target':
        return { ...base, kind: 'target', ...(item.hp === undefined ? {} : { hp: item.hp }) };
      default:
        return { ...base, kind: item.kind };
    }
  });
  if (layout.spawn) {
    let spawnId = 'spawn-1';
    for (let n = 2; items.some((i) => i.id === spawnId); n++) spawnId = `spawn-${n}`;
    items.push({
      id: spawnId,
      priority: 0,
      kind: 'spawn',
      at: [layout.spawn.x + 0.5, layout.spawn.y + 0.5],
    });
  }
  return {
    v: BLOCK_VERSION,
    id,
    name,
    kind: 'scenario',
    ground: [...layout.ground],
    items,
    groups: [],
    ...(layout.cellSize !== undefined ? { cellSize: layout.cellSize } : {}),
    ...(layout.extent ? { extent: { ...layout.extent } } : {}),
  };
}

export function scaleScenarioRect(rect: Rect, factor: number): Rect {
  return { x: rect.x * factor, y: rect.y * factor, w: rect.w * factor, h: rect.h * factor };
}

export function ladderPoint(rect: Rect, normalized: Vec2): Vec2 {
  return { x: rect.x + rect.w * normalized.x, y: rect.y + rect.h * normalized.y };
}

export function scenarioPreviewMap(layout: ScenarioLayout, id: string): MapDef | undefined {
  return scenarioMap(layoutToBlock(layout), id);
}

function worldRect(rect: Rect, cellSize: number): Rect {
  const scaled = scaleScenarioRect(rect, cellSize);
  const exact = (n: number) => (Math.abs(n - Math.round(n)) <= 1e-9 ? Math.round(n) : n);
  return { x: exact(scaled.x), y: exact(scaled.y), w: exact(scaled.w), h: exact(scaled.h) };
}
