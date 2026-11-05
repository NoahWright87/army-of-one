/**
 * (07-a) After-action replay scene ([D42]): plays the whole mission with every life at once while
 * the results screen shows. A `ReplayPlayer` (src/app/replay) does the simulation; this scene steps
 * it at the chosen speed, draws it with the battle renderer, and lets the camera director frame
 * every alive soldier. Read-only with respect to the sim.
 */
import Phaser from 'phaser';
import { advance, createFixedStepper, type FixedStepper } from '../../app/fixed-step';
import type { ReplayPlayer } from '../../app/replay/replay-player';
import { TICKS_PER_SECOND, type Tick } from '../../sim/core/time';
import type { WorldView } from '../../sim/view';
import {
  DEFAULT_DIRECTOR,
  framePoints,
  framing,
  initialCamera,
  stepCamera,
  type CameraState,
  type DirectorConfig,
  type FocusMoment,
} from '../director';
import type { SceneServices } from './services';
import { SoundBank } from './sound-bank';
import { WorldRenderer } from './world-renderer';

/** How long a key moment (death, capture, the win) stays in the framing. */
const MOMENT_HOLD_TICKS = 90;
/** No shots or deaths for this long = a quiet stretch (fast-forwarded when enabled). */
const QUIET_TICKS = 120;
const QUIET_SPEEDUP = 3;

export interface ReplayControls {
  readonly tick: Tick;
  readonly endTick: Tick;
  readonly playing: boolean;
  readonly speed: number;
  readonly quiet: boolean;
  togglePlay(): void;
  setSpeed(x: number): void;
  seek(tick: Tick): void;
  skipToEnd(): void;
  restart(): void;
  setSkipQuiet(on: boolean): void;
}

export interface ReplaySessionData {
  player: ReplayPlayer;
  /** Objective positions (framed near the end). */
  objectives: { x: number; y: number }[];
  /** Called once the scene is up, with its controls. */
  onReady(controls: ReplayControls): void;
  /** Screen px the overlays cover on each side (the camera frames what's left). */
  insets?(): { top: number; right: number; bottom: number; left: number };
}

function scaleInsets(
  i: { top: number; right: number; bottom: number; left: number },
  scale: number,
) {
  return {
    top: i.top / scale,
    right: i.right / scale,
    bottom: i.bottom / scale,
    left: i.left / scale,
  };
}

export class ReplayScene extends Phaser.Scene implements ReplayControls {
  private data0!: ReplaySessionData;
  private player!: ReplayPlayer;
  private stepper!: FixedStepper;
  private prevView!: WorldView;
  private view!: WorldView;
  private worldRenderer!: WorldRenderer;
  private sounds!: SoundBank;
  private cam!: CameraState;
  private moments: FocusMoment[] = [];
  private lastAction = 0;
  private highlight!: Phaser.GameObjects.Graphics;
  private _playing = true;
  private _speed = 1;
  private skipQuiet = true;

  constructor(private readonly services: SceneServices) {
    super('replay');
  }

  init(data: ReplaySessionData): void {
    this.data0 = data;
  }

