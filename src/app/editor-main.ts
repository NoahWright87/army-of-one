/**
 * (PHASE13-a/b) `?scene=editor`: the block editor ([D88]). No Phaser here.
 *
 * Keeps the player's blocks in a library (localStorage), opens official blocks as copies, and
 * hands off to the game: Play this block (`?mission=editor-preview`, a fresh save each time) or
 * Play a random level (`?mission=gen-<seed>`, stitched from official + own blocks).
 */
import { OFFICIAL_BLOCKS } from '../content/blocks';
import { str, type StringKey } from '../content/strings';
import { blockToJson, newBlock, parseBlock, type BlockDef } from '../gen/block';
import { genMissionId } from '../gen/mission-id';
import { clearMission } from '../persistence/mission-store';
import { EditorModel } from '../ui/editor/editor-model';
import { EditorView } from '../ui/editor/editor-view';
import {
  EDITOR_PREVIEW_ID,
  readLibrary,
  readPlayBudget,
  writeLibrary,
  writePlayBudget,
} from './editor-storage';
import { openBestStore } from './storage/indexeddb-store';

export function startEditor(host: HTMLElement): void {
  document.title = str('editor.title');
  const lib = readLibrary();
  const officialIds = new Set(OFFICIAL_BLOCKS.map((b) => b.id));
  const taken = (id: string, except?: string) =>
    officialIds.has(id) || lib.blocks.some((b) => b.id === id && b.id !== except);
  const freeId = (base: string) => {
    if (!taken(base)) return base;
    for (let n = 2; ; n++) if (!taken(`${base}-${n}`)) return `${base}-${n}`;
  };

  const current = lib.blocks.find((b) => b.id === lib.current) ?? lib.blocks[0]!;
  lib.current = current.id;
  const model = new EditorModel(current);
  model.budget = readPlayBudget();

  /** Saves the open block into the library (following a rename of its id). */
  const save = () => {
    const b = model.block;
    if (b.id !== lib.current && taken(b.id, lib.current)) {
      model.setMeta({ id: freeId(b.id) }); // comes back here with a free id
      return;
    }
    const i = lib.blocks.findIndex((x) => x.id === lib.current);
    if (i >= 0) lib.blocks[i] = b;
    else lib.blocks.push(b);
    lib.current = b.id;
    writeLibrary(lib);
  };
  model.onChange(save);
  save();

  const open = (b: BlockDef) => {
    if (!lib.blocks.includes(b)) lib.blocks.push(b);
    lib.current = b.id;
    model.load(b);
  };
  const go = (params: Record<string, string>) => {
    const url = new URL(window.location.href);
    url.searchParams.delete('scene');
    url.searchParams.delete('mission');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.hash = '';
    window.location.assign(url.toString());
  };

  const view = new EditorView(host, model, {
    newBlock: () => {
      const id = freeId('block-1');
      open(newBlock(id, str('editor.newName')));
    },
    download: () => {
      const blob = new Blob([blockToJson(model.block)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${model.block.id}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    copy: async () => {
      try {
        await navigator.clipboard.writeText(blockToJson(model.block));
        return true;
      } catch {
        return false;
      }
    },
    upload: (file) => {
      void file.text().then((text) => {
        const res = parseBlock(text);
        if (!res.ok) {
          window.alert(str(res.key as StringKey));
          return;
        }
        // Re-opening one of your own blocks replaces it; anything else is added.
        const mine = lib.blocks.findIndex((b) => b.id === res.block.id);
        if (mine >= 0) {
          lib.blocks[mine] = res.block;
          open(res.block);
        } else open({ ...res.block, id: freeId(res.block.id) });
      });
    },
    library: () => ({ official: OFFICIAL_BLOCKS, custom: lib.blocks, current: lib.current }),
    openBlock: (id, official) => {
      if (official) {
        const src = OFFICIAL_BLOCKS.find((b) => b.id === id);
        if (src) {
          open({
            ...src,
            id: freeId(`${src.id}-copy`),
            name: str('editor.copyName', { name: src.name }),
          });
        }
        return;
      }
      const b = lib.blocks.find((x) => x.id === id);
      if (b) open(b);
    },
    deleteBlock: (id) => {
      lib.blocks = lib.blocks.filter((b) => b.id !== id);
      if (lib.current === id) {
        const next = lib.blocks[0] ?? newBlock(freeId('block-1'), str('editor.newName'));
        open(next);
      }
      writeLibrary(lib);
    },
    budgetChanged: (budget) => writePlayBudget(budget),
    exit: () => go({}),
    playLevel: () => {
      save();
      go({ mission: genMissionId(Math.floor(Math.random() * 1e9)) });
    },
    play: () => {
      save();
      writePlayBudget(model.budget);
      // Old lives were recorded on the old block: start the playtest from scratch.
      void openBestStore()
        .then((store) => clearMission(store, EDITOR_PREVIEW_ID))
        .catch(() => undefined)
        .then(() => go({ mission: EDITOR_PREVIEW_ID }));
    },
  });
  (window as unknown as { __aoo?: unknown }).__aoo = { editor: model, view, library: lib };
}
