import Phaser from 'phaser';
import { advance, createFixedStepper, type FixedStepper } from '../../app/fixed-step';
import { hashState } from '../../sim/core/hash';
import { TICKS_PER_SECOND } from '../../sim/core/time';
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
  private frame = 0;
  private hash = '';

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
    this.view = getView(this.world);
    this.prevView = this.view;
    this.sounds = new SoundBank(this, display);
    this.worldRenderer = new WorldRenderer(this, this.world.map, this.view, display, this.sounds, {
      spriteRadius: this.world.tuning.soldier.spriteRadius,
    });
    this.worldRenderer.onCue = (c) => this.onCue(c);

    const map = this.world.map;
    this.cameras.main.setBounds(0, 0, map.width, map.height);
    const live = this.view.soldiers.find((s) => s.id === this.liveId);
    this.cam = live ? { x: live.x, y: live.y } : { x: map.width / 2, y: map.height / 2 };
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
    for (let i = 0; i < steps; i++) {
      const live = this.view.soldiers.find((s) => s.id === this.liveId);
      const input = this.source.read(live ?? this.cam);
      const t0 = performance.now();
      this.prevView = this.view;
      step(this.world, new Map([[this.liveId, input]]));
      this.view = getView(this.world);
      this.stepMs = ema(this.stepMs, performance.now() - t0, 0.05);
      this.worldRenderer.onStep(this.prevView, this.view, this.liveId);
      if (this.countdownTicks !== null) this.countdownTicks--;
    }

    const cam = this.cameras.main;
    if (cam.zoom !== display.cameraZoom) cam.setZoom(display.cameraZoom);
    // Camera first (so the reticle's world position uses this frame's camera), then draw.
    const target = this.worldRenderer.soldierRenderPos(this.liveId, alpha);
    if (target) this.cam = smoothFollow(this.cam, target, display.cameraSmoothing, deltaMs);
    cam.centerOn(this.cam.x, this.cam.y);
    this.worldRenderer.render({
      alpha,
      nowMs: time,
      liveId: this.liveId,
      pointer: this.source.pointerWorld(),
    });

    hud.update(buildHudModel(this.view, this.liveId));
    countdown.update(this.countdownTicks);
    if (this.countdownTicks !== null && this.countdownTicks <= 0) this.countdownTicks = null;

    if (debug.visible) {
      if (this.frame % HASH_EVERY_FRAMES === 0) this.hash = hashState(this.world.state);
      debug.update({
        fps: this.game.loop.actualFps,
        tick: this.view.tick,
        counts: entityCounts(this.view),
        hash: this.hash,
        stepMs: this.stepMs ?? 0,
      });
    }
    this.frame++;
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