  create(): void {
    this.player = this.data0.player;
    this.stepper = createFixedStepper(TICKS_PER_SECOND);
    this.view = this.player.view();
    this.prevView = this.view;
    this.moments = [];
    this.lastAction = 0;
    this._playing = true;
    this._speed = 1;
    this.sounds = new SoundBank(this, this.services.display);
    this.worldRenderer = new WorldRenderer(
      this,
      this.player.world.map,
      this.view,
      this.services.display,
      this.sounds,
      { spriteRadius: this.player.world.tuning.soldier.spriteRadius },
    );
    this.highlight = this.add.graphics().setDepth(44);
    this.input.setDefaultCursor('default');
    const f = framing(this.points(), this.config(), this.home());
    this.cam = initialCamera(f);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.sounds.destroy());
    this.data0.onReady(this);
  }

  // ---------- controls ----------

  get tick(): Tick {
    return this.player.tick;
  }
  get endTick(): Tick {
    return this.player.input.endTick;
  }
  get playing(): boolean {
    return this._playing && !this.player.ended;
  }
  get speed(): number {
    return this._speed;
  }
  get quiet(): boolean {
    return this.skipQuiet && this.player.tick - this.lastAction > QUIET_TICKS;
  }
  togglePlay(): void {
    if (this.player.ended) this.restart();
    else this._playing = !this._playing;
  }
  setSpeed(x: number): void {
    this._speed = x;
  }
  setSkipQuiet(on: boolean): void {
    this.skipQuiet = on;
  }
  seek(tick: Tick): void {
    this.player.seek(tick);
    this.view = this.player.view();
    this.prevView = this.view;
    this.worldRenderer.onStep(this.view, this.view, null);
    this.moments = this.moments.filter((m) => m.tick <= tick);
    this.lastAction = this.player.tick;
    // A jump in time is a cut: the camera snaps to the new framing instead of gliding there.
    this.cam = initialCamera(framing(this.points(), this.config(), this.home()));
  }
  skipToEnd(): void {
    this.seek(this.endTick);
  }
  restart(): void {
    this.seek(0);
    this._playing = true;
  }

  // ---------- frame ----------

  override update(time: number, delta: number): void {
    const speed = this._speed * (this.quiet ? QUIET_SPEEDUP : 1);
    const { steps, alpha } = advance(
      this.stepper,
      this.playing ? delta : 0,
      speed,
      Math.ceil(4 * speed),
    );
    for (let i = 0; i < steps; i++) {
      if (!this.player.step()) break;
      this.prevView = this.view;
      this.view = this.player.view();
      this.collectMoments(this.view);
      this.worldRenderer.onStep(this.prevView, this.view, null);
    }
    const cfg = this.config();
    const target = framing(this.points(), cfg, this.home());
    // The camera eases in battle time, so it keeps up at 2×/4× and in fast-forwarded stretches.
    const camDt = Math.min(0.1, delta / 1000) * (this.playing ? speed : 1);
    this.cam = stepCamera(this.cam, target, camDt, cfg.omega);
    const cam = this.cameras.main;
    const scale = this.services.renderScale?.() ?? 1;
    cam.setZoom(this.cam.zoom * scale);
    cam.centerOn(this.cam.x, this.cam.y);
    this.worldRenderer.render({
      alpha: this.player.ended ? 1 : alpha,
      nowMs: time,
      liveId: null,
      pointer: null,
    });
    this.drawHighlight();
  }

  private config(): DirectorConfig {
    const map = this.player.world.map;
    const scale = this.services.renderScale?.() ?? 1;
    return {
      ...DEFAULT_DIRECTOR,
      viewW: this.scale.width / scale,
      viewH: this.scale.height / scale,
      mapW: map.width,
      mapH: map.height,
      ...(this.data0.insets ? { insets: scaleInsets(this.data0.insets(), scale) } : {}),
    };
  }

  private home(): { x: number; y: number } {
    const map = this.player.world.map;
    return { x: map.width / 2, y: map.height / 2 };
  }

  /** Alive, moving soldiers (O statics stand still: not framed), recent moments, the objective at the end. */
  private points(): { x: number; y: number }[] {
    const alive = this.view.soldiers.filter(
      (s) => s.alive && (s.role === 'echo' || s.role === 'interrupted' || s.role === 'live'),
    );
    const pts = framePoints(alive, this.moments, this.player.tick, MOMENT_HOLD_TICKS);
    if (this.player.input.endTick - this.player.tick < 3 * TICKS_PER_SECOND) {
      pts.push(...this.data0.objectives);
    }
    return pts;
  }

  private collectMoments(v: WorldView): void {
    for (const e of v.events) {
      if (e.kind === 'shotFired' || e.kind === 'grenadeThrown') this.lastAction = v.tick;
      if (e.kind === 'soldierDied') {
        const s = v.soldiers.find((x) => x.id === e.id);
        if (s) this.moments.push({ x: s.x, y: s.y, tick: v.tick });
        this.lastAction = v.tick;
      } else if (e.kind === 'objectiveDestroyed') {
        const o = v.objectives.find((x) => x.id === e.id);
        if (o) this.moments.push({ x: o.x, y: o.y, tick: v.tick });
        this.lastAction = v.tick;
      } else if (e.kind === 'captureStageChanged') {
        const c = v.capturePoints.find((x) => x.id === e.id);
        if (c) this.moments.push({ x: c.x, y: c.y, tick: v.tick });
      }
    }
    if (this.moments.length > 64) this.moments.splice(0, this.moments.length - 64);
  }

  /** The soldier who landed the winning blow: a gold ring. */
  private drawHighlight(): void {
    const g = this.highlight;
    g.clear();
    const id = this.player.input.winnerId;
    const s = id ? this.view.soldiers.find((x) => x.id === id) : undefined;
    if (!s || !s.alive) return;
    g.lineStyle(3, 0xffd34d, 0.95);
    g.strokeCircle(s.x, s.y, 24);
  }
}
