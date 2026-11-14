import Phaser from 'phaser';
import { findMap, MISSIONS, missionOrDefault, registerMap } from '../content/maps';
import { EDITOR_PREVIEW_ID, editorPreviewMap } from './editor-storage';
import { clearMission, loadMission, MissionSaver } from '../persistence/mission-store';
import { recordedTo } from '../sim/recording/records';
import { str, strDynamic } from '../content/strings';
import type { SpawnOption } from '../contracts/mission';
import { formatBattleTime } from '../sim/core/time';
import { resolveRenderScale } from '../render/render-scale';
import { DEFAULT_TUNING, withTuning } from '../content/tuning';
import { KeyboardMouseInput } from '../render/input/keyboard-mouse-input';
import { BattleScene } from '../render/phaser/battle-scene';
import { GalleryScene } from '../render/phaser/gallery-scene';
import { PreloadScene } from '../render/phaser/preload-scene';
import type { SceneServices } from '../render/phaser/services';
import {
  Busy,
  Caption,
  CompleteScreen,
  DevBar,
  LeadInHint,
  Notice,
  QuickRedeployHint,
  setTransitionMs,
  TimelineJsonPanel,
  TitleScreen,
  type TitleLibraryItem,
} from '../ui/flow/flow-screens';
import { CountdownOverlay } from '../ui/hud/countdown-overlay';
import { DebugOverlay, Hud } from '../ui/hud/hud';
import { Minimap } from '../ui/minimap/minimap';
import {
  isMinimapSetting,
  minimapSettingDefs,
  readMinimapSettings,
} from '../ui/minimap/minimap-settings';
import { RespawnScreen } from '../ui/respawn/respawn-screen';
import { knownThings, RevealGrid, revealOptions } from '../timeline/reveal';
import {
  isRespawnSetting,
  readRespawnSettings,
  respawnSettingDefs,
} from '../ui/respawn/respawn-settings';
import {
  bindDisplaySettings,
  displaySettingDefs,
  SETTING_IDS,
} from '../ui/settings/display-settings';
import { SettingsStore } from '../ui/settings/registry';
import { SettingsPanel } from '../ui/settings/settings-panel';
import {
  effectiveTuning,
  tuningOverrides,
  tuningSettingDefs,
} from '../ui/settings/tuning-settings';
import { addToLibrary, readLibrary } from './replay-library';
import { offerLink, packedFromHash, packRun, shareUrl, unpackRun, type SharedRun } from './share';
import { Autopilot } from './autoplay';
import { AUTO_LIVES, parseAutoplay } from './autoplay-lives';
import { createDefaultSession } from './battle-setup';
import {
  GameController,
  type BattleHost,
  type CompleteResults,
  type GameUi,
  type RespawnHandle,
} from './game';
import { REPLAY_VERSION, ReplayPlayer } from './replay/replay-player';
import { ReplayScene, type ReplayControls } from '../render/phaser/replay-scene';
import { ResultsScreen } from '../ui/results/results-screen';
import {
  parseBests,
  radarAxes,
  resultStats,
  scrubMarks,
  updateBests,
} from '../ui/results/results-model';
import {
  controlScheme,
  cycleSpeed,
  GAME_SETTING_IDS,
  gameSettingDefs,
  INPUT_SETTING_IDS,
  autoAimRoleSetting,
  inputSettingDefs,
  resolvePace,
} from './game-settings';
import { AutoAimInput, type AutoFireMode } from '../render/input/auto-aim';
import type { InputSource } from '../render/input/input-source';
import { TouchInput } from '../render/input/touch-input';
import { TouchControls } from '../ui/touch/touch-controls';
import { looksLikeTouch } from '../ui/touch/stick-math';
import type { MapDef } from '../sim/world/map';
import type { Tuning } from '../content/tuning';
import { HeadlessBattleHost } from './headless';
import { installHotkeys } from './hotkeys';
import type { LiveRun } from './live-run';
import {
  createInlineResolveRunner,
  createWorkerResolveRunner,
  type ResolveRunner,
} from './resolve-runner';
import { openBestStore } from './storage/indexeddb-store';
import { generateStressMission } from './stress';
import { browserStorage } from './storage';

export const SETTINGS_STORAGE_KEY = 'army-of-one.settings.v1';

