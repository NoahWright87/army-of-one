/**
 * (PHASE13-a/b) Where the block editor keeps its work, and how the game gets maps from it.
 *
 * - The library ("My blocks"): the player's saved blocks, in localStorage. Official blocks
 *   come from the repo (`src/content/blocks/`). The block being edited is a draft until saved.
 * - Play this block: the game opens `EDITOR_PREVIEW_ID`, built from the open block at the
 *   editor's budget.
 * - Generated levels (`gen-<seed>`): stitched from the official blocks plus the player's own
 *   blocks that have no problems.
 */
import { OFFICIAL_BLOCKS } from '../content/blocks';
import { newBlock, parseBlock, parseBlockObject, validateBlock, type BlockDef } from '../gen/block';
import { generateLevel } from '../gen/level';
import { weatherForLevel } from '../gen/weather';
import { parseGenMissionId, parseWorldMissionId, worldMissionId } from '../gen/mission-id';
import { generateWorld, worldLevelMap, type GeneratedWorld } from '../gen/world';
import { mainEntrySide } from '../gen/region';
import { fitTurns, rotateMap } from '../gen/rotate-map';
import { blockToPreviewMap } from '../gen/preview';
import type { MapDef } from '../sim/world/map';
import { SCENARIO_PREVIEW_ID } from './scenario-route';

export const EDITOR_PREVIEW_ID = 'editor-preview';
const LIBRARY_KEY = 'army-of-one.editor.library.v1';
const PLAY_BUDGET_KEY = 'army-of-one.editor.playBudget';
/** (13-a) The single autosaved block, before the library existed: migrated once. */
const OLD_BLOCK_KEY = 'army-of-one.editor.block.v1';

export interface Library {
  /** (13-a/b) Which block was open, before drafts existed: only read, to migrate. */
  current?: string;
  /** The player's saved blocks ("My blocks"). */
  blocks: BlockDef[];
}

/**
 * (PHASE13) The block open in the editor: a draft, kept apart from the library until it's
 * saved. `source` says where it came from: a fresh block, an official one (opened as is, never
 * copied until saved), or one of yours (`id` = its library id).
 */
export interface Draft {
  block: BlockDef;
  source: { kind: 'new' | 'official' | 'mine'; id: string };
}

const DRAFT_KEY = 'army-of-one.editor.draft.v1';

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
      return typeof data.current === 'string' ? { current: data.current, blocks } : { blocks };
    }
    const old = s?.getItem(OLD_BLOCK_KEY);
    const res = old ? parseBlock(old) : null;
    if (res?.ok) return { current: res.block.id, blocks: [res.block] };
  } catch {
    // corrupt storage: start fresh
  }
  return { blocks: [] };
}

export function writeLibrary(lib: Library): void {
  try {
    storage()?.setItem(LIBRARY_KEY, JSON.stringify({ blocks: lib.blocks }));
  } catch {
    // blocked or full storage: the work lives until the tab closes; Download still works
  }
}

export function readDraft(): Draft {
  try {
    const raw = storage()?.getItem(DRAFT_KEY);
    if (raw) {
      const data = JSON.parse(raw) as { block?: unknown; source?: Draft['source'] };
      const res = parseBlockObject(data.block);
      const kind = data.source?.kind;
      if (res.ok && (kind === 'new' || kind === 'official' || kind === 'mine')) {
        return { block: res.block, source: { kind, id: String(data.source!.id ?? '') } };
      }
    }
  } catch {
    // fall through
  }
  // Before drafts: the library's open block was the work in progress.
  const lib = readLibrary();
  const mine = lib.blocks.find((b) => b.id === lib.current) ?? lib.blocks[0];
  if (mine) return { block: mine, source: { kind: 'mine', id: mine.id } };
  const b = newBlock();
  return { block: b, source: { kind: 'new', id: b.id } };
}

export function writeDraft(d: Draft): void {
  try {
    storage()?.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    // ignore: Download still works
  }
}

/** The block open in the editor (what Play this block plays). */
export function readEditorBlock(): BlockDef | null {
  return readDraft().block;
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

/** Official blocks only, or official + your saved ones ("Use my saved blocks too"). */
export function blockPool(includeMine: boolean): BlockDef[] {
  return includeMine ? generationPool() : [...OFFICIAL_BLOCKS];
}

/** (PHASE13-c) A world map from a block pool (cached per seed and pool). */
const worlds = new Map<string, GeneratedWorld>();
export function worldFor(seed: number, includeMine = false): GeneratedWorld {
  const key = `${seed}:${includeMine}`;
  const cached = worlds.get(key);
  if (cached) return cached;
  const w = generateWorld(blockPool(includeMine), { seed });
  worlds.set(key, w);
  return w;
}

/**
 * A generated mission's map, or null if `id` isn't one: `gen-<seed>[-<budget>]` (a random
 * level) or `world-<seed>-<level>[-<budget>]` (one level of a world map).
 */
export function generatedMap(
  id: string,
  opts: { includeMine?: boolean; world?: GeneratedWorld } = {},
): MapDef | null {
  const wid = parseWorldMissionId(id);
  if (wid) {
    // (PHASE14) A campaign passes its own world (made from the blocks it keeps, [D126]).
    const w =
      opts.world && opts.world.seed === wid.seed
        ? opts.world
        : worldFor(wid.seed, opts.includeMine ?? false);
    if (!w.levels[wid.level]) return null;
    const map = worldLevelMap(w, wid.level, {
      id,
      nameKey: 'map.world.name',
      weather: wid.weather,
      ...(wid.budget !== undefined ? { budget: wid.budget } : {}),
      ...(wid.held ? { held: new Set(wid.held) } : {}),
    }).map;
    return wid.turns ? rotateMap(map, wid.turns) : map;
  }
  const gid = parseGenMissionId(id);
  if (!gid) return null;
  return generateLevel(blockPool(opts.includeMine ?? false), {
    id,
    nameKey: 'map.generated.name',
    seed: gid.seed,
    budget: gid.budget,
  }).map;
}

/** Runtime maps resolve on the main thread: the background worker can't see them. */
export function isRuntimeMission(id: string): boolean {
  return (
    id === EDITOR_PREVIEW_ID ||
    id === SCENARIO_PREVIEW_ID ||
    parseGenMissionId(id) !== null ||
    parseWorldMissionId(id) !== null
  );
}

/**
 * (PHASE13-d) The mission id for playing one level of a world: with the neighbours held (for a
 * campaign) or turned to fit this screen for a standalone world playtest ([D107]).
 */
export function worldLevelMissionId(
  world: GeneratedWorld,
  level: number,
  budget: number,
  held?: ReadonlySet<number>,
): string {
  const lv = world.levels[level]!;
  const screen = window.innerHeight >= window.innerWidth ? 'portrait' : 'landscape';
  // Campaign battles share the board's compass. The standalone world playtester can still fit.
  const turns = held
    ? undefined
    : fitTurns(lv.box.w, lv.box.h, screen, mainEntrySide(world, level));
  // Only the neighbours matter (the id stays short and the save slot stable).
  const near = new Set(
    world.crossings
      .filter((c) => c.a === level || c.b === level)
      .map((c) => (c.a === level ? c.b : c.a))
      .filter((o) => o >= 0),
  );
  return worldMissionId(world.seed, level, budget, {
    ...(held ? { held: [...held].filter((h) => near.has(h)) } : {}),
    ...(turns !== undefined ? { turns } : {}),
    weather: weatherForLevel(world.seed, level),
  });
}
