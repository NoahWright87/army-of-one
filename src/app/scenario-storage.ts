/**
 * Playing a scenario from the editor: the draft is handed to the game through tab storage
 * (`?mission=scenario-preview`), and turned into a map by `scenarioMap`. Also brings the old
 * scenario editor's draft into the library once.
 */
import { SCENARIO_PREVIEW_ID } from './scenario-route';
import { parseBlockObject, type BlockDef } from '../gen/block';
import { layoutToBlock, parseScenarioLayout } from '../gen/scenario-layout';
import { scenarioMap } from '../gen/scenario';
import type { Library } from './editor-storage';

/** The old scenario editor's only draft (before blocks and scenarios shared one editor). */
const OLD_DRAFT_KEY = 'army-of-one.scenario.draft.v1';
const PREVIEW_KEY = 'army-of-one.scenario.preview.v2';

export function saveScenarioPreview(block: BlockDef): boolean {
  try {
    window.sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(block));
    return true;
  } catch {
    return false;
  }
}

export function loadScenarioPreview() {
  try {
    const res = parseBlockObject(JSON.parse(window.sessionStorage.getItem(PREVIEW_KEY) ?? 'null'));
    return res.ok ? scenarioMap(res.block, SCENARIO_PREVIEW_ID) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Adds the old scenario editor's draft to `lib` as a scenario and forgets the old key. True if
 * `lib` changed (the caller saves it).
 */
export function migrateScenarioDraft(lib: Library): boolean {
  try {
    const raw = window.localStorage.getItem(OLD_DRAFT_KEY);
    if (raw === null) return false;
    const layout = parseScenarioLayout(raw);
    const changed =
      !!layout &&
      (layout.items.length > 0 ||
        layout.spawn !== null ||
        layout.ground.some((r) => /[^G]/.test(r)));
    if (layout && changed) {
      let id = 'scenario-draft';
      for (let n = 2; lib.blocks.some((b) => b.id === id); n++) id = `scenario-draft-${n}`;
      lib.blocks.push(layoutToBlock(layout, id, 'Scenario draft'));
    }
    window.localStorage.removeItem(OLD_DRAFT_KEY);
    return changed;
  } catch {
    return false;
  }
}