const params = new URLSearchParams(window.location.search);
const sceneParam = params.get('scene');
/** `?scene=gallery` (visual test page), `?scene=sandbox` (old free-play battle), else the game. */
const mode: 'game' | 'gallery' | 'sandbox' =
  sceneParam === 'gallery' ? 'gallery' : sceneParam === 'sandbox' ? 'sandbox' : 'game';
/** Dev tools: dev builds, or `?dev=1` on any build (for playtesting a preview/production build). */
const DEV = import.meta.env.DEV || params.get('dev') === '1';
const SPEED_CHOICES = ['0.25', '0.5', '1', '2', '4'];
/**
 * (05-a) Which mission to play: `?mission=<id>`, else the last one picked, else the default.
 * [D31]: mission-03 is the only mission, so removed ids (mission-01/02) fall back to it.
 */
const MISSION_STORAGE_KEY = 'army-of-one.mission';
// (PHASE13-a) The block editor's Play button: build the map from the editor's saved block.
if (params.get('mission') === EDITOR_PREVIEW_ID) {
  const preview = editorPreviewMap();
  if (preview) registerMap(preview);
}
const MISSION = missionOrDefault(params.get('mission') ?? readStoredMission());
if (MISSION.id === EDITOR_PREVIEW_ID) {
  const back = document.createElement('button');
  back.textContent = str('editor.backToEditor');
  back.style.cssText =
    'position:fixed;left:10px;bottom:10px;z-index:50;font:600 13px system-ui,sans-serif;' +
    'padding:6px 10px;color:#e7e9ec;background:#2f5b86;border:1px solid #4a86bd;border-radius:4px;cursor:pointer';
  back.onclick = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('mission');
    url.searchParams.set('scene', 'editor');
    url.hash = '';
    window.location.assign(url.toString());
  };
  document.body.appendChild(back);
}

