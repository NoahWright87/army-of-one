/**
 * Headless end-to-end tests of the PHASE04 loop: the real attempt runner, truth model and
 * persistence, driven through the GameController with scripted lives, a manual clock and fake
 * screens.
 */
import { describe, expect, it } from 'vitest';
import { MISSION_01 } from '../content/maps/mission-01';
import type { LaneTruth } from '../contracts/mission';
import { loadMission } from '../persistence/mission-store';
import { secondsToTicks } from '../sim/core/time';
import { HeadlessBattleHost } from './headless';
import { createHarness } from './test-harness';

const lane = (lanes: readonly LaneTruth[], id: string) => lanes.find((l) => l.soldierId === id)!;
const LEAD_IN = secondsToTicks(5);

describe('the loop: first death → rescue → resume → mission complete', () => {
  it('plays through with the scrubber finding the rescue', async () => {
    const h = createHarness();
    await h.game.boot();
    expect(h.game.flow).toEqual({ kind: 'title', canContinue: false });
    await h.game.newMission();
    expect(h.game.flow.kind).toBe('respawn');

    // First respawn screen: no lanes, both spawn points at 0:00.
    const first = h.ui.current!;
    expect(first.props.lanes).toEqual([]);
    expect(first.props.options).toEqual([
      { kind: 'new', spawnPointId: 'road', entryTick: 0 },
      { kind: 'new', spawnPointId: 'beach', entryTick: 0 },
    ]);

    // Life 1: S1 walks into the turret.
    await h.play('road-slow');
    // The very first soldier gets a full 5 s countdown over a frozen battlefield ([D25]).
    expect(h.runs[0]!.countdownAtStart).toBe(LEAD_IN);
    expect(h.runs[0]!.run.holdTicks).toBe(LEAD_IN);
    await h.settle();
    expect(h.ui.captions).toContain('kia');
    expect(h.game.flow.kind).toBe('respawn');
    let screen = h.ui.current!;
    const s1 = lane(screen.latest.lanes, 'S1');
    expect(s1.end.kind).toBe('death');
    const s1DeathTick = (s1.end as { tick: number }).tick;
    // Spawn stagger ([D7]): Road's next soldier enters at 0:02, Beach's first still at 0:00.
    expect(screen.latest.options).toEqual([
      { kind: 'new', spawnPointId: 'road', entryTick: secondsToTicks(2) },
      { kind: 'new', spawnPointId: 'beach', entryTick: 0 },
    ]);

    // Life 2: S2 snipes the turret, then dies before S1's old death time. The attempt itself
    // can't tell S1 survives; the background resolve sweeps on and flips X → O.
    await h.play('road-snipe-die');
    expect(h.runs[1]!.countdownAtStart).toBe(LEAD_IN);
    expect(h.runs[1]!.run.holdTicks).toBe(LEAD_IN - secondsToTicks(2));
    await h.settle();
    screen = h.ui.current!;
    const s2 = lane(screen.latest.lanes, 'S2');
    expect(s2.end.kind).toBe('death');
    expect((s2.end as { tick: number }).tick).toBeLessThan(s1DeathTick);
    const s1After = lane(screen.latest.lanes, 'S1');
    expect(s1After.end).toEqual({ kind: 'open', tick: s1DeathTick });
    // The scrubber reported progressively and then finished.
    const progress = h.events.filter((e) => e.type === 'resolveProgress');
    expect(progress.length).toBeGreaterThan(1);
    const s1Changed = [screen.props.changes ?? [], ...screen.updates.map((u) => u.changes ?? [])]
      .flat()
      .some((c) => c.soldierId === 'S1' && c.after.kind === 'open');
    expect(s1Changed).toBe(true);
    expect(screen.latest.resolvedUntil).toBeNull();
    expect(h.game.rescues).toBe(1);
    const resume = screen.latest.options.find((o) => o.kind === 'resume')!;
    expect(resume).toMatchObject({ kind: 'resume', soldierId: 'S1', resumeTick: s1DeathTick });

    // Life 3: resume S1 (the same identity) with a 5 s lead-in, then destroy the depot.
    await h.play('resume');
    const run3 = h.runs[2]!;
    expect(run3.run.liveId).toBe('S1');
    expect(run3.countdownAtStart).toBe(LEAD_IN);
    expect(run3.run.attempt.tick).toBe(s1DeathTick - LEAD_IN);
    expect(run3.run.holdTicks).toBe(0);
    await h.settle();
    expect(h.game.flow.kind).toBe('complete');
    expect(h.ui.captions).toContain('complete');
    const stats = h.ui.complete!.stats;
    expect(stats).toMatchObject({ soldiersUsed: 2, rescues: 1, attempts: 3 });
    expect(stats.battleTicks).toBeGreaterThan(s1DeathTick);
    // S1's lane was extended by the resume and ends in ✓.
    const s1Final = lane(h.game.mission.lanes, 'S1');
    expect(s1Final.recordedTo).toBeGreaterThan(s1DeathTick);
    expect(s1Final.end.kind).toBe('complete');
    expect(h.game.mission.soldiers.find((s) => s.id === 'S1')!.segments).toHaveLength(2);

    // Saved: the completed mission loads back.
    const loaded = await loadMission(h.store, MISSION_01.id);
    expect(loaded.ok && loaded.state.completed?.bySoldierId).toBe('S1');
    expect(loaded.ok && loaded.state.inProgress).toBeUndefined();

    // Play again clears the save.
    h.ui.complete!.playAgain();
    await h.settle();
    expect(h.game.flow).toEqual({ kind: 'respawn', notice: null });
    expect((await loadMission(h.store, MISSION_01.id)).ok).toBe(false);
    expect(h.ui.current!.props.lanes).toEqual([]);
  });

  it('the attempt itself reports the rescue when the rescuer outlives the X', async () => {
    const h = createHarness();
    await h.game.boot();
    await h.game.newMission();
    await h.play('road-slow');
    await h.settle();
    await h.play('road-snipe');
    await h.settle();
    const att = h.events.filter((e) => e.type === 'attemptEnded').at(-1)!;
    expect(att.type === 'attemptEnded' && att.changes).toContainEqual(
      expect.objectContaining({
        soldierId: 'S1',
        after: expect.objectContaining({ kind: 'open' }),
      }),
    );
  });

  it('ignoring the O: a new soldier while S1 replays and turns static', async () => {
    const h = createHarness();
    await h.game.boot();
    await h.game.newMission();
    await h.play('road-slow');
    await h.settle();
    await h.play('road-snipe');
    await h.settle();
    await h.play('beach-idle');
    // S3 at the beach; S1 replays (not controlled).
    expect(h.runs[2]!.run.liveId).toBe('S3');
    await h.settle();
    const s1 = lane(h.game.mission.lanes, 'S1');
    expect(s1.end.kind).toBe('open');
    expect(h.ui.current!.latest.options.filter((o) => o.kind === 'resume').length).toBe(2);
  });
});

