/**
 * (PHASE13-a) Map blocks: the human-authored pieces levels are stitched from ([D80]–[D86]).
 *
 * A block is a grid of painted ground plus placed things (walls, cover, soldiers…). All
 * coordinates are in cells (floats; the editor snaps to half cells), with (0, 0) the block's
 * north-west corner. Facings are degrees, clockwise from east: 90 faces south (down the map,
 * toward an attacker coming up from the bottom).
 *
 * The same document is also a **scenario** (`kind: 'scenario'`): a hand-made map of any size,
 * played as is. Scenarios have starting spawns (and later triggers), no budget (everything
 * spawns), and are never used to generate levels. Level generation needs blocks of exactly
 * `BLOCK_CELLS` × `BLOCK_CELLS` tiles (`validateBlock` says so); the editor doesn't constrain
 * the size.
 *
 * Blocks are plain JSON (`BLOCK_VERSION`), so they can be downloaded, shared and committed as
 * official blocks. Pure TS: no DOM, no Phaser.
 */
import type { RoleId } from '../contracts/mission';
import { isImageKey, type ImageKey } from '../content/assets';
import { BLOCK_CELLS, GROUND, isGroundKind } from '../content/ground';
import type { CoverMaterial } from '../sim/world/map';

/**
 * 4: blocks and scenarios share one format: any size, `kind`, the scenario editor's pieces
 * (raised ground, water, ground mist, ladders, props, practice targets, spawns).
 * 3: no edge tags, edges are the painted tiles ([D101]); a block may be a player start or an
 * enemy HQ. 2 had edge tags; 1 had placed soldiers. All still load.
 */
export const BLOCK_VERSION = 4;
/** Smallest and largest side, in tiles, the editor and loader accept. */
export const MIN_CELLS = 3;
export const MAX_CELLS = 256;
export const MAX_MIST_COATS = 3;

/** (PHASE13) What a block is for when a level is grown from both ends ([D102]). */
export type BlockRole = 'start' | 'hq';

export type Side = 'n' | 'e' | 's' | 'w';
export const SIDES: readonly Side[] = ['n', 'e', 's', 'w'];

/**
 * Spawn priority ([D85]): 0 always spawns and is free (terrain, structures, capture points);
 * 1–5 spawn in that order while the budget lasts. The editor shows everything.
 */
export type Priority = 0 | 1 | 2 | 3 | 4 | 5;
export const PRIORITIES: readonly Priority[] = [0, 1, 2, 3, 4, 5];

export type CellPoint = [number, number];
/** x, y, w, h in cells. */
export type CellRect = [number, number, number, number];

interface ItemBase {
  /** Unique within the block. */
  id: string;
  priority: Priority;
  /** The squad a rally point belongs to, or the squad that holds a capture point. */
  group?: string;
}

/** (PHASE13) One unit of a squad's roster: bought by the budget like anything else ([D85]). */
export interface GroupUnit {
  role: RoleId;
  priority: Priority;
}

/**
 * (PHASE13) A squad ([Q54]): a roster of units and, via `rally` items, the points they roam
 * between. Each unit spawns at a seeded random rally point of its squad.
 */
export interface BlockGroup {
  id: string;
  units: GroupUnit[];
}

