/** (PHASE17) Numbers and regrouping ([D137], [D138]). */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { soldierMaxHp } from '../entities/soldier';
import { createWorld, getSoldier } from '../sim';
import type { SquadDef } from '../world/map';
import { arena, idle, run, soldierAt } from './helpers';

const T = DEFAULT_TUNING;
const guard = (id: string, members: SquadDef['members'], extra: Partial<SquadDef> = {}) =>
  ({ id, members, order: { kind: 'guard' }, ...extra }) as SquadDef;
const at = (x: number, y: number) => ({ position: { x, y }, facing: Math.PI });

describe('numbers ([D137])', () => {
  it('four against one rush in', () => {
    const w = createWorld(
      arena({ squads: [guard('sq', [at(820, 440), at(820, 480), at(820, 520), at(820, 560)])] }),
      T,
    );
    const me = soldierAt(w, { x: 260, y: 500 }, { minHp: 1 });
    let rushed = false;
    for (let i = 0; i < 180; i++) {
      run(w, 1, { [me]: idle(0) });
      if (getSoldier(w, 'E1')!.ai!.rushing) rushed = true;
    }
    expect(rushed).toBe(true);
    const xs = ['E1', 'E2', 'E3', 'E4'].map((id) => getSoldier(w, id)!.x);
    expect(Math.min(...xs)).toBeLessThan(700); // they came in
  });

  it('one against three flees', () => {
    const w = createWorld(arena({ squads: [guard('sq', [at(700, 500)])] }), T);
    const ours = [
      soldierAt(w, { x: 250, y: 460 }, { minHp: 1 }),
      soldierAt(w, { x: 250, y: 500 }, { minHp: 1 }),
      soldierAt(w, { x: 250, y: 540 }, { minHp: 1 }),
    ];
    let fled = false;
    for (let i = 0; i < 120 && !fled; i++) {
      run(w, 1, Object.fromEntries(ours.map((id) => [id, idle(0)])));
      fled = getSoldier(w, 'E1')!.ai!.behavior === 'retreat';
    }
    expect(fled).toBe(true);
  });
});

describe('regrouping ([D138])', () => {
  it('a wounded soldier healed back up joins a squad holding a point', () => {
    const w = createWorld(
      arena({
        capturePoints: [
          { id: 'cp', nameKey: 'capture.gallery.name', position: { x: 800, y: 800 } },
        ],
        squads: [
          guard('lost', [at(200, 200)]),
          guard('small', [at(400, 200)]),
          guard('holders', [at(800, 800), at(820, 800)], { capturePointId: 'cp' }),
        ],
      }),
      T,
    );
    const e = getSoldier(w, 'E1')!;
    e.ai!.wounded = true;
    e.hp = soldierMaxHp(T, 'rifleman', 'enemy');
    run(w, 61);
    expect(e.ai!.wounded).toBe(false);
    expect(e.ai!.squad).toBe('holders');
  });
});

describe('falling back (PHASE17)', () => {
  it('a hurt soldier retreats away from the shooter, not to a rally point in front of it', () => {
    const w = createWorld(
      arena({
        squads: [
          guard('sq', [at(400, 500)], {
            // The only rally point is between it and the shooter.
            rally: [{ x: 560, y: 500 }],
          }),
        ],
      }),
      T,
    );
    const me = soldierAt(w, { x: 760, y: 500 }, { minHp: 1 });
    const e = getSoldier(w, 'E1')!;
    e.hp = soldierMaxHp(T, 'rifleman', 'enemy') * 0.2; // badly hurt: it falls back
    let retreated = false;
    let minX = e.x;
    for (let i = 0; i < 90; i++) {
      run(w, 1, { [me]: idle(Math.PI) });
      if (e.ai!.behavior === 'retreat') retreated = true;
      minX = Math.min(minX, e.x);
    }
    expect(retreated).toBe(true);
    expect(e.x).toBeLessThan(400); // further from the shooter than it started
    expect(minX).toBeLessThan(400);
  });
});
