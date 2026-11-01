import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../../content/assets';
import { assetUrl } from '../assets/asset-urls';

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
      if (a.kind === 'image') this.load.image(a.key, assetUrl(a.key));
      else this.load.audio(a.key, assetUrl(a.key));
    }
  }

  create(): void {
    if (this.next) this.scene.start(this.next);
    this.onReady?.();
  }
}
