/**
 * Placeholder sound synthesizer: writes 16-bit mono PCM WAVs from tiny recipes. Intentionally
 * crude. Deterministic (noise comes from a seeded PRNG local to each sound).
 *
 * Every sound key in the manifest MUST have a recipe (enforced by `Record<SoundKey, …>`).
 */
import type { SoundKey } from '../src/content/assets';

export const SAMPLE_RATE = 22050;

type Wave = 'sine' | 'square' | 'saw' | 'triangle' | 'noise';

interface Voice {
  wave: Wave;
  /** Start / end frequency in Hz (linear sweep). Ignored for noise. */
  f0?: number;
  f1?: number;
  /** Seconds from the sound start. */
  start?: number;
  dur: number;
  gain: number;
  attack?: number;
  /** Exponential decay rate (1/s); 0 = flat (sustain until the end, with a tiny release). */
  decay?: number;
  /** One-pole low-pass coefficient for noise, 0..1 (lower = darker). */
  lowpass?: number;
  /** Tremolo frequency in Hz. */
  tremolo?: number;
  seed?: number;
}

interface SoundRecipe {
  durationMs: number;
  voices: Voice[];
  /** Loops get no fade-out and use whole-cycle frequencies so they repeat seamlessly. */
  loop?: boolean;
}

