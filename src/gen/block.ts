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
  type EdgeTag,
  type GroundKind,
} from '../content/ground';
import type { CoverMaterial } from '../sim/world/map';

export const BLOCK_VERSION = 1;

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
  /** Spawn group ([D85]): members only spawn if the group's anchor did. */
  group?: string;
  /** This item is its group's anchor. */
  anchor?: boolean;
}

export type BlockItem =
  | (ItemBase & { kind: 'wall'; rect: CellRect })
  | (ItemBase & { kind: 'cover'; rect: CellRect; material: CoverMaterial })
  | (ItemBase & { kind: 'gate'; rect: CellRect; open?: boolean })
  | (ItemBase & { kind: 'lever'; at: CellPoint; target: string })
  | (ItemBase & { kind: 'turret'; at: CellPoint; facing: number })
  | (ItemBase & { kind: 'mine'; at: CellPoint })
  | (ItemBase & { kind: 'soldier'; at: CellPoint; role: RoleId; facing: number })
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
  { kind: 'soldier', shape: 'point' },
  { kind: 'capture', shape: 'point' },
  { kind: 'objective', shape: 'point' },
];

/** Kinds that are always priority 0 ([D85]: capture points and objectives always spawn). */
export const ALWAYS_KINDS: ReadonlySet<ItemKind> = new Set(['capture', 'objective']);

export interface BlockDef {
  v: typeof BLOCK_VERSION;
  id: string;
  /** Author-facing name (shown in the editor, not in the game). */
  name: string;
  edges: Record<Side, EdgeTag>;
  /** BLOCK_CELLS rows (north first) of BLOCK_CELLS ground letters each. */
  ground: string[];
  items: BlockItem[];
}

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
  const last = BLOCK_CELLS - 1;
  const corner = (col === 0 || col === last) && (row === 0 || row === last);
  if (corner) return null;
  const at = (side: Side, i: number) => EDGE_TAGS[edges[side]].profile[i] as GroundKind;
  if (row === 0) return at('n', col);
  if (row === last) return at('s', col);
  if (col === 0) return at('w', row);
  if (col === last) return at('e', row);
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

  for (const g of groupIds(block)) {
    const members = block.items.filter((i) => i.group === g);
    const anchors = members.filter((i) => i.anchor);
    if (anchors.length !== 1) {
      out.push({ key: 'editor.problem.groupAnchor', params: { group: g, n: anchors.length } });
      continue;
    }
    const anchor = anchors[0]!;
    for (const m of members) {
      if (m.priority !== 0 && m.priority < anchor.priority) {
        out.push({
          key: 'editor.problem.memberBeforeAnchor',
          params: { id: m.id, group: g },
          itemId: m.id,
        });
      }
    }
  }
  return out;
}

/** Group names in first-use order. */
export function groupIds(block: BlockDef): string[] {
  const out: string[] = [];
  for (const it of block.items) if (it.group && !out.includes(it.group)) out.push(it.group);
  return out;
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
      const lock = edgeLock(block.edges, c, r);
      if (lock && GROUND[lock].passable) return true;
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
  if (b.v !== BLOCK_VERSION) return { ok: false, key: 'editor.load.version' };
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
  return {
    ok: true,
    block: { ...(b as BlockDef), name: typeof b.name === 'string' ? b.name : b.id },
  };
}

/** Stable, diff-friendly JSON: one ground row and one item per line. */
export function blockToJson(block: BlockDef): string {
  const rows = block.ground.map((r) => `    ${JSON.stringify(r)}`).join(',\n');
  const items = block.items.map((i) => `    ${JSON.stringify(i)}`).join(',\n');
  return (
    `{\n  "v": ${block.v},\n  "id": ${JSON.stringify(block.id)},\n` +
    `  "name": ${JSON.stringify(block.name)},\n  "edges": ${JSON.stringify(block.edges)},\n` +
    `  "ground": [\n${rows}\n  ],\n  "items": [${items ? `\n${items}\n  ` : ''}]\n}\n`
  );
}
