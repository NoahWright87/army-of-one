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
import {
  INFANTRY_GALLERY_MAP,
  INFANTRY_CAPTIONS,
  infantryGalleryView,
} from './__fixtures__/infantry-fixture';
import {
  EXPLOSION_GALLERY_MAP,
  EXPLOSION_CAPTIONS,
  explosionGalleryView,
} from './explosion-gallery';
import type { SceneServices } from './services';
import { SoundBank } from './sound-bank';
import { WorldRenderer } from './world-renderer';
import { VEHICLE_GALLERY_MAP, VEHICLE_CAPTIONS, vehicleGalleryView } from './vehicle-gallery';
import { TERRAIN_GALLERY_MAP, TERRAIN_CAPTIONS, terrainGalleryView } from './terrain-gallery';
import { COMBAT_GALLERY_MAP, COMBAT_CAPTIONS, combatGalleryView } from './combat-gallery';
import { TRAIL_GALLERY_MAP, TRAIL_CAPTIONS, trailGalleryView } from './trail-gallery';
import { PROPS_GALLERY_MAP, PROPS_CAPTIONS, propsGalleryView } from './props-gallery';
import { FINISHED_GALLERY_MAP, FINISHED_CAPTIONS, finishedGalleryView } from './finished-gallery';
import {
  TRANSITION_GALLERY_MAP,
  TRANSITION_CAPTIONS,
  transitionGalleryView,
} from './transition-gallery';

/**
 * `?scene=gallery`: renders the hand-written fixture (one of every entity kind and soldier
 * state) through the real WorldRenderer. A visual test page; no sim involved.
 */
export class GalleryScene extends Phaser.Scene {
  private stepper!: FixedStepper;
  private tick = 0;
  private view!: WorldView;
  private worldRenderer!: WorldRenderer;
  private galleryMap = GALLERY_MAP;
  private makeView = galleryView;

  constructor(private readonly services: SceneServices) {
    super('gallery');
  }

  create(): void {
    const { display } = this.services;
    this.stepper = createFixedStepper(TICKS_PER_SECOND);
    const params = new URLSearchParams(window.location.search);
    const infantry = params.has('infantry');
    const explosions = params.has('explosions');
    const combat = params.has('combat');
    const terrain = params.has('terrain');
    const vehicles = params.has('vehicles');
    const transitions = params.has('transitions');
    const trails = params.has('trails');
    const props = params.has('props');
    const finished = params.has('finished');
    this.galleryMap = transitions
      ? TRANSITION_GALLERY_MAP
      : vehicles
        ? VEHICLE_GALLERY_MAP
        : terrain
          ? TERRAIN_GALLERY_MAP
          : combat
            ? COMBAT_GALLERY_MAP
            : explosions
              ? EXPLOSION_GALLERY_MAP
              : infantry
                ? INFANTRY_GALLERY_MAP
                : GALLERY_MAP;
    if (trails) this.galleryMap = TRAIL_GALLERY_MAP;
    if (props) this.galleryMap = PROPS_GALLERY_MAP;
    if (finished) this.galleryMap = FINISHED_GALLERY_MAP;
    this.makeView = transitions
      ? transitionGalleryView
      : vehicles
        ? vehicleGalleryView
        : terrain
          ? terrainGalleryView
          : combat
            ? combatGalleryView
            : explosions
              ? explosionGalleryView
              : infantry
                ? infantryGalleryView
                : galleryView;
    if (trails) this.makeView = trailGalleryView;
    if (props) this.makeView = propsGalleryView;
    if (finished) this.makeView = finishedGalleryView;
    this.view = this.makeView(0);
    const sounds = new SoundBank(this, display);
    this.worldRenderer = new WorldRenderer(this, this.galleryMap, this.view, display, sounds, {
      spriteRadius: DEFAULT_TUNING.soldier.spriteRadius,
    });
    this.worldRenderer.onCue = (c) => {
      if (c.type === 'liveDamaged' && display.incomingFire) this.services.hud.flashDamage(0.5);
    };
    for (const c of finished
      ? FINISHED_CAPTIONS
      : props
        ? PROPS_CAPTIONS
        : trails
          ? TRAIL_CAPTIONS
          : transitions
            ? TRANSITION_CAPTIONS
            : vehicles
              ? VEHICLE_CAPTIONS
              : terrain
                ? TERRAIN_CAPTIONS
                : combat
                  ? COMBAT_CAPTIONS
                  : explosions
                    ? EXPLOSION_CAPTIONS
                    : infantry
                      ? INFANTRY_CAPTIONS
                      : GALLERY_CAPTIONS) {
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
      this.scale.width / this.galleryMap.width,
      this.scale.height / this.galleryMap.height,
    );
    cam.setZoom(zoom);
    cam.centerOn(this.galleryMap.width / 2, this.galleryMap.height / 2);
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
      this.view = this.makeView(this.tick);
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
