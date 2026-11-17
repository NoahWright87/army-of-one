/**
 * (PHASE17) The dev arena's battlefield ([D142]): draws an arena world, plays it (AI on both
 * sides) once GO is pressed, and reports taps on the field (to place cover) while setting up.
 * The DOM panel (`src/ui/arena/arena-panel.ts`) owns the setup and calls `loadFight` / `go`.
 */
import Phaser from 'phaser';
import { advance, createFixedStepper, type FixedStepper } from '../../app/fixed-step';
import {
  ARENA_H,
  ARENA_W,
  arenaState,
  createArenaWorld,
  type ArenaConfig,
  type ArenaState,
} from '../../gen/arena';
import { TICKS_PER_SECOND } from '../../sim/core/time';
import { getView, step, type World } from '../../sim/sim';
import type { WorldView } from '../../sim/view';
import type { SceneServices } from './services';
import { SoundBank } from './sound-bank';
import { WorldRenderer } from './world-renderer';

export interface ArenaHooks {
  /** A tap on the field while setting up (world units). */
  onTap(x: number, y: number): void;
  /** On load, every step while fighting, and at the end. */
  onState(s: ArenaState): void;
  /** The scene started without a fight to show: load one. */
  onReady?(): void;
}

interface ArenaData {
  cfg: ArenaConfig;
  seed: number;
}

const NO_INPUT = new Map();

export class ArenaScene extends Phaser.Scene {
  hooks: ArenaHooks | null = null;
  private data0: ArenaData | null = null;
  private world: World | null = null;
  private view: WorldView | null = null;
  private worldRenderer: WorldRenderer | null = null;
  private stepper: FixedStepper = createFixedStepper(TICKS_PER_SECOND);
  private running = false;
  private speed = 1;

  constructor(private readonly services: SceneServices) {
    super('arena');
  }

  init(data: ArenaData | undefined): void {
    if (data?.cfg) this.data0 = data;
  }

  create(): void {
    const sounds = new SoundBank(this, this.services.display);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => sounds.destroy());
    this.running = false;
    this.stepper = createFixedStepper(TICKS_PER_SECOND);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.running) return;
      const at = this.cameras.main.getWorldPoint(p.x, p.y);
      if (at.x < 0 || at.y < 0 || at.x > ARENA_W || at.y > ARENA_H) return;
      this.hooks?.onTap(at.x, at.y);
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.fit());
    this.fit();
    if (!this.data0) {
      this.hooks?.onReady?.();
      return;
    }
    this.world = createArenaWorld(this.data0.cfg, this.data0.seed);
    this.view = getView(this.world);
    this.worldRenderer = new WorldRenderer(
      this,
      this.world.map,
      this.view,
      this.services.display,
      sounds,
      {
        spriteRadius: this.world.tuning.soldier.spriteRadius,
      },
    );
    this.hooks?.onState(arenaState(this.world));
  }

  /** Shows a fresh fight for this setup (not running). */
  loadFight(cfg: ArenaConfig, seed: number): void {
    this.scene.restart({ cfg, seed });
  }

  go(): void {
    if (this.world && !arenaState(this.world).winner) this.running = true;
  }

  setSpeed(x: number): void {
    this.speed = x;
  }

  private fit(): void {
    const cam = this.cameras.main;
    // The panel covers the right side on wide screens, the bottom on narrow ones.
    const wide = this.scale.width >= 720;
    const w = wide ? this.scale.width - 320 : this.scale.width;
    const h = wide ? this.scale.height : this.scale.height * 0.55;
    cam.setZoom(Math.min(w / ARENA_W, h / ARENA_H) * 0.96);
    // Centre the arena in the uncovered part.
    const z = cam.zoom;
    cam.centerOn(
      ARENA_W / 2 + (this.scale.width - w) / 2 / z,
      ARENA_H / 2 + (this.scale.height - h) / 2 / z,
    );
  }

  override update(time: number, delta: number): void {
    if (!this.world || !this.worldRenderer || !this.view) return;
    const { steps, alpha } = advance(
      this.stepper,
      this.running ? delta : 0,
      this.speed,
      Math.ceil(4 * this.speed),
    );
    for (let i = 0; i < steps && this.running; i++) {
      step(this.world, NO_INPUT);
      const prev = this.view;
      this.view = getView(this.world);
      this.worldRenderer.onStep(prev, this.view, null);
      const st = arenaState(this.world);
      this.hooks?.onState(st);
      if (st.winner) this.running = false;
    }
    this.worldRenderer.render({
      alpha: this.running ? alpha : 1,
      nowMs: time,
      liveId: null,
      pointer: null,
    });
  }
}
