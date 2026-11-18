/** (PHASE17) Bullets slow and weaken past their range, then land; near misses alert ([D146]). */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { fireGun } from '../combat/guns';
import { createWorld, getSoldier } from '../sim';
import type { SquadDef } from '../world/map';
import { arena, idle, run, soldierAt } from './helpers';

const T = { ...DEFAULT_TUNING, ai: { ...DEFAULT_TUNING.ai, enabled: false } };
const BIG = { width: 3000, height: 1000 };

describe('bullet drop ([D146])', () => {
  it('a bullet past its range still hits, for less, and slower', () => {
    const hitAt = (x: number) => {
      const w = createWorld(arena(BIG), T);
      const me = soldierAt(w, { x: 100, y: 500 });
      const them = soldierAt(w, { x, y: 500 });
      getSoldier(w, them)!.team = 'enemy';
      fireGun(w, me, getSoldier(w, me)!, 0, 'rifle', 'player');
      let ticks = 0;
      const t = getSoldier(w, them)!;
      while (t.hp === 100 && ticks < 200 && (w.state.bullets?.length ?? 0) > 0) {
        run(w, 1, { [them]: idle() });
        ticks++;
      }
      return { dmg: 100 - t.hp, ticks };
    };
    const near = hitAt(400); // within the rifle's 520
    const far = hitAt(800); // past it
    expect(near.dmg).toBe(T.rifle.damage);
    expect(far.dmg).toBeGreaterThan(0);
    expect(far.dmg).toBeLessThan(near.dmg);
  });

  it('lands spent somewhere past its range, with a landing event', () => {
    const w = createWorld(arena(BIG), T);
    const me = soldierAt(w, { x: 100, y: 500 });
    // A pistol: it lands well inside the arena's walls.
    fireGun(w, me, getSoldier(w, me)!, 0, 'pistol', 'player');
    let landed: { x: number } | null = null;
    for (let i = 0; i < 300 && !landed; i++) {
      const ev = run(w, 1).find((e) => e.kind === 'bulletStopped' && e.landed);
      if (ev && ev.kind === 'bulletStopped') landed = ev;
    }
    expect(landed).not.toBeNull();
    expect(landed!.x - 100).toBeGreaterThan(T.pistol.range);
    expect(landed!.x - 100).toBeLessThan(T.pistol.range * 3);
    expect(w.state.bullets).toHaveLength(0);
  });
});

describe('near misses and covering fire ([D146])', () => {
  const squad = (x: number): SquadDef => ({
    id: 'sq',
    members: [{ position: { x, y: 500 }, facing: Math.PI }],
    order: { kind: 'guard' },
  });

  it('a bullet whizzing past tells an enemy where it came from, and it fires back', () => {
    // The shooter is beyond the enemy's sight (600) but within its bullets' reach.
    const w = createWorld(arena({ ...BIG, squads: [squad(900)] }), DEFAULT_TUNING);
    const me = soldierAt(w, { x: 200, y: 500 }, { minHp: 1 });
    const e = getSoldier(w, 'E1')!;
    // A shot just past it (not at it).
    fireGun(w, me, getSoldier(w, me)!, Math.atan2(50, 700), 'rifle', 'player');
    let alerted = false;
    let firedBack = false;
    for (let i = 0; i < 150; i++) {
      const ev = run(w, 1, { [me]: idle() });
      if (e.ai!.lastSeen && Math.abs(e.ai!.lastSeen.x - 200) < 1) alerted = true;
      if (ev.some((x) => x.kind === 'shotFired' && x.by === 'E1')) firedBack = true;
    }
    expect(alerted).toBe(true);
    expect(firedBack).toBe(true);
  });
});