function readStoredMission(): string | null {
  try {
    return window.localStorage.getItem(MISSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function pickMission(id: string): void {
  try {
    window.localStorage.setItem(MISSION_STORAGE_KEY, id);
  } catch {
    // remembered for this URL only
  }
  const url = new URL(window.location.href);
  url.searchParams.set('mission', id);
  url.hash = ''; // (PHASE12-e) leaving a shared replay's viewer
  window.location.assign(url.toString());
}

// Settings: display/debug, respawn screen, game flow, and every sim tuning value.
const settings = new SettingsStore(browserStorage(), SETTINGS_STORAGE_KEY);
settings.register(displaySettingDefs());
settings.register(minimapSettingDefs()); // (06-b)
settings.register(respawnSettingDefs());
settings.register(gameSettingDefs());
settings.register(inputSettingDefs()); // (07-b)
settings.register(tuningSettingDefs(DEFAULT_TUNING));
const display = bindDisplaySettings(settings);
/**
 * (07-d) The tuning a battle runs with. Enemy squads ([D44]) are on, except for dev autoplay
 * stories (scripted lives can't fight them): add `&enemies=1` to keep them, `&enemies=0` to
 * turn them off anywhere.
 */
function gameTuning() {
  const t = effectiveTuning(settings, DEFAULT_TUNING);
  const flag = params.get('enemies');
  const off = flag === '0' || (params.has('autoplay') && flag !== '1');
  return off ? withTuning(t, { ai: { enabled: false } }) : t;
}

// DOM overlays.
const uiRoot = document.getElementById('ui-root') ?? document.body;
const hud = new Hud(uiRoot);
const countdown = new CountdownOverlay(uiRoot);
const leadInHint = new LeadInHint(uiRoot);
const debug = new DebugOverlay(uiRoot);
const caption = new Caption(uiRoot);
const busy = new Busy(uiRoot);
const notice = new Notice(uiRoot);
const title = new TitleScreen(uiRoot);
const complete = new CompleteScreen(uiRoot);
const results = new ResultsScreen(uiRoot); // (07-a)
const quickHint = new QuickRedeployHint(uiRoot);
const panel = new SettingsPanel(uiRoot, settings);
// (07-b) Touch controls and auto-aim ([D41]).
const touchDevice = looksLikeTouch({
  coarse: window.matchMedia?.('(pointer: coarse)').matches ?? false,
  fine: window.matchMedia?.('(any-pointer: fine)').matches ?? false,
  maxTouchPoints: navigator.maxTouchPoints ?? 0,
});
const touchControls = new TouchControls(uiRoot, () => panel.toggle());
const scheme = () =>
  controlScheme(
    settings.getString(INPUT_SETTING_IDS.mode),
    settings.getString(INPUT_SETTING_IDS.autoAim),
    touchDevice,
  );
quickHint.setBig(scheme().touch);
settings.subscribe((id) => {
  if (id === INPUT_SETTING_IDS.mode || id === INPUT_SETTING_IDS.autoAim) {
    quickHint.setBig(scheme().touch);
  }
});
/** (07-b) The live soldier's input: keyboard/mouse or touch, optionally wrapped in auto-aim. */
function makeControls(
  scene: Phaser.Scene,
  map: MapDef,
  tuning: Tuning,
  liveId: string,
): InputSource {
  const sc = scheme();
  // (PHASE12-d) Touch aiming: tap-to-aim (touch the field; also overrides auto-aim while held),
  // or the old aim stick when auto-aim is off.
  const tap = settings.getString(INPUT_SETTING_IDS.touchAim) !== 'stick';
  touchControls.setTapAim(tap);
  touchControls.setAimStick(!tap && !sc.autoAim);
  touchControls.setVisible(sc.touch);
  const toWorld = (cx: number, cy: number) => {
    const canvas = scene.game.canvas;
    const r = canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const p = scene.cameras.main.getWorldPoint(
      ((cx - r.left) * scene.scale.width) / r.width,
      ((cy - r.top) * scene.scale.height) / r.height,
    );
    return { x: p.x, y: p.y };
  };
  const base: InputSource = sc.touch
    ? new TouchInput(touchControls, { tuning, toWorld })
    : new KeyboardMouseInput(scene);
  if (!sc.autoAim) return base;
  return new AutoAimInput(base, {
    map,
    tuning,
    liveId,
    fireMode: () => settings.getString(INPUT_SETTING_IDS.autoFire) as AutoFireMode,
    // (PHASE12-d) Auto-aim per role.
    enabledFor: (r) => settings.getBool(autoAimRoleSetting(r ?? 'rifleman')),
  });
}
// (06-b) In-game minimap ([D29]).
const minimap = new Minimap(uiRoot);
minimap.setSettings(readMinimapSettings(settings));
settings.subscribe((id) => {
  if (isMinimapSetting(id)) minimap.setSettings(readMinimapSettings(settings));
});
debug.setVisible(display.debugOverlay);
// (06-c) Spinner delay and transition length follow their settings.
const applyFlowTimings = () => {
  busy.setDelay(settings.getNumber(GAME_SETTING_IDS.spinnerThresholdMs));
  setTransitionMs(settings.getNumber(GAME_SETTING_IDS.transitionMs));
};
applyFlowTimings();
settings.subscribe((id, v) => {
  if (id === SETTING_IDS.debugOverlay) debug.setVisible(v === true);
  if (id === GAME_SETTING_IDS.spinnerThresholdMs || id === GAME_SETTING_IDS.transitionMs) {
    applyFlowTimings();
  }
  if (id === SETTING_IDS.renderScale) applyRenderScale();
});

const services: SceneServices = {
  display,
  hud,
  countdown,
  debug,
  commands: {},
  leadInHint,
  leadInPreview: () => settings.getBool(GAME_SETTING_IDS.ghostArrow),
  renderScale: () => renderScale,
  createSession: () => {
    const tuning = gameTuning();
    const session = createDefaultSession(tuning, () => {
      throw new Error('replaced below');
    });
    return {
      ...session,
      makeInput: (scene: Phaser.Scene) =>
        makeControls(scene, session.world.map, tuning, session.liveId),
    };
  },
};

// (06-c) The game flow starts at once (title, save loading) while Phaser boots and loads assets
// in parallel; a battle that starts before the assets are in waits for them.
let markAssetsReady: () => void = () => {};
const assetsReady = new Promise<void>((resolve) => (markAssetsReady = resolve));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#111418',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  // (06-c) Dual-GPU laptops: ask for the discrete GPU.
  render: { powerPreference: 'high-performance', antialias: display.antialias },
  scene: [
    new PreloadScene(mode === 'game' ? null : mode === 'gallery' ? 'gallery' : 'battle', () =>
      markAssetsReady(),
    ),
    new BattleScene(services),
    new GalleryScene(services),
    new ReplayScene(services),
  ],
});

// (06-c) Render resolution (`display.renderScale`): the canvas host is sized `scale` × the window
// and the canvas is stretched back up with a CSS transform; the battle camera zooms by `scale`
// so the framing doesn't change. Phaser maps the pointer through the canvas' on-screen rect, so
// input stays exact.
let renderScale = 1;
function applyRenderScale(): void {
  const s = resolveRenderScale(display.renderScale, window.innerWidth, window.innerHeight);
  const host = document.getElementById('game');
  if (!host) return;
  if (s === renderScale && host.dataset.renderScale === String(s)) return;
  renderScale = s;
  host.dataset.renderScale = String(s);
  host.style.width = `${s * 100}%`;
  host.style.height = `${s * 100}%`;
  const canvas = game.canvas as HTMLCanvasElement | undefined;
  if (canvas) {
    canvas.style.transformOrigin = '0 0';
    canvas.style.transform = s === 1 ? '' : `scale(${1 / s})`;
  }
  if (game.scale) {
    game.scale.getParentBounds();
    game.scale.refresh();
  }
}
game.events.once(Phaser.Core.Events.READY, applyRenderScale);
window.addEventListener('resize', () => {
  if (display.renderScale === 'auto') applyRenderScale();
});

if (mode !== 'game') {
  panel.addAction({
    label: str('settings.action.restart'),
    run: () => {
      const active = game.scene.getScenes(true)[0];
      if (active) active.scene.restart();
    },
  });
}
panel.addAction({
  label: str('settings.action.countdown'),
  run: () => services.commands.playCountdown?.(),
});

installHotkeys(window, {
  toggleDebug: () => settings.toggle(SETTING_IDS.debugOverlay),
  toggleSettings: () => panel.toggle(),
});

const aoo: Record<string, unknown> = { game, settings, mode, services };
/** Debug/e2e hook (screenshots, browser tests). Not part of any gameplay contract. */
(window as unknown as { __aoo?: unknown }).__aoo = aoo;

// ---------- The game flow (PHASE04) ----------

if (mode === 'game') void startGame();

async function startGame(): Promise<void> {
  hud.setVisible(false);
  countdown.setPlacement('upper');
  const store = await openBestStore();

  // Respawn screen + "History shifted" notice.
  let respawn: RespawnScreen | null = null;
  settings.subscribe((id) => {
    if (isRespawnSetting(id)) respawn?.setSettings(readRespawnSettings(settings));
  });
  const ui: GameUi = {
    showTitle: (p) => {
      void refreshLibrary();
      title.show({
        ...p,
        missionNameKey: MISSION.nameKey,
        missions: MISSIONS.map((m) => ({ id: m.id, nameKey: m.nameKey })),
        currentMissionId: MISSION.id,
        onPickMission: pickMission,
        freshLabelKey: settings.getBool(GAME_SETTING_IDS.skipEmptyRespawn)
          ? 'title.deploy'
          : 'title.new',
      });
    },
    showRespawn: (props, onDeploy, n): RespawnHandle => {
      respawn?.destroy();
      const screen = RespawnScreen.mount(uiRoot, props, {
        onDeploy,
        settings: readRespawnSettings(settings),
      });
      respawn = screen;
      // (PHASE12-c) DEPLOY already is the quick redeploy here (it opens on that choice), so
      // the separate hint stays hidden while the screen is up.
      quickHint.set(null);
      notice.show(n === 'historyShifted' ? str('notice.historyShifted') : null);
      return {
        update: (u) => screen.update(u),
        destroy: () => {
          screen.destroy();
          if (respawn === screen) respawn = null;
          notice.show(null);
        },
      };
    },
    showComplete: (stats, onPlayAgain, extra) => {
      if (!extra) {
        complete.show(stats, onPlayAgain);
        return;
      }
      showResults(extra, onPlayAgain);
    },
    hideScreens: () => {
      title.hide();
      complete.hide();
      stopReplay();
    },
    // The HUD already shows "Mission complete" over the field; the caption is for KIA.
    showCaption: (kind) => caption.show(kind === 'kia' ? 'kia' : null),
    showBusy: (on) => busy.set(on),
    showQuickRedeploy: (option) => {
      const on =
        option && !respawn && settings.getBool(GAME_SETTING_IDS.quickRedeploy) && !autopilot.active;
      quickHint.set(on ? quickHintText(option, scheme().touch) : null);
    },
  };

  const autopilot = new Autopilot(
    {
      waitResolve: params.get('autowait') === '1',
      fast: params.get('fast') === '1',
      continueMission: params.get('continue') === '1',
      delayMs: Number(params.get('autodelay') ?? 400),
    },
    (m) => console.warn(m),
  );

  const clock = {
    after: (ms: number, fn: () => void) => clearer(setTimeout(fn, ms)),
    nowMs: () => performance.now(),
  };
  const headless = new HeadlessBattleHost(clock, (run) => autopilot.inputFor(run));
  // (06-c) While no battle is on screen (title, respawn screen) Phaser's loop sleeps: no empty
  // frames drawn behind the DOM screens.
  let sleepTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingRun: LiveRun | null = null;
  const wakeLoop = () => {
    if (sleepTimer) clearTimeout(sleepTimer);
    sleepTimer = null;
    if (!game.loop.running) game.loop.wake();
  };
  const sleepLoopSoon = () => {
    if (sleepTimer) clearTimeout(sleepTimer);
    sleepTimer = setTimeout(() => {
      sleepTimer = null;
      if (!pendingRun && !game.scene.isActive('battle') && !game.scene.isActive('replay')) {
        game.loop.sleep();
      }
    }, 200);
  };
  // Asleep on the title screen too, once the assets are in.
  void assetsReady.then(() => {
    if (!pendingRun && !game.scene.isActive('battle')) sleepLoopSoon();
  });
  // (07-a) Results screen over the after-action replay ([D42]).
  const stopReplay = () => {
    results.hide();
    if (game.scene.isActive('replay') || game.scene.isPaused('replay')) game.scene.stop('replay');
    sleepLoopSoon();
  };
  const showResults = (r: CompleteResults, onPlayAgain: () => void) => {
    const m = r.mission;
    const endTick = (m.completed?.tick ?? 0) + 2 * 60;
    const stats = resultStats(m, r.rescues, m.completed?.tick ?? 0);
    const key = `aoo:bests:${m.missionId}`;
    let prev = parseBests(null);
    try {
      prev = parseBests(window.localStorage.getItem(key));
    } catch {
      // No storage (private mode): bests just don't persist.
    }
    const upd = updateBests(prev, stats);
    try {
      window.localStorage.setItem(key, JSON.stringify(upd.bests));
    } catch {
      // ignore
    }
    const player = new ReplayPlayer(r.map, r.tuning, {
      version: REPLAY_VERSION,
      missionId: m.missionId,
      soldiers: m.soldiers,
      endTick,
      ...(m.completed ? { winnerId: m.completed.bySoldierId } : {}),
    });
    let controls: ReplayControls | null = null;
    // (PHASE12-e) Keep this win in the replay library ([D79]) and offer it as a link.
    const shared: SharedRun = { missionId: m.missionId, state: m, tuning: currentOverrides() };
    const packedP = packRun(shared).catch(() => null);
    void packedP.then((packed) => {
      if (!packed) return;
      addToLibrary(safeLocalStorage(), {
        id: `${m.missionId}@${Date.now()}`,
        missionId: m.missionId,
        savedAt: Date.now(),
        soldiers: m.soldiers.length,
        battleTicks: m.completed?.tick ?? 0,
        packed,
      });
    });
    results.show(
      {
        stats,
        radar: settings.getBool(GAME_SETTING_IDS.resultsRadar) ? radarAxes(stats, m) : null,
        bests: upd.bests,
        improved: upd.improved,
        marks: scrubMarks(m),
      },
      {
        onShare: () =>
          void packedP.then((packed) => {
            if (packed) void shareLink(packed);
          }),
        onWatchAgain: () => controls?.restart(),
        onPlayAgain: () => {
          stopReplay();
          onPlayAgain();
        },
      },
    );
    playReplay(r.map, player, (c) => (controls = c));
  };

  /** Starts the replay scene for `player` under the results card. */
  const playReplay = (
    map: MapDef,
    player: ReplayPlayer,
    onControls: (c: ReplayControls) => void,
  ) => {
    void assetsReady.then(() => {
      if (!results.visible) return;
      wakeLoop();
      game.scene.start('replay', {
        player,
        objectives: (map.objectives ?? []).map((o) => ({ x: o.position.x, y: o.position.y })),
        insets: () => results.insets(),
        onReady: (c: ReplayControls) => {
          onControls(c);
          c.setSkipQuiet(settings.getBool(GAME_SETTING_IDS.replaySkipQuiet));
          results.attach(c);
        },
      });
    });
  };

  // ---------- (PHASE12-e) Shareable replays and the replay library ([D79]) ----------

  const currentOverrides = () => tuningOverrides(settings, DEFAULT_TUNING);

  const shareLink = async (packed: string) => {
    const res = await offerLink(shareUrl(packed), str('title.name'));
    notice.show(
      str(
        res === 'copied' ? 'replay.copied' : res === 'shared' ? 'replay.shared' : 'replay.failed',
      ),
      2500,
    );
  };

  const backToMenu = () => {
    stopReplay();
    const url = new URL(window.location.href);
    url.hash = '';
    window.location.assign(url.toString());
  };

  /** Plays a run as a viewer: watch it; continue from it (in progress) or play the mission. */
  const openViewer = (run: SharedRun) => {
    const map = findMap(run.missionId);
    if (!map) {
      notice.show(str('replay.broken'));
      return;
    }
    const m = run.state;
    const done = !!m.completed;
    const endTick = done
      ? m.completed!.tick + 2 * 60
      : m.soldiers.reduce((t, s) => Math.max(t, recordedTo(s)), 0);
    const tuning = withTuning(DEFAULT_TUNING, run.tuning);
    const player = new ReplayPlayer(map, tuning, {
      version: REPLAY_VERSION,
      missionId: m.missionId,
      soldiers: m.soldiers,
      endTick,
      ...(m.completed ? { winnerId: m.completed.bySoldierId } : {}),
    });
    const stats = resultStats(m, 0, done ? m.completed!.tick : endTick);
    let controls: ReplayControls | null = null;
    title.hide();
    results.show(
      {
        stats,
        radar: done && settings.getBool(GAME_SETTING_IDS.resultsRadar) ? radarAxes(stats, m) : null,
        bests: parseBests(null),
        improved: [],
        marks: scrubMarks(m),
      },
      {
        title: str(done ? 'replay.title' : 'replay.titleProgress'),
        playLabel: str(done ? 'replay.playMission' : 'replay.continue'),
        onWatchAgain: () => controls?.restart(),
        onShare: () => void packRun(run).then(shareLink),
        onMenu: backToMenu,
        onPlayAgain: () => void (done ? pickMission(run.missionId) : continueFrom(run)),
      },
    );
    playReplay(map, player, (c) => (controls = c));
  };

  /** Adopts a shared in-progress run as this browser's save for its mission, then plays it. */
  const continueFrom = async (run: SharedRun) => {
    const existing = await loadMission(store, run.missionId);
    if (
      existing.ok &&
      existing.state.soldiers.length > 0 &&
      !window.confirm(str('replay.replaceSave'))
    ) {
      return;
    }
    await clearMission(store, run.missionId);
    await new MissionSaver(store, run.missionId).save(run.state);
    pickMission(run.missionId);
  };

  /** The title screen's list: finished runs from the library, missions in progress. */
  const refreshLibrary = async () => {
    const items: TitleLibraryItem[] = [];
    for (const mission of MISSIONS) {
      const res = await loadMission(store, mission.id);
      if (!res.ok || res.state.soldiers.length === 0 || res.state.completed) continue;
      const state = res.state;
      const run = (): SharedRun => ({ missionId: mission.id, state, tuning: currentOverrides() });
      items.push({
        label: str('library.progress', {
          mission: strDynamic(mission.nameKey),
          soldiers: state.soldiers.length,
        }),
        actions: [
          { label: str('library.watch'), run: () => openViewer(run()) },
          { label: str('library.share'), run: () => void packRun(run()).then(shareLink) },
          {
            label: str('library.continue'),
            primary: true,
            run: () =>
              mission.id === MISSION.id
                ? void controller.continueMission()
                : pickMission(mission.id),
          },
        ],
      });
    }
    for (const e of readLibrary(safeLocalStorage())) {
      const map = findMap(e.missionId);
      if (!map) continue;
      items.push({
        label: str('library.won', {
          mission: strDynamic(map.nameKey),
          soldiers: e.soldiers,
          time: formatBattleTime(e.battleTicks),
        }),
        actions: [
          {
            label: str('library.watch'),
            primary: true,
            run: () =>
              void unpackRun(e.packed)
                .then(openViewer)
                .catch(() => notice.show(str('replay.broken'))),
          },
          { label: str('library.share'), run: () => void shareLink(e.packed) },
        ],
      });
    }
    title.setLibrary(items);
  };

  const startScene = (run: LiveRun) => {
    wakeLoop();
    hud.setVisible(true);
    game.scene.start('battle', {
      session: {
        world: run.attempt.world,
        liveId: run.liveId,
        driver: run,
        makeInput: (scene: Phaser.Scene) =>
          autopilot.inputFor(run) ??
          makeControls(scene, run.attempt.world.map, run.attempt.world.tuning, run.liveId),
      },
    });
  };
  const phaserHost: BattleHost = {
    start: (run: LiveRun) => {
      pendingRun = run;
      void assetsReady.then(() => {
        if (pendingRun !== run) return;
        pendingRun = null;
        startScene(run);
        startMinimap(run);
      });
    },
    stop: () => {
      pendingRun = null;
      if (game.scene.isActive('battle') || game.scene.isPaused('battle')) game.scene.stop('battle');
      touchControls.setVisible(false);
      hud.setVisible(false);
      countdown.update(null);
      leadInHint.set(false);
      sleepLoopSoon();
      minimap.stop();
    },
  };

  /** (06-b) The minimap starts from the current truth's reveal; the live soldier adds to it. */
  function startMinimap(run: LiveRun): void {
    const m = controller.mission;
    const grid = new RevealGrid(MISSION, revealOptions(controller.tuning));
    grid.update(m.soldiers, m.lanes);
    const soldiers = m.soldiers;
    const lanes = m.lanes;
    const captures = m.captureTruth ?? [];
    minimap.start({
      map: MISSION,
      grid,
      known: () => knownThings(MISSION, grid, soldiers, lanes, captures),
      view: () => run.view(),
      liveId: run.liveId,
      camera: () => {
        const scene = game.scene.getScene('battle');
        const cam = scene?.cameras?.main;
        return cam ? cam.worldView : null;
      },
    });
  }
  // Fast autoplay plays its lives headless; everything else is drawn.
  const battle: BattleHost = {
    start: (run) => (autopilot.playHeadless ? headless : phaserHost).start(run),
    stop: () => {
      headless.stop();
      phaserHost.stop();
    },
  };

  let diedAt = -Infinity;
  const controller = new GameController({
    map: MISSION,
    tuning: () => gameTuning(),
    store,
    ui,
    battle,
    clock,
    resolver: makeResolver(),
    options: {
      resolvePace: (span) => resolvePace(settings, span),
      resumeOnReload: settings.getBool(GAME_SETTING_IDS.resumeOnReload),
      // Autoplay deploys its own first life from the respawn screen.
      skipEmptyRespawn: () =>
        settings.getBool(GAME_SETTING_IDS.skipEmptyRespawn) && !autopilot.active,
      spinnerThresholdMs: () => settings.getNumber(GAME_SETTING_IDS.spinnerThresholdMs),
    },
    onEvent: (e) => {
      if (e.type === 'flow' && e.state.kind === 'deathBeat') diedAt = performance.now();
      autopilot.onEvent(e);
      refreshDev();
    },
    log: (m) => console.warn(`[game] ${m}`),
  });
  autopilot.attach(controller);
  // (07-b) Tapping the quick-redeploy hint redeploys (the touch death beat's big button).
  quickHint.onTap = () => {
    if (!quickHint.visible) return;
    if (performance.now() - diedAt < settings.getNumber(GAME_SETTING_IDS.quickRedeployGuardMs)) {
      return;
    }
    void controller.quickRedeploy();
  };

  // (06-c) Quick redeploy: R / Space on the death beat or the respawn screen. Capture phase, so a
  // focused button doesn't take the Space first. Held keys (auto-fire on Space) repeat and are
  // ignored, and so is a press right after the death (`flow.quickRedeployGuardMs`).

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code !== 'KeyR' && e.code !== 'Space') return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (!quickHint.visible) return;
      e.preventDefault();
      const guard = settings.getNumber(GAME_SETTING_IDS.quickRedeployGuardMs);
      if (performance.now() - diedAt < guard) return;
      e.stopPropagation();
      void controller.quickRedeploy();
    },
    true,
  );

  // Autosave ([D6], [D20]): the battle-time interval is handled by the controller; these cover
  // the page going away (tab switch, mobile pull-to-refresh, close).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') controller.saveInProgressNow('hidden');
  });
  window.addEventListener('pagehide', () => controller.saveInProgressNow('hidden'));

  // Dev tools.
  const tlPanel = DEV ? new TimelineJsonPanel(uiRoot, params.get('debugTimeline') === '1') : null;
  const resetMission = () => {
    autopilot.stop();
    void controller.newMission();
  };
  const devBar = DEV
    ? new DevBar(uiRoot, {
        reset: resetMission,
        kill: () => controller.devKill(),
        toggleTimeline: () => {
          tlPanel?.toggle();
          refreshDev();
        },
      })
    : null;
  function refreshDev(): void {
    devBar?.setSpeed(display.timeScale);
    devBar?.setAutoplay(autopilot.active ? autopilot.left : null);
    tlPanel?.update({
      flow: controller.flow.kind,
      attempts: controller.mission.attemptCount,
      resolvedUntil: controller.resolvedUntil,
      snapshots: controller.snapshots.size,
      lanes: controller.mission.lanes,
      lastObservation: controller.lastObservation,
    });
  }
  autopilot.onChange = refreshDev;
  settings.subscribe((id) => {
    if (id === SETTING_IDS.timeScale) refreshDev();
  });
  if (DEV) {
    panel.addAction({ label: str('dev.reset'), run: resetMission });
    window.addEventListener('keydown', (e) => {
      if (e.repeat || isTyping(e.target)) return;
      if (e.code === 'KeyK') controller.devKill();
      else if (e.key === '[' || e.key === ']') {
        const next = cycleSpeed(display.timeScale, e.key === '[' ? -1 : 1, SPEED_CHOICES);
        settings.set(SETTING_IDS.timeScale, next);
      }
    });
  }
  refreshDev();

  Object.assign(aoo, {
    controller,
    autopilot,
    lives: AUTO_LIVES.map((l) => `${l.name}: ${l.about}`),
    autoplay: (spec: string) => {
      const { lives, unknown } = parseAutoplay(spec);
      if (unknown.length) console.warn(`autoplay: unknown lives ${unknown.join(', ')}`);
      autopilot.play(lives);
    },
    kill: () => controller.devKill(),
  });

  const spec = params.get('autoplay');
  if (spec) {
    const { lives, unknown } = parseAutoplay(spec);
    if (unknown.length) console.warn(`autoplay: unknown lives ${unknown.join(', ')}`);
    autopilot.play(lives);
  }
  // Stress mode (PHASE05-b): `?stress=100` generates bot lives, then opens the respawn screen.
  const stress = Math.floor(Number(params.get('stress') ?? 0));
  if (stress > 0) {
    busy.set(true, str('busy.stress', { done: 0, total: stress }));
    const gen = await generateStressMission(
      MISSION,
      gameTuning(),
      stress,
      Number(params.get('stressSeed') ?? 1),
      (done, total) => busy.set(true, str('busy.stress', { done, total })),
    );
    busy.set(false);
    console.warn(`[stress] ${stress} bot lives in ${(gen.ms / 1000).toFixed(1)} s`);
    Object.assign(aoo, { stressMs: gen.ms });
    await controller.adoptMission(gen.state, gen.snapshots);
    return;
  }
  await controller.boot();
  // (PHASE12-e) Opened from a shared link: watch it over the title screen ([D79]).
  const packed = packedFromHash(window.location.hash);
  if (packed) {
    try {
      openViewer(await unpackRun(packed));
    } catch {
      notice.show(str('replay.broken'));
    }
  }
}