describe('history shifted ([D23])', () => {
  it('bounces back when the deploy fast-forward kills the choice', async () => {
    const h = createHarness({ resolveSlice: 5, resolveDelayMs: 16 });
    await h.game.boot();
    await h.game.newMission();
    await h.play('road-slow');
    await h.settle();
    await h.play('road-snipe');
    await h.settle();
    expect(lane(h.game.mission.lanes, 'S1').end.kind).toBe('open');
    // S3 blows the road bridge before S1 crosses it, then dies at once.
    await h.play('road-blow-bridge');
    // Let the life play and the death beat end, but deploy before the scrubber gets far.
    for (let i = 0; i < 200 && h.game.flow.kind !== 'respawn'; i++) {
      await Promise.resolve();
      h.clock.advance(16);
    }
    expect(h.game.flow.kind).toBe('respawn');
    // S1's O isn't contradicted yet (the scrubber hasn't reached it): still offered.
    const resume = h.ui.current!.latest.options.find(
      (o) => o.kind === 'resume' && o.soldierId === 'S1',
    );
    expect(resume).toBeDefined();
    const attemptsBefore = h.game.mission.attemptCount;
    await h.game.deploy(resume!);
    await h.settle();
    expect(h.game.flow).toEqual({ kind: 'respawn', notice: 'historyShifted' });
    expect(h.ui.current!.notice).toBe('historyShifted');
    expect(h.game.mission.attemptCount).toBe(attemptsBefore + 1);
    expect(lane(h.game.mission.lanes, 'S1').end.kind).not.toBe('open');
    expect(
      h.ui.current!.latest.options.some((o) => o.kind === 'resume' && o.soldierId === 'S1'),
    ).toBe(false);
  });
});

