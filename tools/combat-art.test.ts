import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  PROJECTILE_ART,
  IMPACT_SHEET,
  bulletArt,
  impactFrames,
  impactRow,
} from '../src/content/combat-art';
import { eventCues, type CueContext } from '../src/render/event-cues';

describe('combat art', () => {
  it('chooses the weapon silhouette and supports older views', () => {
    expect(['shotgun', 'pistol', 'rifle', 'mg', 'sniper', undefined].map(bulletArt)).toEqual([
      'pellet',
      'pistol',
      'rifle',
      'rifle',
      'rifle',
      'rifle',
    ]);
  });
  it('delivers small transparent projectile textures with clean margins', () => {
    for (const spec of Object.values(PROJECTILE_ART)) {
      const p = PNG.sync.read(readFileSync(new URL(`../assets/${spec.file}`, import.meta.url)));
      expect([p.width, p.height]).toEqual([spec.width, spec.height]);
      let visible = 0;
      for (let y = 0; y < p.height; y++)
        for (let x = 0; x < p.width; x++) {
          const a = p.data[(y * p.width + x) * 4 + 3]!;
          if (x < 2 || y < 2 || x >= p.width - 2 || y >= p.height - 2) expect(a).toBe(0);
          visible += a;
        }
      expect(visible).toBeGreaterThan(1000);
    }
  });
  it('isolates four fixed-grid impact sequences that expand then fade', () => {
    const p = PNG.sync.read(
      readFileSync(new URL(`../assets/${IMPACT_SHEET.file}`, import.meta.url)),
    );
    expect([p.width, p.height]).toEqual([768, 512]);
    for (let row = 0; row < 4; row++) {
      expect(impactFrames(row)).toEqual(Array.from({ length: 6 }, (_, i) => row * 6 + i));
      const energy = [];
      for (let col = 0; col < 6; col++) {
        let sum = 0;
        for (let y = 0; y < 128; y++)
          for (let x = 0; x < 128; x++) {
            const a = p.data[((row * 128 + y) * p.width + col * 128 + x) * 4 + 3]!;
            if (x < 2 || y < 2 || x >= 126 || y >= 126) expect(a).toBe(0);
            sum += a;
          }
        energy.push(sum);
      }
      const peak = Math.max(...energy);
      expect(peak).toBeGreaterThan(energy[0]! * 2);
      expect(energy[5]).toBeLessThan(peak * 0.15);
    }
    expect(() => impactFrames(4)).toThrow();
  });
  it('animates only actual bullet stops, preserving armor sparks and the range-end fix', () => {
    const ctx: CueContext = {
      liveId: null,
      kindOf: () => undefined,
      positionOf: () => ({ x: 7, y: 8 }),
    };
    const cues = eventCues(
      [
        {
          kind: 'shotFired',
          tick: 1,
          by: 's',
          fromX: 0,
          fromY: 0,
          angle: 0,
          hitX: 100,
          hitY: 0,
          flying: true,
        },
        { kind: 'bulletStopped', tick: 2, by: 's', x: 20, y: 0, landed: true },
        { kind: 'damaged', tick: 2, target: 'tank', amount: 0, armored: true },
      ],
      ctx,
    ).filter((c) => c.type === 'impact');
    expect(cues).toEqual([
      { type: 'impact', x: 20, y: 0 },
      { type: 'impact', x: 7, y: 8, metal: true },
    ]);
    expect(impactRow(20, 0) % 2).toBe(0);
    expect(impactRow(7, 8, true) % 2).toBe(1);
  });
});
