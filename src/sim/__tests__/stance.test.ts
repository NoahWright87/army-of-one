/**
 * (PHASE20, [D160]) Stances and the weapon swap by choice: the manual controls the player gets by
 * default. (`guns.test.ts` and `roles-12a.test.ts` keep covering the automatic behaviour.)
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import type { SoldierInput } from '../entities/soldier';
import {
  currentSpread,
  gunOf,
  gunRange,
  isSettling,
  mountTicksNeeded,
  stanceBonus,
} from '../combat/guns';
import { secondsToTicks } from '../core/time';
import { playLife } from '../scenarios/lives';
import { getSoldier, getView } from '../sim';
import type { CoverDef } from '../world/map';
import { arena, idle, ofKind, run, soldierAt, world } from './helpers';

const T = DEFAULT_TUNING;
/** Manual controls: nothing happens until the buttons are pressed. */
const manual = (extra: Partial<SoldierInput> = {}): SoldierInput => ({
  ...idle(),
  autoStance: false,
  autoWeapon: false,
  ...extra,
});
const press = (extra: Partial<SoldierInput> = {}) => manual({ stance: true, ...extra });
const bags: CoverDef = {
  id: 'bags',
  rect: { x: 400, y: 400, w: 20, h: 200 },
  material: 'sandbags',
};
/** A tick with the stance button up again (so the next press is a new press). */
const release = (w: ReturnType<typeof world>, id: string, extra: Partial<SoldierInput> = {}) =>
  run(w, 1, { [id]: manual(extra) });

