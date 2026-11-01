/**
 * Dev page for the respawn screen: `?screen=respawn&fixture=<name>` (no Phaser). Renders a
 * fixture built with the real truth model; the `scrubber` fixture streams its progressive
 * resolve updates like PHASE04's worker will. F2 opens the settings panel.
 */
import { str } from '../content/strings';
import { el, injectStyle } from '../ui/dom';
import {
  buildFixture,
  FIXTURE_NAMES,
  type RespawnFixture,
} from '../ui/respawn/__fixtures__/respawn-fixtures';
import { RespawnScreen } from '../ui/respawn/respawn-screen';
import {
  isRespawnSetting,
  readRespawnSettings,
  respawnSettingDefs,
} from '../ui/respawn/respawn-settings';
import { SettingsStore } from '../ui/settings/registry';
import { SettingsPanel } from '../ui/settings/settings-panel';
import { installHotkeys } from './hotkeys';
import { browserStorage } from './storage';

const SETTINGS_STORAGE_KEY = 'army-of-one.settings.v1';
const STREAM_STEP_MS = 90;

const DEV_CSS = `
.rs-dev { position: fixed; left: 0; right: 0; top: 0; height: 40px; z-index: 25; display: flex; gap: 8px;
  align-items: center; padding: 0 16px; background: #1d2228; border-bottom: 1px solid #39424c;
  font: 12px system-ui, sans-serif; color: #c8d0d8; box-sizing: border-box; }
.rs-dev select, .rs-dev button { font: inherit; background: #222a32; color: #e6e9ec; border: 1px solid #3c4650;
  border-radius: 3px; height: 30px; }
.rs-dev .out { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #ffd34d; }
.rs-dev-stage { position: fixed; left: 0; right: 0; top: 40px; bottom: 0; }
`;

export function startRespawnDevPage(params: URLSearchParams, uiRoot: HTMLElement): void {
  injectStyle('aoo-respawn-dev-css', DEV_CSS);
  document.getElementById('game')?.remove();

  const settings = new SettingsStore(browserStorage(), SETTINGS_STORAGE_KEY);
  settings.register(respawnSettingDefs());
  const panel = new SettingsPanel(uiRoot, settings);

  const bar = el('div', 'rs-dev');
  const select = el('select');
  for (const n of FIXTURE_NAMES) {
    const o = el('option', '', n);
    o.value = n;
    select.append(o);
  }
  const replay = el('button', '', str('respawn.dev.replay'));
  const gear = el('button', '', str('settings.title'));
  const out = el('span', 'out');
  bar.append(el('span', '', str('respawn.dev.fixture')), select, replay, gear, out);
  const stage = el('div', 'rs-dev-stage');
  uiRoot.append(bar, stage);

  let screen: RespawnScreen | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const show = (name: string) => {
    if (timer) clearInterval(timer);
    timer = null;
    screen?.destroy();
    const f: RespawnFixture = buildFixture(name) ?? buildFixture(FIXTURE_NAMES[0]!)!;
    select.value = f.name;
    out.textContent = f.about;
    screen = RespawnScreen.mount(stage, f.props, {
      settings: readRespawnSettings(settings),
      onDeploy: (option) => {
        out.textContent = str('respawn.dev.deployed', { option: JSON.stringify(option) });
      },
    });
    const stream = f.stream ?? [];
    let i = 0;
    if (stream.length > 0 && params.get('still') !== '1') {
      timer = setInterval(() => {
        const u = stream[i++];
        if (!u || !screen) {
          if (timer) clearInterval(timer);
          timer = null;
          return;
        }
        screen.update(u);
      }, STREAM_STEP_MS);
    }
    // Screenshot hook: jump straight to stream step N (`&step=N`).
    const step = Number(params.get('step'));
    if (step > 0 && stream.length > 0) {
      if (timer) clearInterval(timer);
      timer = null;
      for (const u of stream.slice(0, step)) screen.update(u);
    }
    const url = new URL(window.location.href);
    url.searchParams.set('fixture', f.name);
    window.history.replaceState(null, '', url);
  };

  select.onchange = () => show(select.value);
  replay.onclick = () => show(select.value);
  gear.onclick = () => panel.toggle();
  settings.subscribe((id) => {
    if (isRespawnSetting(id)) screen?.setSettings(readRespawnSettings(settings));
  });
  installHotkeys(window, { toggleDebug: () => {}, toggleSettings: () => panel.toggle() });
  show(params.get('fixture') ?? 'rescue');
  (window as unknown as { __aoo?: unknown }).__aoo = {
    settings,
    get screen() {
      return screen;
    },
  };
}
