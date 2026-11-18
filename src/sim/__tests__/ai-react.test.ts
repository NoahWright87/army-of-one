/**
 * (PHASE13) Reacting to fire: hits tell soldiers where the shot came from; wounded soldiers fall
 * back once and don't yo-yo; outranged ones charge or fall back by type; squadmates protect;
 * a torn-up squad joins a healthy one.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { stepAi } from '../ai/brain';
import { soldierMaxHp } from '../entities/soldier';
import { createWorld, getSoldier } from '../sim';
import type { SimEvent } from '../events';
import type { MapDef, SquadDef } from '../world/map';
import { arena, idle, run, soldierAt } from './helpers';

const T = DEFAULT_TUNING;
type W = ReturnType<typeof createWorld>;

const guard = (id: string, members: SquadDef['members'], extra: Partial<SquadDef> = {}) =>
  ({ id, members, order: { kind: 'guard' }, ...extra }) as SquadDef;

/** One of ours ("S1") hits `target` this tick, as far as the AI is concerned. */
function hit(w: W, target: string, by = 'S1'): void {
  const e: SimEvent = { kind: 'damaged', tick: w.state.tick, target, amount: 1, by };
  stepAi(w, [e]);
}

describe('reacting to being shot', () => {
  it('a hit tells it (and its squad) where the shot came from, and wakes them', () => {
    const map: MapDef = arena({
      squads: [guard('sq', [{ position: { x: 900, y: 500 } }, { position: { x: 900, y: 600 } }])],
    });
    const w = createWorld(map, { ...T, ai: { ...T.ai, wakeRadius: 100 } });
    soldierAt(w, { x: 100, y: 500 });
    run(w, 10);
    expect(getSoldier(w, 'E1')!.ai!.awake).toBe(false);
    hit(w, 'E1');
    const e1 = getSoldier(w, 'E1')!.ai!;
    expect(e1.awake).toBe(true);
    expect(e1.lastSeen).toMatchObject({ x: 100, y: 500 });
    expect(getSoldier(w, 'E2')!.ai!.lastSeen).toMatchObject({ x: 100, y: 500 });
    expect(getSoldier(w, 'E2')!.ai!.protectAlly).toBe('E1');
  });

  it('a shotgunner shot from far out of its range charges in; a grenadier falls back', () => {
    const outcome = (role: 'shotgun' | 'grenadier') => {
      const w = createWorld(
        arena({ squads: [guard('sq', [{ role, position: { x: 800, y: 500 } }])] }),
        T,
      );
      soldierAt(w, { x: 120, y: 500 });
      for (let i = 0; i < 20; i++) {
        hit(w, 'E1');
        run(w, 3, { S1: idle(0) });
      }
      return getSoldier(w, 'E1')!;
    };
    const shotgun = outcome('shotgun');
    expect(shotgun.ai!.behavior).toBe('approach');
    // (PHASE17) It sprints in fast enough to be in range by now ([D144]).
    expect(shotgun.x).toBeLessThan(600);
    const grenadier = outcome('grenadier');
    expect(grenadier.ai!.behavior).toBe('retreat');
  });

  it("shot from behind cover it can't see past, it steps up to the cover and fires back", () => {
    const map: MapDef = arena({
      // Sandbags between them; the enemy stands a little way back, so it can't see over.
      cover: [{ id: 'bags', rect: { x: 600, y: 440, w: 24, h: 120 }, material: 'sandbags' }],
      squads: [guard('sq', [{ position: { x: 700, y: 500 }, facing: Math.PI }])],
    });
    const w = createWorld(map, T);
    soldierAt(w, { x: 300, y: 500 });
    let fired = false;
    // (PHASE17) It fires back at once now (covering fire) while it steps up.
    for (let i = 0; i < 90; i++) {
      if (i % 20 === 0) hit(w, 'E1');
      const events = run(w, 2, { S1: idle(0) });
      fired ||= events.some((e) => e.kind === 'shotFired' && e.by === 'E1');
    }
    const e = getSoldier(w, 'E1')!;
    expect(e.x).toBeLessThan(680); // moved up to the sandbags
    expect(fired).toBe(true);
  });
});

describe('no yo-yo', () => {
  it('once wounded it falls back and never advances again', () => {
    const map: MapDef = arena({
      squads: [guard('sq', [{ position: { x: 600, y: 500 } }], { fallback: { x: 900, y: 500 } })],
    });
    const w = createWorld(map, T);
    soldierAt(w, { x: 200, y: 500 });
    const e = getSoldier(w, 'E1')!;
    e.hp = soldierMaxHp(T, 'rifleman') * 0.2;
    e.ai!.lastHp = e.hp;
    hit(w, 'E1');
    const seen = new Set<string>();
    let closest = Infinity;
    for (let i = 0; i < 60 * 20; i++) {
      run(w, 1, { S1: idle(0) });
      seen.add(e.ai!.behavior);
      if (i > 120) closest = Math.min(closest, e.x);
    }
    expect(e.ai!.wounded).toBe(true);
    expect(seen.has('approach')).toBe(false);
    // Stayed back at its fallback, never came forward to where it started.
    expect(closest).toBeGreaterThan(700);
  });
});

describe('squads support each other', () => {
  it('a shield steps between a hurt squadmate and the shooter', () => {
    const map: MapDef = arena({
      squads: [
        guard('sq', [
          { position: { x: 700, y: 500 } },
          { role: 'shield', position: { x: 720, y: 700 } },
        ]),
      ],
    });
    const w = createWorld(map, T);
    soldierAt(w, { x: 300, y: 500 });
    const shield = getSoldier(w, 'E2')!;
    const before = Math.hypot(shield.x - 700, shield.y - 500);
    let protecting = false;
    for (let i = 0; i < 40; i++) {
      if (i % 10 === 0) hit(w, 'E1');
      run(w, 3, { S1: idle(0) });
      protecting ||= shield.ai!.behavior === 'protect';
    }
    expect(protecting).toBe(true);
    expect(Math.hypot(shield.x - 700, shield.y - 500)).toBeLessThan(before);
  });

  it('a torn-up squad falls back and joins the nearest healthy one', () => {
    const map: MapDef = arena({
      squads: [
        guard('weak', [{ position: { x: 300, y: 300 } }, { position: { x: 340, y: 300 } }]),
        guard('far', [{ position: { x: 850, y: 850 } }]),
        guard('near', [{ position: { x: 700, y: 300 } }, { position: { x: 740, y: 300 } }]),
      ],
    });
    const w = createWorld(map, T);
    for (const id of ['E1', 'E2']) {
      const s = getSoldier(w, id)!;
      s.hp = soldierMaxHp(T, 'rifleman') * 0.2;
      s.ai!.lastHp = s.hp;
    }
    run(w, 60 * 3);
    const e1 = getSoldier(w, 'E1')!;
    expect(e1.ai!.squad).toBe('near');
    expect(e1.ai!.origSquad).toBe('weak');
    expect(e1.x).toBeGreaterThan(400);
    expect(getSoldier(w, 'E4')!.ai!.squad).toBe('near'); // the healthy squad stays put
  });
});
