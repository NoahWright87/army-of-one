/** (PHASE17) Bullets fly ([D145]). */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { fireGun } from '../combat/guns';
import { createWorld, getSoldier, getView } from '../sim';
import { launchRocket } from '../entities/rocket';
import { arena, idle, run, soldierAt } from './helpers';

const T = { ...DEFAULT_TUNING, ai: { ...DEFAULT_TUNING.ai, enabled: false } };

function setup() {
  const w = createWorld(arena(), T);
  const shooter = soldierAt(w, { x: 100, y: 500 });
  const target = soldierAt(w, { x: 500, y: 500 });
  getSoldier(w, target)!.team = 'enemy';
  return { w, shooter, target };
}

describe('bullets ([D145])', () => {
  it('exposes owner and allegiance for rendering without changing the shot', () => {
    const { w, shooter, target } = setup();
    fireGun(w, shooter, getSoldier(w, shooter)!, 0, 'rifle', 'player');
    fireGun(w, target, getSoldier(w, target)!, Math.PI, 'pistol', 'enemy');
    launchRocket(w, target, { x: 500, y: 500 }, Math.PI, 'enemy', 'shell');
    const before = structuredClone(w.state);
    expect(getView(w).bullets).toEqual([
      expect.objectContaining({ by: shooter, hostile: false, weapon: 'rifle' }),
      expect.objectContaining({ by: target, hostile: true, weapon: 'pistol' }),
    ]);
    expect(getView(w).rockets).toEqual([
      expect.objectContaining({ by: target, hostile: true, shell: true }),
    ]);
    expect(w.state).toEqual(before);
  });
  it('take time to arrive, then hit', () => {
    const { w, shooter, target } = setup();
    fireGun(w, shooter, getSoldier(w, shooter)!, 0, 'rifle', 'player');
    expect(w.state.bullets).toHaveLength(1);
    const t = getSoldier(w, target)!;
    const full = t.hp;
    const ticks = Math.ceil(((500 - 100) / T.bullets.speed.rifle) * 60);
    run(w, ticks - 3, { [target]: idle() });
    expect(t.hp).toBe(full); // still on its way
    run(w, 6, { [target]: idle() });
    expect(t.hp).toBeLessThan(full);
    expect(w.state.bullets).toHaveLength(0);
  });

  it('can be dodged by stepping out of the line', () => {
    const { w, shooter, target } = setup();
    fireGun(w, shooter, getSoldier(w, shooter)!, 0, 'rifle', 'player');
    const t = getSoldier(w, target)!;
    const full = t.hp;
    run(w, 30, { [target]: { ...idle(), move: { x: 0, y: 1 }, sprint: true } });
    expect(t.hp).toBe(full);
  });

  it('are deterministic', () => {
    const play = () => {
      const { w, shooter, target } = setup();
      for (let i = 0; i < 40; i++) {
        if (i % 5 === 0) fireGun(w, shooter, getSoldier(w, shooter)!, 0.01 * i, 'rifle', 'player');
        run(w, 1, { [target]: { ...idle(), move: { x: 0, y: i < 20 ? 1 : -1 } } });
      }
      return getSoldier(w, target)!.hp;
    };
    expect(play()).toBe(play());
  });
});
