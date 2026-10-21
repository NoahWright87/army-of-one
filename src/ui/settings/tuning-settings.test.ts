import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, type Tuning } from '../../content/tuning';
import { MemoryStorage, SettingsStore } from './registry';
import {
  effectiveTuning,
  numberRange,
  tuningOverrides,
  tuningSettingDefs,
  TUNING_PREFIX,
} from './tuning-settings';

describe('tuning settings', () => {
  it('registers one setting per numeric leaf', () => {
    const defs = tuningSettingDefs(DEFAULT_TUNING);
    const ids = defs.map((d) => d.id);
    expect(ids).toContain('tuning.soldier.speed');
    expect(ids).toContain('tuning.soldier.maxHp');
    expect(ids.every((id) => id.startsWith(TUNING_PREFIX))).toBe(true);
    const speed = defs.find((d) => d.id === 'tuning.soldier.speed')!;
    expect(speed.type).toBe('number');
    expect(speed.type === 'number' && speed.default).toBe(DEFAULT_TUNING.soldier.speed);
  });

  it('walks nested sections and booleans generically', () => {
    const fake = { a: { b: { c: 2.5 }, flag: true }, n: -3 } as unknown as Tuning;
    const defs = tuningSettingDefs(fake);
    expect(defs.map((d) => [d.id, d.type])).toEqual([
      ['tuning.a.b.c', 'number'],
      ['tuning.a.flag', 'boolean'],
      ['tuning.n', 'number'],
    ]);
  });

  it('picks sensible slider ranges', () => {
    expect(numberRange(150)).toEqual({ min: 0, max: 600, step: 1 });
    expect(numberRange(0)).toMatchObject({ min: 0, max: 10, step: 1 });
    const f = numberRange(0.25);
    expect(f.min).toBe(0);
    expect(f.max).toBeCloseTo(1);
    expect(f.step).toBeCloseTo(0.001);
    expect(numberRange(-2).max).toBe(0);
  });

  it('turns changed values into overrides for withTuning', () => {
    const s = new SettingsStore(new MemoryStorage(), 'k');
    s.register(tuningSettingDefs(DEFAULT_TUNING));
    expect(tuningOverrides(s, DEFAULT_TUNING)).toEqual({});
    s.set('tuning.soldier.speed', 200);
    expect(tuningOverrides(s, DEFAULT_TUNING)).toEqual({ soldier: { speed: 200 } });
    const t = effectiveTuning(s, DEFAULT_TUNING);
    expect(t.soldier.speed).toBe(200);
    expect(t.soldier.maxHp).toBe(DEFAULT_TUNING.soldier.maxHp);
    expect(DEFAULT_TUNING.soldier.speed).toBe(150); // defaults untouched
  });
});
