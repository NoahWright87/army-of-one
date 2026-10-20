import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { loadMission, missionKeys, MissionSaver } from '../../persistence/mission-store';
import { syntheticMission } from '../../persistence/__tests__/fixtures';
import { IndexedDbStore } from './indexeddb-store';
import { LocalStorageStore } from './local-storage-store';

const keys = missionKeys('mission-01');

describe('browser adapters', () => {
  it('IndexedDB store round-trips a mission', async () => {
    const store = await IndexedDbStore.open(indexedDB, `test-${Math.random()}`);
    const state = syntheticMission(3, 120);
    await new MissionSaver(store, 'mission-01').save(state);
    expect(await loadMission(store, 'mission-01')).toEqual({ ok: true, state });
    expect((await store.keys(keys.prefix)).length).toBeGreaterThan(0);
  });

  it('localStorage store reports quota errors instead of throwing', async () => {
    const data = new Map<string, string>();
    const fake = {
      get length() {
        return data.size;
      },
      key: (i: number) => [...data.keys()][i] ?? null,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (v.length > 10) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
        data.set(k, v);
      },
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear(),
    } as Storage;
    const store = new LocalStorageStore(fake);
    expect(await store.set('a', 'small')).toEqual({ ok: true });
    expect(await store.set('b', 'x'.repeat(50))).toMatchObject({ ok: false, error: 'quota' });
    expect(await store.keys('')).toEqual(['a']);
  });
});
