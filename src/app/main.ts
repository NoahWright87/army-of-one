import Phaser from 'phaser';
import { MISSIONS, missionOrDefault } from '../content/maps';
import { str, strDynamic } from '../content/strings';
import type { SpawnOption } from '../contracts/mission';
import { formatBattleTime } from '../sim/core/time';
import { resolveRenderScale } from '../render/render-scale';
import { DEFAULT_TUNING } from '../content/tuning';
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
import { effectiveTuning, tuningSettingDefs } from '../ui/settings/tuning-settings';
import { Autopilot } from './autoplay';
import { AUTO_LIVES, parseAutoplay } from './autoplay-lives';
import { createDefaultSession } from './battle-setup';
import { GameController, type BattleHost, type GameUi, type RespawnHandle } from './game';
import { cycleSpeed, GAME_SETTING_IDS, gameSettingDefs, resolvePace } from './game-settings';
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
/** (05-a) Which mission to play: `?mission=mission-02`, else the last one picked, else (06-a) mission-03. */
const MISSION_STORAGE_KEY = 'army-of-one.mission';
const MISSION = missionOrDefault(params.get('mission') ?? readStoredMission());

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
  window.location.assign(url.toString());
}

// Settings: display/debug, respawn screen, game flow, and every sim tuning value.
const settings = new SettingsStore(browserStorage(), SETTINGS_STORAGE_KEY);
settings.register(displaySettingDefs());
settings.register(minimapSettingDefs()); // (06-b)
settings.register(respawnSettingDefs());
settings.register(gameSettingDefs());
settings.register(tuningSettingDefs(DEFAULT_TUNING));
const display = bindDisplaySettings(settings);

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
const quickHint = new QuickRedeployHint(uiRoot);
const panel = new SettingsPanel(uiRoot, settings);
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
  createSession: () =>
    createDefaultSession(
      effectiveTuning(settings, DEFAULT_TUNING),
      (scene) => new KeyboardMouseInput(scene),
    ),
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
    showTitle: (p) =>
      title.show({
        ...p,
        missionNameKey: MISSION.nameKey,
        missions: MISSIONS.map((m) => ({ id: m.id, nameKey: m.nameKey })),
        currentMissionId: MISSION.id,
        onPickMission: pickMission,
        freshLabelKey: settings.getBool(GAME_SETTING_IDS.skipEmptyRespawn)
          ? 'title.deploy'
          : 'title.new',
      }),
    showRespawn: (props, onDeploy, n): RespawnHandle => {
      respawn?.destroy();
      const screen = RespawnScreen.mount(uiRoot, props, {
        onDeploy,
        settings: readRespawnSettings(settings),
      });
      respawn = screen;
      // (06-c) The quick-redeploy hint sits under the Deploy button (falls back to floating).
      quickHint.dock(uiRoot.querySelector<HTMLElement>('.rs-deploy-bar'));
      notice.show(n === 'historyShifted' ? str('notice.historyShifted') : null);
      return {
        update: (u) => screen.update(u),
        destroy: () => {
          quickHint.dock(null);
          screen.destroy();
          if (respawn === screen) respawn = null;
          notice.show(null);
        },
      };
    },
    showComplete: (stats, onPlayAgain) => complete.show(stats, onPlayAgain),
    hideScreens: () => {
      title.hide();
      complete.hide();
    },
    // The HUD already shows "Mission complete" over the field; the caption is for KIA.
    showCaption: (kind) => caption.show(kind === 'kia' ? 'kia' : null),
    showBusy: (on) => busy.set(on),
    showQuickRedeploy: (option) => {
      const on = option && settings.getBool(GAME_SETTING_IDS.quickRedeploy) && !autopilot.active;
      quickHint.set(on ? quickHintText(option) : null);
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
      if (!pendingRun && !game.scene.isActive('battle')) game.loop.sleep();
    }, 200);
  };
  // Asleep on the title screen too, once the assets are in.
  void assetsReady.then(() => {
    if (!pendingRun && !game.scene.isActive('battle')) sleepLoopSoon();
  });
  const startScene = (run: LiveRun) => {
    wakeLoop();
    hud.setVisible(true);
    game.scene.start('battle', {
      session: {
        world: run.attempt.world,
        liveId: run.liveId,
        driver: run,
        makeInput: (scene: Phaser.Scene) =>
          autopilot.inputFor(run) ?? new KeyboardMouseInput(scene),
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
    tuning: () => effectiveTuning(settings, DEFAULT_TUNING),
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
      effectiveTuning(settings, DEFAULT_TUNING),
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
}

/** (06-c) "R / Space: redeploy at Road (0:04)". */
function quickHintText(option: SpawnOption): string {
  if (option.kind !== 'new') return str('quick.hintAny');
  const sp = MISSION.spawnPoints.find((p) => p.id === option.spawnPointId);
  return str('quick.hint', {
    spawn: sp ? strDynamic(sp.nameKey) : option.spawnPointId,
    time: formatBattleTime(option.entryTick),
  });
}

function makeResolver(): ResolveRunner {
  if (typeof Worker !== 'undefined' && params.get('resolveWorker') !== '0') {
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
