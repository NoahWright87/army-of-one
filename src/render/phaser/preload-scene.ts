import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../../content/assets';
import { STARTUP_IMAGES, missingStartupImages } from '../assets/startup-assets';
import { runtimePhase, watchForStall } from '../../app/runtime-errors';
import { assetUrl } from '../assets/asset-urls';
import { MINIATURE_ATLAS } from '../../content/miniature-atlas';
import { IMPACT_SHEET, impactAnimationKey, impactFrames } from '../../content/combat-art';
import {
  EXPLOSION_SHEETS,
  explosionAnimationKey,
  explosionFrames,
  type ExplosionSize,
} from '../../content/explosions';

/**
 * Loads required images by key, then starts the requested scene (or, with `next` null,
 * just calls `onReady`: the PHASE04 game flow starts battles itself).
 */
export class PreloadScene extends Phaser.Scene {
  private deadline?: ReturnType<typeof watchForStall>;
  private completed = 0;
  private readonly failed = new Set<string>();

  constructor(
    private readonly next: string | null,
    private readonly onReady?: () => void,
    private readonly onFailure: (error: Error) => void = (error) => {
      throw error;
    },
    private readonly onProgress?: (done: number, total: number) => void,
  ) {
    super('preload');
  }

  preload(): void {
    runtimePhase('loading images');
    this.deadline = watchForStall('required images');
    this.load.on(Phaser.Loader.Events.FILE_PROGRESS, () => this.deadline?.progress());
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      this.failed.add(file.key);
      runtimePhase(`image request failed: ${file.key}`);
    });
    this.load.on(Phaser.Loader.Events.FILE_COMPLETE, (key: string) => {
      this.deadline?.progress();
      runtimePhase(`loaded image: ${key}`);
      this.onProgress?.(++this.completed, STARTUP_IMAGES.length);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.deadline?.stop());
    this.onProgress?.(0, STARTUP_IMAGES.length);
    for (const a of STARTUP_IMAGES) {
      if (a.kind === 'image') {
        if (a.sheet) this.load.spritesheet(a.key, assetUrl(a.key), a.sheet);
        else this.load.image(a.key, assetUrl(a.key));
      }
    }
  }

  create(): void {
    this.deadline?.stop();
    const missing = missingStartupImages((key) => this.textures.exists(key));
    if (missing.length) {
      this.onFailure(
        new Error(
          `Required images failed to load or decode: ${missing.join(', ')}. Failed requests: ${[...this.failed].join(', ') || 'none (image decode/cache failure)'}`,
        ),
      );
      return;
    }
    runtimePhase('preparing image textures and animations');
    // Keep each existing asset key and centered frame while sharing one GPU texture source.
    // This avoids sampler churn/rotating-quad clipping with mixed unit layers on software WebGL.
    const atlas = this.textures.get(MINIATURE_ATLAS.key);
    for (const [key, box] of Object.entries(MINIATURE_ATLAS.frames)) {
      if (this.textures.exists(key)) continue;
      const texture = this.textures.create(key, []);
      if (!texture) throw new Error(`Cannot create miniature texture ${key}`);
      texture.source = atlas.source;
      texture.add('__BASE', 0, box.x, box.y, box.w, box.h);
      // The atlas owns the source. Aliases release their frames without double-destroying it.
      const destroy = texture.destroy.bind(texture);
      texture.destroy = () => {
        texture.source = [];
        destroy();
      };
    }
    for (let row = 0; row < IMPACT_SHEET.rows; row++) {
      const key = impactAnimationKey(row);
      if (!this.anims.exists(key))
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(IMPACT_SHEET.key, { frames: impactFrames(row) }),
          frameRate: IMPACT_SHEET.frameRate,
          repeat: 0,
        });
    }
    for (const size of Object.keys(EXPLOSION_SHEETS) as ExplosionSize[]) {
      const spec = EXPLOSION_SHEETS[size];
      for (let row = 0; row < spec.rows; row++) {
        const key = explosionAnimationKey(size, row);
        if (!this.anims.exists(key))
          this.anims.create({
            key,
            frames: this.anims.generateFrameNumbers(spec.key, {
              frames: explosionFrames(size, row),
            }),
            frameRate: spec.frameRate,
            repeat: 0,
          });
      }
    }
    // Audio decode (including mobile browser permission/suspension) must never gate a battle.
    this.scene.launch('audio-preload');
    if (this.next) this.scene.start(this.next);
    this.onReady?.();
  }
}

export class AudioPreloadScene extends Phaser.Scene {
  constructor() {
    super('audio-preload');
  }

  preload(): void {
    for (const asset of ASSET_MANIFEST) {
      if (asset.kind === 'sound') this.load.audio(asset.key, assetUrl(asset.key));
    }
  }

  create(): void {
    this.scene.stop();
  }
}
