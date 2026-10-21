import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { damageSoldier } from '../combat/damage';
import { castRay, fireRifle, hasLineOfSight } from '../combat/shots';
import { getSoldier, getView, step } from '../sim';
import { arena, idle, ofKind, run, soldierAt, walk, world } from './helpers';

const turretAt = (x: number, y: number) => ({
  turrets: [{ id: 'turret-1', position: { x, y }, facing: Math.PI }],
});

describe('rifle', () => {
  it('fires from (x, y) at angle θ and stops at the first wall', () => {
    const w = world(arena({ walls: [{ x: 400, y: 0, w: 20, h: 1000 }] }));
    const res = fireRifle(w, 'S9', { x: 100, y: 300 }, 0);
    expect(res.hitX).toBeCloseTo(400);
    expect(res.hitY).toBeCloseTo(300);
    expect(res.hitId).toBeUndefined();
    // Fired between steps: the event opens the next tick.
    const shots = ofKind(step(w, new Map()), 'shotFired');
    expect(shots).toHaveLength(1);
    expect(shots[0]).toMatchObject({ by: 'S9', fromX: 100, fromY: 300, angle: 0 });
  });

  it('stops at max range', () => {
    const w = world(arena());
    const res = fireRifle(w, 'S1', { x: 100, y: 500 }, 0);
    expect(res.hitX).toBeCloseTo(100 + DEFAULT_TUNING.rifle.range);
  });

  it('respects the fire cooldown for live soldiers', () => {
    const w = world(arena());
    const id = soldierAt(w, { x: 100, y: 500 });
    const fire = { ...idle(0), fire: true };
    const events = run(w, 60, { [id]: fire });
    const expected = Math.ceil(60 / Math.round(DEFAULT_TUNING.rifle.cooldownSeconds * 60));
    expect(ofKind(events, 'shotFired')).toHaveLength(expected);
  });

  it('has no friendly fire: shots pass through our soldiers and hit the turret behind them', () => {
    const w = world(arena(turretAt(700, 500)), { turret: { range: 1 } }); // turret can't shoot back
    const shooter = soldierAt(w, { x: 300, y: 500 });
    const buddy = soldierAt(w, { x: 400, y: 500 });
    const res = fireRifle(w, shooter, { x: 300, y: 500 }, 0);
    expect(res.hitId).toBe('turret-1');
    expect(getSoldier(w, buddy)!.hp).toBe(DEFAULT_TUNING.soldier.maxHp);
    expect(w.state.turrets[0]!.hp).toBe(DEFAULT_TUNING.turret.maxHp - DEFAULT_TUNING.rifle.damage);
  });

  it('enemy rays hit soldiers but line of sight looks past them', () => {
    const w = world(arena());
    soldierAt(w, { x: 400, y: 500 });
    const hit = castRay(w, { x: 700, y: 500 }, Math.PI, 1000, 'enemy');
    expect(hit.target).toMatchObject({ kind: 'soldier', id: 'S1' });
    expect(hasLineOfSight(w, { x: 700, y: 500 }, { x: 100, y: 500 }, 'enemy')).toBe(true);
  });
});

describe('soldier hp, death and flags', () => {
  it('dies at 0 hp, stops stepping, and stays in the view as a corpse', () => {
    const w = world(arena());
    const id = soldierAt(w, { x: 100, y: 500 });
    damageSoldier(w, getSoldier(w, id)!, 500, 'turret-1', 'turret');
    const s = getSoldier(w, id)!;
    expect(s.alive).toBe(false);
    expect(s.deathCause).toBe('turret');
    // Emitted between steps, so it's queued for the next tick's events.
    expect(ofKind(w.state.queuedEvents, 'soldierDied')[0]).toMatchObject({
      id,
      cause: 'turret',
      by: 'turret-1',
    });
    run(w, 30, { [id]: walk(1, 0) });
    expect(getSoldier(w, id)!.x).toBe(100);
    const view = getView(w).soldiers[0]!;
    expect(view).toMatchObject({ alive: false, deathCause: 'turret' });
  });

  it('minHp floors damage during a lead-in: hurt but never killed', () => {
    const w = world(arena());
    const id = soldierAt(w, { x: 100, y: 500 }, { minHp: 1 });
    damageSoldier(w, getSoldier(w, id)!, 30, 'x', 'test');
    damageSoldier(w, getSoldier(w, id)!, 9999, 'x', 'test');
    expect(getSoldier(w, id)).toMatchObject({ hp: 1, alive: true });
    expect(getView(w).soldiers[0]!.leadIn).toBe(true);
  });

  it('non-interactive (static) soldiers cannot be hit and are ignored by turrets', () => {
    const w = world(arena(turretAt(500, 500)));
    const ghost = soldierAt(w, { x: 300, y: 500 }, { controllable: false, interactive: false });
    const events = run(w, 300);
    expect(ofKind(events, 'turretWindup')).toHaveLength(0);
    expect(castRay(w, { x: 500, y: 500 }, Math.PI, 1000, 'enemy').target).toMatchObject({
      kind: 'wall',
    });
    expect(getSoldier(w, ghost)!.hp).toBe(DEFAULT_TUNING.soldier.maxHp);
    expect(getView(w).soldiers[0]!.role).toBe('static');
  });

  it('non-controllable soldiers ignore input', () => {
    const w = world(arena());
    const id = soldierAt(w, { x: 100, y: 500 }, { controllable: false });
    run(w, 30, { [id]: walk(1, 0) });
    expect(getSoldier(w, id)!.x).toBe(100);
    expect(getView(w).soldiers[0]!.role).toBe('echo');
  });
});
