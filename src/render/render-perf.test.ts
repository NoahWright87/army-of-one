/** PHASE06-c render-side perf helpers: same results as before, without the allocations. */
import { describe, expect, it } from 'vitest';
import type { SoldierView } from '../sim/view';
import { indexById, nearById } from './interp';
import { AUTO_MAX_PIXELS, resolveRenderScale } from './render-scale';
import { emptyVisual, soldierVisual, type SoldierStyleSettings } from './soldier-style';

const soldier = (p: Partial<SoldierView> = {}): SoldierView => ({
  kind: 'soldier',
  id: 'S1',
  ordinal: 1,
  x: 0,
  y: 0,
  facing: 0,
  hp: 100,
  maxHp: 100,
  alive: true,
  role: 'live',
  leadIn: false,
  ...p,
});

describe('render scale (display.renderScale)', () => {
  it('fixed choices are used as given (clamped to 0.5..1)', () => {
    expect(resolveRenderScale('1', 3840, 2160)).toBe(1);
    expect(resolveRenderScale('0.75', 800, 600)).toBe(0.75);
    expect(resolveRenderScale('0.5', 800, 600)).toBe(0.5);
    expect(resolveRenderScale('0.1', 800, 600)).toBe(0.5);
    expect(resolveRenderScale('junk', 800, 600)).toBe(1);
  });

  it('auto keeps full resolution up to about 1080p and scales very large windows down', () => {
    expect(resolveRenderScale('auto', 1280, 720)).toBe(1);
    expect(resolveRenderScale('auto', 1920, 1080)).toBe(1);
    const s = resolveRenderScale('auto', 3840, 2160);
    expect(s).toBeGreaterThanOrEqual(0.5);
    expect(s).toBeLessThan(1);
    expect(3840 * 2160 * s * s).toBeLessThanOrEqual(AUTO_MAX_PIXELS);
    expect(resolveRenderScale('auto', 2560, 1440)).toBe(0.75);
  });
});

describe('index-first lookups in the previous view', () => {
  it('nearById finds the entity at the same index, a neighbour, or anywhere', () => {
    const list = ['A', 'B', 'C', 'D'].map((id) => soldier({ id }));
    expect(nearById(list, 1, 'B')).toBe(list[1]);
    expect(nearById(list, 2, 'B')).toBe(list[1]); // shifted by one (a hidden soldier)
    expect(nearById(list, 0, 'B')).toBe(list[1]);
    expect(nearById(list, 0, 'D')).toBe(list[3]);
    expect(nearById(list, 9, 'A')).toBe(list[0]);
    expect(nearById(list, 1, 'Z')).toBeUndefined();
    // Same answers as an id map.
    const m = indexById(list);
    for (const id of ['A', 'B', 'C', 'D', 'Z']) {
      for (let i = 0; i < 5; i++) expect(nearById(list, i, id)).toBe(m.get(id));
    }
  });
});

describe('soldierVisual into a reused object', () => {
  it('gives the same result as a fresh call for every role and setting combination', () => {
    const out = emptyVisual();
    const roles = ['live', 'echo', 'static', 'interrupted'] as const;
    const base: SoldierStyleSettings = { echoOpacity: 0.6, echoLabels: true, staticFlicker: true };
    const variants: SoldierStyleSettings[] = [
      base,
      { ...base, echoLabels: false, staticFlicker: false },
      { ...base, dimEchoes: true, dimEchoesLevel: 0.25 },
    ];
    // Alternate between very different soldiers so stale fields would show.
    for (const settings of variants) {
      for (const role of roles) {
        for (const alive of [true, false]) {
          for (const leadIn of [false, true]) {
            const s = soldier({ role, alive, leadIn, ordinal: 7 });
            const fresh = soldierVisual(s, settings, 130);
            expect(soldierVisual(s, settings, 130, out)).toBe(out);
            expect({ ...out }).toEqual(fresh);
          }
        }
      }
    }
  });
});
