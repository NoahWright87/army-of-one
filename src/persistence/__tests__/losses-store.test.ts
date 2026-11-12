import { describe, expect, it } from 'vitest';
import type { LossTruth } from '../../contracts/mission';
import { loadMission, missionKeys, MissionSaver } from '../mission-store';
import { MemoryStore } from '../storage';
import { syntheticMission } from './fixtures';

const keys = missionKeys('mission-03');
const LOSSES: LossTruth = {
  enemies: [
    { refId: 'E3', kind: 'soldier', roleId: 'gunner', tick: 900, observedInAttempt: 1 },
    { refId: 'm3-t1', kind: 'turret', tick: 1200, observedInAttempt: 2 },
  ],
  points: [{ pointId: 'cp-forward', tick: 3000, observedInAttempt: 2 }],
};

describe('loss truth persistence (PHASE11)', () => {
  it('round-trips a mission with loss truth', async () => {
    const store = new MemoryStore();
    const state = { ...syntheticMission(3, 300), missionId: 'mission-03', lossTruth: LOSSES };
    expect((await new MissionSaver(store, 'mission-03').save(state)).ok).toBe(true);
    expect(await loadMission(store, 'mission-03')).toEqual({ ok: true, state });
  });

  it('an old save has none; a corrupt one is dropped, never fatal', async () => {
    const store = new MemoryStore();
    const state = { ...syntheticMission(2, 200), missionId: 'mission-03' };
    await new MissionSaver(store, 'mission-03').save(state);
    expect(store.data.has(keys.losses)).toBe(false);
    await store.set(keys.losses, '{"enemies":[{"refId":1}],"points":[]}');
    const loaded = await loadMission(store, 'mission-03');
    expect(loaded.ok && loaded.state.lossTruth).toBeUndefined();
  });
});
