/**
 * PHASE05-a end to end (headless): capture the Forward Post on mission-03 "Breach" (this ran on
 * the removed mission-02, [D31]), see it as a forward spawn, deploy there with the lead-in, win
 * from it; lose it causally and win it back.
 */
import { describe, expect, it } from 'vitest';
import { MISSION_03 } from '../content/maps/mission-03';
import type { CaptureChange, LaneTruth, SpawnOption } from '../contracts/mission';
import { loadMission } from '../persistence/mission-store';
import { secondsToTicks } from '../sim/core/time';
import { createHarness } from './test-harness';

const lane = (lanes: readonly LaneTruth[], id: string) => lanes.find((l) => l.soldierId === id)!;
const forward = (opts: readonly SpawnOption[]) =>
  opts.find((o) => o.kind === 'new' && o.spawnPointId === 'forward') as
    Extract<SpawnOption, { kind: 'new' }> | undefined;

describe('mission-03: forward spawn loop', () => {
  it('capture → forward option at the capture tick → deploy there → Command Post completes', async () => {
    const h = createHarness({ map: MISSION_03 });
    await h.game.boot();
    await h.game.newMission();
    expect(forward(h.ui.current!.latest.options)).toBeUndefined();

    await h.play('breach-capture');
    await h.settle();
    const screen = h.ui.current!;
    const caps = screen.latest.captures ?? [];
    const ours = caps.find((c) => c.pointId === 'cp-forward' && c.stage === 'ours')!;
    expect(ours.by).toEqual(['S1']);
    expect(forward(screen.latest.options)).toEqual({
      kind: 'new',
      spawnPointId: 'forward',
      entryTick: ours.tick,
    });
    const changes = [
      screen.props.captureChanges ?? [],
      ...screen.updates.map((u) => u.captureChanges ?? []),
    ].flat();
    expect(changes).toContainEqual({ pointId: 'cp-forward', before: null, after: ours.tick });
    expect(lane(screen.latest.lanes, 'S1').markers.some((m) => m.kind === 'capture')).toBe(true);
    // Persisted with the mission.
    const saved = await loadMission(h.store, 'mission-03');
    expect(saved.ok && saved.state.captureTruth?.some((c) => c.stage === 'ours')).toBe(true);

    await h.play('breach-win');
    const run = h.runs[1]!;
    expect(run.countdownAtStart).toBe(secondsToTicks(5)); // lead-in reused ([D25])
    expect(run.run.attempt.tick).toBe(ours.tick - secondsToTicks(5));
    await h.settle();
    expect(h.game.flow.kind).toBe('complete');
    expect(h.game.mission.completed?.bySoldierId).toBe('S2');
    expect(h.game.mission.soldiers.find((s) => s.id === 'S2')!.spawnTick).toBe(ours.tick);
  });

  it('the captor dies earlier → point lost, forward soldier never spawns → re-capture restores', async () => {
    const h = createHarness({ map: MISSION_03 });
    await h.game.boot();
    await h.game.newMission();
    await h.play('breach-capture-slow'); // S1 captures late
    await h.settle();
    await h.play('breach-forward-hold'); // S2 enters at the Forward Post
    await h.settle();
    const t1 = forward(h.ui.current!.latest.options)!;
    expect(lane(h.ui.current!.latest.lanes, 'S2').end.kind).not.toBe('neverSpawned');

    await h.play('breach-mine-under-s1'); // S3 sets off a mine next to S1 in the mine strip
    await h.settle();
    let screen = h.ui.current!;
    expect(lane(screen.latest.lanes, 'S1').end.kind).toBe('death');
    expect(lane(screen.latest.lanes, 'S2').end).toEqual({ kind: 'neverSpawned' });
    expect(forward(screen.latest.options)).toBeUndefined();
    const all: CaptureChange[] = [
      screen.props.captureChanges ?? [],
      ...screen.updates.map((u) => u.captureChanges ?? []),
    ].flat();
    expect(all.some((c) => c.pointId === 'cp-forward' && c.after === null)).toBe(true);

    await h.play('breach-follow-capture'); // S4 rushes it while S1 still dawdles at the gate
    await h.settle();
    screen = h.ui.current!;
    const back = forward(screen.latest.options)!;
    expect(back).toBeDefined();
    expect(back.entryTick).toBeGreaterThan(0);
    expect(back.entryTick).toBeLessThanOrEqual(t1.entryTick);
    expect(lane(screen.latest.lanes, 'S2').end.kind).not.toBe('neverSpawned');
    expect(t1.entryTick).toBeGreaterThan(0);
  });

  it('deploying at a capture that no longer happens bounces with "History shifted" before the countdown', async () => {
    const h = createHarness({ map: MISSION_03, resolveDelayMs: 10_000_000 });
    await h.game.boot();
    await h.game.newMission();
    await h.play('breach-capture-slow');
    await h.settle(h.clock.now + 5_000);
    await h.play('breach-mine-under-s1');
    // The beat ends; the scrubber hasn't run yet, so the stale capture is still offered.
    await h.settle(h.clock.now + 5_000);
    expect(h.game.flow.kind).toBe('respawn');
    const stale = forward(h.ui.current!.latest.options);
    expect(stale).toBeDefined();
    const runsBefore = h.runs.length;
    await h.game.deploy(stale!);
    expect(h.game.flow).toMatchObject({ kind: 'respawn', notice: 'historyShifted' });
    expect(h.runs.length).toBe(runsBefore); // no countdown was shown
    // The bounce itself observed the window: the capture is gone from the truth.
    expect(forward(h.ui.current!.latest.options)).toBeUndefined();
  });
});
