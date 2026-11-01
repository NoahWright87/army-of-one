/**
 * (07-c) Spread and recoil ([D39]) and the Machine Gunner's mount ([D40]).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import {
  currentSpread,
  isMounted,
  mountBonus,
  mountTicksNeeded,
  spreadOf,
  trySoldierFire,
} from '../combat/guns';
import { getSoldier, getView, step } from '../sim';
import { playLife } from '../scenarios/lives';
import { hashState } from '../core/hash';
import type { CoverDef } from '../world/map';
import { arena, idle, ofKind, run, soldierAt, walk, world } from './helpers';

const T = DEFAULT_TUNING;
const fire = (aim = 0) => ({ ...idle(aim), fire: true });
const bags: CoverDef = {
  id: 'bags',
  rect: { x: 400, y: 400, w: 20, h: 200 },
  material: 'sandbags',
};

describe('spread and recoil ([D39])', () => {
  it('a standing rifleman tapping is exact; holding fire blooms within the recoil cap', () => {
    const w = world(arena());
    const id = soldierAt(w, { x: 100, y: 200 });
    // Taps: one shot, then wait long enough to recover.
    for (let i = 0; i < 3; i++) {
      const shots = ofKind(run(w, 1, { [id]: fire(0.3) }), 'shotFired');
      expect(shots[0]!.angle).toBe(0.3);
      run(w, 60, { [id]: idle(0.3) });
    }
    // Held fire: later shots spread, never beyond base + maxRecoil.
    const held = ofKind(run(w, 120, { [id]: fire(0.3) }), 'shotFired').map((e) => e.angle - 0.3);
    expect(held.some((d) => d !== 0)).toBe(true);
    expect(held.every((d) => Math.abs(d) <= T.rifle.baseSpread + T.rifle.maxRecoil + 1e-9)).toBe(
      true,
    );
    expect(getSoldier(w, id)!.recoil).toBeGreaterThan(0);
  });

  it('recoil recovers when fire is released', () => {
    const w = world(arena());
    const id = soldierAt(w, { x: 100, y: 200 });
    run(w, 60, { [id]: fire() });
    run(w, 120, { [id]: idle() });
    expect(getSoldier(w, id)!.recoil).toBe(0);
  });

  it('moving widens the spread', () => {
    const w = world(arena());
    const id = soldierAt(w, { x: 100, y: 200 });
    run(w, 5, { [id]: walk(1, 0) });
    const s = getSoldier(w, id)!;
    expect(currentSpread(w, s, 0)).toBeCloseTo(T.rifle.movingSpread);
  });

  it('the MG kicks harder than the rifle', () => {
    const spray = (roleId: 'rifleman' | 'gunner') => {
      const w = world(arena());
      const id = soldierAt(w, { x: 100, y: 200 }, { roleId });
      run(w, 30, { [id]: fire() });
      return currentSpread(w, getSoldier(w, id)!, 0);
    };
    expect(spray('gunner')).toBeGreaterThan(spray('rifleman') * 2);
  });

  it('is deterministic', () => {
    const angles = () => {
      const w = world(arena());
      const id = soldierAt(w, { x: 100, y: 200 }, { roleId: 'gunner' });
      return ofKind(run(w, 60, { [id]: { ...walk(1, 0.3, 0.1), fire: true } }), 'shotFired').map(
        (e) => e.angle,
      );
    };
    expect(angles()).toEqual(angles());
  });

  it('turrets stay exact at the default timings (recoil recovers between shots)', () => {
    expect(T.turret.recoveryPerSecond * (T.turret.windupSeconds + T.turret.cooldownSeconds)).toBe(
      T.turret.recoveryPerSecond * (T.turret.windupSeconds + T.turret.cooldownSeconds),
    );
    expect(
      T.turret.recoveryPerSecond * (T.turret.windupSeconds + T.turret.cooldownSeconds),
    ).toBeGreaterThan(T.turret.kick);
    expect(spreadOf(T.turret, 0, 0)).toBe(0);
  });

  it('the view gives the live soldier its spread, nobody else', () => {
    const w = world(arena());
    soldierAt(w, { x: 100, y: 200 });
    soldierAt(w, { x: 100, y: 600 }, { controllable: false });
    const v = getView(w);
    expect(v.soldiers[0]!.aimSpread).toBe(0);
    expect(v.soldiers[1]!.aimSpread).toBeUndefined();
  });
});

describe('MG mount ([D40])', () => {
  const N = mountTicksNeeded(T);

  it('standing still next to cover mounts after mountSeconds; the view shows progress', () => {
    const w = world(arena({ cover: [bags] }));
    const id = soldierAt(w, { x: 385, y: 500 }, { roleId: 'gunner' });
    run(w, Math.floor(N / 2), { [id]: idle() });
    const v = getView(w).soldiers[0]!;
    expect(v.mount).toBeGreaterThan(0.3);
    expect(v.mount).toBeLessThan(1);
    run(w, N, { [id]: idle() });
    expect(isMounted(w, getSoldier(w, id)!)).toBe(true);
    expect(getView(w).soldiers[0]!.mounted).toBe(true);
  });

  it('mounted and firing across the cover: much tighter spread; aiming away: no bonus', () => {
    const w = world(arena({ cover: [bags] }));
    const id = soldierAt(w, { x: 385, y: 500 }, { roleId: 'gunner' });
    run(w, N + 1, { [id]: idle() });
    const s = getSoldier(w, id)!;
    expect(mountBonus(w, s, 0)).toBe(true);
    expect(mountBonus(w, s, Math.PI)).toBe(false);
    const across = ofKind(run(w, 60, { [id]: fire(0) }), 'shotFired').map((e) => e.angle);
    const cap = T.mg.mounted.baseSpread + T.mg.mounted.maxRecoil + 1e-9;
    expect(across.every((a) => Math.abs(a) <= cap)).toBe(true);
    expect(currentSpread(w, s, 0)).toBeLessThan(currentSpread(w, s, Math.PI));
  });

  it('moving unmounts at once; no cover, no mount', () => {
    const w = world(arena({ cover: [bags] }));
    const id = soldierAt(w, { x: 385, y: 500 }, { roleId: 'gunner' });
    run(w, N + 1, { [id]: idle() });
    run(w, 1, { [id]: walk(0, 1) });
    expect(isMounted(w, getSoldier(w, id)!)).toBe(false);
    const open = world(arena());
    const id2 = soldierAt(open, { x: 200, y: 500 }, { roleId: 'gunner' });
    run(open, N + 1, { [id2]: idle() });
    expect(isMounted(open, getSoldier(open, id2)!)).toBe(false);
  });

  it('riflemen do not mount', () => {
    const w = world(arena({ cover: [bags] }));
    const id = soldierAt(w, { x: 385, y: 500 });
    run(w, N + 1, { [id]: idle() });
    expect(getSoldier(w, id)!.mountTicks).toBe(0);
  });

  it('an MG echo replays its recorded shots exactly (same damage, same world)', () => {
    const map = arena({
      cover: [bags],
      turrets: [{ id: 't1', position: { x: 600, y: 500 }, facing: Math.PI }],
    });
    const tuning = { ...T, turret: { ...T.turret, range: 1 } };
    const first = playLife({
      map,
      tuning,
      records: [],
      attempt: 1,
      live: { mode: 'new', soldierId: 'S1', spawnPointId: 'a', entryTick: 0, roleId: 'gunner' },
      steps: [
        { kind: 'moveTo', to: { x: 385, y: 500 } },
        { kind: 'wait', ticks: N + 5 },
        { kind: 'shoot', at: { x: 600, y: 500 }, until: (w) => w.state.tick > 200 },
      ],
    });
    expect(first.records[0]!.roleId).toBe('gunner');
    const hp = first.attempt.world.state.turrets[0]!.hp;
    expect(hp).toBeLessThan(T.turret.maxHp);
    const replay = playLife({
      map,
      tuning,
      records: first.records,
      attempt: 2,
      live: null,
      maxTick: first.attempt.tick,
    });
    expect(replay.attempt.world.state.turrets[0]!.hp).toBe(hp);
    expect(hashState(replay.attempt.world.state.turrets)).toBe(
      hashState(first.attempt.world.state.turrets),
    );
    void step;
    void trySoldierFire;
  });
});
