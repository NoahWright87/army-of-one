import { distanceGain, effectiveVolume } from '../sound-mix';
import type { ParsedLine } from './markup';

const FORMANTS: Record<string, readonly [number, number]> = {
  a: [750, 1550],
  e: [460, 2150],
  i: [290, 2450],
  o: [500, 950],
  u: [330, 780],
  y: [380, 2000],
};

export interface VoiceCue {
  atMs: number;
  sound: string;
  emphasis: number;
  pitch: number;
  duration: number;
  brightness: number;
}

function hash(id: string): number {
  let value = 2166136261;
  for (const ch of id) value = Math.imul(value ^ ch.codePointAt(0)!, 16777619);
  return (value ^ (value >>> 16)) >>> 0;
}

export function captionVoice(speakerId: string, { glyphs, pauses }: ParsedLine): VoiceCue[] {
  const seed = hash(speakerId);
  const pitch = 120 + (seed % 127);
  const tempo = 0.85 + ((seed >>> 8) % 36) / 100;
  const brightness = 0.8 + ((seed >>> 16) % 50) / 100;
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
    if (!/^[a-z0-9]$/.test(ch) && !/^\p{L}$/u.test(ch)) {
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
    const vowel = FORMANTS[sound] !== undefined;
    const emphasis =
      Math.max(0.65, Math.min(1.5, glyph.size)) *
      (glyph.effects.some((effect) => effect === 'shake' || effect === 'slam') ? 1.2 : 1);
    const inflection = glyph.effects.includes('wave') ? Math.sin(i * 0.9) * 0.12 : 0;
    cues.push({
      atMs: nextMs,
      sound,
      emphasis,
      pitch: pitch * (1 + inflection + ((hash(sound) % 17) - 8) / 100),
      duration: (vowel ? 0.07 : 0.045) * tempo,
      brightness,
    });
    if (glyph.pacing !== 'letters') nextMs += (vowel ? 43 : 31) * tempo;
  }
  return cues;
}

/** Short filtered pulses, sharing Phaser's unlocked audio context. */
export class CaptionVoicePlayer {
  private readonly active = new Set<OscillatorNode>();

  play(
    context: AudioContext,
    destination: AudioNode,
    cue: VoiceCue,
    distance: number,
    volume: number,
    muted: boolean,
  ): void {
    const start = context.currentTime;
    if (context.state !== 'running' || this.active.size >= 6) return;
    const level = effectiveVolume(volume, muted, 0.14 * cue.emphasis * distanceGain(distance));
    if (level < 0.005) return;
    const end = start + cue.duration;
    const oscillator = context.createOscillator();
    oscillator.type = FORMANTS[cue.sound] ? 'sawtooth' : 'triangle';
    oscillator.frequency.setValueAtTime(cue.pitch * (1 + (cue.emphasis - 1) * 0.15), start);
    oscillator.frequency.exponentialRampToValueAtTime(cue.pitch * 0.88, end);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    const color = hash(cue.sound);
    const formants = FORMANTS[cue.sound] ?? [480 + (color % 420), 1400 + (color % 1600)];
    const filters = formants.map((frequency) => {
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = frequency * cue.brightness;
      filter.Q.value = 1.4;
      oscillator.connect(filter).connect(gain);
      return filter;
    });
    gain.connect(destination);
    this.active.add(oscillator);
    oscillator.onended = () => {
      this.active.delete(oscillator);
      oscillator.disconnect();
      for (const filter of filters) filter.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(end);
  }

  clear(): void {
    for (const sound of this.active) sound.stop();
    this.active.clear();
  }
}
