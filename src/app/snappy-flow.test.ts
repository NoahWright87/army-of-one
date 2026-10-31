/**
 * PHASE06-c: the snappy flow ([D28]). Pure flow rules (flow.ts) plus headless end-to-end checks
 * through the GameController: a fresh mission skips the empty respawn screen, quick redeploy
 * (R / Space) from the death beat and from the respawn screen, the hint, and the spinner rule.
 */
import { describe, expect, it } from 'vitest';
import type { SpawnOption } from '../contracts/mission';
import { secondsToTicks, TICKS_PER_SECOND } from '../sim/core/time';
import { findAutoLife } from './autoplay-lives';
import { advance, catchUpCap, createFixedStepper, MAX_BACKLOG_MS } from './fixed-step';
import {
  canQuickRedeploy,
  FlowError,
  freshMissionOption,
  quickRedeployOption,
  transition,
  type FlowState,
} from './flow';
import { paceFor } from './game-settings';
import { createHarness } from './test-harness';

const west = (entryTick = 0): SpawnOption => ({ kind: 'new', spawnPointId: 'west', entryTick });
const east = (entryTick = 0): SpawnOption => ({ kind: 'new', spawnPointId: 'east', entryTick });
const resumeS1: SpawnOption = {
  kind: 'resume',
  soldierId: 'S1',
  resumeTick: 900,
  leadInFromTick: 600,
};

describe('flow rules (pure)', () => {
  it('quick redeploy goes from the death beat straight to preparing', () => {
    const beat: FlowState = { kind: 'deathBeat', next: 'respawn' };
    expect(transition(beat, { type: 'deploy', option: west(120) })).toEqual({
      kind: 'preparing',
      option: west(120),
      recovery: false,
    });
    // Not after a mission-complete beat: that one ends at the stats screen.
    expect(() =>
      transition({ kind: 'deathBeat', next: 'complete' }, { type: 'deploy', option: west() }),
    ).toThrow(FlowError);
  });

  it('quick redeploy is available on the death beat and the respawn screen only', () => {
    expect(canQuickRedeploy({ kind: 'respawn', notice: null })).toBe(true);
    expect(canQuickRedeploy({ kind: 'respawn', notice: 'historyShifted' })).toBe(true);
    expect(canQuickRedeploy({ kind: 'deathBeat', next: 'respawn' })).toBe(true);
    expect(canQuickRedeploy({ kind: 'deathBeat', next: 'complete' })).toBe(false);
    for (const kind of ['live', 'complete', 'boot'] as const) {
      expect(canQuickRedeploy({ kind } as FlowState)).toBe(false);
    }
    expect(canQuickRedeploy({ kind: 'leadIn', option: west() })).toBe(false);
  });

  it("quick redeploy picks the last spawn point's next slot, else the first new soldier", () => {
    const opts = [resumeS1, west(240), east(0)];
    expect(quickRedeployOption(opts, 'east')).toEqual(east(0));
    expect(quickRedeployOption(opts, 'west')).toEqual(west(240));
    // Never a resume by default: the first new soldier when the point is gone / unknown.
    expect(quickRedeployOption(opts, 'forward')).toEqual(west(240));
    expect(quickRedeployOption(opts, null)).toEqual(west(240));
    expect(quickRedeployOption([resumeS1], 'west')).toEqual(resumeS1);
    expect(quickRedeployOption([], 'west')).toBeNull();
  });

  it('a fresh mission deploys the default option only when skipping is on', () => {
    expect(freshMissionOption(0, [west(), east()], true)).toEqual(west());
    expect(freshMissionOption(0, [west(), east()], false)).toBeNull();
    expect(freshMissionOption(3, [west(), east()], true)).toBeNull();
    expect(freshMissionOption(0, [], true)).toBeNull();
  });

  it("the 'fit' scrubber pace sweeps the remaining battle in about a second", () => {
    expect(paceFor('fit', secondsToTicks(90))).toBe(secondsToTicks(90));
    // Short remainders still sweep at least 20× battle time.
    expect(paceFor('fit', secondsToTicks(2))).toBe(20 * TICKS_PER_SECOND);
    expect(paceFor('20', 99999)).toBe(20 * TICKS_PER_SECOND);
    expect(paceFor('max', 99999)).toBeNull();
  });
});

