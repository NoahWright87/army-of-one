/**
 * PHASE05-a end to end (headless): capture the Outpost on mission-02, see it as a forward spawn,
 * deploy there with the lead-in, finish at the HQ flag; lose it causally and win it back.
 */
import { describe, expect, it } from 'vitest';
import { MISSION_02 } from '../content/maps/mission-02';
import type { CaptureChange, LaneTruth, SpawnOption } from '../contracts/mission';
import { loadMission } from '../persistence/mission-store';
import { secondsToTicks } from '../sim/core/time';
import { createHarness } from './test-harness';

const lane = (lanes: readonly LaneTruth[], id: string) => lanes.find((l) => l.soldierId === id)!;
const outpost = (opts: readonly SpawnOption[]) =>
  opts.find((o) => o.kind === 'new' && o.spawnPointId === 'outpost') as
    Extract<SpawnOption, { kind: 'new' }> | undefined;

describe('mission-02: forward spawn loop', () => {
  it('capture → forward option at the capture tick → deploy there → HQ flag completes', async () => {
    const h = createHarness({ map: MISSION_02 });
    await h.game.boot();
    await h.game.newMission();
    expect(outpost(h.ui.current!.latest.options)).toBeUndefined();

    await h.play('outpost-capture');
    await h.settle();
    const screen = h.ui.current!;
    const caps = screen.latest.captures ?? [];
    const ours = caps.find((c) => c.pointId === 'cp-outpost' && c.stage === 'ours')!;
    expect(ours.by).toEqual(['S1']);
    expect(outpost(screen.latest.options)).toEqual({
      kind: 'new',
      spawnPointId: 'outpost',
      entryTick: ours.tick,
    });
    const changes = [
      screen.props.captureChanges ?? [],
      ...screen.updates.map((u) => u.captureChanges ?? []),
    ].flat();
    expect(changes).toContainEqual({ pointId: 'cp-outpost', before: null, after: ours.tick });
    expect(lane(screen.latest.lanes, 'S1').markers.some((m) => m.kind === 'capture')).toBe(true);
    // Persisted with the mission.
    const saved = await loadMission(h.store, 'mission-02');
    expect(saved.ok && saved.state.captureTruth?.some((c) => c.stage === 'ours')).toBe(true);

    await h.play('outpost-hq');
    const run = h.runs[1]!;
    expect(run.countdownAtStart).toBe(secondsToTicks(5)); // lead-in reused ([D25])
    expect(run.run.attempt.tick).toBe(ours.tick - secondsToTicks(5));
    await h.settle();
    expect(h.game.flow.kind).toBe('complete');
    expect(h.game.mission.completed?.bySoldierId).toBe('S2');
    expect(h.game.mission.soldiers.find((s) => s.id === 'S2')!.spawnTick).toBe(ours.tick);
  });

  it('the captor dies earlier → point lost, outpost soldier never spawns → re-capture restores', async () => {
    const h = createHarness({ map: MISSION_02 });
    await h.game.boot();
    await h.game.newMission();
    await h.play('outpost-capture-slow'); // S1 captures late
    await h.settle();
    await h.play('outpost-hold'); // S2 enters at the outpost
    await h.settle();
    const t1 = outpost(h.ui.current!.latest.options)!;
    expect(lane(h.ui.current!.latest.lanes, 'S2').end.kind).not.toBe('neverSpawned');

    await h.play('bridge-under-s1'); // S3 blows the bridge under S1
    await h.settle();
    let screen = h.ui.current!;
    expect(lane(screen.latest.lanes, 'S1').end.kind).toBe('death');
    expect(lane(screen.latest.lanes, 'S2').end).toEqual({ kind: 'neverSpawned' });
    expect(outpost(screen.latest.options)).toBeUndefined();
    const all: CaptureChange[] = [
      screen.props.captureChanges ?? [],
      ...screen.updates.map((u) => u.captureChanges ?? []),
    ].flat();
    expect(all.some((c) => c.pointId === 'cp-outpost' && c.after === null)).toBe(true);

    await h.play('outpost-capture'); // S4 rushes it before the bridge blows
    await h.settle();
    screen = h.ui.current!;
    const back = outpost(screen.latest.options)!;
    expect(back).toBeDefined();
    expect(back.entryTick).toBeGreaterThan(0);
    expect(lane(screen.latest.lanes, 'S2').end.kind).not.toBe('neverSpawned');
    expect(t1.entryTick).toBeGreaterThan(0);
  });

  it('deploying at a capture that no longer happens bounces with "History shifted" before the countdown', async () => {
    const h = createHarness({ map: MISSION_02, resolveDelayMs: 10_000_000 });
    await h.game.boot();
    await h.game.newMission();
    await h.play('outpost-capture-slow');
    await h.settle(h.clock.now + 5_000);
    await h.play('bridge-under-s1');
    // The beat ends; the scrubber hasn't run yet, so the stale capture is still offered.
    await h.settle(h.clock.now + 5_000);
    expect(h.game.flow.kind).toBe('respawn');
    const stale = outpost(h.ui.current!.latest.options);
    expect(stale).toBeDefined();
    const runsBefore = h.runs.length;
    await h.game.deploy(stale!);
    expect(h.game.flow).toMatchObject({ kind: 'respawn', notice: 'historyShifted' });
    expect(h.runs.length).toBe(runsBefore); // no countdown was shown
    // The bounce itself observed the window: the capture is gone from the truth.
    expect(outpost(h.ui.current!.latest.options)).toBeUndefined();
  });
});
