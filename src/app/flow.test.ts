import { describe, expect, it } from 'vitest';
import type { SpawnOption } from '../contracts/mission';
import { parseAutoplay, pickOption } from './autoplay-lives';
import {
  FlowError,
  inBattle,
  INITIAL_FLOW,
  transition,
  type FlowEvent,
  type FlowState,
} from './flow';

const road: SpawnOption = { kind: 'new', spawnPointId: 'road', entryTick: 0 };
const resume: SpawnOption = {
  kind: 'resume',
  soldierId: 'S1',
  resumeTick: 600,
  leadInFromTick: 300,
};

function run(events: FlowEvent[], from: FlowState = INITIAL_FLOW): FlowState {
  return events.reduce(transition, from);
}

describe('game flow state machine', () => {
  it('boot → title → respawn → preparing → leadIn → live → death beat → respawn', () => {
    const states: string[] = [];
    let s = INITIAL_FLOW;
    for (const e of [
      { type: 'loaded', hasSave: false },
      { type: 'newMission' },
      { type: 'deploy', option: road },
      { type: 'prepared' },
      { type: 'controlStarted' },
      { type: 'attemptEnded', reason: 'death' },
      { type: 'beatDone' },
    ] as FlowEvent[]) {
      s = transition(s, e);
      states.push(s.kind);
    }
    expect(states).toEqual([
      'title',
      'respawn',
      'preparing',
      'leadIn',
      'live',
      'deathBeat',
      'respawn',
    ]);
    expect(s).toEqual({ kind: 'respawn', notice: null });
  });

  it('mission complete goes through the beat to the complete screen; play again restarts', () => {
    const s = run([
      { type: 'loaded', hasSave: false },
      { type: 'newMission' },
      { type: 'deploy', option: road },
      { type: 'prepared' },
      { type: 'controlStarted' },
      { type: 'attemptEnded', reason: 'missionComplete' },
    ]);
    expect(s).toEqual({ kind: 'deathBeat', next: 'complete' });
    const done = transition(s, { type: 'beatDone' });
    expect(done).toEqual({ kind: 'complete' });
    expect(transition(done, { type: 'playAgain' })).toEqual({ kind: 'respawn', notice: null });
  });

  it('history shifted from the fast-forward or the lead-in returns with a notice, no beat', () => {
    const preparing = run([
      { type: 'loaded', hasSave: true },
      { type: 'continue', completed: false },
      { type: 'deploy', option: resume },
    ]);
    const shifted = { type: 'attemptEnded', reason: 'historyShifted' } as const;
    expect(transition(preparing, shifted)).toEqual({ kind: 'respawn', notice: 'historyShifted' });
    const leadIn = transition(preparing, { type: 'prepared' });
    expect(transition(leadIn, shifted)).toEqual({ kind: 'respawn', notice: 'historyShifted' });
  });

  it('reload recovery skips the title and the respawn screen', () => {
    const s = run([{ type: 'recover', option: resume }]);
    expect(s).toEqual({ kind: 'preparing', option: resume, recovery: true });
    expect(transition(s, { type: 'prepared' })).toEqual({ kind: 'leadIn', option: resume });
  });

  it('continue: a completed mission opens the complete screen', () => {
    expect(
      run([
        { type: 'loaded', hasSave: true },
        { type: 'continue', completed: true },
      ]),
    ).toEqual({ kind: 'complete' });
  });

  it('rejects events that make no sense', () => {
    expect(() => transition(INITIAL_FLOW, { type: 'deploy', option: road })).toThrow(FlowError);
    const title = run([{ type: 'loaded', hasSave: false }]);
    expect(() => transition(title, { type: 'continue', completed: false })).toThrow(FlowError);
    const live = run(
      [
        { type: 'newMission' },
        { type: 'deploy', option: road },
        { type: 'prepared' },
        { type: 'controlStarted' },
      ],
      title,
    );
    expect(() => transition(live, { type: 'deploy', option: road })).toThrow(FlowError);
    expect(() => transition(live, { type: 'beatDone' })).toThrow(FlowError);
  });

  it('reset (dev / new mission) works from anywhere', () => {
    const live = run([
      { type: 'loaded', hasSave: false },
      { type: 'newMission' },
      { type: 'deploy', option: road },
      { type: 'prepared' },
    ]);
    expect(transition(live, { type: 'reset' })).toEqual({ kind: 'respawn', notice: null });
  });

  it('inBattle covers lead-in, live and the death beat', () => {
    expect(inBattle({ kind: 'leadIn', option: road })).toBe(true);
    expect(inBattle({ kind: 'deathBeat', next: 'respawn' })).toBe(true);
    expect(inBattle({ kind: 'respawn', notice: null })).toBe(false);
  });
});

describe('autoplay specs', () => {
  it('parses names and repeats', () => {
    const { lives, unknown } = parseAutoplay('road-slow, road-naive*3,nope');
    expect(lives.map((l) => l.name)).toEqual([
      'road-slow',
      'road-naive',
      'road-naive',
      'road-naive',
    ]);
    expect(unknown).toEqual(['nope']);
  });

  it('picks options', () => {
    const [slow] = parseAutoplay('road-slow').lives;
    const [res] = parseAutoplay('resume').lives;
    expect(pickOption(slow!, [road, resume])).toBe(road);
    expect(pickOption(res!, [road, resume])).toBe(resume);
    expect(pickOption(res!, [road])).toBeNull();
  });
});