describe('fixed-step catch-up (06-c)', () => {
  it('carries a little backlog instead of dropping jittery frame time', () => {
    const s = createFixedStepper(60);
    // 3 frames of 60 ms (3.6 steps each) with a cap of 4: nothing is lost.
    let total = 0;
    for (let i = 0; i < 3; i++) total += advance(s, 60, 1, 4).steps;
    expect(total).toBe(10);
    expect(s.accumulatorMs).toBeGreaterThan(0);
  });

  it('spreads a hitch over the next frames and drops what is beyond the backlog', () => {
    const s = createFixedStepper(60);
    const r = advance(s, 1000, 1, 4);
    // 1000 ms is clamped to 250; 4 steps run now, the rest carries over.
    expect(r.steps).toBe(4);
    expect(s.accumulatorMs).toBeCloseTo(250 - 4 * (1000 / 60));
    expect(r.alpha).toBeLessThan(1);
    // The next 60 Hz frames run at most 4 steps each until the backlog is gone: no burst.
    const next = [1, 2, 3, 4, 5].map(() => advance(s, 1000 / 60, 1, 4).steps);
    expect(Math.max(...next)).toBe(4);
    expect(next.slice(0, 3)).toEqual([4, 4, 4]);
    expect(next.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(14);
    // With a cap of 1 the backlog would grow without bound: beyond 200 ms it's dropped.
    const t = createFixedStepper(60);
    advance(t, 250, 1, 1);
    expect(t.accumulatorMs).toBe(MAX_BACKLOG_MS);
  });

  it('scales the cap with sim speed', () => {
    expect(catchUpCap(4, 1)).toBe(4);
    expect(catchUpCap(4, 0.25)).toBe(4);
    expect(catchUpCap(4, 4)).toBe(16);
  });
});

describe('snappy flow through the controller (headless)', () => {
  it('a fresh mission goes straight into the lead-in, without a respawn screen', async () => {
    const h = createHarness({ options: { skipEmptyRespawn: () => true } });
    await h.game.boot();
    h.lives.push(findAutoLife('breach-slow')!);
    await h.game.newMission();
    expect(h.game.flow.kind).toBe('leadIn');
    expect(h.ui.respawns).toHaveLength(0);
    expect(h.events.some((e) => e.type === 'respawnShown')).toBe(false);
    expect(h.runs[0]!.run.option).toEqual(west());
    await h.settle();
    // After the first death the respawn screen shows as usual.
    expect(h.game.flow.kind).toBe('respawn');
    expect(h.ui.respawns).toHaveLength(1);
    expect(h.game.mission.soldiers.map((s) => s.id)).toEqual(['S1']);
  });

  it('stress mode (adoptMission) never auto-deploys', async () => {
    const h = createHarness({ options: { skipEmptyRespawn: () => true } });
    await h.game.boot();
    await h.game.adoptMission({
      schemaVersion: 1,
      missionId: h.game.mission.missionId,
      attemptCount: 0,
      soldiers: [],
      lanes: [],
    });
    expect(h.game.flow.kind).toBe('respawn');
  });

  it('quick redeploy on the death beat: next slot at the same point, no respawn screen', async () => {
    const h = createHarness();
    await h.game.boot();
    await h.game.newMission();
    await h.play('breach-slow');
    // Run the life (one clock macrotask), stopping inside the death beat.
    h.clock.advance(0);
    await Promise.resolve();
    expect(h.game.flow).toEqual({ kind: 'deathBeat', next: 'respawn' });
    expect(h.ui.quickHint).toEqual(west(secondsToTicks(2)));
    const shown = h.ui.respawns.length;

    h.lives.push(findAutoLife('west-idle')!);
    expect(await h.game.quickRedeploy()).toBe(true);
    expect(h.game.flow.kind).toBe('leadIn');
    expect(h.ui.respawns.length).toBe(shown);
    expect(h.ui.quickHint).toBeNull();
    expect(h.ui.captions[h.ui.captions.length - 1]).toBeNull();
    const run = h.runs[1]!.run;
    expect(run.option).toEqual(west(secondsToTicks(2)));
    expect(run.liveId).toBe('S2');
    // The cancelled beat never fires later (it would stop the new battle).
    await h.settle();
    expect(h.game.mission.soldiers.map((s) => s.id)).toEqual(['S1', 'S2']);
    expect(h.game.flow.kind).toBe('respawn');
  });

  it('quick redeploy on the respawn screen follows the last spawn point (East)', async () => {
    const h = createHarness();
    await h.game.boot();
    await h.game.newMission();
    await h.play('east-idle');
    h.game.devKill();
    await h.settle();
    expect(h.game.flow.kind).toBe('respawn');
    expect(h.game.lastSpawnPointId).toBe('east');
    const opt = h.game.quickRedeployOption()!;
    expect(opt).toMatchObject({ kind: 'new', spawnPointId: 'east' });
    expect(h.ui.quickHint).toEqual(opt);
    h.lives.push(findAutoLife('east-idle')!);
    expect(await h.game.quickRedeploy()).toBe(true);
    expect(h.game.flow.kind).toBe('leadIn');
    expect(h.runs[1]!.run.option).toEqual(opt);
  });

  it('no quick redeploy during play or after the mission-complete beat', async () => {
    const h = createHarness();
    await h.game.boot();
    expect(await h.game.quickRedeploy()).toBe(false);
    await h.game.newMission();
    await h.play('west-idle');
    expect(h.game.flow.kind).toBe('leadIn');
    expect(await h.game.quickRedeploy()).toBe(false);
    expect(h.ui.quickHint).toBeNull();
  });

  it('the spinner only shows for fast-forwards estimated over the threshold', async () => {
    const resumeWith = async (threshold?: number) => {
      const h = createHarness({
        clockNow: true,
        ...(threshold !== undefined ? { options: { spinnerThresholdMs: () => threshold } } : {}),
      });
      await h.game.boot();
      await h.game.newMission();
      await h.play('breach-slow');
      await h.settle();
      await h.play('breach-snipe-die');
      await h.settle();
      // Resuming S1 fast-forwards from the nearest snapshot to its lead-in start (< 1 s).
      // (Showing the spinner yields a frame on the clock first, so settle while it deploys.)
      const deployed = h.play('resume-wait');
      await h.settle();
      await deployed;
      return h.ui.busyShown;
    };
    expect(await resumeWith()).toBe(0);
    expect(await resumeWith(0)).toBe(1);
  }, 30_000);
});
