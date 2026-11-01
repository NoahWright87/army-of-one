/**
 * (07-c) Grenadier and frag grenades ([D36], [D37]): wind-up by distance, early release throws
 * short, bounces off walls, rolls to a stop, blast + fragments hurt everyone (own soldiers too),
 * cover stops airborne grenades by its `lobbed` share, and echoes replay throws exactly.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { hashState } from '../core/hash';
import { secondsToTicks } from '../core/time';
import { throwGrenade } from '../entities/grenade';
import { windupTicksFor } from '../combat/weapons';
import { playLife } from '../scenarios/lives';
import { getSoldier, getView, step } from '../sim';
import { arena, idle, ofKind, run, soldierAt, world } from './helpers';

const T = DEFAULT_TUNING;
const FUSE = secondsToTicks(T.grenade.fuseSeconds);
const hold = (aim: number, aimDistance: number) => ({ ...idle(aim), fire: true, aimDistance });
const release = (aim: number, aimDistance: number) => ({ ...idle(aim), aimDistance });

describe('throwing', () => {
  it('a rifleman fires the rifle; a grenadier winds up and throws on release', () => {
    const w = world(arena());
    const g = soldierAt(w, { x: 100, y: 500 }, { roleId: 'grenadier' });
    const need = windupTicksFor(w, 300);
    const evs = run(w, need, { [g]: hold(0, 300) });
    expect(ofKind(evs, 'shotFired')).toHaveLength(0);
    expect(getView(w).soldiers[0]!.windup).toBeCloseTo(1);
    const thrown = ofKind(run(w, 1, { [g]: release(0, 300) }), 'grenadeThrown');
    expect(thrown).toHaveLength(1);
    expect(thrown[0]!.distance).toBeCloseTo(300);
    expect(getView(w).grenades).toHaveLength(1);
  });

  it('wind-up grows with distance; releasing early throws shorter', () => {
    const w = world(arena());
    expect(windupTicksFor(w, 400)).toBeGreaterThan(windupTicksFor(w, 100));
    const g = soldierAt(w, { x: 100, y: 500 }, { roleId: 'grenadier' });
    const half = Math.floor(windupTicksFor(w, 400) / 2);
    run(w, half, { [g]: hold(0, 400) });
    const thrown = ofKind(run(w, 1, { [g]: release(0, 400) }), 'grenadeThrown')[0]!;
    expect(thrown.distance).toBeGreaterThan(120);
    expect(thrown.distance).toBeLessThan(260);
  });

  it('lands near the throw distance, rolls a bit, and explodes on its fuse', () => {
    const w = world(arena());
    throwGrenade(w, 'S9', { x: 100, y: 500 }, 0, 300);
    run(w, FUSE - 1);
    const g = w.state.grenades![0]!;
    expect(g.z).toBe(0);
    expect(g.x).toBeGreaterThan(330);
    expect(g.x).toBeLessThan(480);
    const evs = run(w, 1);
    expect(ofKind(evs, 'grenadeExploded')).toHaveLength(1);
    expect(w.state.grenades).toHaveLength(0);
  });

  it('bounces off walls back toward the thrower', () => {
    const w = world(arena({ walls: [{ x: 300, y: 0, w: 20, h: 1000 }] }));
    throwGrenade(w, 'S9', { x: 100, y: 500 }, 0, 400);
    const evs = run(w, FUSE - 1);
    expect(ofKind(evs, 'grenadeBounced').length).toBeGreaterThan(0);
    expect(w.state.grenades![0]!.x).toBeLessThan(300);
  });
});

describe('explosion', () => {
  it('hurts our own soldiers (friendly fire) and turrets', () => {
    const w = world(arena({ turrets: [{ id: 't1', position: { x: 420, y: 520 }, facing: 0 }] }), {
      turret: { range: 1 },
    });
    const buddy = soldierAt(w, { x: 380, y: 500 });
    throwGrenade(w, 'S9', { x: 100, y: 500 }, 0, 280);
    run(w, FUSE);
    expect(getSoldier(w, buddy)!.hp).toBeLessThan(T.soldier.maxHp);
    expect(w.state.turrets[0]!.hp).toBeLessThan(T.turret.maxHp);
  });

  it('fragments fly like bullets: walls stop them, they reach soldiers in the open', () => {
    const w = world(arena({ walls: [{ x: 440, y: 0, w: 20, h: 1000 }] }), {
      grenade: { blastRadius: 1, fragments: 64 },
    });
    const open = soldierAt(w, { x: 300, y: 500 });
    const behind = soldierAt(w, { x: 480, y: 500 });
    const g = throwGrenade(w, 'S9', { x: 400, y: 500 }, 0, 0);
    g.vx = 0;
    g.vy = 0;
    const ex = ofKind(run(w, FUSE), 'grenadeExploded')[0]!;
    expect(ex.fragments).toHaveLength(64);
    expect(getSoldier(w, open)!.hp).toBeLessThan(T.soldier.maxHp);
    expect(getSoldier(w, behind)!.hp).toBe(T.soldier.maxHp);
  });

  it('kills by a grenade are credited to the thrower, cause grenade', () => {
    const w = world(arena(), { grenade: { blastDamage: 1000 } });
    const victim = soldierAt(w, { x: 300, y: 500 });
    const g = throwGrenade(w, 'S9', { x: 300, y: 500 }, 0, 0);
    g.vx = 0;
    g.vy = 0;
    const died = ofKind(run(w, FUSE), 'soldierDied');
    expect(died[0]).toMatchObject({ id: victim, cause: 'grenade', by: 'S9' });
  });
});

describe('cover vs grenades', () => {
  const fence = (lobbed: number) =>
    arena({
      cover: [
        { id: 'c1', rect: { x: 300, y: 0, w: 10, h: 1000 }, material: 'fence', bullet: 0, lobbed },
      ],
    });

  it('lobbed 0: sails over; lobbed 1: bounces off', () => {
    const over = world(fence(0));
    throwGrenade(over, 'S9', { x: 100, y: 500 }, 0, 400);
    run(over, FUSE - 1);
    expect(over.state.grenades![0]!.x).toBeGreaterThan(310);
    const off = world(fence(1));
    throwGrenade(off, 'S9', { x: 100, y: 500 }, 0, 400);
    run(off, FUSE - 1);
    expect(off.state.grenades![0]!.x).toBeLessThan(300);
  });

  it('a rolling grenade is always stopped by cover', () => {
    const w = world(fence(0));
    const g = throwGrenade(w, 'S9', { x: 250, y: 500 }, 0, 0);
    g.vx = 300; // rolling along the ground into the fence
    run(w, 30);
    expect(w.state.grenades![0]!.x).toBeLessThan(300);
  });

  it('the thrower throws over cover they stand next to', () => {
    const w = world(fence(0.99));
    throwGrenade(w, 'S9', { x: 285, y: 500 }, 0, 200);
    run(w, FUSE - 1);
    expect(w.state.grenades![0]!.x).toBeGreaterThan(310);
  });
});

describe('echo replay', () => {
  it('a recorded grenadier throws the same grenade as an echo (same world hash)', () => {
    const map = arena({ turrets: [{ id: 't1', position: { x: 500, y: 500 }, facing: Math.PI }] });
    const tuning = { ...T, turret: { ...T.turret, range: 1 } };
    const first = playLife({
      map,
      tuning,
      records: [],
      attempt: 1,
      live: { mode: 'new', soldierId: 'S1', spawnPointId: 'a', entryTick: 0, roleId: 'grenadier' },
      steps: [
        { kind: 'throw', at: { x: 480, y: 500 } },
        { kind: 'wait', ticks: FUSE + 10 },
      ],
    });
    expect(first.records[0]!.roleId).toBe('grenadier');
    const throws = first.records[0]!.segments[0]!.actions.filter((a) => a.kind === 'throw');
    expect(throws).toHaveLength(1);
    const liveHp = first.attempt.world.state.turrets[0]!.hp;
    expect(liveHp).toBeLessThan(T.turret.maxHp);

    const replay = playLife({
      map,
      tuning,
      records: first.records,
      attempt: 2,
      live: null,
      maxTick: first.attempt.tick,
    });
    expect(replay.attempt.world.state.turrets[0]!.hp).toBe(liveHp);
    const strip = (w: typeof replay.attempt.world) => ({
      turrets: w.state.turrets,
      grenades: w.state.grenades,
      soldiers: w.state.soldiers.map((s) => ({ x: s.x, y: s.y, hp: s.hp })),
    });
    expect(hashState(strip(replay.attempt.world))).toBe(hashState(strip(first.attempt.world)));
    expect(getView(replay.attempt.world).soldiers[0]!.roleId).toBe('grenadier');
  });

  it('a grenade can kill an echo that survived its own life (history changes)', () => {
    const map = arena({
      spawnPoints: [
        { id: 'a', nameKey: 'spawn.a', position: { x: 100, y: 500 }, facing: 0, kind: 'initial' },
        { id: 'b', nameKey: 'spawn.b', position: { x: 100, y: 800 }, facing: 0, kind: 'initial' },
      ],
    });
    const tuning = { ...T, grenade: { ...T.grenade, blastDamage: 1000 } };
    const first = playLife({
      map,
      tuning,
      records: [],
      attempt: 1,
      live: { mode: 'new', soldierId: 'S1', spawnPointId: 'a', entryTick: 0 },
      steps: [
        { kind: 'moveTo', to: { x: 400, y: 500 } },
        { kind: 'wait', ticks: 300 },
      ],
    });
    const second = playLife({
      map,
      tuning,
      records: first.records,
      attempt: 2,
      live: { mode: 'new', soldierId: 'S2', spawnPointId: 'b', entryTick: 0, roleId: 'grenadier' },
      steps: [
        { kind: 'throw', at: { x: 370, y: 530 } },
        { kind: 'wait', ticks: FUSE + 30 },
      ],
    });
    const s1 = getSoldier(second.attempt.world, 'S1')!;
    expect(s1.alive).toBe(false);
    expect(s1.deathCause).toBe('grenade');
    void step;
  });
});
