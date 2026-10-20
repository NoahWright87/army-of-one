import Phaser from 'phaser';
import { str } from '../content/strings';
import { DEFAULT_TUNING } from '../content/tuning';
import { KeyboardMouseInput } from '../render/input/keyboard-mouse-input';
import { BattleScene } from '../render/phaser/battle-scene';
import { GalleryScene } from '../render/phaser/gallery-scene';
import { PreloadScene } from '../render/phaser/preload-scene';
import type { SceneServices } from '../render/phaser/services';
import { CountdownOverlay } from '../ui/hud/countdown-overlay';
import { DebugOverlay, Hud } from '../ui/hud/hud';
import {
  bindDisplaySettings,
  displaySettingDefs,
  SETTING_IDS,
} from '../ui/settings/display-settings';
import { SettingsStore } from '../ui/settings/registry';
import { SettingsPanel } from '../ui/settings/settings-panel';
import { effectiveTuning, tuningSettingDefs } from '../ui/settings/tuning-settings';
import { createDefaultSession } from './battle-setup';
import { installHotkeys } from './hotkeys';
import { browserStorage } from './storage';

export const SETTINGS_STORAGE_KEY = 'army-of-one.settings.v1';

const params = new URLSearchParams(window.location.search);
const startScene = params.get('scene') === 'gallery' ? 'gallery' : 'battle';

// Settings: display/debug + every sim tuning value (applied when a battle (re)starts).
const settings = new SettingsStore(browserStorage(), SETTINGS_STORAGE_KEY);
settings.register(displaySettingDefs());
settings.register(tuningSettingDefs(DEFAULT_TUNING));
const display = bindDisplaySettings(settings);

// DOM overlays.
const uiRoot = document.getElementById('ui-root') ?? document.body;
const hud = new Hud(uiRoot);
const countdown = new CountdownOverlay(uiRoot);
const debug = new DebugOverlay(uiRoot);
const panel = new SettingsPanel(uiRoot, settings);
debug.setVisible(display.debugOverlay);
settings.subscribe((id, v) => {
  if (id === SETTING_IDS.debugOverlay) debug.setVisible(v === true);
});

const services: SceneServices = {
  display,
  hud,
  countdown,
  debug,
  commands: {},
  createSession: () =>
    createDefaultSession(
      effectiveTuning(settings, DEFAULT_TUNING),
      (scene) => new KeyboardMouseInput(scene),
    ),
};

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#111418',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [new PreloadScene(startScene), new BattleScene(services), new GalleryScene(services)],
});

panel.addAction({
  label: str('settings.action.restart'),
  run: () => {
    const active = game.scene.getScenes(true)[0];
    if (active) active.scene.restart();
  },
});
panel.addAction({
  label: str('settings.action.countdown'),
  run: () => services.commands.playCountdown?.(),
});

installHotkeys(window, {
  toggleDebug: () => settings.toggle(SETTING_IDS.debugOverlay),
  toggleSettings: () => panel.toggle(),
});

/** Debug/e2e hook (screenshots, browser tests). Not part of any gameplay contract. */
(window as unknown as { __aoo?: unknown }).__aoo = { game, settings };
