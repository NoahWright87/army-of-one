/**
 * (PHASE13-a/b) Where the block editor keeps its work, and how the game gets maps from it.
 *
 * - The library: the player's own blocks plus which one is open, in localStorage. Official
 *   blocks come from the repo (`src/content/blocks/`).
 * - Play this block: the game opens `EDITOR_PREVIEW_ID`, built from the open block at the
 *   editor's budget.
 * - Generated levels (`gen-<seed>`): stitched from the official blocks plus the player's own
 *   blocks that have no problems.
 */
import { OFFICIAL_BLOCKS } from '../content/blocks';
import { newBlock, parseBlock, parseBlockObject, validateBlock, type BlockDef } from '../gen/block';
import { generateLevel } from '../gen/level';
import { parseGenMissionId } from '../gen/mission-id';
import { blockToPreviewMap } from '../gen/preview';
import type { MapDef } from '../sim/world/map';

export const EDITOR_PREVIEW_ID = 'editor-preview';
const LIBRARY_KEY = 'army-of-one.editor.library.v1';
const PLAY_BUDGET_KEY = 'army-of-one.editor.playBudget';
/** (13-a) The single autosaved block, before the library existed: migrated once. */
const OLD_BLOCK_KEY = 'army-of-one.editor.block.v1';

export interface Library {
  /** Id of the block open in the editor. */
  current: string;
  blocks: BlockDef[];
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLibrary(): Library {
  const s = storage();
  try {
    const raw = s?.getItem(LIBRARY_KEY);
    if (raw) {
      const data = JSON.parse(raw) as { current?: unknown; blocks?: unknown[] };
      const blocks = (data.blocks ?? []).flatMap((b) => {
        const res = parseBlockObject(b);
        return res.ok ? [res.block] : [];
      });
      if (blocks.length) {
        const current = typeof data.current === 'string' ? data.current : blocks[0]!.id;
        return { current, blocks };
      }
    }
    const old = s?.getItem(OLD_BLOCK_KEY);
    const res = old ? parseBlock(old) : null;
    if (res?.ok) return { current: res.block.id, blocks: [res.block] };
  } catch {
    // corrupt storage: start fresh
  }
  const b = newBlock();
  return { current: b.id, blocks: [b] };
}

export function writeLibrary(lib: Library): void {
  try {
    storage()?.setItem(LIBRARY_KEY, JSON.stringify(lib));
  } catch {
    // blocked or full storage: the work lives until the tab closes; Download still works
  }
}

/** The block open in the editor. */
export function readEditorBlock(): BlockDef | null {
  const lib = readLibrary();
  return lib.blocks.find((b) => b.id === lib.current) ?? lib.blocks[0] ?? null;
}

/** The editor's budget slider for Play (null = everything). */
export function readPlayBudget(): number | null {
  const v = storage()?.getItem(PLAY_BUDGET_KEY);
  if (!v || v === 'all') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function writePlayBudget(budget: number | null): void {
  try {
    storage()?.setItem(PLAY_BUDGET_KEY, budget === null ? 'all' : String(budget));
  } catch {
    // ignore
  }
}

/** The Play map for the open editor block, or null if there's none. */
export function editorPreviewMap(): MapDef | null {
  const block = readEditorBlock();
  return block
    ? blockToPreviewMap(block, {
        id: EDITOR_PREVIEW_ID,
        nameKey: 'map.editorPreview.name',
        budget: readPlayBudget(),
      })
    : null;
}

/** Blocks generated levels use: official + the player's own that have no problems. */
export function generationPool(): BlockDef[] {
  const official = new Set(OFFICIAL_BLOCKS.map((b) => b.id));
  const custom = readLibrary().blocks.filter(
    (b) => !official.has(b.id) && validateBlock(b).length === 0,
  );
  return [...OFFICIAL_BLOCKS, ...custom];
}

/** A generated mission's map (`gen-<seed>[-<budget>]`), or null if `id` isn't one. */
export function generatedMap(id: string): MapDef | null {
  const gid = parseGenMissionId(id);
  if (!gid) return null;
  return generateLevel(generationPool(), {
    id,
    nameKey: 'map.generated.name',
    seed: gid.seed,
    budget: gid.budget,
  }).map;
}

/** Runtime maps resolve on the main thread: the background worker can't see them. */
export function isRuntimeMission(id: string): boolean {
  return id === EDITOR_PREVIEW_ID || parseGenMissionId(id) !== null;
}
