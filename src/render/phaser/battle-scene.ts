import Phaser from 'phaser';
import { advance, createFixedStepper, type FixedStepper } from '../../app/fixed-step';
import { hashState } from '../../sim/core/hash';
import { TICKS_PER_SECOND } from '../../sim/core/time';
import { IDLE_INPUT, type SoldierInput } from '../../sim/entities/soldier';
import { getView, step, type World } from '../../sim/sim';
import type { WorldView } from '../../sim/view';
import { entityCounts, ema } from '../../ui/hud/debug-model';
import { buildHudModel } from '../../ui/hud/hud-model';
import type { Cue } from '../event-cues';
import type { InputSource } from '../input/input-source';
import { smoothFollow } from '../interp';
import type { BattleSession, SceneServices } from './services';
import { SoundBank } from './sound-bank';
import { WorldRenderer } from './world-renderer';

/** Debug countdown length (PHASE04's lead-in is 5 s too, [D5]). */
const DEMO_COUNTDOWN_TICKS = 5 * TICKS_PER_SECOND;
const HASH_EVERY_FRAMES = 30;

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
  private countdownTicks: number | null = null;
  private stepMs: number | null = null;
  private simFrameMs: number | null = null;
  private renderMs: number | null = null;
  private frame = 0;
  private hash = '';
  private lastInput: SoldierInput = IDLE_INPUT;
  private ghost!: Phaser.GameObjects.Graphics;

  constructor(private readonly services: SceneServices) {
    super('battle');
  }

  init(data: { session?: BattleSession }): void {
    this.session = data.session ?? this.services.createSession();
  }

  create(): void {
    const { display } = this.services;
    this.world = this.session.world;
    this.liveId = this.session.liveId;
    this.stepper = createFixedStepper(TICKS_PER_SECOND);
    this.source = this.session.makeInput(this);
    const driver = this.session.driver;
    this.view = driver ? driver.view() : getView(this.world);
    this.prevView = this.view;
    this.lastInput = IDLE_INPUT;
    this.sounds = new SoundBank(this, display);
    this.worldRenderer = new WorldRenderer(this, this.world.map, this.view, display, this.sounds, {
      spriteRadius: this.world.tuning.soldier.spriteRadius,
    });
    this.worldRenderer.onCue = (c) => this.onCue(c);

    const map = this.world.map;
    this.cameras.main.setBounds(0, 0, map.width, map.height);
    const live = this.view.soldiers.find((s) => s.id === this.liveId);
    this.cam = live
      ? { x: live.x, y: live.y }
      : driver
        ? { ...driver.cameraHome }
        : { x: map.width / 2, y: map.height / 2 };
    this.ghost = this.add.graphics().setDepth(1000);
    this.input.setDefaultCursor('none');
    this.services.hud.setVisible(true);

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

  override update(time: number): void {
    const { display, hud, countdown, debug } = this.services;
    // Raw (unsmoothed) frame time: Phaser clamps its smoothed delta when the page lacks focus,
    // which would slow battle time. The fixed stepper does its own capping.
    const deltaMs = this.game.loop.rawDelta;
    const { steps, alpha } = advance(this.stepper, deltaMs, Number(display.timeScale) || 1);
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
      if (this.countdownTicks !== null) this.countdownTicks--;
    }

    const cam = this.cameras.main;
    if (cam.zoom !== display.cameraZoom) cam.setZoom(display.cameraZoom);
    // Camera first (so the reticle's world position uses this frame's camera), then draw.
    const target = this.worldRenderer.soldierRenderPos(this.liveId, alpha);
    if (target) this.cam = smoothFollow(this.cam, target, display.cameraSmoothing, deltaMs);
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
    this.renderMs = ema(this.renderMs, performance.now() - r0, 0.05);

    hud.update(buildHudModel(this.view, this.liveId));
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

    if (debug.visible) {
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
      });
    }
    this.frame++;
    // (05-b) Perf readout for browser checks (stress mode, Playwright).
    this.services.perf = {
      fps: this.game.loop.actualFps,
      stepMs: this.stepMs ?? 0,
      simFrameMs: this.simFrameMs ?? 0,
      renderMs: this.renderMs ?? 0,
      sprites: this.worldRenderer.drawnObjectCount,
      culled: this.worldRenderer.culledSoldiers,
      counts: entityCounts(this.view),
    };
  }

  /** Lead-in preview: a ghost arrow for the movement being held ([D5]). */
  private drawGhost(on: boolean, alpha: number): void {
    const g = this.ghost;
    g.clear();
    const m = this.lastInput.move;
    const len = Math.hypot(m.x, m.y);
    if (!on || len < 0.1) return;
    const from = this.worldRenderer.soldierRenderPos(this.liveId, alpha) ?? this.cam;
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
