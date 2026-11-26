/**
 * (PHASE21, step 1) Being shot at isn't instant, and isn't exact: a hit or a whizzing bullet is
 * reacted to after a short delay, a whizz only gives a direction (the guessed spot is off), and
 * how close counts as a near miss is tuning in metres.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { meters, toMeters, UNITS_PER_METER } from '../../content/units';
import { fireGun } from '../combat/guns';
import { stepAi } from '../ai/brain';
import { secondsToTicks } from '../core/time';
import type { SimEvent } from '../events';
import { createWorld, getSoldier } from '../sim';
import type { SquadDef } from '../world/map';
import { arena, idle, ofKind, run, soldierAt } from './helpers';

const T = DEFAULT_TUNING;
const squad = (x: number): SquadDef => ({
  id: 'sq',
  members: [{ position: { x, y: 500 }, facing: Math.PI }],
  order: { kind: 'guard' },
});
const BIG = { width: 3000, height: 1000 };

/** A dormant enemy at (900, 500) and one of ours far away, so nothing is seen. */
function setup(tuning = T) {
  const w = createWorld(arena({ ...BIG, squads: [squad(900)] }), tuning);
  const me = soldierAt(w, { x: 100, y: 500 }, { minHp: 1 });
  return { w, me, e: getSoldier(w, 'E1')! };
}

describe('units', () => {
  it('converts between metres and world units', () => {
    expect(meters(2)).toBe(2 * UNITS_PER_METER);
    expect(toMeters(meters(3.5))).toBeCloseTo(3.5);
  });
});

describe('reaction delay', () => {
  it('a hit is reacted to in a few ticks, not instantly', () => {
    const { w, me, e } = setup();
    const e1: SimEvent = { kind: 'damaged', tick: 0, target: 'E1', amount: 1, by: me };
    stepAi(w, [e1]);
    expect(e.ai!.awake).toBe(false);
    expect(e.ai!.hurtTick).toBeLessThan(0);
    run(w, secondsToTicks(T.ai.hurtReactSeconds) + 1, { [me]: idle() });
    expect(e.ai!.awake).toBe(true);
    // A hit tells it exactly where the shooter stood.
    expect(e.ai!.lastSeen).toMatchObject({ x: 100, y: 500 });
  });

  it('a whizzing bullet takes longer to react to than a hit', () => {
    const { w, me, e } = setup();
    stepAi(w, [{ kind: 'nearMiss', tick: 0, target: 'E1', by: me, fromX: 100, fromY: 500 }]);
    run(w, secondsToTicks(T.ai.hurtReactSeconds) + 1, { [me]: idle() });
    expect(e.ai!.awake).toBe(false);
    run(w, secondsToTicks(T.ai.nearMissReactSeconds), { [me]: idle() });
    expect(e.ai!.awake).toBe(true);
  });

  it('a whizz only gives a direction: the guessed spot is off, never past the error', () => {
    const err = T.ai.nearMissBearingError;
    let offAtLeastOnce = false;
    for (let seed = 0; seed < 12; seed++) {
      const { w, me, e } = setup();
      run(w, seed, { [me]: idle() }); // a different tick (so a different roll) each time
      const { x: ex, y: ey } = e; // where it stood when the bullet passed
      stepAi(w, [
        { kind: 'nearMiss', tick: w.state.tick, target: 'E1', by: me, fromX: 100, fromY: 500 },
      ]);
      run(w, secondsToTicks(T.ai.nearMissReactSeconds) + 1, { [me]: idle() });
      const g = e.ai!.lastSeen!;
      const bearing = Math.atan2(g.y - ey, g.x - ex);
      const truth = Math.atan2(500 - ey, 100 - ex);
      const diff = Math.abs(((bearing - truth + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      expect(diff).toBeLessThanOrEqual(err + 1e-6);
      expect(Math.hypot(g.x - ex, g.y - ey)).toBeCloseTo(Math.hypot(100 - ex, 500 - ey), 3); // same distance away
      if (diff > 1e-3) offAtLeastOnce = true;
    }
    expect(offAtLeastOnce).toBe(true);
  });
});

describe('near miss radius is tuning', () => {
  const passed = (radius: number): boolean => {
    const tuning = { ...T, ai: { ...T.ai, nearMissRadius: radius } };
    const w = createWorld(arena({ ...BIG, squads: [squad(500)] }), tuning);
    const me = soldierAt(w, { x: 200, y: 500 }, { minHp: 1 });
    // Passes the enemy about 30 units to the side (the gun's spread is only a few units here).
    fireGun(w, me, getSoldier(w, me)!, Math.atan2(30, 300), 'rifle', 'player');
    let seen = false;
    for (let i = 0; i < 40; i++)
      seen ||= ofKind(run(w, 1, { [me]: idle() }), 'nearMiss').length > 0;
    return seen;
  };
  it('a wide radius counts it; a tight one does not', () => {
    expect(passed(meters(2.5))).toBe(true);
    expect(passed(meters(0.2))).toBe(false);
  });
  it('is under two metres by default', () => {
    expect(toMeters(T.ai.nearMissRadius)).toBeLessThan(2);
  });
});