export type BlockItem =
  /** `firingSurface`: the id of a `raised` item soldiers fire over this from. */
  | (ItemBase & { kind: 'wall'; rect: CellRect; firingSurface?: string })
  | (ItemBase & {
      kind: 'cover';
      rect: CellRect;
      material: CoverMaterial;
      firingSurface?: string;
      /** Overrides of the material's share of stopped shots / lobbed things (0..1). */
      bullet?: number;
      lobbed?: number;
    })
  | (ItemBase & { kind: 'bush' | 'trench'; rect: CellRect })
  /** Exact areas (painted tiles cover most needs): walkable raised ground, water, ground mist. */
  | (ItemBase & { kind: 'raised' | 'water' | 'mist'; rect: CellRect })
  /** A ladder from `bottom` to `top`, both as fractions (0..1) of `rect`. */
  | (ItemBase & { kind: 'ladder'; rect: CellRect; bottom: CellPoint; top: CellPoint })
  /** Scenery: a picture drawn over `rect`. */
  | (ItemBase & { kind: 'prop'; rect: CellRect; image: ImageKey })
  /** A practice target: shot down, never part of winning. */
  | (ItemBase & { kind: 'target'; rect: CellRect; hp?: number })
  /** A scenario's starting spawn (the player deploys here). Blocks don't use them. */
  | (ItemBase & { kind: 'spawn'; at: CellPoint })
  | (ItemBase & { kind: 'gate'; rect: CellRect; open?: boolean })
  | (ItemBase & { kind: 'lever'; at: CellPoint; target: string })
  | (ItemBase & { kind: 'turret'; at: CellPoint; facing: number })
  | (ItemBase & { kind: 'mine'; at: CellPoint })
  /** (PHASE13) A rally point of squad `group` ([Q54]). Free, always there. */
  | (ItemBase & { kind: 'rally'; at: CellPoint; group: string })
  | (ItemBase & { kind: 'capture'; at: CellPoint })
  /** Where a level objective may go ([D90]). The generator picks one; Play uses the first. */
  | (ItemBase & { kind: 'objective'; at: CellPoint });

export type ItemKind = BlockItem['kind'];
export type RectItem = Extract<BlockItem, { rect: CellRect }>;
export type PointItem = Extract<BlockItem, { at: CellPoint }>;

/** Every kind, in palette order, with its shape. */
export const ITEM_KINDS: readonly { kind: ItemKind; shape: 'rect' | 'point' }[] = [
  { kind: 'wall', shape: 'rect' },
  { kind: 'cover', shape: 'rect' },
  { kind: 'bush', shape: 'rect' },
  { kind: 'trench', shape: 'rect' },
  { kind: 'raised', shape: 'rect' },
  { kind: 'water', shape: 'rect' },
  { kind: 'mist', shape: 'rect' },
  { kind: 'ladder', shape: 'rect' },
  { kind: 'prop', shape: 'rect' },
  { kind: 'target', shape: 'rect' },
  { kind: 'gate', shape: 'rect' },
  { kind: 'lever', shape: 'point' },
  { kind: 'turret', shape: 'point' },
  { kind: 'mine', shape: 'point' },
  { kind: 'rally', shape: 'point' },
  { kind: 'capture', shape: 'point' },
  { kind: 'objective', shape: 'point' },
  { kind: 'spawn', shape: 'point' },
];

/** Kinds that are always priority 0 ([D85]: capture points and objectives always spawn). */
export const ALWAYS_KINDS: ReadonlySet<ItemKind> = new Set([
  'capture',
  'objective',
  'rally',
  'spawn',
  'raised',
  'water',
  'mist',
  'ladder',
  'prop',
  'target',
]);

/** Placed things that stop movement, so a block's edge tiles must stay clear of them. */
const EDGE_BLOCKING: ReadonlySet<ItemKind> = new Set([
  'wall',
  'cover',
  'bush',
  'trench',
  'water',
  'raised',
  'target',
]);

/** A block (stitched into generated levels) or a scenario (a whole map, played as is). */
export type DocKind = 'block' | 'scenario';

export interface BlockDef {
  v: typeof BLOCK_VERSION;
  id: string;
  /** Author-facing name (shown in the editor, not in the game). */
  name: string;
  /** A scenario; absent for a block. */
  kind?: 'scenario';
  /** (PHASE13) A player start (levels grow from it) or an enemy HQ (the objective). */
  role?: BlockRole;
  /** Rows (north first) of ground letters, all the same length. */
  ground: string[];
  /** Optional layer of mist coats, 0–3 per tile (same size as `ground`). */
  mist?: string[];
  items: BlockItem[];
  /** (PHASE13) Squads: rosters; their rally points are `rally` items. */
  groups: BlockGroup[];
  /** Scenarios only: world units per tile (default `BLOCK_TUNING.cellSize`). */
  cellSize?: number;
  /**
   * Scenarios only: exact size in world units, for maps whose edges fall between tiles (the HQ).
   * Such maps draw their own border walls.
   */
  extent?: { width: number; height: number };
}

