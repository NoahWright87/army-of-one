import { describe, expect, it } from 'vitest';
import type { CaptureTruth } from '../../contracts/mission';
import { loadMission, missionKeys, MissionSaver } from '../mission-store';
import { MemoryStore } from '../storage';
import { syntheticMission } from './fixtures';

const keys = missionKeys('mission-02');
const TRUTH: CaptureTruth[] = [
  { pointId: 'cp-outpost', stage: 'neutral', tick: 2400, by: ['S1'], observedInAttempt: 1 },
  { pointId: 'cp-outpost', stage: 'ours', tick: 2700, by: ['S1', 'S2'], observedInAttempt: 2 },
];

describe('capture truth persistence (05-a)', () => {
  it('round-trips a mission with capture truth', async () => {
    const store = new MemoryStore();
    const state = { ...syntheticMission(3, 300), missionId: 'mission-02', captureTruth: TRUTH };
    expect((await new MissionSaver(store, 'mission-02').save(state)).ok).toBe(true);
    expect(await loadMission(store, 'mission-02')).toEqual({ ok: true, state });
  });

  it('loads an old save without capture truth', async () => {
    const store = new MemoryStore();
    const state = { ...syntheticMission(3, 300), missionId: 'mission-02' };
    await new MissionSaver(store, 'mission-02').save(state);
    expect(store.data.has(keys.captures)).toBe(false);
    const loaded = await loadMission(store, 'mission-02');
    expect(loaded).toEqual({ ok: true, state });
    expect(loaded.ok && loaded.state.captureTruth).toBeUndefined();
  });

  it('a corrupt capture key falls back to its backup, then to none (never fatal)', async () => {
    const store = new MemoryStore();
    const saver = new MissionSaver(store, 'mission-02');
    const state = { ...syntheticMission(2, 200), missionId: 'mission-02', captureTruth: TRUTH };
    await saver.save(state);
    await saver.save({ ...state, captureTruth: TRUTH.slice(0, 1) });
    await store.set(keys.captures, '{nope');
    let loaded = await loadMission(store, 'mission-02');
    expect(loaded.ok && loaded.state.captureTruth).toEqual(TRUTH);
    await store.set(keys.capturesBackup, '[{"pointId":3}]');
    loaded = await loadMission(store, 'mission-02');
    expect(loaded.ok).toBe(true);
    expect(loaded.ok && loaded.state.captureTruth).toBeUndefined();
  });
});
