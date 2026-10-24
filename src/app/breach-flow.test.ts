/**
 * PHASE06-a end to end (headless): mission-03 "Breach" through the real game flow with the
 * `breach-*` autoplay lives: a fast first death, the rescue story ending in an O, the resume,
 * the forward capture and a win from the forward spawn.
 */
import { describe, expect, it } from 'vitest';
import { MISSION_03 } from '../content/maps/mission-03';
import type { LaneTruth, SpawnOption } from '../contracts/mission';
import { ticksToSeconds } from '../sim/core/time';
import { createHarness } from './test-harness';

const lane = (lanes: readonly LaneTruth[], id: string) => lanes.find((l) => l.soldierId === id)!;
const forward = (opts: readonly SpawnOption[]) =>
  opts.find((o) => o.kind === 'new' && o.spawnPointId === 'forward');

describe('mission-03: breach flow', () => {
  it('the first life dies within seconds; three spawn points are offered at 0:00', async () => {
    const h = createHarness({ map: MISSION_03 });
    await h.game.boot();
    await h.game.newMission();
    const first = h.ui.current!.latest.options.filter((o) => o.kind === 'new');
    expect(first.map((o) => (o.kind === 'new' ? o.spawnPointId : ''))).toEqual([
      'west',
      'centre',
      'east',
    ]);
    await h.play('breach-naive');
    await h.settle();
    const s1 = lane(h.ui.current!.latest.lanes, 'S1');
    expect(s1.end.kind).toBe('death');
    expect(ticksToSeconds((s1.end as { tick: number }).tick)).toBeLessThan(5);
  });

  it('slow → rescue gives an O; resume it, capture forward, win from the Forward Post', async () => {
    const h = createHarness({ map: MISSION_03 });
    await h.game.boot();
    await h.game.newMission();
    await h.play('breach-slow');
    await h.settle();
    expect(lane(h.ui.current!.latest.lanes, 'S1').end.kind).toBe('death');
    await h.play('breach-rescue');
    await h.settle();
    const options = h.ui.current!.latest.options;
    expect(options.some((o) => o.kind === 'resume' && o.soldierId === 'S1')).toBe(true);
    expect(forward(options)).toBeUndefined();

    await h.play('breach-resume'); // S1 opens the gate, runs the mines and the road, captures
    await h.settle();
    expect(forward(h.ui.current!.latest.options)).toBeDefined();

    await h.play('breach-win');
    await h.settle();
    expect(h.game.flow.kind).toBe('complete');
    expect(h.game.mission.completed?.bySoldierId).toBe('S3');
  });
});
