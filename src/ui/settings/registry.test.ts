import { describe, expect, it, vi } from 'vitest';
import {
  MemoryStorage,
  parseStored,
  sanitize,
  SettingsStore,
  type KeyValueStorage,
  type SettingDef,
} from './registry';

const DEFS: SettingDef[] = [
  { id: 'a.bool', group: 'g', label: 'Bool', type: 'boolean', default: true },
  {
    id: 'a.num',
    group: 'g',
    label: 'Num',
    type: 'number',
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.1,
  },
  {
    id: 'a.choice',
    group: 'g',
    label: 'Choice',
    type: 'choice',
    default: 'x',
    options: [
      { value: 'x', label: 'X' },
      { value: 'y', label: 'Y' },
    ],
  },
];
const KEY = 'test.settings';

describe('sanitize', () => {
  it('validates and clamps', () => {
    expect(sanitize(DEFS[0]!, 'yes')).toBe(true);
    expect(sanitize(DEFS[0]!, false)).toBe(false);
    expect(sanitize(DEFS[1]!, 7)).toBe(1);
    expect(sanitize(DEFS[1]!, -1)).toBe(0);
    expect(sanitize(DEFS[1]!, NaN)).toBe(0.5);
    expect(sanitize(DEFS[2]!, 'y')).toBe('y');
    expect(sanitize(DEFS[2]!, 'z')).toBe('x');
  });
});

describe('parseStored', () => {
  it('tolerates garbage', () => {
    expect(parseStored(null)).toEqual({});
    expect(parseStored('{not json')).toEqual({});
    expect(parseStored('[1,2]')).toEqual({});
    expect(parseStored('{"a":1}')).toEqual({ a: 1 });
  });
});

describe('SettingsStore', () => {
  it('starts with defaults', () => {
    const s = new SettingsStore(new MemoryStorage(), KEY);
    s.register(DEFS);
    expect(s.getBool('a.bool')).toBe(true);
    expect(s.getNumber('a.num')).toBe(0.5);
    expect(s.getString('a.choice')).toBe('x');
    expect(s.isDefault('a.num')).toBe(true);
  });

  it('persists only non-default values and reloads them', () => {
    const storage = new MemoryStorage();
    const s = new SettingsStore(storage, KEY);
    s.register(DEFS);
    s.set('a.num', 0.8);
    s.set('a.choice', 'y');
    expect(JSON.parse(storage.getItem(KEY)!)).toEqual({ 'a.num': 0.8, 'a.choice': 'y' });
    s.set('a.choice', 'x');
    expect(JSON.parse(storage.getItem(KEY)!)).toEqual({ 'a.num': 0.8 });

    const s2 = new SettingsStore(storage, KEY);
    s2.register(DEFS);
    expect(s2.getNumber('a.num')).toBe(0.8);
    expect(s2.isDefault('a.num')).toBe(false);
  });

  it('removes the blob when everything is default again', () => {
    const storage = new MemoryStorage();
    const s = new SettingsStore(storage, KEY);
    s.register(DEFS);
    s.toggle('a.bool');
    expect(storage.getItem(KEY)).not.toBeNull();
    s.reset();
    expect(storage.getItem(KEY)).toBeNull();
    expect(s.getBool('a.bool')).toBe(true);
  });

  it('clamps invalid stored values on load', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, JSON.stringify({ 'a.num': 99, 'a.choice': 'nope', 'a.bool': 'x' }));
    const s = new SettingsStore(storage, KEY);
    s.register(DEFS);
    expect(s.getNumber('a.num')).toBe(1);
    expect(s.getString('a.choice')).toBe('x');
    expect(s.getBool('a.bool')).toBe(true);
  });

  it('keeps stored values for settings registered later', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, JSON.stringify({ 'later.x': 3 }));
    const s = new SettingsStore(storage, KEY);
    s.register(DEFS);
    s.set('a.num', 0.2);
    expect(JSON.parse(storage.getItem(KEY)!)).toEqual({ 'later.x': 3, 'a.num': 0.2 });
    s.register([
      {
        id: 'later.x',
        group: 'g',
        label: 'L',
        type: 'number',
        default: 1,
        min: 0,
        max: 5,
        step: 1,
      },
    ]);
    expect(s.getNumber('later.x')).toBe(3);
  });

  it('survives storage that throws', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const s = new SettingsStore(broken, KEY);
    s.register(DEFS);
    expect(() => s.set('a.num', 0.3)).not.toThrow();
    expect(s.getNumber('a.num')).toBe(0.3);
  });

  it('works without storage at all', () => {
    const s = new SettingsStore(null, KEY);
    s.register(DEFS);
    s.set('a.bool', false);
    expect(s.getBool('a.bool')).toBe(false);
  });

  it('notifies subscribers on change only', () => {
    const s = new SettingsStore(new MemoryStorage(), KEY);
    s.register(DEFS);
    const fn = vi.fn();
    const off = s.subscribe(fn);
    s.set('a.num', 0.5); // unchanged
    s.set('a.num', 0.7);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a.num', 0.7);
    off();
    s.set('a.num', 0.1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown ids and wrong types', () => {
    const s = new SettingsStore(new MemoryStorage(), KEY);
    s.register(DEFS);
    expect(() => s.get('nope')).toThrow();
    expect(() => s.set('nope', 1)).toThrow();
    expect(() => s.getNumber('a.bool')).toThrow();
  });

  it('keeps registration order for the panel', () => {
    const s = new SettingsStore(new MemoryStorage(), KEY);
    s.register(DEFS);
    expect(s.definitions().map((d) => d.id)).toEqual(['a.bool', 'a.num', 'a.choice']);
  });
});