export const docKind = (b: BlockDef): DocKind => b.kind ?? 'block';
export const isScenario = (b: BlockDef) => b.kind === 'scenario';
export const blockCols = (b: BlockDef) => b.ground[0]?.length ?? 0;
export const blockRows = (b: BlockDef) => b.ground.length;

/** The playable area in cells (smaller than the ground when `extent` cuts the last tiles). */
export function blockSize(b: BlockDef): { w: number; h: number } {
  const cs = b.cellSize;
  if (b.extent && cs) return { w: b.extent.width / cs, h: b.extent.height / cs };
  return { w: blockCols(b), h: blockRows(b) };
}

/** Budget id of a squad's `i`th unit ([D85]). */
export const unitId = (group: string, i: number) => `${group}#${i}`;

export const isRectItem = (i: BlockItem): i is RectItem => 'rect' in i;

/** A fresh block: all grass, grass on every side. */
export function newBlock(
  id = 'block-1',
  name = 'New block',
  cols = BLOCK_CELLS,
  rows = cols,
): BlockDef {
  return {
    v: BLOCK_VERSION,
    id,
    name,
    ground: Array.from({ length: rows }, () => 'G'.repeat(cols)),
    items: [],
    groups: [],
  };
}

/** Is (col, row) on the outer row of tiles (its edges) of a `cols` × `rows` block? */
export function onEdge(col: number, row: number, cols = BLOCK_CELLS, rows = cols): boolean {
  return col === 0 || row === 0 || col === cols - 1 || row === rows - 1;
}

export const validSide = (n: number) => Number.isInteger(n) && n >= MIN_CELLS && n <= MAX_CELLS;

// ---------------------------------------------------------------------------------------------
// Validation

/** A problem shown in the editor: a strings.ts key (`editor.problem.*`) plus parameters. */
export interface BlockProblem {
  key: string;
  params?: Record<string, string | number>;
  itemId?: string;
}

/** Ids the sim hands out at runtime ("S1", "E4"…) can't be used by map content. */
const RESERVED_ID = /^[SEVGR]\d+$/;

