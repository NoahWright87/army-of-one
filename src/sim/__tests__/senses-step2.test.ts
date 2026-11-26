/**
 * (PHASE21, step 2) Hearing and heat: gunfire, blasts and cries raise the heat of soldiers in
 * earshot (more when louder and closer), heat fades, and enough of it wakes a sleeper, sends an
 * idle soldier to look, or alarms a squad. A lone far-off shot does nothing; a firefight does.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { meters } from '../../content/units';
import { stepAi } from '../ai/brain';
import { heatNow, soundsOf } from '../ai/senses';
import type { SimEvent } from '../events';
import { createWorld, getSoldier } from '../sim';
import type { SquadDef } from '../world/map';
import { arena, idle, run, soldierAt } from './helpers';

// Proximity waking is off (tiny radii) so only what's heard counts.
const T = {
  ...DEFAULT_TUNING,
  ai: { ...DEFAULT_TUNING.ai, wakeRadius: 50, sleepRadius: 50 },
};
const BIG = { width: 4000, height: 1000 };
const squad = (xs: number[]): SquadDef => ({
  id: 'sq',
  members: xs.map((x) => ({ position: { x, y: 500 }, facing: Math.PI })),
  order: { kind: 'guard' },
});

/** A sleeping enemy squad at the given xs, and one of ours ("S1") `gap` metres to the left of E1. */
function setup(gap: number, xs = [2000], tuning = T) {
  // A wall between them: they hear each other but can't see each other.
  const w = createWorld(
    arena({ ...BIG, squads: [squad(xs)], walls: [{ x: xs[0]! - 200, y: 0, w: 20, h: 1000 }] }),
    tuning,
  );
  const x = xs[0]! - meters(gap);
  const me = soldierAt(w, { x, y: 500 }, { minHp: 1 });
  return { w, me, x, e: getSoldier(w, 'E1')! };
}

const shot = (
  w: ReturnType<typeof createWorld>,
  by: string,
  x: number,
  weapon?: 'pistol',
): SimEvent => ({
  kind: 'shotFired',
  tick: w.state.tick,
  by,
  fromX: x,
  fromY: 500,
  angle: 0,
  hitX: x + 100,
  hitY: 500,
  ...(weapon ? { weapon } : {}),
});

/** `n` shots, one every `every` ticks, heard by the AI. */
function fire(w: ReturnType<typeof createWorld>, by: string, x: number, n: number, every = 10) {
  for (let i = 0; i < n; i++) {
    stepAi(w, [shot(w, by, x)]);
    run(w, every, { [by]: idle(0) });
  }
}

describe('hearing and heat', () => {
  it('a lone shot from far off does not wake anyone', () => {
    const { w, me, x, e } = setup(30);
    fire(w, me, x, 1);
    run(w, 30, { [me]: idle(0) });
    expect(e.ai!.awake).toBe(false);
  });

  it('a firefight within earshot does, after a beat, not on the first shot', () => {
    const { w, me, x, e } = setup(15);
    stepAi(w, [shot(w, me, x)]);
    expect(e.ai!.awake).toBe(false);
    fire(w, me, x, 12, 8);
    run(w, 30, { [me]: idle(0) });
    expect(e.ai!.awake).toBe(true);
  });

  it('nothing out of earshot ever does', () => {
    const { w, me, x, e } = setup(DEFAULT_TUNING.senses.sounds.rifle.audibleMeters + 5);
    fire(w, me, x, 60, 4);
    expect(e.ai!.awake).toBe(false);
    expect(heatNow(w, e.ai!.heat, w.state.tick)).toBe(0);
  });

  it('heat fades: it cools off and the soldier goes back to its post', () => {
    const { w, me, x, e } = setup(15);
    fire(w, me, x, 14, 8);
    run(w, 30, { [me]: idle(0) });
    expect(e.ai!.awake).toBe(true);
    const hot = heatNow(w, e.ai!.heat, w.state.tick);
    expect(hot).toBeGreaterThan(DEFAULT_TUNING.senses.heat.wake);
    run(w, 60 * 12, { [me]: idle(0) });
    expect(heatNow(w, e.ai!.heat, w.state.tick)).toBe(0);
    expect(e.ai!.awake).toBe(false);
  });

  it('closer and louder count for more (a pistol is quieter than a rifle)', () => {
    const heatAfter = (gap: number, weapon?: 'pistol') => {
      const { w, me, x, e } = setup(gap);
      stepAi(w, [shot(w, me, x, weapon)]);
      return heatNow(w, e.ai!.heat, w.state.tick);
    };
    expect(heatAfter(8)).toBeGreaterThan(heatAfter(20));
    expect(heatAfter(10)).toBeGreaterThan(heatAfter(10, 'pistol'));
  });

  it("an enemy's own side's gunfire is not suspicious", () => {
    const { w, e } = setup(15, [2000, 2100]);
    stepAi(w, [shot(w, 'E2', 2100)]);
    expect(heatNow(w, e.ai!.heat, w.state.tick)).toBe(0);
  });

  it('a friend crying out is heard by its side (not by ours)', () => {
    const { w, me, e } = setup(15, [2000, 2100]);
    const hurt: SimEvent = { kind: 'damaged', tick: 0, target: 'E2', amount: 5, by: me };
    stepAi(w, [hurt]);
    expect(heatNow(w, e.ai!.heat, w.state.tick)).toBeGreaterThan(0);
    expect(getSoldier(w, me)!.ai).toBeUndefined();
  });

  it('a hot soldier with nothing in view goes to where it heard it, and only a guess', () => {
    const { w, me, x, e } = setup(15);
    fire(w, me, x, 14, 8);
    run(w, 30, { [me]: idle(0) });
    const seen = e.ai!.lastSeen;
    expect(seen).not.toBeNull();
    // Somewhere out toward the shooter, not exactly at it, and it hasn't "seen" anyone.
    expect(seen!.x).toBeLessThan(e.x);
    expect(e.ai!.targetId).toBeNull();
  });

  it('what it hears is a direction: the guess gets worse the farther away', () => {
    const meanError = (gap: number) => {
      let sum = 0;
      const n = 20;
      for (let i = 0; i < n; i++) {
        const { w, me, x, e } = setup(gap);
        run(w, i * 7, { [me]: idle(0) }); // a different roll each time
        stepAi(w, [shot(w, me, x)]);
        const spot = e.ai!.heat!.spot!;
        sum += Math.hypot(spot.x - x, spot.y - 500);
      }
      return sum / n;
    };
    expect(meanError(32)).toBeGreaterThan(meanError(8) * 2);
  });

  it('every sound of the events is accounted for', () => {
    const { w, me } = setup(15);
    const sounds = soundsOf(w, [
      shot(w, me, 100),
      { kind: 'mineDetonated', tick: 0, id: 'm', x: 5, y: 5, radius: 10 },
      { kind: 'bulletStopped', tick: 0, by: me, x: 1, y: 1 },
    ]);
    expect(sounds.map((s) => s.kind)).toEqual(['rifle', 'explosion', 'impact']);
  });

  it('seeing opposition raises heat too, with nobody making a sound', () => {
    // Awake, in the open, and one of ours right there: no wall.
    const w = createWorld(arena({ ...BIG, squads: [squad([2000])] }), {
      ...T,
      ai: { ...T.ai, wakeRadius: 900, sleepRadius: 1300 },
    });
    const me = soldierAt(w, { x: 1700, y: 500 }, { minHp: 1 });
    run(w, 90, { [me]: idle(0) });
    expect(heatNow(w, getSoldier(w, 'E1')!.ai!.heat, w.state.tick)).toBeGreaterThan(0.3);
  });
});
