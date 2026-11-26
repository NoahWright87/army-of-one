/**
 * (PHASE18) `?scene=sarge`: the Sarge script editor ([D161]). Plain DOM, no Phaser. It edits the
 * drill sergeant's script (kept in this browser on top of the repo default); "Play from here"
 * opens basic training at a station with it, and the game's "← Sarge editor" comes back.
 */
import { BASIC_TRAINING, BASIC_TRAINING_ID } from '../content/maps/basic-training';
import { BT_STATIONS, gateRules } from '../content/maps/basic-training-stations';
import { DEFAULT_SARGE_SCRIPT } from '../content/sarge-script';
import { str } from '../content/strings';
import { SargeEditorView } from '../ui/sarge-editor/sarge-editor-view';
import { clearScript, loadScript, parseScript, saveScript } from './sarge-script-store';

export function startSargeEditor(host: HTMLElement, params: URLSearchParams): void {
  document.title = str('sarge.title');
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  const loaded = loadScript(storage);
  let script = loaded.script;
  let edited = loaded.edited;
  let outdated = loaded.outdated;
  new SargeEditorView(host, {
    script: () => script,
    save: (s) => {
      script = s;
      saveScript(storage, s);
      edited = true;
    },
    reset: () => {
      clearScript(storage);
      script = structuredClone(DEFAULT_SARGE_SCRIPT);
      edited = false;
      outdated = false;
    },
    importJson: (json) => {
      const parsed = parseScript(json);
      if (typeof parsed === 'string') return parsed;
      script = parsed;
      saveScript(storage, parsed);
      edited = true;
      return null;
    },
    play: (stationId) => {
      const u = new URL(window.location.href);
      u.search = '';
      u.searchParams.set('mission', BASIC_TRAINING_ID);
      u.searchParams.set('go', '1');
      u.searchParams.set('new', '1');
      u.searchParams.set('station', stationId);
      u.searchParams.set('from', 'sarge');
      const dev = params.get('dev');
      if (dev) u.searchParams.set('dev', dev);
      u.hash = '';
      window.location.assign(u.toString());
    },
    stations: BT_STATIONS.map((s) => ({ id: s.id, label: s.label, y: s.start.y })),
    gateRules: gateRules(BASIC_TRAINING),
    edited: () => edited,
    outdated: () => outdated,
  });
}
