/**
 * (PHASE13-a) Map blocks: the human-authored pieces levels are stitched from ([D80]–[D86]).
 *
 * A block is a 15×15 grid of painted ground plus placed things (walls, cover, soldiers…). All
 * coordinates are in cells (floats; the editor snaps to half cells), with (0, 0) the block's
 * north-west corner. Facings are degrees, clockwise from east: 90 faces south (down the map,
 * toward an attacker coming up from the bottom).
 *
 * Blocks are plain JSON (`BLOCK_VERSION`), so they can be downloaded, shared and committed as
 * official blocks. Pure TS: no DOM, no Phaser.
 */
import type { RoleId } from '../contracts/mission';
import {
  BLOCK_CELLS,
  EDGE_TAGS,
  GROUND,
  isEdgeTag,
  isGroundKind,
  WALL_CELL,
  type EdgeTag,
  type GroundKind,
} from '../content/ground';
import type { CoverMaterial } from '../sim/world/map';

/** 2: squads are groups (a roster + rally points); 1 had placed soldiers (still read). */
export const BLOCK_VERSION = 2;

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
  | (ItemBase & { kind: 'wall'; rect: CellRect })
  | (ItemBase & { kind: 'cover'; rect: CellRect; material: CoverMaterial })
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
  { kind: 'gate', shape: 'rect' },
  { kind: 'lever', shape: 'point' },
  { kind: 'turret', shape: 'point' },
  { kind: 'mine', shape: 'point' },
  { kind: 'rally', shape: 'point' },
  { kind: 'capture', shape: 'point' },
  { kind: 'objective', shape: 'point' },
];

/** Kinds that are always priority 0 ([D85]: capture points and objectives always spawn). */
export const ALWAYS_KINDS: ReadonlySet<ItemKind> = new Set(['capture', 'objective', 'rally']);

export interface BlockDef {
  v: typeof BLOCK_VERSION;
  id: string;
  /** Author-facing name (shown in the editor, not in the game). */
  name: string;
  edges: Record<Side, EdgeTag>;
  /** BLOCK_CELLS rows (north first) of BLOCK_CELLS ground letters each. */
  ground: string[];
  items: BlockItem[];
  /** (PHASE13) Squads: rosters; their rally points are `rally` items. */
  groups: BlockGroup[];
}

/** Budget id of a squad's `i`th unit ([D85]). */
export const unitId = (group: string, i: number) => `${group}#${i}`;

export const isRectItem = (i: BlockItem): i is RectItem => 'rect' in i;

/** A fresh block: all grass, grass on every side. */
export function newBlock(id = 'block-1', name = 'New block'): BlockDef {
  return applyEdges({
    v: BLOCK_VERSION,
    id,
    name,
    edges: { n: 'grass', e: 'grass', s: 'grass', w: 'grass' },
    ground: Array.from({ length: BLOCK_CELLS }, () => 'G'.repeat(BLOCK_CELLS)),
    items: [],
    groups: [],
  });
}

/**
 * The ground letter an edge tag forces on cell (col, row), or null if the cell is free: the
 * outer ring is forced by its side's tag, except the four corners ([D81]).
 */
export function edgeLock(
  edges: Record<Side, EdgeTag>,
  col: number,
  row: number,
): GroundKind | null {
  const ch = edgeProfileChar(edges, col, row);
  if (ch === null) return null;
  return ch === WALL_CELL ? 'C' : (ch as GroundKind);
}

/**
 * The raw profile letter on cell (col, row) of the edge band (`#` for a wall crossing), or null
 * off the band and on the corners. Profiles read clockwise ([D81]).
 */
export function edgeProfileChar(
  edges: Record<Side, EdgeTag>,
  col: number,
  row: number,
): string | null {
  const last = BLOCK_CELLS - 1;
  const corner = (col === 0 || col === last) && (row === 0 || row === last);
  if (corner) return null;
  const at = (side: Side, i: number) => EDGE_TAGS[edges[side]].profile[i]!;
  if (row === 0) return at('n', col);
  if (col === last) return at('e', row);
  if (row === last) return at('s', last - col);
  if (col === 0) return at('w', last - row);
  return null;
}

