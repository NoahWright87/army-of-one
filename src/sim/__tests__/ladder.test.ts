import { describe, expect, it } from 'vitest';
import { hashState } from '../core/hash';
import { getSoldier } from '../sim';
import { currentSolids } from '../world/blockers';
import { recordedLadderTransfer } from '../world/ladder';
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
      expect(s.x).toBe(bottom.x);
      expect(s.ladderClimb?.progress).toBeGreaterThan(0);
      run(w, 1);
      expect(s.ladderClimb).toBeUndefined();
      run(w, 100, east);
      expect(s.x).toBeGreaterThanOrEqual(top.x);
      run(w, 200, { [id]: walk(-1, 0) });
      expect(s.x).toBeLessThanOrEqual(bottom.x);
      return hashState(w.state);
    };
    expect(scenario()).toBe(scenario());
  });

  it('recognizes a recorded transfer only at its landing, and rejects obstructed exits', () => {
    const w = world(arena({ walls: [wall], raisedGround, ladders: [ladder] }));
    const solids = currentSolids(w);
    const radius = w.tuning.soldier.wallRadius;
    expect(recordedLadderTransfer([ladder], bottom, top, bottom, radius, solids)).toBe(true);
    expect(
      recordedLadderTransfer([ladder], bottom, top, { ...bottom, y: 510 }, radius, solids),
    ).toBe(false);
    expect(
      recordedLadderTransfer([ladder], bottom, top, bottom, radius, [
        ...solids,
        { x: 440, y: 490, w: 20, h: 20 },
      ]),
    ).toBe(false);
  });
});
