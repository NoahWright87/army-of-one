import { describe, expect, it } from 'vitest';
import { TEST_RANGE } from './maps/test-range';
import { hasString, str, STRINGS, strDynamic } from './strings';

describe('strings', () => {
  it('fills params', () => {
    expect(str('hud.soldier', { n: 3 })).toBe('Soldier 3');
    expect(str('objective.destroyMany', { done: 1, total: 3 })).toContain('1/3');
  });

  it('leaves unknown params visible', () => {
    expect(str('hud.soldier')).toBe('Soldier {n}');
  });

  it('dynamic keys fall back to the key itself', () => {
    expect(strDynamic('spawn.west')).toBe('West');
    expect(strDynamic('spawn.nowhere')).toBe('spawn.nowhere');
  });

  it('every test-range name key exists', () => {
    expect(hasString(TEST_RANGE.nameKey)).toBe(true);
    for (const sp of TEST_RANGE.spawnPoints) expect(hasString(sp.nameKey), sp.nameKey).toBe(true);
  });

  it('no entry is empty', () => {
    for (const [k, v] of Object.entries(STRINGS)) expect(v.trim().length, k).toBeGreaterThan(0);
  });
});
