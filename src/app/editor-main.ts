/**
 * (PHASE13) `?scene=editor` (or `?scene=scenario`): the map editor for blocks and scenarios
 * ([D88]). No Phaser here.
 *
 * The open block is a draft (kept across reloads). Nothing goes into "My blocks" until you
 * Save: opening an official block just opens it; new blocks and edited official blocks are saved
 * as new entries. Opening something else with unsaved changes asks first (Save / Don't save /
 * Cancel). Play this block plays the draft; Play a random level uses saved blocks only.
 * `&open=<id>` opens a block on arrival (the world map viewer's "Open in editor").
 */
import { OFFICIAL_BLOCKS } from '../content/blocks';
import { str, type StringKey } from '../content/strings';
import { blockToJson, isScenario, newBlock, parseBlock, type BlockDef } from '../gen/block';
import { layoutToBlock, parseScenarioLayout } from '../gen/scenario-layout';
import { scenarioTemplate, type ScenarioTemplate } from '../gen/scenario-templates';
import { countFits, EdgeMatcher, sideProfiles } from '../gen/edges';
import { ORIENTATIONS, orientBlock } from '../gen/transform';
import { genMissionId } from '../gen/mission-id';
import { clearMission } from '../persistence/mission-store';
import { EditorModel } from '../ui/editor/editor-model';
import { EditorView, type SaveState } from '../ui/editor/editor-view';
import { openConnectionGraph } from '../ui/worldmap/connection-graph';
import {
  EDITOR_PREVIEW_ID,
  readDraft,
  readLibrary,
  readPlayBudget,
  writeDraft,
  writeLibrary,
  writePlayBudget,
  type Draft,
} from './editor-storage';
import { openBestStore } from './storage/indexeddb-store';
import { SCENARIO_PREVIEW_ID } from './scenario-route';
import { migrateScenarioDraft, saveScenarioPreview } from './scenario-storage';

