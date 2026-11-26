import { SCENARIO_PREVIEW_ID } from './scenario-route';
import { str } from '../content/strings';
import { newScenarioLayout } from '../gen/scenario-layout';
import { ScenarioView } from '../ui/editor/scenario-view';
import { readScenarioDraft, saveScenarioDraft, saveScenarioPreview } from './scenario-storage';

export function startScenarioEditor(host: HTMLElement): void {
  document.title = str('scenario.title');
  const navigate = (key: 'scene' | 'mission', value: string) => {
    const url = new URL(window.location.href);
    const dev = url.searchParams.get('dev');
    url.search = '';
    url.hash = '';
    if (dev !== null) url.searchParams.set('dev', dev);
    url.searchParams.set(key, value);
    window.location.assign(url.toString());
  };
  new ScenarioView(host, readScenarioDraft() ?? newScenarioLayout(), {
    save: saveScenarioDraft,
    play: (layout) => {
      if (!saveScenarioPreview(layout)) return false;
      navigate('mission', SCENARIO_PREVIEW_ID);
      return true;
    },
    openBlocks: () => navigate('scene', 'editor'),
  });
}
