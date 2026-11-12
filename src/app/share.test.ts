/** (PHASE12-e) Shareable runs and the replay library ([D79]). */
import { describe, expect, it } from 'vitest';
import { MISSION_03 } from '../content/maps/mission-03';
import { DEFAULT_TUNING } from '../content/tuning';
import { KEEP_PER_MISSION, withEntry, type LibraryEntry } from './replay-library';
import { decodeRun, encodeRun, packRun, packedFromHash, unpackRun } from './share';
import { createHarness } from './test-harness';

async function wonRun() {
  const h = createHarness({ map: MISSION_03 });
  await h.game.boot();
  await h.game.newMission();
  for (const n of ['breach-slow', 'breach-rescue', 'breach-resume', 'breach-win']) {
    await h.play(n);
    await h.settle();
  }
  return h.game.mission;
}

describe('shareable runs', () => {
  it('a won mission packs into a small link and comes back identical', async () => {
    const state = await wonRun();
    const run = { missionId: state.missionId, state, tuning: { rifle: { damage: 30 } } };
    const packed = await packRun(run);
    expect(packed).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(packed.length).toBeLessThan(8000); // three lives: a few KB
    const back = await unpackRun(packed);
    expect(back.missionId).toBe('mission-03');
    expect(back.tuning).toEqual({ rifle: { damage: 30 } });
    expect(back.state.soldiers).toEqual(state.soldiers);
    expect(back.state.lanes).toEqual(state.lanes);
    expect(back.state.completed).toEqual(state.completed);
    expect(packedFromHash(`#replay=${packed}`)).toBe(packed);
    expect(packedFromHash('#other')).toBeNull();
    void DEFAULT_TUNING;
  });

  it('rejects garbage', async () => {
    await expect(decodeRun('{"v":99}')).rejects.toThrow();
    const ok = JSON.parse(
      await encodeRun({ missionId: 'mission-03', state: await wonRun(), tuning: {} }),
    );
    ok.e = { 'aoo:v1:mission-03:meta': '{nope' };
    await expect(decodeRun(JSON.stringify(ok))).rejects.toThrow();
  });
});

describe('replay library', () => {
  const e = (id: string, missionId: string, savedAt: number): LibraryEntry => ({
    id,
    missionId,
    savedAt,
    soldiers: 1,
    battleTicks: 60,
    packed: 'x',
  });
  it(`keeps the newest ${KEEP_PER_MISSION} per mission`, () => {
    let list: LibraryEntry[] = [];
    for (let i = 0; i < 5; i++) list = withEntry(list, e(`a${i}`, 'm3', i));
    list = withEntry(list, e('b0', 'm5', 10));
    expect(list.map((x) => x.id)).toEqual(['b0', 'a4', 'a3', 'a2']);
  });
});