describe('reload recovery ([D6])', () => {
  it('re-simulates the life in progress and goes straight into its resume lead-in', async () => {
    // A host that "reloads the page" 20 s into the life: it stops stepping and autosaves.
    const stopAt = secondsToTicks(20);
    const h = createHarness({
      battle: (clock, input) => {
        const inner = new HeadlessBattleHost(clock, input);
        return {
          start(run) {
            clock.after(0, () => {
              const src = input(run)!;
              while (!run.ended && run.tick < stopAt) run.step(src.read(run.cameraHome));
            });
          },
          stop: () => inner.stop(),
        };
      },
    });
    await h.game.boot();
    await h.game.newMission();
    await h.play('road-slow');
    await h.settle();
    expect(h.game.flow.kind).toBe('live');
    h.game.saveInProgressNow('hidden');
    await h.game.flushSaves();
    const saved = await loadMission(h.store, MISSION_01.id);
    expect(saved.ok && saved.state.inProgress).toMatchObject({
      soldierId: 'S1',
      mode: 'new',
      spawnPointId: 'road',
      segmentSoFar: { endTick: stopAt, endReason: 'suspended' },
    });

    // "Reload": a fresh controller on the same storage (its battle host just shows the run).
    const r = createHarness({ store: h.store, battle: () => ({ start() {}, stop() {} }) });
    const booting = r.game.boot();
    await r.settle();
    await booting;
    // No title, no respawn screen: straight into S1's resume lead-in at the autosave.
    expect(r.ui.title).toBeNull();
    expect(r.ui.respawns).toHaveLength(0);
    expect(r.game.flow.kind).toBe('leadIn');
    const run = r.runs[0]!.run;
    expect(run.liveId).toBe('S1');
    expect(run.option).toMatchObject({
      kind: 'resume',
      soldierId: 'S1',
      resumeTick: secondsToTicks(20),
    });
    expect(r.runs[0]!.countdownAtStart).toBe(LEAD_IN);
    expect(r.game.mission.attemptCount).toBe(1);
    expect(lane(r.game.mission.lanes, 'S1').end).toEqual({
      kind: 'open',
      tick: secondsToTicks(20),
    });
  });

  it('Continue from the title re-derives history in the background', async () => {
    const h = createHarness();
    await h.game.boot();
    await h.game.newMission();
    await h.play('road-slow');
    await h.settle();
    const r = createHarness({ store: h.store });
    const booting = r.game.boot();
    await r.settle();
    await booting;
    expect(r.game.flow).toEqual({ kind: 'title', canContinue: true });
    r.ui.title!.onContinue();
    await r.settle();
    expect(r.game.flow.kind).toBe('respawn');
    expect(lane(r.ui.current!.latest.lanes, 'S1').end.kind).toBe('death');
    expect(r.ui.current!.props.reachedTick).toBe(h.game.reachedTick);
    expect(r.game.snapshots.size).toBeGreaterThan(10);
  });
});

describe('dev kill and autosave', () => {
  it('K ends the life at once; in-progress autosaves follow the interval', async () => {
    const h = createHarness();
    await h.game.boot();
    await h.game.newMission();
    await h.play('road-idle');
    await h.settle();
    const s1 = lane(h.game.mission.lanes, 'S1');
    expect(s1.end.kind).toBe('death');
    // Control at 0:00, idles 3 s, killed: dies a tick or two after 0:03.
    expect((s1.end as { tick: number }).tick).toBeLessThanOrEqual(secondsToTicks(3) + 2);
  });
});

describe('acceptance scenarios, headless', () => {
  it('make it worse: S3 blows the bridge under a rescued S1 → X earlier, dashed remainder', async () => {
    const h = createHarness();
    await h.game.boot();
    await h.game.newMission();
    for (const l of ['road-slow', 'road-snipe', 'bridge-under-s1']) {
      await h.play(l);
      await h.settle();
    }
    const s1 = lane(h.game.mission.lanes, 'S1');
    expect(s1.end.kind).toBe('death');
    const t = (s1.end as { tick: number }).tick;
    expect(t).toBeLessThan(s1.recordedTo);
    expect(s1.spans.at(-1)).toMatchObject({ kind: 'lost', to: s1.recordedTo });
  });

  it('block an echo route: S2 shuts the gate on S1 → S1 freezes with an interrupted marker', async () => {
    const h = createHarness();
    await h.game.boot();
    await h.game.newMission();
    await h.play('gate-walker');
    await h.settle();
    await h.play('gate-closer');
    await h.settle();
    const s1 = lane(h.game.mission.lanes, 'S1');
    expect(s1.end.kind).toBe('interrupted');
    expect(s1.markers.some((m) => m.kind === 'interrupted')).toBe(true);
    // Interrupted soldiers aren't resumable ([D24]).
    expect(h.ui.current!.latest.options.some((o) => o.kind === 'resume')).toBe(false);
  });

  it('ten-plus lives replay together; road spawns stagger 2 s apart', async () => {
    const h = createHarness();
    await h.game.boot();
    await h.game.newMission();
    const t0 = Date.now();
    for (let i = 0; i < 11; i++) {
      await h.play(i % 2 ? 'beach-naive' : 'road-naive');
      await h.settle();
    }
    expect(h.game.mission.soldiers).toHaveLength(11);
    // Every lane is resolved (the scrubber caught up after each life).
    const ends = h.game.mission.lanes.map((l) => l.end.kind);
    expect(ends.filter((k) => k === 'unresolved')).toEqual([]);
    // Earlier echoes clear mines and draw turret fire, so some later lives now survive (O).
    expect(ends.every((k) => k === 'death' || k === 'open')).toBe(true);
    const roads = h.game.mission.soldiers.filter((s) => s.spawnPointId === 'road');
    expect(roads.map((s) => s.spawnTick)).toEqual(roads.map((_, i) => i * secondsToTicks(2)));
    expect(Date.now() - t0).toBeLessThan(30_000);
  }, 60_000);
});
