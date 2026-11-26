import { SCENARIO_PREVIEW_ID } from './scenario-route';
import {
  parseScenarioLayout,
  scenarioPreviewMap,
  type ScenarioLayout,
} from '../gen/scenario-layout';

const DRAFT_KEY = 'army-of-one.scenario.draft.v1';
const PREVIEW_KEY = 'army-of-one.scenario.preview.v1';

export function readScenarioDraft(): ScenarioLayout | null {
  try {
    return parseScenarioLayout(window.localStorage.getItem(DRAFT_KEY) ?? '');
  } catch {
    return null;
  }
}

export function saveScenarioDraft(layout: ScenarioLayout): boolean {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(layout));
    return true;
  } catch {
    return false;
  }
}

export function saveScenarioPreview(layout: ScenarioLayout): boolean {
  try {
    window.sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(layout));
    return true;
  } catch {
    return false;
  }
}

export function loadScenarioPreview() {
  try {
    const layout = parseScenarioLayout(window.sessionStorage.getItem(PREVIEW_KEY) ?? '');
    return layout ? scenarioPreviewMap(layout, SCENARIO_PREVIEW_ID) : undefined;
  } catch {
    return undefined;
  }
}