/** Everything wrong with a block that would stop it being used. Empty means good to go. */
export function validateBlock(block: BlockDef): BlockProblem[] {
  const out: BlockProblem[] = [];
  const n = BLOCK_CELLS;
  const scenario = isScenario(block);
  const cols = blockCols(block);
  if (!scenario && (block.ground.length !== n || block.ground.some((r) => r.length !== n))) {
    out.push({ key: 'editor.problem.groundSize', params: { n } });
  }
  if (scenario && (!validSide(cols) || !validSide(block.ground.length))) {
    out.push({ key: 'editor.problem.scenarioSize', params: { min: MIN_CELLS, max: MAX_CELLS } });
  }
  const size = blockSize(block);

  const ids = new Set<string>();
  for (const it of block.items) {
    if (!it.id || RESERVED_ID.test(it.id) || ids.has(it.id)) {
      out.push({ key: 'editor.problem.badId', params: { id: it.id }, itemId: it.id });
    }
    ids.add(it.id);
    if (!inside(it, size.w, size.h)) {
      out.push({ key: 'editor.problem.outside', params: { id: it.id }, itemId: it.id });
    }
    if (!scenario && isRectItem(it) && EDGE_BLOCKING.has(it.kind) && touchesEdge(it.rect)) {
      out.push({ key: 'editor.problem.blocksEdge', params: { id: it.id }, itemId: it.id });
    }
    if (!validDetails(it, block)) {
      out.push({ key: 'editor.problem.badItem', params: { id: it.id }, itemId: it.id });
    }
    if (ALWAYS_KINDS.has(it.kind) && it.priority !== 0) {
      out.push({ key: 'editor.problem.alwaysPriority', params: { id: it.id }, itemId: it.id });
    }
    if (it.kind === 'lever') {
      const target = block.items.find((t) => t.id === it.target);
      if (!target || target.kind !== 'gate') {
        out.push({ key: 'editor.problem.leverTarget', params: { id: it.id }, itemId: it.id });
      }
    }
  }

  if (scenario) {
    const spawns = block.items.filter((i) => i.kind === 'spawn');
    if (spawns.length === 0) out.push({ key: 'editor.problem.noSpawn' });
    for (const sp of spawns) {
      if (spawnBlocked(block, sp.at)) {
        out.push({ key: 'editor.problem.spawnBlocked', params: { id: sp.id }, itemId: sp.id });
      }
    }
  }

  const groups = new Set<string>();
  for (const g of block.groups) {
    if (!g.id || groups.has(g.id)) {
      out.push({ key: 'editor.problem.badGroupId', params: { group: g.id } });
    }
    groups.add(g.id);
    if (g.units.length === 0)
      out.push({ key: 'editor.problem.groupEmpty', params: { group: g.id } });
    if (!block.items.some((i) => i.kind === 'rally' && i.group === g.id)) {
      out.push({ key: 'editor.problem.groupNoRally', params: { group: g.id } });
    }
  }
  for (const it of block.items) {
    if ((it.kind === 'rally' || it.group) && !(it.group && groups.has(it.group))) {
      out.push({
        key: 'editor.problem.groupMissing',
        params: { id: it.id, group: it.group ?? '' },
        itemId: it.id,
      });
    }
  }
  return out;
}

/** Squad names, in order. */
export function groupIds(block: BlockDef): string[] {
  return block.groups.map((g) => g.id);
}

function inside(it: BlockItem, cols: number, rows: number): boolean {
  const ok = (...v: number[]) => v.every(Number.isFinite);
  const eps = 1e-8;
  if (isRectItem(it)) {
    const [x, y, w, h] = it.rect;
    return (
      ok(x, y, w, h) &&
      x >= 0 &&
      y >= 0 &&
      w > 0 &&
      h > 0 &&
      x + w <= cols + eps &&
      y + h <= rows + eps
    );
  }
  const [x, y] = it.at;
  return ok(x, y) && x >= 0 && y >= 0 && x <= cols && y <= rows;
}

const fraction = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const unitPoint = (p: unknown) => Array.isArray(p) && p.length === 2 && p.every(fraction);

/** Kind-specific fields that a hand-edited file could get wrong. */
function validDetails(it: BlockItem, block: BlockDef): boolean {
  const surface = (id: string | undefined) =>
    id === undefined || block.items.some((r) => r.kind === 'raised' && r.id === id);
  switch (it.kind) {
    case 'wall':
      return surface(it.firingSurface);
    case 'cover':
      return (
        surface(it.firingSurface) &&
        (it.bullet === undefined || fraction(it.bullet)) &&
        (it.lobbed === undefined || fraction(it.lobbed))
      );
    case 'ladder':
      return (
        unitPoint(it.bottom) &&
        unitPoint(it.top) &&
        (it.bottom[0] !== it.top[0] || it.bottom[1] !== it.top[1])
      );
    case 'prop':
      return typeof it.image === 'string' && isImageKey(it.image);
    case 'target':
      return it.hp === undefined || (Number.isFinite(it.hp) && it.hp > 0);
    default:
      return true;
  }
}

