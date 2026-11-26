/**
 * (PHASE21, [Q71]) Prone is a little harder to see (not like a bush); braced and deployed don't
 * change visibility; a sprinting soldier is heard as well as seen.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { meters } from '../../content/units';
import { heatNow } from '../ai/senses';
import { createWorld, getSoldier } from '../sim';
import { soldierVisibility } from '../world/concealment';
import { arena, run, soldierAt, walk } from './helpers';

const T = DEFAULT_TUNING;

describe('prone visibility', () => {
  it('prone is a little harder to see: between standing and a bush; braced is the same as standing', () => {
    const w = createWorld(arena(), T);
    const id = soldierAt(w, { x: 500, y: 500 });
    const s = getSoldier(w, id)!;
    const standing = soldierVisibility(w, s);
    s.settled = 'prone';
    const prone = soldierVisibility(w, s);
    s.settled = 'braced';
    const braced = soldierVisibility(w, s);
    s.settled = 'deployed';
    const deployed = soldierVisibility(w, s);
    expect(prone).toBeLessThan(standing);
    expect(prone).toBeGreaterThan(T.concealment.bush.visibility);
    expect(braced).toBe(standing);
    expect(deployed).toBe(standing);
  });

  it('prone still shows when it fires or sprints (those add on top)', () => {
    const w = createWorld(arena(), T);
    const s = getSoldier(w, soldierAt(w, { x: 500, y: 500 }))!;
    s.settled = 'prone';
    const calm = soldierVisibility(w, s);
    s.sprinting = true;
    expect(soldierVisibility(w, s)).toBeGreaterThan(calm);
  });
});

describe('sprinting is audible', () => {
  const heatAfterRunning = (sprint: boolean) => {
    const w = createWorld(
      arena({
        width: 4000,
        height: 1000,
        squads: [
          { id: 'sq', members: [{ position: { x: 2000, y: 500 } }], order: { kind: 'guard' } },
        ],
        walls: [{ x: 1900, y: 0, w: 20, h: 1000 }],
      }),
      { ...T, ai: { ...T.ai, wakeRadius: 50, sleepRadius: 50 } },
    );
    const me = soldierAt(w, { x: 2000 - meters(5), y: 500 }, { minHp: 1 });
    // Run up and down beside the wall, 5 m from the sleeping enemy (who can't see through it).
    for (let i = 0; i < 10; i++) {
      run(w, 20, { [me]: { ...walk(0, i % 2 ? -1 : 1), sprint } });
    }
    return heatNow(w, getSoldier(w, 'E1')!.ai!.heat, w.state.tick);
  };
  it('running near a sleeping enemy raises its heat; walking there does not', () => {
    expect(heatAfterRunning(true)).toBeGreaterThan(0.05);
    expect(heatAfterRunning(false)).toBe(0);
  });
});
