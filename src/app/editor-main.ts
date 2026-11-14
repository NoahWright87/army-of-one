/**
 * (PHASE13-a) `?scene=editor`: the block editor ([D88]). No Phaser here; Play opens the real
 * game on the block (`?mission=editor-preview`), with a fresh save each time.
 */
import { str } from '../content/strings';
import { blockToJson, newBlock, parseBlock } from '../gen/block';
import { clearMission } from '../persistence/mission-store';
import { EditorModel } from '../ui/editor/editor-model';
import { EditorView } from '../ui/editor/editor-view';
import { EDITOR_PREVIEW_ID, readEditorBlock, writeEditorBlock } from './editor-storage';
import { openBestStore } from './storage/indexeddb-store';

export function startEditor(host: HTMLElement): void {
  document.title = str('editor.title');
  const model = new EditorModel(readEditorBlock() ?? newBlock());
  model.onChange(() => writeEditorBlock(model.block));
  writeEditorBlock(model.block);

  const view = new EditorView(host, model, {
    newBlock: () => {
      if (window.confirm(str('editor.newConfirm'))) model.load(newBlock());
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
        if (res.ok) model.load(res.block);
        else window.alert(str(res.key as Parameters<typeof str>[0]));
      });
    },
    play: () => {
      writeEditorBlock(model.block);
      // Old lives were recorded on the old block: start the playtest from scratch.
      void openBestStore()
        .then((store) => clearMission(store, EDITOR_PREVIEW_ID))
        .catch(() => undefined)
        .then(() => {
          const url = new URL(window.location.href);
          url.searchParams.delete('scene');
          url.searchParams.set('mission', EDITOR_PREVIEW_ID);
          url.hash = '';
          window.location.assign(url.toString());
        });
    },
  });
  (window as unknown as { __aoo?: unknown }).__aoo = { editor: model, view };
}
