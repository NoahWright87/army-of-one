/** (PHASE12-b) Breakable cover ([Q40]) through the unified armor ([D70]). */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { castRay } from '../combat/shots';
import { damageCover, standingCover } from '../world/cover';
import { currentSolids } from '../world/blockers';
import { getSoldier } from '../sim';
import { arena, idle, ofKind, run, soldierAt, walk, world } from './helpers';

const T = DEFAULT_TUNING;
const crate = { id: 'crate', rect: { x: 400, y: 450, w: 40, h: 100 }, material: 'crate' as const };

describe('breakable cover', () => {
  it('armor makes small arms barely scratch it; pierce matters', () => {
    const w = world(arena({ cover: [crate] }));
    damageCover(w, 'crate', 100, 'rifle', 'S1');
    expect(w.state.coverHp!.crate).toBeCloseTo(T.cover.materials.crate.hp - 15);
    damageCover(w, 'crate', 100, 'rocket', 'S1');
    expect(w.state.coverHp!.crate).toBeCloseTo(T.cover.materials.crate.hp - 15 - 65);
  });

  it('a destroyed piece stops blocking shots and movement', () => {
    const w = world(arena({ cover: [crate] }), { cover: { materials: { crate: { bullet: 1 } } } });
    const before = castRay(w, { x: 300, y: 500 }, 0, 400, 'player', { coverKey: 'k' });
    expect(before.target).toEqual({ kind: 'cover', id: 'crate' });
    const solids = currentSolids(w).length;
    const ev = (() => {
      damageCover(w, 'crate', 1e6, 'rocket', 'S1');
      return [...w.state.events, ...w.state.queuedEvents];
    })();
    expect(ofKind(ev, 'coverDestroyed')).toHaveLength(1);
    expect(standingCover(w)).toHaveLength(0);
    expect(castRay(w, { x: 300, y: 500 }, 0, 400, 'player', { coverKey: 'k' }).target).toBeNull();
    expect(currentSolids(w).length).toBe(solids - 1);
    // Walk straight through where it stood.
    const id = soldierAt(w, { x: 350, y: 500 });
    run(w, 60, { [id]: walk(1, 0) });
    expect(getSoldier(w, id)!.x).toBeGreaterThan(450);
  });

  it('unbreakable materials ignore damage', () => {
    const w = world(arena({ cover: [{ ...crate, material: 'bunkerWindow' }] }));
    damageCover(w, 'crate', 1e9, 'rocket', 'S1');
    expect(standingCover(w)).toHaveLength(1);
  });

  it('rockets break cover over time, the same way every run', () => {
    const play = () => {
      const w = world(arena({ cover: [crate] }));
      const id = soldierAt(w, { x: 150, y: 500 }, { roleId: 'bazooka' });
      run(w, 60 * 20, { [id]: { ...idle(0), fire: true } });
      return [w.state.coverDestroyed ?? [], w.state.coverHp?.crate];
    };
    const a = play();
    expect(a[0]).toEqual(['crate']);
    expect(play()).toEqual(a);
  });
});
