import Phaser from 'phaser';
import { advance, createFixedStepper, type FixedStepper } from '../../app/fixed-step';
import { DEFAULT_TUNING } from '../../content/tuning';
import { hashState } from '../../sim/core/hash';
import { TICKS_PER_SECOND } from '../../sim/core/time';
import type { WorldView } from '../../sim/view';
import { entityCounts } from '../../ui/hud/debug-model';
import { buildHudModel } from '../../ui/hud/hud-model';
import { DEPTH } from '../depth';
import {
  GALLERY_CAPTIONS,
  GALLERY_LIVE_ID,
  GALLERY_MAP,
  galleryView,
} from './__fixtures__/gallery-fixture';
import type { SceneServices } from './services';
import { SoundBank } from './sound-bank';
import { WorldRenderer } from './world-renderer';

/**
 * `?scene=gallery`: renders the hand-written fixture (one of every entity kind and soldier
 * state) through the real WorldRenderer. A visual test page; no sim involved.
 */
export class GalleryScene extends Phaser.Scene {
  private stepper!: FixedStepper;
  private tick = 0;
  private view!: WorldView;
  private worldRenderer!: WorldRenderer;

  constructor(private readonly services: SceneServices) {
    super('gallery');
  }

  create(): void {
    const { display } = this.services;
    this.stepper = createFixedStepper(TICKS_PER_SECOND);
    this.view = galleryView(0);
    const sounds = new SoundBank(this, display);
    this.worldRenderer = new WorldRenderer(this, GALLERY_MAP, this.view, display, sounds, {
      spriteRadius: DEFAULT_TUNING.soldier.spriteRadius,
    });
    this.worldRenderer.onCue = (c) => {
      if (c.type === 'liveDamaged' && display.incomingFire) this.services.hud.flashDamage(0.5);
    };
    for (const c of GALLERY_CAPTIONS) {
      this.add
        .text(c.x, c.y, c.text, {
          fontFamily: 'ui-monospace, monospace',
          fontSize: '12px',
          color: '#e6e9ec',
          backgroundColor: 'rgba(0,0,0,0.55)',
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5, 0)
        .setDepth(DEPTH.prompts)
        .setResolution(2);
    }
    this.fit();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.fit());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => sounds.destroy());
  }

  private fit(): void {
    const cam = this.cameras.main;
    const zoom = Math.min(
      this.scale.width / GALLERY_MAP.width,
      this.scale.height / GALLERY_MAP.height,
    );
    cam.setZoom(zoom);
    cam.centerOn(GALLERY_MAP.width / 2, GALLERY_MAP.height / 2);
  }

  override update(time: number): void {
    const { steps, alpha } = advance(
      this.stepper,
      this.game.loop.rawDelta,
      Number(this.services.display.timeScale) || 1,
    );
    for (let i = 0; i < steps; i++) {
      const prev = this.view;
      this.tick++;
      this.view = galleryView(this.tick);
      this.worldRenderer.onStep(prev, this.view, GALLERY_LIVE_ID);
    }
    this.worldRenderer.render({ alpha, nowMs: time, liveId: GALLERY_LIVE_ID, pointer: null });
    this.services.hud.update(buildHudModel(this.view, GALLERY_LIVE_ID));
    if (this.services.debug.visible) {
      this.services.debug.update({
        fps: this.game.loop.actualFps,
        tick: this.view.tick,
        counts: entityCounts(this.view),
        hash: hashState({ ...this.view, events: [] }),
        stepMs: 0,
      });
    }
  }
}
