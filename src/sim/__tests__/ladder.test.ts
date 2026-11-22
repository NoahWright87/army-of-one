import { describe, expect, it } from 'vitest';
import { hashState } from '../core/hash';
import { getSoldier } from '../sim';
import { currentSolids } from '../world/blockers';
import { recordedLadderStep } from '../world/ladder';
import { arena, run, soldierAt, walk, world } from './helpers';

const bottom = { x: 350, y: 500 };
const top = { x: 450, y: 500 };
const ladder = { id: 'fortress-ladder', bottom, top };
const wall = { x: 380, y: 300, w: 40, h: 400 };
const raisedGround = [{ x: 420, y: 300, w: 200, h: 400 }];

describe('ladders', () => {
  it('crosses a solid wall only after sustained movement into the ladder', () => {
    const scenario = () => {
      const w = world(arena({ walls: [wall], raisedGround, ladders: [ladder] }));
      const id = soldierAt(w, bottom);
      const s = getSoldier(w, id)!;
      const east = { [id]: walk(1, 0) };
      run(w, 20, east);
      const speed = (w.tuning.soldier.speed / 60) * w.tuning.concealment.trench.climbSpeed;
      expect(s.x).toBeCloseTo(bottom.x + 20 * speed, 2);
      const before = s.x;
      run(w, 1, east);
      expect(s.x - before).toBeCloseTo(speed, 2);
      expect(s.ladderClimb?.progress).toBeGreaterThan(0);
      run(w, 1);
      expect(s.x).toBeCloseTo(before + speed, 2);
      run(w, 1, { [id]: walk(-1, 0) });
      expect(s.x).toBeCloseTo(before, 2);
      run(w, 150, east);
      expect(s.x).toBeGreaterThanOrEqual(top.x);
      run(w, 230, { [id]: walk(-1, 0) });
      expect(s.x).toBeLessThanOrEqual(bottom.x);
      return hashState(w.state);
    };
    expect(scenario()).toBe(scenario());
  });

  it('replays gradual ladder steps inside the wall and checks collision at the landing', () => {
    const w = world(arena({ walls: [wall], raisedGround, ladders: [ladder] }));
    const solids = currentSolids(w);
    const radius = w.tuning.soldier.wallRadius;
    const walkPerTick = w.tuning.soldier.speed / 60;
    const previous = { x: 400, y: 500 };
    const target = { x: 400.5, y: 500 };
    const replay = (from: typeof bottom, to: typeof top, actual = from, blockers = solids) =>
      recordedLadderStep([ladder], from, to, actual, walkPerTick, radius, blockers, w.tuning);
    expect(replay(previous, target)?.climb?.id).toBe(ladder.id);
    expect(replay(previous, target, { ...previous, y: 510 })).toBeUndefined();
    expect(replay(bottom, top)).toBeUndefined();
    expect(replay({ ...top, x: top.x - 0.5 }, top)).toEqual({});
    expect(
      replay({ ...top, x: top.x - 0.5 }, top, { ...top, x: top.x - 0.5 }, [
        ...solids,
        { x: 440, y: 490, w: 20, h: 20 },
      ]),
    ).toBeUndefined();
  });
});
