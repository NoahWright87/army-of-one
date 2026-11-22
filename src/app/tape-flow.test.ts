/**
 * (PHASE19) Through the real game flow (resolves, a rescue and a resume, enemies on): the tape is
 * what played, the replay ends in the win, and a fresh re-simulation agrees with the tape.
 */
import { describe, expect, it } from 'vitest';
import { MISSION_03 } from '../content/maps/mission-03';
import { DEFAULT_TUNING } from '../content/tuning';
import { firstDrift } from '../sim/tape/drift';
import { createHarness } from './test-harness';
import { TapePlayer } from './replay/tape-player';

describe('battle tape through the game flow', () => {
  it('records the story; the replay plays to the win; re-simulation agrees', async () => {
    const h = createHarness({ map: MISSION_03, tuning: DEFAULT_TUNING });
    await h.game.boot();
    await h.game.newMission();
    // Enemies are on, so the scripted story doesn't go to plan: play a mix, and take every
    // resume offered (resume lead-ins are where live and echo used to differ).
    const news = ['breach-slow', 'breach-rescue-hold', 'breach-naive', 'breach-snipe'];
    let resumes = 0;
    for (let i = 0; i < 12 && h.game.flow.kind === 'respawn'; i++) {
      const canResume = h.ui.current!.latest.options.some((o) => o.kind === 'resume');
      if (canResume) resumes++;
      await h.play(canResume ? 'resume-wait' : news[i % news.length]!);
      await h.settle();
    }
    const tape = h.game.tape;
    expect(tape.length).toBeGreaterThan(10);
    expect(tape.start).toBe(0);
    if (h.game.mission.completed) {
      const p = new TapePlayer(tape, MISSION_03, DEFAULT_TUNING, {
        endTick: h.game.mission.completed.tick + 120,
      });
      p.seek(p.input.endTick);
      expect(p.view().missionComplete).not.toBeNull();
    }
    expect(firstDrift(tape, MISSION_03, DEFAULT_TUNING, h.game.mission.soldiers)).toBeNull();
    expect(resumes).toBeGreaterThan(0);
  }, 120000);
});
