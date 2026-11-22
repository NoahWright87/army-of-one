import Phaser from 'phaser';
import type { RoleId } from '../../contracts/mission';
import { advance, catchUpCap, createFixedStepper, type FixedStepper } from '../../app/fixed-step';
import { hashState } from '../../sim/core/hash';
import { TICKS_PER_SECOND } from '../../sim/core/time';
import { IDLE_INPUT, type SoldierInput } from '../../sim/entities/soldier';
import { getView, step, type World } from '../../sim/sim';
import type { WorldView } from '../../sim/view';
import { entityCounts, ema } from '../../ui/hud/debug-model';
import { buildHudModel } from '../../ui/hud/hud-model';
import { capLookAhead, lookAheadOffset, lookView, phoneFitZoom } from '../camera-look-ahead';
import { CAMERA, CLASS_LOOK } from '../../content/camera';
import { roleDef } from '../../content/roles';
import type { Cue } from '../event-cues';
import type { InputSource } from '../input/input-source';
import { lerpAngle, smoothFollow } from '../interp';
import type { BattleSession, SceneServices } from './services';
import { SoundBank } from './sound-bank';
import { WorldRenderer } from './world-renderer';
import { alongPath, approachFor, spawnAt } from '../run-in';
import { DEPTH } from '../depth';
import type { Vec2 } from '../../sim/core/vec';
import { fitPx, type ImageKey } from '../../content/assets';
import { pilotMiniature } from '../pilot-miniatures';
import type { Tape } from '../../sim/tape/tape';
import { TimeClock } from '../time-clock';
import type { TimeControls } from '../time-controls';
import { INFANTRY_BASE_SCALE, INFANTRY_FIGURE_SCALE } from '../../content/miniatures';

/** Debug countdown length (PHASE04's lead-in is 5 s too, [D5]). */
const DEMO_COUNTDOWN_TICKS = 5 * TICKS_PER_SECOND;
const HASH_EVERY_FRAMES = 30;
/** (07-b) Time constant of the look-ahead easing under auto-aim. */
const LOOK_AIM_EASE_MS = 600;

/**
 * Runs one battle: fixed-step sim (60 Hz, [E6]) + interpolated rendering + HUD.
 * Start it with `scene.start('battle', { session })`; see BattleSession in services.ts.
 */
export class BattleScene extends Phaser.Scene {
  private session!: BattleSession;
  private world!: World;
  private liveId!: string;
  private stepper!: FixedStepper;
  private source!: InputSource;
  private prevView!: WorldView;
  private view!: WorldView;
  private worldRenderer!: WorldRenderer;
  private sounds!: SoundBank;
  private cam = { x: 0, y: 0 };
  /** (PHASE18) Zoom before any scope zoom, the zoom wanted now, and the eased zoom in use. */
  private baseZoom = 1;
  private zoomGoal = 1;
  private zoomNow = 0;
  /** The last look-ahead offset (held while the session asks, PHASE18). */
  private ahead = { x: 0, y: 0 };
  /** (06-a) Facing used for the look-ahead before the live soldier appears. */
  private homeFacing = -Math.PI / 2;
  private countdownTicks: number | null = null;
  private stepMs: number | null = null;
  private simFrameMs: number | null = null;
  private renderMs: number | null = null;
  private frame = 0;
  private hash = '';
  private lastInput: SoldierInput = IDLE_INPUT;
  /** (07-b) The aim the camera looks ahead along (eased under auto-aim). */
  private lookAim: number | null = null;
  private ghost!: Phaser.GameObjects.Graphics;
  /** (06-c) The first update after create: its delta covers scene creation, not play. */
  private firstFrame = true;
  /** (06-c) The view the HUD last showed (it only changes when the sim steps). */
  private hudView: WorldView | null = null;
  /** (PHASE11) Cached HUD money and the tick it was computed at. */
  private money: { balance: number; rate: number } | null = null;
  private moneyTick: number | null = null;
  private ghostDrawn = false;
  /** (PHASE13-d) The live soldier's run in during the countdown ([D112]). */
  private runPath: Vec2[] | null = null;
  private runTotal = 1;
  private runnerPos: Vec2 | null = null;
  private runners = new Map<string, Phaser.GameObjects.Image>();
  private frameMs: number | null = null;
  private frameMax = 0;
  private frameMaxWindow = 0;
  private frameMaxShown = 0;
  private updateMs: number | null = null;
  /**
   * (PHASE19) Respawn mode: the scene plays the battle tape on a smooth clock with a free camera
   * while the player picks a spawn. Null while a run is being played.
   */
  private rs: {
    tape: Tape;
    clock: TimeClock;
    pairTick: number;
    lastEvent: number;
    goal: { x: number; y: number; zoom: number };
    drag: { x: number; y: number } | null;
    pinch: number | null;
  } | null = null;

