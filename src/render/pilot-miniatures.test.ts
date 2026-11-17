import { describe, expect, it } from 'vitest';
import { ASSET_MANIFEST, fitPx } from '../content/assets';
import { pilotMiniature, corpsePose } from './pilot-miniatures';

describe('pilot miniature layers', () => {
  it('changes ownership through the base finish while keeping the allied sculpt', () => {
    const live = pilotMiniature('sniper', 'live')!;
    for (const state of ['echo', 'static', 'interrupted'] as const) {
      const echo = pilotMiniature('sniper', state)!;
      expect(echo.figure).toBe(live.figure);
      expect(echo.base).toBe('mini_base_round_gold_tarnished');
    }
    expect(live.base).toBe('mini_base_round_gold');
    expect(pilotMiniature('sniper', 'enemy')).toEqual({
      base: 'mini_base_round_silver',
      figure: 'mini_figure_sniper_enemy',
    });
  });

  it('removes the base and selects an unarmed fallen figure on death', () => {
    expect(pilotMiniature('shield', 'live', false)).toEqual({
      base: null,
      figure: 'mini_figure_fallen_ally',
    });
    expect(pilotMiniature('shield', 'echo', false)).toEqual({
      base: null,
      figure: 'mini_figure_fallen_ally',
    });
    expect(pilotMiniature('shield', 'enemy', false)).toEqual({
      base: null,
      figure: 'mini_figure_fallen_enemy',
    });
  });

  it('falls back for undelivered roles, including vehicles', () => {
    for (const role of ['grenadier', 'gunner', 'shotgun', 'bazooka', 'truck', 'tank'] as const) {
      expect(pilotMiniature(role)).toBeNull();
      if (role === 'truck' || role === 'tank') {
        expect(pilotMiniature(role, 'enemy', false)).toBeNull();
      } else {
        expect(pilotMiniature(role, 'enemy', false)).toEqual({
          base: null,
          figure: 'mini_figure_fallen_enemy',
        });
      }
    }
  });

  it('places a corpse away from the former base along the lethal hit direction', () => {
    const south = corpsePose(100, 200, Math.PI / 2, 16);
    expect(south.x).toBeCloseTo(100);
    expect(south.y).toBeGreaterThan(216);
    expect(south.facing).toBe(Math.PI / 2);
    const west = corpsePose(100, 200, Math.PI, 16);
    expect(west.x).toBeLessThan(84);
    expect(west.y).toBeCloseTo(200);
  });

  it('loads every chosen layer through the manifest at a shared scale', () => {
    expect(ASSET_MANIFEST.some((a) => a.key === 'mini_shadow_infantry')).toBe(true);
    for (const role of ['rifleman', 'sniper', 'shield'] as const) {
      for (const state of ['live', 'echo', 'enemy', 'static', 'interrupted'] as const) {
        for (const alive of [true, false]) {
          const p = pilotMiniature(role, state, alive)!;
          for (const key of [p.base, p.figure] as const) {
            if (key === null) continue;
            expect(ASSET_MANIFEST.some((a) => a.key === key)).toBe(true);
            expect(fitPx(key)).toBe(100);
          }
        }
      }
    }
  });
});
