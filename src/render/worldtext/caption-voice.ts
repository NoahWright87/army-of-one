import {
  CAPTION_SOUND_SECONDS,
  CAPTION_SOUNDS,
  CAPTION_VOICE_BANKS,
  type CaptionVoiceProfile,
} from '../../content/caption-voices';
import { distanceGain, effectiveVolume } from '../sound-mix';
import type { ParsedLine } from './markup';

export interface VoiceCue {
  atMs: number;
  sound: string;
  emphasis: number;
  pitch: number;
  speed: number;
  bank: CaptionVoiceProfile['bank'];
}

function hash(id: string): number {
  let value = 2166136261;
  for (const ch of id) value = Math.imul(value ^ ch.codePointAt(0)!, 16777619);
  return (value ^ (value >>> 16)) >>> 0;
}

export function soldierVoice(speakerId: string): CaptionVoiceProfile {
  const seed = hash(speakerId);
  return {
    bank: CAPTION_VOICE_BANKS[seed % CAPTION_VOICE_BANKS.length]!,
    pitch: ((seed >>> 8) % 15) - 7,
    speed: (16 + ((seed >>> 16) % 9)) / 20,
    expression: (8 + ((seed >>> 24) % 17)) / 20,
  };
}

export function captionVoice(
  speakerId: string,
  { glyphs, pauses }: ParsedLine,
  profile = soldierVoice(speakerId),
): VoiceCue[] {
  const cues: VoiceCue[] = [];
  let nextMs = 0;
  let pauseIndex = 0;
  for (let i = 0; i < glyphs.length; i++) {
    const glyph = glyphs[i]!;
    const ch = glyph.ch.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    while (pauses[pauseIndex]?.glyphIndex === i) {
      nextMs += Math.max(0, pauses[pauseIndex++]!.durationMs);
    }
    nextMs = Math.max(nextMs, glyph.appearMs);
    if (!CAPTION_SOUNDS.includes(ch)) {
      if (glyph.pacing !== 'letters') {
        nextMs += /[.!?]/.test(ch) ? 95 : /[,;:\s]/.test(ch) ? 45 : 0;
      }
      continue;
    }
    const following = glyphs[i + 1];
    const pair = ch + following?.ch.toLowerCase();
    const sound =
      glyph.pacing !== 'letters' &&
      pauses[pauseIndex]?.glyphIndex !== i + 1 &&
      following?.appearMs === glyph.appearMs &&
      following.size === glyph.size &&
      following.effects.join() === glyph.effects.join() &&
      ['sh', 'th', 'ch', 'ng'].includes(pair)
        ? pair
        : ch;
    if (sound === pair) i++;
    const vowel = /^[aeiouy]$/.test(sound);
    const emphasis =
      Math.max(0.65, Math.min(1.5, glyph.size)) *
      (glyph.effects.some((effect) => effect === 'shake' || effect === 'slam') ? 1.2 : 1);
    const wave = glyph.effects.includes('wave') ? Math.sin(i * 0.9) * 3 : 0;
    const question = glyphs[i + 1]?.ch === '?' ? 3 : 0;
    const contour = Math.sin(i * 1.3) * 2 + question + wave;
    cues.push({
      atMs: nextMs,
      sound,
      emphasis,
      pitch: profile.pitch + contour * profile.expression + (emphasis - 1) * 2,
      speed: profile.speed,
      bank: profile.bank,
    });
    if (glyph.pacing !== 'letters') nextMs += (vowel ? 56 : 46) / profile.speed;
  }
  return cues;
}

/** Plays short speech samples through Phaser's unlocked audio context and mixer. */
export class CaptionVoicePlayer {
  private readonly active = new Set<AudioBufferSourceNode>();

  play(
    context: AudioContext,
    destination: AudioNode,
    bank: AudioBuffer,
    cue: VoiceCue,
    distance: number,
    volume: number,
    muted: boolean,
  ): void {
    if (context.state !== 'running' || this.active.size >= 12) return;
    const level = effectiveVolume(volume, muted, 0.5 * cue.emphasis * distanceGain(distance));
    if (level < 0.005) return;

    const slot =
      CAPTION_VOICE_BANKS.indexOf(cue.bank) * CAPTION_SOUNDS.length +
      CAPTION_SOUNDS.indexOf(cue.sound);
    const source = context.createBufferSource();
    source.buffer = bank;
    const rate = 1.55 * cue.speed ** 0.45 * 2 ** (cue.pitch / 12);
    source.playbackRate.value = rate;
    const start = context.currentTime;
    const end = start + CAPTION_SOUND_SECONDS / rate;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.004);
    gain.gain.setValueAtTime(level, end - 0.012);
    gain.gain.linearRampToValueAtTime(0, end);
    source.connect(gain).connect(destination);
    this.active.add(source);
    source.onended = () => {
      this.active.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start(start, slot * CAPTION_SOUND_SECONDS, CAPTION_SOUND_SECONDS);
  }

  clear(): void {
    for (const sound of this.active) sound.stop();
    this.active.clear();
  }
}
