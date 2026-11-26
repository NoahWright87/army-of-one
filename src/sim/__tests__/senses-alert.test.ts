/**
 * (PHASE21) The view shows how worked up an AI soldier is (1 uneasy, 2 contact, 3 alarm), so the
 * renderer can put a "?" or "!" over its head and the chatter can say what it noticed.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { meters } from '../../content/units';
import { stepAi } from '../ai/brain';
import type { SimEvent } from '../events';
import { createWorld, getSoldier, getView } from '../sim';
import { arena, idle, run, soldierAt } from './helpers';

const T = { ...DEFAULT_TUNING, ai: { ...DEFAULT_TUNING.ai, wakeRadius: 50, sleepRadius: 50 } };
const squad = {
  id: 'sq',
  members: [{ position: { x: 2000, y: 500 } }],
  order: { kind: 'guard' as const },
};
const alertOf = (w: ReturnType<typeof createWorld>) =>
  getView(w).soldiers.find((s) => s.id === 'E1')!.alert;

describe('alert in the view', () => {
  it('is absent when calm, uneasy after a shot nearby, alarm after a firefight', () => {
    const w = createWorld(
      arena({
        width: 4000,
        height: 1000,
        squads: [squad],
        walls: [{ x: 1800, y: 0, w: 20, h: 1000 }],
      }),
      T,
    );
    const x = 2000 - meters(8);
    const me = soldierAt(w, { x, y: 500 }, { minHp: 1 });
    expect(alertOf(w)).toBeUndefined();
    const shot = (): SimEvent => ({
      kind: 'shotFired',
      tick: w.state.tick,
      by: me,
      fromX: x,
      fromY: 500,
      angle: 0,
      hitX: x + 99,
      hitY: 500,
    });
    stepAi(w, [shot()]);
    expect(alertOf(w)).toBe(1);
    for (let i = 0; i < 30; i++) {
      stepAi(w, [shot()]);
      run(w, 6, { [me]: idle(0) });
    }
    expect(alertOf(w)).toBe(3);
    // And it cools: calm again some seconds after the shooting stops.
    run(w, 60 * 14, { [me]: idle(0) });
    expect(alertOf(w)).toBeUndefined();
  });

  it('is contact while it has a foe in view', () => {
    const w = createWorld(arena({ width: 4000, height: 1000, squads: [squad] }), {
      ...T,
      ai: { ...T.ai, wakeRadius: 900, sleepRadius: 1300 },
    });
    soldierAt(w, { x: 1750, y: 500 }, { minHp: 1 });
    run(w, 60, {});
    expect(getSoldier(w, 'E1')!.ai!.targetId).not.toBeNull();
    expect(alertOf(w)).toBeGreaterThanOrEqual(2);
  });
});