/** localStorage, or null where it's blocked (private mode). */
function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** (06-c) "R / Space: redeploy at Road (0:04)". */
function quickHintText(option: SpawnOption, touch = false): string {
  if (option.kind !== 'new') return touch ? str('touch.redeploy') : str('quick.hintAny');
  const sp = MISSION.spawnPoints.find((p) => p.id === option.spawnPointId);
  return str(touch ? 'touch.redeployAt' : 'quick.hint', {
    spawn: sp ? strDynamic(sp.nameKey) : option.spawnPointId,
    time: formatBattleTime(option.entryTick),
  });
}

function makeResolver(): ResolveRunner {
  // The worker can't see a runtime map (the editor's Play map), so those resolve inline.
  if (
    typeof Worker !== 'undefined' &&
    params.get('resolveWorker') !== '0' &&
    MISSION.id !== EDITOR_PREVIEW_ID
  ) {
    try {
      return createWorkerResolveRunner(
        () => new Worker(new URL('./resolve-worker.ts', import.meta.url), { type: 'module' }),
      );
    } catch {
      // fall through to the main-thread runner
    }
  }
  return createInlineResolveRunner();
}

function clearer(id: ReturnType<typeof setTimeout>): () => void {
  return () => clearTimeout(id);
}

function isTyping(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLInputElement ||
    t instanceof HTMLSelectElement ||
    t instanceof HTMLTextAreaElement
  );
}