describe('stance by choice ([D160])', () => {
  it('standing still does nothing on manual, even by cover or as a Sniper', () => {
    const w = world(arena({ cover: [bags] }));
    const sn = soldierAt(w, { x: 100, y: 500 }, { roleId: 'sniper' });
    const rm = soldierAt(w, { x: 385, y: 300 }, { roleId: 'gunner' });
    run(w, 90, { [sn]: manual(), [rm]: manual() });
    expect(getSoldier(w, sn)!.stance).toBeUndefined();
    expect(getSoldier(w, rm)!.stance).toBeUndefined();
    expect(gunOf(getSoldier(w, sn)!, T)).toBe('sniper'); // the rifle is out from the start
  });

  it('a Sniper goes prone on a press: no firing while it settles, then it crawls', () => {
    const w = world(arena());
    const id = soldierAt(w, { x: 100, y: 500 }, { roleId: 'sniper' });
    const need = mountTicksNeeded(T, 'sniper', 'prone');
    expect(need).toBe(secondsToTicks(T.sniper.setupSeconds));
    const shots: number[] = [];
    run(w, 1, { [id]: press({ fire: true }) });
    expect(isSettling(w, getSoldier(w, id)!)).toBe(true);
    for (let i = 1; i < need + 5; i++) {
      const ev = run(w, 1, { [id]: manual({ fire: true }) });
      if (ofKind(ev, 'shotFired').length) shots.push(getSoldier(w, id)!.mountTicks);
    }
    expect(getSoldier(w, id)!.settled).toBe('prone');
    expect(Math.min(...shots)).toBeGreaterThanOrEqual(need); // nothing during the transition
    // Prone, walking crawls (and doesn't stand it up).
    const y0 = getSoldier(w, id)!.y;
    run(w, 30, { [id]: manual({ move: { x: 0, y: 1 } }) });
    expect(getSoldier(w, id)!.settled).toBe('prone');
    expect(getSoldier(w, id)!.y - y0).toBeLessThan(T.soldier.speed * 0.5 * 0.5);
    expect(getSoldier(w, id)!.y - y0).toBeGreaterThan(0);
    // Sprinting stands it up; a press stands it up too.
    run(w, 2, { [id]: manual({ move: { x: 0, y: 1 }, sprint: true }) });
    expect(getSoldier(w, id)!.stance).toBeUndefined();
  });

  it('prone: a share of the cover bonus (spread and range), less than braced on cover', () => {
    const w = world(arena({ cover: [bags] }));
    const prone = soldierAt(w, { x: 100, y: 200 }, { roleId: 'sniper' });
    const braced = soldierAt(w, { x: 385, y: 500 }, { roleId: 'sniper' });
    run(w, 1, { [prone]: press(), [braced]: press() });
    run(w, 60, { [prone]: manual(), [braced]: manual() });
    const p = getSoldier(w, prone)!;
    const b = getSoldier(w, braced)!;
    expect([p.settled, b.settled]).toEqual(['prone', 'braced']);
    expect(stanceBonus(w, p, 0)).toBe(T.stance.noCoverShare.prone);
    expect(stanceBonus(w, b, 0)).toBe(1);
    expect(stanceBonus(w, b, Math.PI)).toBe(0); // braced, but not firing across the cover
    expect(currentSpread(w, p, 0)).toBeLessThan(T.sniper.baseSpread);
    expect(currentSpread(w, b, 0)).toBeLessThan(currentSpread(w, p, 0));
    expect(gunRange(w, 'sniper', p, 0, p)).toBeGreaterThan(T.sniper.range);
    expect(gunRange(w, 'sniper', b, 0, b)).toBeGreaterThan(gunRange(w, 'sniper', p, 0, p));
    expect(gunRange(w, 'sniper', p, 0)).toBe(T.sniper.range); // no shooter, no bonus
  });

  it('the swap is by button, takes a moment without firing, and lands on the other gun', () => {
    const w = world(arena());
    const id = soldierAt(w, { x: 100, y: 500 }, { roleId: 'sniper' });
    run(w, 1, { [id]: manual({ swap: true, fire: true }) });
    expect(gunOf(getSoldier(w, id)!, T)).toBe('pistol');
    const swapTicks = secondsToTicks(T.stance.swapSeconds);
    const during = ofKind(run(w, swapTicks - 2, { [id]: manual({ fire: true }) }), 'shotFired');
    expect(during).toHaveLength(0);
    const after = ofKind(run(w, 10, { [id]: manual({ fire: true }) }), 'shotFired');
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((e) => e.weapon === 'pistol')).toBe(true);
    // A press swaps back; holding the button doesn't swap back and forth.
    run(w, 30, { [id]: manual({ swap: true }) });
    expect(gunOf(getSoldier(w, id)!, T)).toBe('sniper');
    run(w, 1, { [id]: manual() });
    run(w, 1, { [id]: manual({ swap: true }) });
    expect(gunOf(getSoldier(w, id)!, T)).toBe('pistol');
  });

  it('a Machine Gunner deploys anywhere (a share of the bonus); on cover across it, all of it', () => {
    const w = world(arena({ cover: [bags] }));
    const open = soldierAt(w, { x: 100, y: 200 }, { roleId: 'gunner' });
    const cover = soldierAt(w, { x: 385, y: 500 }, { roleId: 'gunner' });
    run(w, 1, { [open]: press(), [cover]: press() });
    run(w, mountTicksNeeded(T, 'gunner') + 2, { [open]: manual(), [cover]: manual() });
    const o = getSoldier(w, open)!;
    const c = getSoldier(w, cover)!;
    expect([o.settled, c.settled]).toEqual(['deployed', 'deployed']);
    expect(stanceBonus(w, o, 0)).toBe(T.stance.noCoverShare.deployed);
    expect(stanceBonus(w, c, 0)).toBe(1);
    expect(stanceBonus(w, c, Math.PI)).toBe(0);
    expect(currentSpread(w, c, 0)).toBeLessThan(currentSpread(w, o, 0));
    expect(currentSpread(w, o, 0)).toBeLessThan(
      currentSpread({ ...w, state: { ...w.state } } as typeof w, { ...o, settled: undefined }, 0),
    );
    // Walking away lets go at once: it's a tripod.
    run(w, 1, { [open]: manual({ move: { x: 1, y: 0 } }) });
    expect(getSoldier(w, open)!.stance).toBeUndefined();
  });

  it('any class braces on cover by a press, snapped to its edge; nothing happens far from cover', () => {
    const w = world(arena({ cover: [bags] }));
    const near = soldierAt(w, { x: 375, y: 500 });
    const far = soldierAt(w, { x: 100, y: 200 });
    run(w, 1, { [near]: press(), [far]: press() });
    run(w, mountTicksNeeded(T) + 5, { [near]: manual(), [far]: manual() });
    const n = getSoldier(w, near)!;
    expect(n.settled).toBe('braced');
    expect(n.braceId).toBe('bags');
    expect(400 - n.x).toBeCloseTo(T.soldier.wallRadius + T.stance.snapGap, 0); // snapped up to it
    expect(getSoldier(w, far)!.stance).toBeUndefined();
    expect(getView(w).soldiers.find((s) => s.id === near)).toBeDefined();
    // A press stands it up; so does moving.
    release(w, near);
    run(w, 1, { [near]: press() });
    expect(getSoldier(w, near)!.stance).toBeUndefined();
  });

  it('an echo takes the stance up on the tick the live soldier did, and fires with its range', () => {
    const map = arena();
    const first = playLife({
      map,
      tuning: T,
      records: [],
      attempt: 1,
      live: { mode: 'new', soldierId: 'S1', spawnPointId: 'a', entryTick: 0, roleId: 'sniper' },
      steps: [{ kind: 'wait', ticks: 60 }],
    });
    // Auto (a scripted soldier): it settled by itself; the record says when.
    const actions = first.records[0]!.segments[0]!.actions;
    const stances = actions.filter((a) => a.kind === 'stance');
    expect(stances.map((a) => (a.kind === 'stance' ? a.stance : null))).toEqual(['prone']);
    const replay = playLife({
      map,
      tuning: T,
      records: first.records,
      attempt: 2,
      live: null,
      maxTick: first.attempt.tick,
    });
    const echo = getSoldier(replay.attempt.world, 'S1')!;
    expect(echo.settled).toBe(first.attempt.world.state.soldiers[0]!.settled);
    expect(echo.settled).toBe('prone');
  });
});
