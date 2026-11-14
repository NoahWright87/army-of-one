/**
 * (PHASE13-a) Where the block editor keeps its work, and how Play hands the block to the game.
 * The editor autosaves the block it's on to localStorage; Play opens the game on the
 * `EDITOR_PREVIEW_ID` mission, which main.ts builds from that same saved block.
 */
import { parseBlock, type BlockDef } from '../gen/block';
import { blockToPreviewMap } from '../gen/preview';
import type { MapDef } from '../sim/world/map';

export const EDITOR_BLOCK_KEY = 'army-of-one.editor.block.v1';
export const EDITOR_PREVIEW_ID = 'editor-preview';

export function readEditorBlock(): BlockDef | null {
  try {
    const raw = window.localStorage.getItem(EDITOR_BLOCK_KEY);
    if (!raw) return null;
    const res = parseBlock(raw);
    return res.ok ? res.block : null;
  } catch {
    return null;
  }
}

export function writeEditorBlock(block: BlockDef): void {
  try {
    window.localStorage.setItem(EDITOR_BLOCK_KEY, JSON.stringify(block));
  } catch {
    // blocked storage: the work lives until the tab closes; Download still works
  }
}

/** The Play map for the saved editor block, or null if there's none. */
export function editorPreviewMap(): MapDef | null {
  const block = readEditorBlock();
  return block
    ? blockToPreviewMap(block, { id: EDITOR_PREVIEW_ID, nameKey: 'map.editorPreview.name' })
    : null;
}