  constructor(private readonly services: SceneServices) {
    super('battle');
  }

  init(data: { session?: BattleSession }): void {
    this.session = data.session ?? this.services.createSession();
  }

  create(): void {
    const { display } = this.services;
    this.world = this.session.world;
    const driver0 = this.session.driver;
    this.view = driver0 ? driver0.view() : getView(this.world);
    this.sounds = new SoundBank(this, display);
    this.worldRenderer = new WorldRenderer(this, this.world.map, this.view, display, this.sounds, {
      spriteRadius: this.world.tuning.soldier.spriteRadius,
    });
    this.worldRenderer.onCue = (c) => this.onCue(c);
    this.cameras.main.setBounds(0, 0, this.world.map.width, this.world.map.height);
    this.ghost = this.add.graphics().setDepth(1000);
    this.rs = null;
    this.zoomNow = 0;
    this.setupRespawnInput();
    this.bindSession(false);

    const startCountdown = () => {
      this.countdownTicks = DEMO_COUNTDOWN_TICKS;
    };
    this.services.commands.playCountdown = startCountdown;
    this.input.keyboard?.on('keydown-F4', startCountdown);
    this.services.countdown.onCue = (cue) =>
      this.sounds.play(
        cue === 'go' ? 'sfx_resume_go' : 'sfx_countdown_tick',
        1,
        null,
        this.time.now,
      );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.source.destroy();
      this.sounds.destroy();
      this.services.countdown.update(null);
      this.services.leadInHint?.set(false);
      if (this.services.commands.playCountdown === startCountdown) {
        delete this.services.commands.playCountdown;
      }
    });
  }

  /**
   * Takes on `this.session`: its world, live soldier, input and driver. (PHASE19) `keepCamera`:
   * the scene was already showing this battle (respawn mode), so the camera glides on from where
   * it is instead of cutting to the new soldier.
   */
  private bindSession(keepCamera: boolean): void {
    this.world = this.session.world;
    this.liveId = this.session.liveId;
    this.stepper = createFixedStepper(TICKS_PER_SECOND);
    this.source = this.session.makeInput(this);
    const driver = this.session.driver;
    this.view = driver ? driver.view() : getView(this.world);
    if (!keepCamera) this.prevView = this.view;
    this.source.observe?.(this.view);
    // (06-a) Until the first input arrives, "aim" is the soldier's facing (up on Breach).
    const facing = this.view.soldiers.find((s) => s.id === this.liveId)?.facing;
    this.lastInput = { ...IDLE_INPUT, aim: facing ?? -Math.PI / 2 };
    const map = this.world.map;
    const live = this.view.soldiers.find((s) => s.id === this.liveId);
    const home = live
      ? { x: live.x, y: live.y }
      : driver
        ? { ...driver.cameraHome }
        : { x: map.width / 2, y: map.height / 2 };
    // (06-a) Start already looking ahead (the spawn's facing; up on Breach, [D27]).
    this.homeFacing =
      map.spawnPoints.find((sp) => sp.position.x === home.x && sp.position.y === home.y)?.facing ??
      -Math.PI / 2;
    const camWas = this.cam;
    this.cam = this.lookAhead(home, live?.facing ?? this.homeFacing);
    if (keepCamera) this.cam = camWas;
    // (PHASE13-d) A new soldier runs in to its spawn point during the countdown ([D112]).
    this.runPath = null;
    this.runnerPos = null;
    for (const img of this.runners.values()) img.destroy();
    this.runners = new Map();
    const left0 = driver?.countdown() ?? null;
    if (driver && !live && left0 !== null && left0 > 0) {
      const sp = spawnAt(map.spawnPoints, driver.cameraHome);
      if (sp) {
        this.runPath = approachFor(sp, this.runDistance());
        this.runTotal = left0;
        this.runnerPos = this.runPath[0] ?? null;
        if (!keepCamera) this.cam = this.lookAhead(this.runnerPos ?? home, this.homeFacing);
      }
    }
    this.firstFrame = true;
    this.lookAim = null;
    this.hudView = null;
    this.money = null;
    this.moneyTick = null;
    this.ghostDrawn = false;
    this.input.setDefaultCursor('none');
    this.services.hud.setVisible(true);
    this.session.overlay?.create(this, this.liveId, this.services.display);
  }

  override update(time: number): void {
    const u0 = performance.now();
    const { display, hud, countdown, debug } = this.services;
    // Raw (unsmoothed) frame time: Phaser clamps its smoothed delta when the page lacks focus,
    // which would slow battle time. The fixed stepper does its own capping. (06-c) The first
    // frame's delta is the scene's creation time: don't replay it as a burst of steps.
    const rawDelta = this.game.loop.rawDelta;
    const deltaMs = this.firstFrame ? 0 : rawDelta;
    if (!this.firstFrame) this.trackFrame(rawDelta);
    this.firstFrame = false;
    if (this.rs) {
      this.updateRespawn(time, deltaMs);
      return;
    }
    const speed = Number(display.timeScale) || 1;
    const { steps, alpha } = advance(
      this.stepper,
      deltaMs,
      speed,
      catchUpCap(display.maxCatchUpSteps, speed),
    );
    const driver = this.session.driver;
    let simThisFrame = 0;
    for (let i = 0; i < steps; i++) {
      if (driver?.ended) break;
      const live = this.view.soldiers.find((s) => s.id === this.liveId);
      // Read every tick, also during the lead-in (previewed; applied from GO on, [D5]).
      const input = this.source.read(live ?? this.cam);
      this.lastInput = input;
      const t0 = performance.now();
      if (driver) {
        if (!driver.step(input)) continue; // frozen pre-battle hold: the world doesn't advance
        this.prevView = this.view;
        this.view = driver.view();
      } else {
        this.prevView = this.view;
        step(this.world, new Map([[this.liveId, input]]));
        this.view = getView(this.world);
      }
      const dt = performance.now() - t0;
      simThisFrame += dt;
      this.stepMs = ema(this.stepMs, dt, 0.05);
      this.worldRenderer.onStep(this.prevView, this.view, this.liveId);
      this.session.overlay?.onStep?.(this.view);
      this.source.observe?.(this.view);
      if (this.countdownTicks !== null) this.countdownTicks--;
    }

    const cam = this.cameras.main;
    // (06-c) A lower render scale draws a smaller canvas the browser stretches: zoom by the same
    // factor so the framing stays the same.
    // (PHASE18) Phones zoom out so a rifleman sees his range toward his aim ([D158]).
    const rs = this.services.renderScale?.() ?? 1;
    this.baseZoom = display.cameraZoom * rs * phoneFitZoom(cam.width / rs, cam.height / rs);
    // Camera first (so the reticle's world position uses this frame's camera), then draw.
    // (06-a) During the frozen pre-battle hold there's no soldier yet: look ahead from home.
    this.updateRunners(driver, alpha);
    const target =
      this.worldRenderer.soldierRenderPos(this.liveId, alpha) ??
      this.runnerPos ??
      driver?.cameraHome ??
      null;
    if (target) {
      // During the countdown the pointer is still wherever Deploy was clicked, so look the way
      // the soldier faces (forward) instead of toward the reticle.
      const counting = (driver?.countdown() ?? 0) > 0;
      const facing =
        this.view.soldiers.find((s) => s.id === this.liveId)?.facing ?? this.homeFacing;
      // (07-b) Auto-aim jumps between targets: ease the look-ahead toward the aim instead of
      // snapping the view ([D43]). Mouse aim follows the hand, so it stays direct.
      const aim = counting ? facing : this.lastInput.aim;
      if (this.source.aimTarget) {
        const k = 1 - Math.exp(-deltaMs / LOOK_AIM_EASE_MS);
        this.lookAim = this.lookAim === null ? aim : lerpAngle(this.lookAim, aim, k);
      } else {
        this.lookAim = aim;
      }
      // Pan toward the cursor in proportion to how far out it is (none in a countdown).
      const goal = this.lookAhead(
        target,
        this.lookAim,
        counting ? undefined : this.lastInput.aimDistance,
      );
      this.cam = smoothFollow(this.cam, goal, display.cameraSmoothing, deltaMs);
    } else {
      this.zoomGoal = this.baseZoom;
    }
    // (PHASE18) Scope zoom eases in and out.
    const ease = 1 - Math.exp((-deltaMs / 1000) * CAMERA.zoomEase);
    this.zoomNow =
      this.zoomNow <= 0 ? this.zoomGoal : this.zoomNow + (this.zoomGoal - this.zoomNow) * ease;
    if (Math.abs(cam.zoom - this.zoomNow) > 1e-4) cam.setZoom(this.zoomNow);
    cam.centerOn(this.cam.x, this.cam.y);
    this.simFrameMs = ema(this.simFrameMs, simThisFrame, 0.05);
    const frozen = driver?.ended ?? false;
    const r0 = performance.now();
    this.worldRenderer.render({
      alpha: frozen ? 1 : alpha,
      nowMs: time,
      liveId: this.liveId,
      pointer: frozen ? null : this.source.pointerWorld(),
    });
    this.session.overlay?.update(
      time,
      this.worldRenderer.soldierRenderPos(this.liveId, alpha),
      this.lastInput,
    );
    this.renderMs = ema(this.renderMs, performance.now() - r0, 0.05);

    // (06-c) The HUD only changes when the sim steps (the view object is replaced then).
    if (this.view !== this.hudView) {
      this.hudView = this.view;
      // (PHASE11) Money: refolded at most every quarter second of battle time.
      if (
        driver?.money &&
        (this.moneyTick === null || Math.abs(this.view.tick - this.moneyTick) >= 15)
      ) {
        this.moneyTick = this.view.tick;
        this.money = driver.money();
      }
      hud.update(buildHudModel(this.view, this.liveId, this.money));
    }
    if (driver) {
      const left = driver.countdown();
      if (this.countdownTicks !== null) countdown.update(this.countdownTicks);
      else countdown.update(left);
      const inLeadIn = left !== null && left > 0;
      this.services.leadInHint?.set(inLeadIn);
      this.drawGhost(inLeadIn && (this.services.leadInPreview?.() ?? true), alpha);
    } else {
      countdown.update(this.countdownTicks);
    }
    if (this.countdownTicks !== null && this.countdownTicks <= 0) this.countdownTicks = null;

    // (06-c) A few refreshes a second is plenty for a readout (each one lays out text).
    if (debug.visible && this.frame % 6 === 0) {
      if (this.frame % HASH_EVERY_FRAMES === 0) this.hash = hashState(this.world.state);
      debug.update({
        fps: this.game.loop.actualFps,
        tick: this.view.tick,
        counts: entityCounts(this.view),
        hash: this.hash,
        stepMs: this.stepMs ?? 0,
        simFrameMs: this.simFrameMs ?? 0,
        renderMs: this.renderMs ?? 0,
        sprites: this.worldRenderer.drawnObjectCount,
        culled: this.worldRenderer.culledSoldiers,
        frameMs: this.frameMs ?? 0,
        frameMaxMs: this.frameMaxShown,
        updateMs: this.updateMs ?? 0,
        renderScale: this.services.renderScale?.() ?? 1,
      });
    }
    this.frame++;
    // (05-b) Perf readout for browser checks (stress mode, Playwright). (06-c) A few times a
    // second, not every frame: it allocates.
    if (this.frame % 15 === 1) {
      this.services.perf = {
        fps: this.game.loop.actualFps,
        stepMs: this.stepMs ?? 0,
        simFrameMs: this.simFrameMs ?? 0,
        renderMs: this.renderMs ?? 0,
        sprites: this.worldRenderer.drawnObjectCount,
        culled: this.worldRenderer.culledSoldiers,
        counts: entityCounts(this.view),
        frameMs: this.frameMs ?? 0,
        updateMs: this.updateMs ?? 0,
      };
    }
    this.updateMs = ema(this.updateMs, performance.now() - u0, 0.05);
  }

  // ---------- (PHASE19) respawn mode ----------

  /**
   * Switches to respawn mode: the scene stops playing the run and plays `tape` from `start` at
   * `rate` (the slow motion after a death), up to `frontier()`. The camera becomes the player's
   * (drag, wheel, pinch; `focus` glides it). Returns the controls the respawn overlay drives.
   */
  enterRespawn(o: {
    tape: Tape;
    start: number;
    rate: number;
    frontier: () => number;
  }): TimeControls {
    const tape = o.tape;
    this.rs = {
      tape,
      clock: new TimeClock({ min: () => tape.start ?? 0, frontier: o.frontier }, o.start, o.rate),
      pairTick: Number.NaN,
      lastEvent: o.start,
      goal: { x: this.cam.x, y: this.cam.y, zoom: this.zoomNow || this.baseZoom || 1 },
      drag: null,
      pinch: null,
    };
    this.services.hud.setVisible(false);
    this.services.countdown.update(null);
    this.services.leadInHint?.set(false);
    this.ghost.clear();
    this.ghostDrawn = false;
    for (const img of this.runners.values()) img.destroy();
    this.runners = new Map();
    this.input.setDefaultCursor('grab');
    // The free camera may look past the map's edge (edge spawns sit above the timeline).
    this.cameras.main.removeBounds();
    const rs = this.rs;
    const now = () => this.time.now;
    const shown = () => this.view;
    const baseZoom = () => this.baseZoom || 1;
    const camera = () => this.cameras.main;
    const toScreen = (x: number, y: number) => this.worldToScreen(x, y);
    return {
      get tick() {
        return rs.clock.tick;
      },
      get start() {
        return tape.start ?? 0;
      },
      get frontier() {
        return Math.max(tape.start ?? 0, o.frontier());
      },
      get traveling() {
        return rs.clock.traveling;
      },
      get destination() {
        return rs.clock.destination;
      },
      get rate() {
        return rs.clock.rate;
      },
      setRate: (r) => {
        rs.clock.rate = r;
      },
      travelTo: (t) => rs.clock.travelTo(t, now()),
      scrubTo: (t) => rs.clock.set(t),
      focus: (x, y, zoom) => {
        rs.goal = { x, y, zoom: zoom ?? Math.max(rs.goal.zoom, baseZoom()) };
      },
      worldToScreen: toScreen,
      get currentView() {
        return shown();
      },
      viewport: () => {
        const v = camera().worldView;
        return { x: v.x, y: v.y, width: v.width, height: v.height };
      },
    };
  }

  /** True while the scene is in respawn mode. */
  get inRespawn(): boolean {
    return this.rs !== null;
  }

  /**
   * Plays a new run in this same scene, carrying on from what is on screen (no restart, no cut):
   * the camera glides from where it is to the new soldier.
   */
  adopt(session: BattleSession): void {
    this.source.destroy();
    // The last run's extras (basic training's sergeant, his words, the signs) go with it.
    this.session.overlay?.destroy?.();
    this.session = session;
    this.rs = null;
    this.cameras.main.setBounds(0, 0, session.world.map.width, session.world.map.height);
    this.bindSession(true);
  }

  private worldToScreen(x: number, y: number): { x: number; y: number } {
    const cam = this.cameras.main;
    const rect = this.game.canvas.getBoundingClientRect();
    const k = rect.width / this.scale.width;
    return {
      x: rect.left + ((x - cam.midPoint.x) * cam.zoom + this.scale.width / 2) * k,
      y: rect.top + ((y - cam.midPoint.y) * cam.zoom + this.scale.height / 2) * k,
    };
  }

  /** The camera's zoom limits in respawn mode: the whole map in view … close up. */
  private zoomLimits(): { min: number; max: number } {
    const cam = this.cameras.main;
    const map = this.world.map;
    const fit = Math.min(cam.width / map.width, cam.height / map.height);
    return { min: fit * 0.95, max: Math.max(fit, (this.baseZoom || 1) * 2.2) };
  }

  private setupRespawnInput(): void {
    this.input.addPointer(1);
    const both = () => {
      const a = this.input.pointer1;
      const b = this.input.pointer2;
      return a?.isDown && b?.isDown ? Math.hypot(a.x - b.x, a.y - b.y) : null;
    };
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.rs) return;
      this.rs.drag = { x: p.x, y: p.y };
      this.rs.pinch = both();
      if (this.rs.pinch !== null) this.rs.drag = null;
      this.input.setDefaultCursor('grabbing');
    });
    this.input.on('pointerup', () => {
      if (!this.rs) return;
      this.rs.drag = null;
      this.rs.pinch = both();
      this.input.setDefaultCursor('grab');
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const rs = this.rs;
      if (!rs) return;
      const d = both();
      if (d !== null && rs.pinch !== null && rs.pinch > 0) {
        this.zoomBy(d / rs.pinch);
        rs.pinch = d;
        return;
      }
      if (!rs.drag || !p.isDown) return;
      const z = this.cameras.main.zoom || 1;
      const dx = (p.x - rs.drag.x) / z;
      const dy = (p.y - rs.drag.y) / z;
      // Dragging moves the camera with the finger (no easing behind it).
      rs.goal = { ...rs.goal, x: rs.goal.x - dx, y: rs.goal.y - dy };
      this.cam = { x: this.cam.x - dx, y: this.cam.y - dy };
      rs.drag = { x: p.x, y: p.y };
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (this.rs) this.zoomBy(dy > 0 ? 1 / 1.15 : 1.15);
    });
  }

  private zoomBy(k: number): void {
    const rs = this.rs;
    if (!rs) return;
    const { min, max } = this.zoomLimits();
    rs.goal = { ...rs.goal, zoom: Math.max(min, Math.min(max, rs.goal.zoom * k)) };
  }

  private updateRespawn(time: number, deltaMs: number): void {
    const rs = this.rs!;
    rs.clock.update(time, deltaMs);
    const t = rs.clock.tick;
    const f = Math.floor(t);
    if (f !== rs.pairTick) {
      // Effects and sounds play at normal-ish speeds going forward; a fast trip is silent.
      const quiet = rs.clock.speedNow() > 150 || !(f > rs.pairTick);
      const a = rs.tape.viewAt(f, f) ?? this.view;
      const b = rs.tape.viewAt(f + 1, quiet ? f + 1 : Math.max(rs.lastEvent, f)) ?? a;
      rs.lastEvent = f + 1;
      this.worldRenderer.onStep(a, b, null);
      this.prevView = a;
      this.view = b;
      rs.pairTick = f;
    }
    // The free camera glides to its goal (dragging already moved it).
    const { min, max } = this.zoomLimits();
    rs.goal.zoom = Math.max(min, Math.min(max, rs.goal.zoom));
    const k = 1 - Math.exp(-deltaMs / 180);
    this.cam = {
      x: this.cam.x + (rs.goal.x - this.cam.x) * k,
      y: this.cam.y + (rs.goal.y - this.cam.y) * k,
    };
    this.zoomNow =
      (this.zoomNow || rs.goal.zoom) + (rs.goal.zoom - (this.zoomNow || rs.goal.zoom)) * k;
    this.zoomGoal = this.zoomNow;
    const cam = this.cameras.main;
    cam.setZoom(this.zoomNow);
    cam.centerOn(this.cam.x, this.cam.y);
    this.worldRenderer.render({ alpha: t - f, nowMs: time, liveId: null, pointer: null });
  }

  /** (06-c) Frame interval readout: EMA plus the worst frame of the last ~second. */
  private trackFrame(ms: number): void {
    this.frameMs = ema(this.frameMs, ms, 0.05);
    this.frameMax = Math.max(this.frameMax, ms);
    this.frameMaxWindow += ms;
    if (this.frameMaxWindow >= 1000) {
      this.frameMaxShown = this.frameMax;
      this.frameMax = 0;
      this.frameMaxWindow = 0;
    }
  }

  /** (06-a) Camera goal for a soldier at `pos` aiming at `aim`: look-ahead, capped on screen. */
  private lookAhead(
    pos: { x: number; y: number },
    aim: number,
    aimDistance?: number,
  ): { x: number; y: number } {
    // (PHASE18) The HQ holds the view still while a sign is open (its buttons mustn't slide).
    if (this.session.holdLookAhead?.()) {
      return { x: pos.x + this.ahead.x, y: pos.y + this.ahead.y };
    }
    const { display } = this.services;
    const cam = this.cameras.main;
    const live = this.view.soldiers.find((s) => s.id === this.liveId);
    // (PHASE18) 'aim' (the default): look as far as this soldier can, zooming like a scope at
    // the far end ([D158]).
    if (display.cameraLookAhead === 'aim' && live) {
      const t = this.world.tuning as unknown as Record<string, { range?: number } | undefined>;
      const weapon = roleDef(live.roleId).weapon;
      const range =
        (live.gun ? t[live.gun]?.range : undefined) ??
        (weapon === 'grenade' ? this.world.tuning.grenade.maxRange : CAMERA.minReach);
      const move = this.lastInput.move;
      const v = lookView({
        range,
        look: CLASS_LOOK[live.roleId ?? 'rifleman'],
        still: move.x === 0 && move.y === 0,
        braced: !!live.braced,
        setUp: !!live.mounted || live.gun === 'sniper',
        aim,
        ...(aimDistance !== undefined ? { aimDistance } : {}),
        viewW: cam.width,
        viewH: cam.height,
        baseZoom: this.baseZoom,
      });
      this.zoomGoal = v.zoom;
      this.ahead = v.offset;
      return { x: pos.x + v.offset.x, y: pos.y + v.offset.y };
    }
    this.zoomGoal = this.baseZoom;
    const zoom = this.baseZoom || 1;
    // (PHASE12-a) A Sniper with its rifle up looks further ahead ([D59]).
    const far = live?.gun === 'sniper' ? this.world.tuning.sniper.lookAheadMultiplier : 1;
    const ahead = capLookAhead(
      lookAheadOffset(
        display.cameraLookAhead,
        display.cameraLookAheadDistance * far,
        aim,
        aimDistance,
      ),
      cam.width / 2 / zoom,
      cam.height / 2 / zoom,
    );
    this.ahead = ahead;
    return { x: pos.x + ahead.x, y: pos.y + ahead.y };
  }

  /** How far a soldier runs in a lead-in (world units). */
  private runDistance(): number {
    const t = this.world.tuning;
    return t.spawn.leadInSeconds * t.soldier.speed;
  }

  /**
   * (PHASE13-d) Runners ([D112]): the live soldier during its countdown, and echoes in the
   * lead-in's worth of ticks before they spawn, each along its spawn point's approach. For show:
   * the sim knows nothing of them.
   */
  private updateRunners(driver: BattleSession['driver'], alpha: number): void {
    const seen = new Set<string>();
    const place = (
      key: string,
      texture: 'soldier_live' | 'soldier_echo',
      at: { pos: Vec2; facing: number },
      roleId: RoleId = 'rifleman',
    ) => {
      const mini = pilotMiniature(roleId, texture === 'soldier_live' ? 'live' : 'echo');
      const depth = key === 'live' ? DEPTH.live : DEPTH.echoes;
      const layer = (suffix: string, asset: ImageKey, rotation: number, z: number) => {
        const id = `${key}:${suffix}`;
        seen.add(id);
        let img = this.runners.get(id);
        if (!img) {
          img = this.add.image(0, 0, asset);
          this.runners.set(id, img);
        }
        img
          .setTexture(asset)
          .setDepth(z)
          .setScale((this.world.tuning.soldier.spriteRadius * 2) / fitPx(asset))
          .setPosition(at.pos.x, at.pos.y)
          .setRotation(rotation)
          .setVisible(true);
      };
      if (!mini) {
        layer('figure', texture, at.facing, depth);
        return;
      }
      if (mini.base) {
        layer('base', mini.base, 0, depth - 0.1);
        this.runners
          .get(`${key}:base`)!
          .setScale(
            ((this.world.tuning.soldier.spriteRadius * 2) / fitPx(mini.base)) * INFANTRY_BASE_SCALE,
          );
      }
      layer('figure', mini.figure, at.facing, depth);
      this.runners
        .get(`${key}:figure`)!
        .setScale(
          ((this.world.tuning.soldier.spriteRadius * 2) / fitPx(mini.figure)) *
            INFANTRY_FIGURE_SCALE,
        );
    };
    // The live soldier, until it exists.
    this.runnerPos = null;
    const left = driver?.countdown() ?? null;
    const exists = this.worldRenderer.soldierRenderPos(this.liveId, alpha) !== null;
    if (this.runPath && !exists && left !== null && left > 0) {
      const at = alongPath(this.runPath, 1 - left / this.runTotal);
      this.runnerPos = at.pos;
      place('live', 'soldier_live', at, driver?.previewRoleId);
    } else if (exists) {
      this.runPath = null;
    }
    // Echoes about to spawn.
    const lead = this.world.tuning.spawn.leadInSeconds * TICKS_PER_SECOND;
    const tick = this.view.tick + alpha;
    for (const a of driver?.arrivals?.() ?? []) {
      const ahead = a.spawnTick - tick;
      if (ahead <= 0 || ahead > lead) continue;
      const sp = this.world.map.spawnPoints.find((s) => s.id === a.spawnPointId);
      if (!sp) continue;
      place(
        a.id,
        'soldier_echo',
        alongPath(approachFor(sp, this.runDistance()), 1 - ahead / lead),
        a.roleId,
      );
    }
    for (const [key, img] of this.runners) {
      if (!seen.has(key)) {
        img.destroy();
        this.runners.delete(key);
      }
    }
  }

  /** Lead-in preview: a ghost arrow for the movement being held ([D5]). */
  private drawGhost(on: boolean, alpha: number): void {
    const g = this.ghost;
    const m = this.lastInput.move;
    const len = Math.hypot(m.x, m.y);
    if (!on || len < 0.1) {
      // (06-c) Clear once, not every frame.
      if (this.ghostDrawn) g.clear();
      this.ghostDrawn = false;
      return;
    }
    g.clear();
    this.ghostDrawn = true;
    const from =
      this.worldRenderer.soldierRenderPos(this.liveId, alpha) ?? this.runnerPos ?? this.cam;
    const dx = m.x / len;
    const dy = m.y / len;
    const x0 = from.x + dx * 26;
    const y0 = from.y + dy * 26;
    const x1 = from.x + dx * 70;
    const y1 = from.y + dy * 70;
    g.lineStyle(6, 0x35e0ff, 0.55);
    g.lineBetween(x0, y0, x1, y1);
    g.fillStyle(0x35e0ff, 0.55);
    g.fillTriangle(
      x1 + dx * 14,
      y1 + dy * 14,
      x1 - dy * 11,
      y1 + dx * 11,
      x1 + dy * 11,
      y1 - dx * 11,
    );
  }

  private onCue(c: Cue): void {
    const { display, hud } = this.services;
    if (c.type === 'shake' && display.screenShake) {
      this.cameras.main.shake(c.durationMs, c.intensity);
    } else if (c.type === 'liveDamaged' && display.incomingFire) {
      hud.flashDamage(Math.min(1, 0.4 + c.amount / 40));
    }
  }
}