export function startEditor(host: HTMLElement, params?: URLSearchParams): void {
  document.title = str('editor.title');
  const lib = readLibrary();
  // The old scenario editor's single draft joins My blocks & scenarios (once).
  if (migrateScenarioDraft(lib)) writeLibrary(lib);
  const officialIds = new Set(OFFICIAL_BLOCKS.map((b) => b.id));
  const official = (id: string) => OFFICIAL_BLOCKS.find((b) => b.id === id);
  const mine = (id: string) => lib.blocks.find((b) => b.id === id);
  const taken = (id: string, except?: string) =>
    officialIds.has(id) || lib.blocks.some((b) => b.id === id && b.id !== except);
  const freeId = (base: string) => {
    if (!taken(base)) return base;
    for (let n = 2; ; n++) if (!taken(`${base}-${n}`)) return `${base}-${n}`;
  };

  const fresh = (id: string, scenario: boolean): BlockDef =>
    scenario
      ? { ...newBlock(id, str('editor.newScenarioName'), 16, 12), kind: 'scenario' }
      : newBlock(id, str('editor.newName'));

  let draft: Draft = readDraft();
  /** What the draft is compared with to know if it has unsaved changes. */
  const baselineOf = (d: Draft): string => {
    if (d.source.kind === 'mine') {
      const saved = mine(d.source.id);
      return saved ? blockToJson(saved) : '';
    }
    if (d.source.kind === 'official') {
      const o = official(d.source.id);
      return o ? blockToJson(o) : '';
    }
    return blockToJson(fresh(d.source.id, isScenario(d.block)));
  };
  let baseline = baselineOf(draft);

  const model = new EditorModel(draft.block);
  model.budget = readPlayBudget();
  const dirty = () => blockToJson(model.block) !== baseline;
  const saveState = (): SaveState => {
    if (draft.source.kind === 'mine') return dirty() ? 'dirty' : 'saved';
    if (draft.source.kind === 'official') return dirty() ? 'dirty' : 'official';
    return dirty() ? 'dirty' : 'new';
  };

  model.onChange(() => {
    draft = { ...draft, block: model.block };
    writeDraft(draft);
  });
  writeDraft(draft);

  const load = (block: BlockDef, source: Draft['source']) => {
    draft = { block, source };
    baseline = baselineOf(draft);
    writeDraft(draft);
    model.load(block); // fires onChange → re-renders with the new save state
  };

  /**
   * Saves the draft into My blocks. Your own block is updated in place (following a rename); a
   * new or official one becomes a new entry. Asks for an id if it clashes. False if cancelled.
   */
  const save = (): boolean => {
    let b = model.block;
    const own = draft.source.kind === 'mine' ? draft.source.id : undefined;
    if (taken(b.id, own)) {
      const want = window.prompt(str('editor.saveAsPrompt'), freeId(`${b.id}-copy`));
      if (!want?.trim()) return false;
      const id = want.trim();
      if (taken(id, own)) {
        window.alert(str('editor.idTaken', { id }));
        return false;
      }
      model.setMeta({ id });
      b = model.block;
    }
    const i = own ? lib.blocks.findIndex((x) => x.id === own) : -1;
    if (i >= 0) lib.blocks[i] = b;
    else lib.blocks.push(b);
    writeLibrary(lib);
    poolSides = null;
    draft = { block: b, source: { kind: 'mine', id: b.id } };
    baseline = blockToJson(b);
    writeDraft(draft);
    view.refresh();
    return true;
  };

  /** Runs `then` once the draft is safe to replace: saved, discarded, or not changed. */
  const guard = (then: () => void) => {
    if (!dirty()) {
      then();
      return;
    }
    void view.askUnsaved(model.block.name).then((answer) => {
      if (answer === 'cancel') return;
      if (answer === 'save' && !save()) return;
      then();
    });
  };

  const go = (set: Record<string, string>) => {
    const url = new URL(window.location.href);
    for (const k of ['scene', 'mission', 'open', 'pool']) url.searchParams.delete(k);
    for (const [k, v] of Object.entries(set)) url.searchParams.set(k, v);
    url.hash = '';
    window.location.assign(url.toString());
  };

  const openById = (id: string) => {
    const m = mine(id);
    if (m) return load(m, { kind: 'mine', id });
    const o = official(id);
    if (o) load(o, { kind: 'official', id });
  };

  // (PHASE13) "N blocks fit" per side ([D101]): official + saved blocks in every orientation.
  const matcher = new EdgeMatcher();
  let poolSides: { id: string; sides: ReturnType<typeof sideProfiles> }[] | null = null;
  const sidesOfPool = () => {
    poolSides ??= [...OFFICIAL_BLOCKS, ...lib.blocks.filter((b) => !isScenario(b))].flatMap((b) =>
      ORIENTATIONS.map((o) => ({ id: b.id, sides: sideProfiles(orientBlock(b, o)) })),
    );
    return poolSides;
  };

  const view = new EditorView(host, model, {
    saveState,
    edgeFits: (block) =>
      countFits(
        block,
        sidesOfPool()
          .filter((x) => x.id !== draft.source.id)
          .map((x) => x.sides),
        matcher,
      ),
    save: () => void save(),
    newBlock: () =>
      guard(() => {
        const id = freeId('block-1');
        load(fresh(id, false), { kind: 'new', id });
      }),
    newScenario: () =>
      guard(() => {
        const id = freeId('scenario-1');
        load(fresh(id, true), { kind: 'new', id });
      }),
    openTemplate: (template: ScenarioTemplate) =>
      guard(() => {
        const id = freeId(template);
        const name = str(template === 'hq' ? 'hub.name' : 'map.basic.name');
        load(layoutToBlock(scenarioTemplate(template), id, name), { kind: 'new', id });
      }),
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
        // An old scenario editor file opens as a scenario.
        const layout = parseScenarioLayout(text);
        const id = layout ? freeId('scenario-1') : '';
        const res = layout
          ? {
              ok: true as const,
              block: layoutToBlock(layout, id, file.name.replace(/\.json$/i, '')),
            }
          : parseBlock(text);
        if (!res.ok) {
          window.alert(str(res.key as StringKey));
          return;
        }
        // Opened, not saved: Save adds it to My blocks (or updates yours with the same id).
        guard(() =>
          load(
            res.block,
            mine(res.block.id)
              ? { kind: 'mine', id: res.block.id }
              : { kind: 'new', id: res.block.id },
          ),
        );
      });
    },
    library: () => ({
      official: OFFICIAL_BLOCKS,
      custom: lib.blocks,
      current: draft.source,
    }),
    openBlock: (id) => guard(() => openById(id)),
    deleteBlock: (id) => {
      lib.blocks = lib.blocks.filter((b) => b.id !== id);
      writeLibrary(lib);
      poolSides = null;
      // The draft stays open, now unsaved.
      if (draft.source.kind === 'mine' && draft.source.id === id) {
        draft = { ...draft, source: { kind: 'new', id } };
        baseline = '';
        writeDraft(draft);
      }
      view.refresh();
    },
    budgetChanged: (budget) => writePlayBudget(budget),
    exit: () => go({}),
    playLevel: () => go({ mission: genMissionId(Math.floor(Math.random() * 1e9)), pool: 'mine' }),
    openGraph: () =>
      openConnectionGraph([...OFFICIAL_BLOCKS, ...lib.blocks.filter((b) => !isScenario(b))], {
        openBlock: (id) => {
          document.querySelector('.aoo-graph')?.remove();
          guard(() => openById(id));
        },
      }),
    play: () => {
      writeDraft(draft);
      if (isScenario(model.block)) {
        if (saveScenarioPreview(model.block)) go({ mission: SCENARIO_PREVIEW_ID });
        else window.alert(str('scenario.previewFailed'));
        return;
      }
      writePlayBudget(model.budget);
      // Old lives were recorded on the old block: start the playtest from scratch.
      void openBestStore()
        .then((store) => clearMission(store, EDITOR_PREVIEW_ID))
        .catch(() => undefined)
        .then(() => go({ mission: EDITOR_PREVIEW_ID }));
    },
  });

  const wanted = params?.get('open');
  if (wanted && wanted !== draft.source.id) guard(() => openById(wanted));
  (window as unknown as { __aoo?: unknown }).__aoo = { editor: model, view, library: lib };
}