export const SOUND_RECIPES: Record<SoundKey, SoundRecipe> = {
  sfx_rifle_shot: {
    durationMs: 180,
    voices: [
      { wave: 'noise', dur: 0.18, gain: 0.7, decay: 28, lowpass: 0.5, seed: 1 },
      { wave: 'sine', f0: 140, f1: 50, dur: 0.12, gain: 0.6, decay: 25 },
    ],
  },
  sfx_turret_shot: {
    durationMs: 220,
    voices: [
      { wave: 'square', f0: 220, f1: 70, dur: 0.2, gain: 0.35, decay: 18 },
      { wave: 'noise', dur: 0.22, gain: 0.5, decay: 18, lowpass: 0.3, seed: 2 },
    ],
  },
  sfx_turret_windup: {
    durationMs: 500,
    voices: [
      { wave: 'saw', f0: 180, f1: 900, dur: 0.5, gain: 0.25, attack: 0.05, tremolo: 18 },
      { wave: 'sine', f0: 360, f1: 1800, dur: 0.5, gain: 0.15, attack: 0.05 },
    ],
  },
  sfx_hit: {
    durationMs: 90,
    voices: [
      { wave: 'square', f0: 520, f1: 180, dur: 0.09, gain: 0.35, decay: 30 },
      { wave: 'noise', dur: 0.06, gain: 0.3, decay: 50, lowpass: 0.6, seed: 3 },
    ],
  },
  sfx_death: {
    durationMs: 600,
    voices: [
      { wave: 'saw', f0: 420, f1: 60, dur: 0.6, gain: 0.35, decay: 4 },
      { wave: 'sine', f0: 210, f1: 40, dur: 0.6, gain: 0.3, decay: 4 },
    ],
  },
  sfx_explosion: {
    durationMs: 900,
    voices: [
      { wave: 'noise', dur: 0.9, gain: 0.9, decay: 5, lowpass: 0.12, seed: 4 },
      { wave: 'sine', f0: 90, f1: 30, dur: 0.9, gain: 0.6, decay: 4 },
      { wave: 'noise', dur: 0.1, gain: 0.5, decay: 40, lowpass: 0.7, seed: 5 },
    ],
  },
  sfx_lever: {
    durationMs: 120,
    voices: [
      { wave: 'square', f0: 1400, f1: 900, dur: 0.03, gain: 0.3, decay: 80 },
      { wave: 'square', f0: 700, f1: 500, start: 0.06, dur: 0.05, gain: 0.35, decay: 60 },
    ],
  },
  sfx_gate: {
    durationMs: 450,
    voices: [
      { wave: 'saw', f0: 95, f1: 80, dur: 0.45, gain: 0.35, attack: 0.03, tremolo: 22 },
      { wave: 'noise', dur: 0.45, gain: 0.2, lowpass: 0.15, tremolo: 11, seed: 6 },
      { wave: 'square', f0: 300, f1: 200, start: 0.38, dur: 0.07, gain: 0.3, decay: 40 },
    ],
  },
  sfx_vehicle_loop: {
    durationMs: 1000,
    loop: true,
    voices: [
      { wave: 'saw', f0: 70, dur: 1, gain: 0.25, tremolo: 8 },
      { wave: 'square', f0: 36, dur: 1, gain: 0.15 },
      { wave: 'sine', f0: 140, dur: 1, gain: 0.1 },
    ],
  },
  sfx_static_hum: {
    durationMs: 1000,
    loop: true,
    voices: [
      { wave: 'noise', dur: 1, gain: 0.18, lowpass: 0.5, tremolo: 6, seed: 7 },
      { wave: 'sine', f0: 60, dur: 1, gain: 0.25 },
      { wave: 'sine', f0: 120, dur: 1, gain: 0.1 },
    ],
  },
  sfx_countdown_tick: {
    durationMs: 90,
    voices: [{ wave: 'sine', f0: 880, dur: 0.09, gain: 0.5, decay: 30 }],
  },
  sfx_resume_go: {
    durationMs: 320,
    voices: [
      { wave: 'triangle', f0: 660, dur: 0.12, gain: 0.45, decay: 6 },
      { wave: 'triangle', f0: 1320, start: 0.1, dur: 0.22, gain: 0.45, decay: 8 },
    ],
  },
  sfx_mine_armed: {
    durationMs: 60,
    voices: [{ wave: 'square', f0: 1600, dur: 0.05, gain: 0.25, decay: 20 }],
  },
  sfx_capture: {
    durationMs: 500,
    voices: [
      { wave: 'square', f0: 587, dur: 0.14, gain: 0.25, decay: 5 },
      { wave: 'square', f0: 880, start: 0.15, dur: 0.3, gain: 0.25, decay: 4 },
    ],
  },
  sfx_mission_complete: {
    durationMs: 900,
    voices: [
      { wave: 'triangle', f0: 523, dur: 0.2, gain: 0.4, decay: 4 },
      { wave: 'triangle', f0: 659, start: 0.18, dur: 0.2, gain: 0.4, decay: 4 },
      { wave: 'triangle', f0: 784, start: 0.36, dur: 0.54, gain: 0.45, decay: 3 },
    ],
  },
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Synthesizes a recipe to float samples in [-1, 1]. */
export function synth(recipe: SoundRecipe): Float32Array {
  const n = Math.round((recipe.durationMs / 1000) * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (const v of recipe.voices) {
    const rand = mulberry32(v.seed ?? 1);
    const start = Math.round((v.start ?? 0) * SAMPLE_RATE);
    const len = Math.min(n - start, Math.round(v.dur * SAMPLE_RATE));
    let phase = 0;
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      const u = i / len;
      const f = (v.f0 ?? 0) + ((v.f1 ?? v.f0 ?? 0) - (v.f0 ?? 0)) * u;
      phase += f / SAMPLE_RATE;
      const p = phase - Math.floor(phase);
      let s: number;
      switch (v.wave) {
        case 'sine':
          s = Math.sin(p * Math.PI * 2);
          break;
        case 'square':
          s = p < 0.5 ? 1 : -1;
          break;
        case 'saw':
          s = 2 * p - 1;
          break;
        case 'triangle':
          s = 1 - 4 * Math.abs(p - 0.5);
          break;
        case 'noise': {
          const k = v.lowpass ?? 1;
          lp += (rand() * 2 - 1 - lp) * k;
          s = lp;
          break;
        }
      }
      let env = v.decay ? Math.exp(-v.decay * t) : 1;
      if (v.attack && t < v.attack) env *= t / v.attack;
      if (v.tremolo) env *= 0.75 + 0.25 * Math.sin(t * v.tremolo * Math.PI * 2);
      // Short release to avoid clicks, except on loops (which must wrap seamlessly).
      const rel = Math.min(1, (len - i) / (SAMPLE_RATE * 0.005));
      if (!recipe.loop) env *= rel;
      out[start + i]! += s * env * v.gain;
    }
  }
  return out;
}

export function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]!));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'ascii');
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8, 'ascii');
  h.write('fmt ', 12, 'ascii');
  h.writeUInt32LE(16, 16); // PCM chunk size
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28); // byte rate
  h.writeUInt16LE(2, 32); // block align
  h.writeUInt16LE(16, 34); // bits per sample
  h.write('data', 36, 'ascii');
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

export function renderSound(key: SoundKey): Buffer {
  return encodeWav(synth(SOUND_RECIPES[key]));
}
