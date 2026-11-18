import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../../content/assets';
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
      if (a.key.startsWith('mini_') && a.key !== MINIATURE_ATLAS.key) continue;
      if (a.kind === 'image') {
        if (a.sheet) this.load.spritesheet(a.key, assetUrl(a.key), a.sheet);
        else this.load.image(a.key, assetUrl(a.key));
      } else this.load.audio(a.key, assetUrl(a.key));
    }
  }

  create(): void {
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
    if (this.next) this.scene.start(this.next);
    this.onReady?.();
  }
}
