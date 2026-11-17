import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  EXPLOSION_SHEETS,
  explosionFrames,
  explosionDurationMs,
  explosionVariation,
  type ExplosionSize,
} from '../src/content/explosions';
import { explosionGalleryView } from '../src/render/phaser/explosion-gallery';
import { eventCues, type CueContext } from '../src/render/event-cues';

describe('explosion sprite sheets', () => {
  for (const size of Object.keys(EXPLOSION_SHEETS) as ExplosionSize[]) {
    const spec = EXPLOSION_SHEETS[size];
    it(`${size}: rows contain eight distinct sequential frames without crossing variations`, () => {
      const frames = [0, 1, 2].flatMap((row) => {
        const f = explosionFrames(size, row);
        expect(f).toEqual(Array.from({ length: 8 }, (_, i) => row * 8 + i));
        return f;
      });
      expect(new Set(frames).size).toBe(24);
      expect(() => explosionFrames(size, 3)).toThrow();
      expect(() => explosionFrames(size, -1)).toThrow();
      expect(explosionDurationMs(size)).toBeCloseTo(8000 / spec.frameRate);
    });

    it(`${size}: delivered PNG has isolated transparent frames that expand and fade`, () => {
      const img = PNG.sync.read(readFileSync(new URL(`../assets/${spec.file}`, import.meta.url)));
      const w = spec.frameWidth;
      const h = spec.frameHeight;
      expect([img.width, img.height]).toEqual([w * 8, h * 3]);
      const peaks: Buffer[] = [];
      for (let row = 0; row < 3; row++) {
        const energies: number[] = [];
        for (let col = 0; col < 8; col++) {
          let energy = 0;
          for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
              const alpha = img.data[((row * h + y) * img.width + col * w + x) * 4 + 3]!;
              if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) expect(alpha).toBe(0);
              energy += alpha;
            }
          energies.push(energy);
        }
        const peak = Math.max(...energies);
        expect(energies[0]).toBeGreaterThan(0);
        expect(peak).toBeGreaterThan(energies[0]! * 2);
        expect(energies[7]).toBeLessThan(peak * 0.15);
        const bytes = Buffer.alloc(w * h * 4);
        for (let y = 0; y < h; y++) {
          const offset = ((row * h + y) * img.width + w * 2) * 4;
          img.data.copy(bytes, y * w * 4, offset, offset + w * 4);
        }
        peaks.push(bytes);
      }
      expect(peaks[0]!.equals(peaks[1]!)).toBe(false);
      expect(peaks[1]!.equals(peaks[2]!)).toBe(false);
    });
  }

  it('chooses repeatable variation rows without consuming simulation randomness', () => {
    expect(explosionVariation('grenade-4', 123, 'small')).toBe(
      explosionVariation('grenade-4', 123, 'small'),
    );
    const rows = new Set(
      Array.from({ length: 30 }, (_, i) => explosionVariation(`mine-${i}`, 60, 'large')),
    );
    expect([...rows].sort()).toEqual([0, 1, 2]);
  });

  it('the review gallery exercises each labelled row through the gameplay cue path', () => {
    const ctx: CueContext = { liveId: null, kindOf: () => undefined, positionOf: () => undefined };
    for (let row = 0; row < 3; row++) {
      const view = explosionGalleryView(1 + row * 18);
      const cues = eventCues(view.events, ctx).filter((cue) => cue.type === 'explosion');
      expect(cues.map((cue) => cue.size)).toEqual(['small', 'large']);
      expect(cues.map((cue) => cue.variation)).toEqual([row, row]);
    }
  });

  it('routes grenades to small sheets and mines/rockets to large sheets', () => {
    const ctx: CueContext = { liveId: null, kindOf: () => undefined, positionOf: () => undefined };
    const cues = eventCues(
      [
        {
          kind: 'grenadeExploded',
          tick: 60,
          id: 'g',
          by: 'S1',
          x: 10,
          y: 20,
          radius: 30,
          fragments: [],
        },
        { kind: 'mineDetonated', tick: 60, id: 'm', x: 30, y: 40, radius: 60 },
        { kind: 'rocketExploded', tick: 60, id: 'r', by: 'S1', x: 50, y: 60, radius: 70 },
      ],
      ctx,
    ).filter((cue) => cue.type === 'explosion');
    expect(cues.map((cue) => cue.size)).toEqual(['small', 'large', 'large']);
    expect(cues.map((cue) => cue.radius)).toEqual([48, 60, 98]);
    for (const cue of cues) expect([0, 1, 2]).toContain(cue.variation);
  });
});
