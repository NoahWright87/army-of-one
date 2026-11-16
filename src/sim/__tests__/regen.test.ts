/** (PHASE16) Slight health regeneration ([D133]). */
import { describe, expect, it } from 'vitest';
import { damageSoldier } from '../combat/damage';
import { getSoldier } from '../sim';
import { arena, run, soldierAt, world } from './helpers';

describe('regeneration ([D133])', () => {
  it('heals after a while unhurt, up to max, and waits again after a hit', () => {
    const w = world(arena(), { ai: { enabled: false } });
    const id = soldierAt(w, { x: 500, y: 500 });
    const s = getSoldier(w, id)!;
    damageSoldier(w, s, 40, undefined, 'test');
    expect(s.hp).toBe(60);
    run(w, 4 * 60); // under the 5 s wait
    expect(s.hp).toBe(60);
    run(w, 2 * 60); // ~1 s of healing at 2/s
    expect(s.hp).toBeGreaterThan(61);
    expect(s.hp).toBeLessThan(63);
    damageSoldier(w, s, 10, undefined, 'test');
    const after = s.hp;
    run(w, 4 * 60);
    expect(s.hp).toBe(after);
    run(w, 60 * 60);
    expect(s.hp).toBe(100);
  });

  it('is off with perSecond 0, and never heals enemies', () => {
    const off = world(arena(), { ai: { enabled: false }, soldier: { regen: { perSecond: 0 } } });
    const a = getSoldier(off, soldierAt(off, { x: 500, y: 500 }))!;
    damageSoldier(off, a, 40, undefined, 'test');
    run(off, 20 * 60);
    expect(a.hp).toBe(60);

    const w = world(arena(), { ai: { enabled: false } });
    const e = getSoldier(w, soldierAt(w, { x: 500, y: 500 }))!;
    e.team = 'enemy';
    damageSoldier(w, e, 40, undefined, 'test');
    run(w, 20 * 60);
    expect(e.hp).toBe(60);
  });
});
