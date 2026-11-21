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

export interface PlayingVoice {
  mix(distance: number, volume: number, muted: boolean): void;
  stop(): void;
}

/** Schedule the whole phrase on the audio clock so slow render frames can't drop syllables. */
export class CaptionVoicePlayer {
  private readonly active = new Set<PlayingVoice>();

  play(
    context: AudioContext,
    destination: AudioNode,
    bank: AudioBuffer,
    cues: readonly VoiceCue[],
  ): PlayingVoice | undefined {
    if (context.state !== 'running' || this.active.size >= 4 || !cues.length) return undefined;

    const mix = context.createGain();
    mix.gain.value = 0;
    mix.connect(destination);
    const sources = new Set<AudioBufferSourceNode>();
    const start = context.currentTime + 0.015;
    const line: PlayingVoice = {
      mix: (distance, volume, muted) => {
        if (!this.active.has(line)) return;
        mix.gain.cancelScheduledValues(context.currentTime);
        mix.gain.setTargetAtTime(
          effectiveVolume(volume, muted, 0.45 * distanceGain(distance)),
          context.currentTime,
          0.006,
        );
      },
      stop: () => {
        if (!this.active.delete(line)) return;
        for (const source of sources) source.stop();
        sources.clear();
        mix.disconnect();
      },
    };
    this.active.add(line);

    for (const cue of cues) {
      const slot =
        CAPTION_VOICE_BANKS.indexOf(cue.bank) * CAPTION_SOUNDS.length +
        CAPTION_SOUNDS.indexOf(cue.sound);
      const source = context.createBufferSource();
      source.buffer = bank;
      const rate = 1.55 * cue.speed ** 0.45 * 2 ** (cue.pitch / 12);
      source.playbackRate.value = rate;
      const at = start + cue.atMs / 1000;
      const end = at + CAPTION_SOUND_SECONDS / rate;
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(cue.emphasis, at + 0.004);
      envelope.gain.setValueAtTime(cue.emphasis, end - 0.012);
      envelope.gain.linearRampToValueAtTime(0, end);
      source.connect(envelope).connect(mix);
      sources.add(source);
      source.onended = () => {
        source.disconnect();
        envelope.disconnect();
        if (sources.delete(source) && !sources.size) line.stop();
      };
      source.start(at, slot * CAPTION_SOUND_SECONDS, CAPTION_SOUND_SECONDS);
    }
    return line;
  }

  clear(): void {
    for (const line of this.active) line.stop();
  }
}