/** Repaints the edge band from the tags (a copy; the input is untouched). */
export function applyEdges(block: BlockDef): BlockDef {
  const ground = block.ground.map((row, r) =>
    [...row].map((ch, c) => edgeLock(block.edges, c, r) ?? ch).join(''),
  );
  return { ...block, ground };
}

export function groundAt(block: BlockDef, col: number, row: number): GroundKind {
  const ch = block.ground[row]?.[col] ?? 'G';
  return isGroundKind(ch) ? ch : 'G';
}

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
  if (block.ground.length !== n || block.ground.some((r) => r.length !== n)) {
    out.push({ key: 'editor.problem.groundSize' });
  } else {
    let mismatch = 0;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const lock = edgeLock(block.edges, c, r);
        if (lock && block.ground[r]![c] !== lock) mismatch++;
      }
    }
    if (mismatch) out.push({ key: 'editor.problem.edgePaint', params: { n: mismatch } });
  }

  const ids = new Set<string>();
  for (const it of block.items) {
    if (!it.id || RESERVED_ID.test(it.id) || ids.has(it.id)) {
      out.push({ key: 'editor.problem.badId', params: { id: it.id }, itemId: it.id });
    }
    ids.add(it.id);
    if (!inside(it)) {
      out.push({ key: 'editor.problem.outside', params: { id: it.id }, itemId: it.id });
    }
    if (isRectItem(it) && it.kind !== 'gate' && blocksPassableEdge(block, it.rect)) {
      out.push({ key: 'editor.problem.blocksEdge', params: { id: it.id }, itemId: it.id });
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

function inside(it: BlockItem): boolean {
  const n = BLOCK_CELLS;
  if (isRectItem(it)) {
    const [x, y, w, h] = it.rect;
    return x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= n && y + h <= n;
  }
  const [x, y] = it.at;
  return x >= 0 && y >= 0 && x <= n && y <= n;
}

/**
 * A wall or cover touching an edge cell its tag says you can cross would break the promise
 * that matching tags join up ([D81]). Water cells on the band are fine to cover.
 */
function blocksPassableEdge(block: BlockDef, rect: CellRect): boolean {
  const [x, y, w, h] = rect;
  const n = BLOCK_CELLS;
  const c0 = Math.max(0, Math.floor(x));
  const c1 = Math.min(n - 1, Math.ceil(x + w) - 1);
  const r0 = Math.max(0, Math.floor(y));
  const r1 = Math.min(n - 1, Math.ceil(y + h) - 1);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const ch = edgeProfileChar(block.edges, c, r);
      if (ch !== null && ch !== WALL_CELL && GROUND[ch as GroundKind].passable) return true;
    }
  }
  return false;
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
  if (version !== BLOCK_VERSION && version !== 1) return { ok: false, key: 'editor.load.version' };
  if (typeof b.id !== 'string' || !Array.isArray(b.ground) || !Array.isArray(b.items)) {
    return { ok: false, key: 'editor.load.notBlock' };
  }
  const edges = b.edges as Record<string, unknown> | undefined;
  if (!edges || !SIDES.every((s) => typeof edges[s] === 'string' && isEdgeTag(edges[s]))) {
    return { ok: false, key: 'editor.load.notBlock' };
  }
  if (!b.ground.every((r) => typeof r === 'string' && [...r].every(isGroundKind))) {
    return { ok: false, key: 'editor.load.notBlock' };
  }
  const named = { ...(b as BlockDef), name: typeof b.name === 'string' ? b.name : b.id };
  if (version === 1) return { ok: true, block: migrateV1(named as unknown as V1Block) };
  if (!Array.isArray(b.groups)) return { ok: false, key: 'editor.load.notBlock' };
  return { ok: true, block: named };
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
    `  "name": ${JSON.stringify(block.name)},\n  "edges": ${JSON.stringify(block.edges)},\n` +
    `  "ground": [\n${rows}\n  ],\n  "items": [${items ? `\n${items}\n  ` : ''}],\n` +
    `  "groups": [${groups ? `\n${groups}\n  ` : ''}]\n}\n`
  );
}
