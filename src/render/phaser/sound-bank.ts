import type Phaser from 'phaser';
import { SOUND_ASSETS, type SoundKey } from '../../content/assets';
import type { DisplaySettings } from '../../ui/settings/display-settings';
import { distanceGain, effectiveVolume, SoundThrottle } from '../sound-mix';

type LoopingSound = Phaser.Sound.BaseSound & { setVolume(v: number): unknown };

/** Plays sounds by manifest key, with master volume/mute, distance falloff and throttling. */
export class SoundBank {
  private readonly throttle = new SoundThrottle();
  private readonly loops = new Map<SoundKey, LoopingSound>();
  private listener = { x: 0, y: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly settings: DisplaySettings,
  ) {}

  /** World position the player "hears" from (camera center). */
  setListener(x: number, y: number): void {
    this.listener = { x, y };
  }

  play(key: SoundKey, gain = 1, at: { x: number; y: number } | null = null, nowMs = 0): void {
    const d = at ? Math.hypot(at.x - this.listener.x, at.y - this.listener.y) : 0;
    const volume = effectiveVolume(
      this.settings.volume,
      this.settings.muted,
      gain * distanceGain(d),
    );
    if (volume <= 0.01) return;
    if (!this.throttle.allow(key, nowMs)) return;
    if (!this.scene.cache.audio.exists(key)) return;
    this.scene.sound.play(key, { volume });
  }

  /** Sets a looping sound's gain (0 silences it but keeps it running). */
  setLoop(key: SoundKey, gain: number): void {
    if (!SOUND_ASSETS[key].loop || !this.scene.cache.audio.exists(key)) return;
    let s = this.loops.get(key);
    const volume = effectiveVolume(this.settings.volume, this.settings.muted, gain);
    if (!s) {
      if (volume <= 0) return;
      s = this.scene.sound.add(key, { loop: true, volume }) as LoopingSound;
      s.play();
      this.loops.set(key, s);
    }
    s.setVolume(volume);
  }

  /** Gain for a loop driven by the nearest source position. */
  loopGainFor(nearest: number): number {
    return distanceGain(nearest, 150, 700);
  }

  destroy(): void {
    for (const s of this.loops.values()) s.destroy();
    this.loops.clear();
  }
}
