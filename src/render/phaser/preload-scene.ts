import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../../content/assets';
import { assetUrl } from '../assets/asset-urls';
import {
  EXPLOSION_SHEETS,
  explosionAnimationKey,
  explosionFrames,
  type ExplosionSize,
} from '../../content/explosions';

/**
 * Loads every manifest asset by key, then starts the requested scene (or, with `next` null,
 * just calls `onReady`: the PHASE04 game flow starts battles itself).
 */
export class PreloadScene extends Phaser.Scene {
  constructor(
    private readonly next: string | null,
    private readonly onReady?: () => void,
  ) {
    super('preload');
  }

  preload(): void {
    for (const a of ASSET_MANIFEST) {
      if (a.kind === 'image') {
        if (a.sheet) this.load.spritesheet(a.key, assetUrl(a.key), a.sheet);
        else this.load.image(a.key, assetUrl(a.key));
      } else this.load.audio(a.key, assetUrl(a.key));
    }
  }

  create(): void {
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
    if (this.next) this.scene.start(this.next);
    this.onReady?.();
  }
}