/** A spawn must stand on open ground: walkable tile, not in a wall, cover, water or shut gate. */
export function spawnBlocked(block: BlockDef, [x, y]: CellPoint): boolean {
  const tile = block.ground[Math.floor(y)]?.[Math.floor(x)];
  if (!tile || !isGroundKind(tile) || !GROUND[tile].passable) return true;
  return block.items.some((it) => {
    if (!isRectItem(it)) return false;
    const solid =
      it.kind === 'wall' ||
      it.kind === 'cover' ||
      it.kind === 'water' ||
      (it.kind === 'gate' && !it.open);
    const [rx, ry, w, h] = it.rect;
    return solid && x >= rx && x < rx + w && y >= ry && y < ry + h;
  });
}

/**
 * A placed wall or cover on the outer row of tiles would block what the tiles say is open, and
 * the neighbour can't see it ([D101]): edges are paint only (use wall or rock tiles there).
 */
function touchesEdge(rect: CellRect): boolean {
  const [x, y, w, h] = rect;
  const n = BLOCK_CELLS;
  return x < 1 || y < 1 || x + w > n - 1 || y + h > n - 1;
}

// ---------------------------------------------------------------------------------------------
// JSON

export type ParseResult = { ok: true; block: BlockDef } | { ok: false; key: string };

/** Reads a downloaded/shared block. Shape errors come back as a strings.ts key. */
export function parseBlock(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, key: 'editor.load.notJson' };
  }
  return parseBlockObject(raw);
}

/** Checks an already-parsed object (e.g. an official block's imported JSON). */
export function parseBlockObject(raw: unknown): ParseResult {
  if (!raw || typeof raw !== 'object') return { ok: false, key: 'editor.load.notBlock' };
  const b = raw as Partial<BlockDef>;
  const version = (raw as { v?: unknown }).v;
  if (version !== BLOCK_VERSION && version !== 1 && version !== 2 && version !== 3) {
    return { ok: false, key: 'editor.load.version' };
  }
  if (typeof b.id !== 'string' || !Array.isArray(b.ground) || !Array.isArray(b.items)) {
    return { ok: false, key: 'editor.load.notBlock' };
  }
  const cols = typeof b.ground[0] === 'string' ? b.ground[0].length : 0;
  if (
    !validSide(cols) ||
    !validSide(b.ground.length) ||
    !b.ground.every((r) => typeof r === 'string' && r.length === cols && [...r].every(isGroundKind))
  ) {
    return { ok: false, key: 'editor.load.notBlock' };
  }
  if (
    b.mist !== undefined &&
    (!Array.isArray(b.mist) ||
      b.mist.length !== b.ground.length ||
      !b.mist.every((r) => typeof r === 'string' && r.length === cols && /^[0-3]+$/.test(r)))
  ) {
    return { ok: false, key: 'editor.load.notBlock' };
  }
  if (
    (b.kind !== undefined && b.kind !== 'scenario') ||
    (b.cellSize !== undefined && !(Number.isSafeInteger(b.cellSize) && b.cellSize > 0)) ||
    (b.extent !== undefined && !validExtent(b.extent, b.cellSize, cols, b.ground.length)) ||
    !b.items.every((i) => {
      if (version === 1 && i?.kind === ('soldier' as string)) return true;
      const def = i && typeof i === 'object' && ITEM_KINDS.find((k) => k.kind === i.kind);
      if (!def) return false;
      return def.shape === 'rect'
        ? validTuple((i as { rect?: unknown }).rect, 4)
        : validTuple((i as { at?: unknown }).at, 2);
    })
  ) {
    return { ok: false, key: 'editor.load.notBlock' };
  }
  // Versions 1 and 2 had edge tags; their edges were painted to match, so the paint is enough.
  const { edges: _edges, ...rest } = b as Partial<BlockDef> & { edges?: unknown };
  void _edges;
  const named: BlockDef = {
    ...(rest as BlockDef),
    v: BLOCK_VERSION,
    name: typeof b.name === 'string' ? b.name : b.id,
  };
  if (b.role !== undefined && b.role !== 'start' && b.role !== 'hq') delete named.role;
  if (version === 1) return { ok: true, block: migrateV1(named as unknown as V1Block) };
  if (!Array.isArray(b.groups)) return { ok: false, key: 'editor.load.notBlock' };
  return { ok: true, block: named };
}

