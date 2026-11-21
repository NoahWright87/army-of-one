import { describe, expect, it } from 'vitest';
import { MISSION_03 } from '../content/maps/mission-03';
import { loadMission, MissionSaver } from '../persistence/mission-store';
import { MemoryStore } from '../persistence/storage';
import { emptyMission } from './game';
import { createHarness } from './test-harness';

/** (PHASE18) A save made on another revision of the map is dropped, not replayed. */
describe('map revisions', () => {
  it('a save remembers the map revision it began on', async () => {
    const store = new MemoryStore();
    const m = { ...emptyMission('mission-03', 3), attemptCount: 2 };
    await new MissionSaver(store, 'mission-03').save(m);
    const back = await loadMission(store, 'mission-03');
    expect(back.ok && back.state.mapRev).toBe(3);
  });

  it('booting on a newer revision of the map starts fresh', async () => {
    const store = new MemoryStore();
    await new MissionSaver(store, 'mission-03').save({
      ...emptyMission('mission-03', 1),
      attemptCount: 2,
    });
    const h = createHarness({ store, map: { ...MISSION_03, rev: 2 } });
    await h.game.boot();
    expect(h.ui.title?.canContinue).toBe(false);
    expect((await loadMission(store, 'mission-03')).ok).toBe(false);
  });

  it('the same revision continues as before', async () => {
    const store = new MemoryStore();
    await new MissionSaver(store, 'mission-03').save({
      ...emptyMission('mission-03', 2),
      attemptCount: 2,
    });
    const h = createHarness({ store, map: { ...MISSION_03, rev: 2 } });
    await h.game.boot();
    expect((await loadMission(store, 'mission-03')).ok).toBe(true);
  });
});