const validTuple = (v: unknown, n: number) =>
  Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number' && Number.isFinite(x));

function validExtent(
  e: { width: number; height: number },
  cs: number | undefined,
  cols: number,
  rows: number,
): boolean {
  return (
    !!e &&
    cs !== undefined &&
    Number.isSafeInteger(e.width) &&
    Number.isSafeInteger(e.height) &&
    Math.ceil(e.width / cs) === cols &&
    Math.ceil(e.height / cs) === rows
  );
}

type V1Item = (BlockItem | { kind: 'soldier'; at: CellPoint; role: RoleId }) & {
  id: string;
  priority: Priority;
  group?: string;
  anchor?: boolean;
};
type V1Block = Omit<BlockDef, 'v' | 'items' | 'groups'> & { v: 1; items: V1Item[] };

/**
 * Version 1 placed soldiers one by one. Each v1 group (ungrouped soldiers: one squad) becomes a
 * squad whose roster is its soldiers and whose rally points are where they stood.
 */
export function migrateV1(b: V1Block): BlockDef {
  const groups: BlockGroup[] = [];
  const rallies: BlockItem[] = [];
  const used = new Set(b.items.map((i) => i.id));
  const fresh = (base: string) => {
    for (let n = 1; ; n++) {
      if (!used.has(`${base}-${n}`)) {
        used.add(`${base}-${n}`);
        return `${base}-${n}`;
      }
    }
  };
  for (const it of b.items) {
    if (it.kind !== 'soldier') continue;
    const gid = it.group ?? 'squad';
    let g = groups.find((x) => x.id === gid);
    if (!g) groups.push((g = { id: gid, units: [] }));
    g.units.push({ role: it.role, priority: it.priority });
    const near = rallies.some(
      (r) =>
        r.group === gid && 'at' in r && Math.hypot(r.at[0] - it.at[0], r.at[1] - it.at[1]) < 0.75,
    );
    if (!near)
      rallies.push({ id: fresh('rally'), kind: 'rally', at: it.at, group: gid, priority: 0 });
  }
  const kept = new Set(groups.map((g) => g.id));
  const items: BlockItem[] = [];
  for (const it of b.items) {
    if (it.kind === 'soldier') continue;
    const { anchor: _anchor, group, ...rest } = it;
    void _anchor;
    const keepGroup = it.kind === 'capture' && group && kept.has(group);
    items.push((keepGroup ? { ...rest, group } : rest) as BlockItem);
  }
  return { ...b, v: BLOCK_VERSION, items: [...items, ...rallies], groups };
}

/** Stable, diff-friendly JSON: one ground row and one item per line. */
export function blockToJson(block: BlockDef): string {
  const rows = block.ground.map((r) => `    ${JSON.stringify(r)}`).join(',\n');
  const items = block.items.map((i) => `    ${JSON.stringify(i)}`).join(',\n');
  const groups = block.groups.map((g) => `    ${JSON.stringify(g)}`).join(',\n');
  return (
    `{\n  "v": ${block.v},\n  "id": ${JSON.stringify(block.id)},\n` +
    `  "name": ${JSON.stringify(block.name)},\n` +
    (block.kind ? `  "kind": ${JSON.stringify(block.kind)},\n` : '') +
    (block.role ? `  "role": ${JSON.stringify(block.role)},\n` : '') +
    (block.cellSize ? `  "cellSize": ${block.cellSize},\n` : '') +
    (block.extent ? `  "extent": ${JSON.stringify(block.extent)},\n` : '') +
    `  "ground": [\n${rows}\n  ],\n` +
    (block.mist ? `  "mist": ${JSON.stringify(block.mist)},\n` : '') +
    `  "items": [${items ? `\n${items}\n  ` : ''}],\n` +
    `  "groups": [${groups ? `\n${groups}\n  ` : ''}]\n}\n`
  );
}
