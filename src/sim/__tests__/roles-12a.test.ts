/**
 * (PHASE12-a) Sniper, Shield, Shotgunner and Bazooka ([D59]–[D62]).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { damageSoldier } from '../combat/damage';
import { currentSpread, gunOf, gunRange, isSetUp, mountTicksNeeded } from '../combat/guns';
import { hashState } from '../core/hash';
import { getSoldier } from '../sim';
import { playLife } from '../scenarios/lives';
import type { CoverDef, MapDef } from '../world/map';
import { arena, idle, ofKind, run, soldierAt, walk, world } from './helpers';

const T = DEFAULT_TUNING;
const fire = (aim = 0) => ({ ...idle(aim), fire: true });
const bags: CoverDef = {
  id: 'bags',
  rect: { x: 400, y: 400, w: 20, h: 200 },
  material: 'sandbags',
};

describe('Sniper ([D59])', () => {
  it('fires a pistol on the move, sets up the rifle by standing still, swaps back when moving', () => {
    const w = world(arena());
    const id = soldierAt(w, { x: 100, y: 500 }, { roleId: 'sniper' });
    const moving = ofKind(run(w, 10, { [id]: { ...walk(0, 1), fire: true } }), 'shotFired');
    expect(moving.length).toBeGreaterThan(0);
    expect(moving.every((e) => e.weapon === 'pistol')).toBe(true);
    // Standing still: no cover needed.
    run(w, mountTicksNeeded(T, 'sniper') + 1, { [id]: idle() });
    const s = getSoldier(w, id)!;
    expect(isSetUp(T, s)).toBe(true);
    expect(gunOf(s, T)).toBe('sniper');
    const shots = ofKind(run(w, 1, { [id]: fire() }), 'shotFired');
    expect(shots[0]!.weapon).toBe('sniper');
    run(w, 2, { [id]: walk(0, 1) });
    expect(gunOf(getSoldier(w, id)!, T)).toBe('pistol');
  });

  it('reaches further than a rifle, and further and tighter set up on cover', () => {
    const w = world(arena({ cover: [bags] }));
    const id = soldierAt(w, { x: 385, y: 500 }, { roleId: 'sniper' });
    expect(gunRange(w, 'sniper', { x: 100, y: 200 }, 0)).toBe(T.sniper.range);
    expect(T.sniper.range).toBeGreaterThan(T.rifle.range);
    expect(gunRange(w, 'sniper', { x: 385, y: 500 }, 0)).toBeCloseTo(
      T.sniper.range * T.sniper.coverRangeMultiplier,
    );
    run(w, mountTicksNeeded(T, 'sniper') + 1, { [id]: idle() });
    const s = getSoldier(w, id)!;
    expect(currentSpread(w, s, 0)).toBeCloseTo(
      T.sniper.baseSpread * T.sniper.coverSpreadMultiplier,
    );
    expect(currentSpread(w, s, Math.PI)).toBeCloseTo(T.sniper.baseSpread); // not across the bags
  });

  it('an echo replays pistol and rifle shots exactly', () => {
    const map = arena({ turrets: [{ id: 't1', position: { x: 800, y: 500 }, facing: Math.PI }] });
    const tuning = { ...T, turret: { ...T.turret, range: 1 } };
    const first = playLife({
      map,
      tuning,
      records: [],
      attempt: 1,
      live: { mode: 'new', soldierId: 'S1', spawnPointId: 'a', entryTick: 0, roleId: 'sniper' },
      steps: [
        { kind: 'moveTo', to: { x: 300, y: 500 } },
        { kind: 'shoot', at: { x: 800, y: 500 }, until: (w) => w.state.tick > 260 },
      ],
    });
    const guns = first.records[0]!.segments[0]!.actions.map((a) =>
      a.kind === 'shot' ? a.gun : '-',
    );
    expect(guns).toContain('sniper');
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
  });
});

describe('Shield ([D60], armor [D70])', () => {
  it('blocks 80% of a rifle hit from the 135° it faces, none from the side or behind', () => {
    const w = world(arena());
    const id = soldierAt(w, { x: 500, y: 500 }, { roleId: 'shield' });
    run(w, 1, { [id]: idle(0) }); // facing +x
    const s = getSoldier(w, id)!;
    const hit = (from: { x: number; y: number }, cause = 'rifle') => {
      const before = s.hp;
      damageSoldier(w, s, 10, 'x', cause, from);
      return before - s.hp;
    };
    expect(hit({ x: 700, y: 500 })).toBeCloseTo(2);
    expect(hit({ x: 700, y: 650 })).toBeCloseTo(2); // 36.9°: inside ±67.5°
    expect(hit({ x: 500, y: 700 })).toBeCloseTo(10); // 90°: the side
    expect(hit({ x: 300, y: 500 })).toBeCloseTo(10);
    // A sniper pierces 5 %; a grenade blast right next to it 50 % ([D71]); shrapnel 0 %.
    expect(hit({ x: 700, y: 500 }, 'sniper')).toBeCloseTo(2.5);
    expect(hit({ x: 540, y: 500 }, 'grenade')).toBeCloseTo(7);
  });

  it('carries a pistol and is a bit tougher and slower', () => {
    const w = world(arena());
    const id = soldierAt(w, { x: 500, y: 500 }, { roleId: 'shield' });
    expect(ofKind(run(w, 1, { [id]: fire() }), 'shotFired')[0]!.weapon).toBe('pistol');
    expect(getSoldier(w, id)!.hp).toBe(Math.round(T.soldier.maxHp * T.roleStats.shield.hp));
  });
});

describe('Shotgunner ([D61])', () => {
  it('fires a fan of pellets, each its own shot, deterministically', () => {
    const pellets = () => {
      const w = world(arena());
      const id = soldierAt(w, { x: 500, y: 500 }, { roleId: 'shotgun' });
      return ofKind(run(w, 1, { [id]: fire(0.2) }), 'shotFired').map((e) => e.angle);
    };
    const a = pellets();
    expect(a).toHaveLength(T.shotgun.pellets);
    expect(new Set(a).size).toBe(T.shotgun.pellets);
    expect(a.every((x) => Math.abs(x - 0.2) <= T.shotgun.pelletSpread + 1e-9)).toBe(true);
    expect(pellets()).toEqual(a);
  });

  it('is deadly close and weak far away; has more HP', () => {
    const at = (x: number) => {
      const w = world(
        arena({ turrets: [{ id: 't1', position: { x, y: 500 }, facing: Math.PI }] }),
        { turret: { range: 1 }, shotgun: { pelletSpread: 0 } },
      );
      const id = soldierAt(w, { x: 100, y: 500 }, { roleId: 'shotgun' });
      run(w, 1, { [id]: fire(0) });
      return T.turret.maxHp - w.state.turrets[0]!.hp;
    };
    const near = at(160);
    const far = at(100 + T.shotgun.range - 40);
    expect(near).toBeGreaterThan(far * 2.5);
    expect(at(100 + T.shotgun.range + 60)).toBe(0); // out of range
    const w = world(arena());
    const id = soldierAt(w, { x: 500, y: 500 }, { roleId: 'shotgun' });
    expect(getSoldier(w, id)!.hp).toBe(150);
  });

  it('an echo replays every recorded pellet', () => {
    const map = arena({ turrets: [{ id: 't1', position: { x: 450, y: 500 }, facing: Math.PI }] });
    const tuning = { ...T, turret: { ...T.turret, range: 1 } };
    const first = playLife({
      map,
      tuning,
      records: [],
      attempt: 1,
      live: { mode: 'new', soldierId: 'S1', spawnPointId: 'a', entryTick: 0, roleId: 'shotgun' },
      steps: [
        { kind: 'moveTo', to: { x: 250, y: 500 } },
        { kind: 'shoot', at: { x: 450, y: 500 }, until: (w) => w.state.tick > 120 },
      ],
    });
    const shots = first.records[0]!.segments[0]!.actions.filter((a) => a.kind === 'shot');
    expect(shots.length % T.shotgun.pellets).toBe(0);
    expect(shots.every((a) => a.kind === 'shot' && a.gun === 'shotgun')).toBe(true);
    const replay = playLife({
      map,
      tuning,
      records: first.records,
      attempt: 2,
      live: null,
      maxTick: first.attempt.tick,
    });
    expect(hashState(replay.attempt.world.state.turrets)).toBe(
      hashState(first.attempt.world.state.turrets),
    );
  });
});

describe('Bazooka ([D62])', () => {
  const rocketMap = (extra: Partial<MapDef> = {}) =>
    arena({ turrets: [{ id: 't1', position: { x: 600, y: 500 }, facing: Math.PI }], ...extra });

  it('aims before launching; releasing early cancels', () => {
    const w = world(rocketMap(), { turret: { range: 1 } });
    const id = soldierAt(w, { x: 100, y: 500 }, { roleId: 'bazooka' });
    const aim = Math.round(T.rocket.aimSeconds * 60);
    expect(ofKind(run(w, aim - 2, { [id]: fire() }), 'rocketLaunched')).toHaveLength(0);
    run(w, 1, { [id]: idle() });
    expect(getSoldier(w, id)!.windupTicks).toBe(0);
    const ev = run(w, aim + 120, { [id]: fire() });
    expect(ofKind(ev, 'rocketLaunched')).toHaveLength(1);
    expect(ofKind(ev, 'rocketExploded')).toHaveLength(1);
    expect(w.state.turrets[0]!.hp).toBe(Math.max(0, T.turret.maxHp - T.rocket.hazardDamage));
  });

  it('the blast hurts our own soldiers too', () => {
    const w = world(rocketMap(), { turret: { range: 1 } });
    const id = soldierAt(w, { x: 100, y: 500 }, { roleId: 'bazooka' });
    const buddy = soldierAt(w, { x: 560, y: 530 });
    run(w, 200, { [id]: fire(), [buddy]: idle() });
    expect(getSoldier(w, buddy)!.hp).toBeLessThan(T.soldier.maxHp);
  });

  it('is slower than a rifleman', () => {
    const dist = (roleId: 'rifleman' | 'bazooka') => {
      const w = world(arena());
      const id = soldierAt(w, { x: 100, y: 500 }, { roleId });
      run(w, 60, { [id]: walk(1, 0) });
      return getSoldier(w, id)!.x - 100;
    };
    expect(dist('bazooka')).toBeCloseTo(dist('rifleman') * T.roleStats.bazooka.speed, 0);
  });

  it('an echo replays the launch exactly', () => {
    const map = rocketMap();
    const tuning = { ...T, turret: { ...T.turret, range: 1 } };
    const first = playLife({
      map,
      tuning,
      records: [],
      attempt: 1,
      live: { mode: 'new', soldierId: 'S1', spawnPointId: 'a', entryTick: 0, roleId: 'bazooka' },
      steps: [{ kind: 'shoot', at: { x: 600, y: 500 }, until: (w) => w.state.tick > 150 }],
    });
    const acts = first.records[0]!.segments[0]!.actions;
    expect(acts.some((a) => a.kind === 'shot' && a.gun === 'rocket')).toBe(true);
    const hp = first.attempt.world.state.turrets[0]!.hp;
    expect(hp).toBeLessThan(T.turret.maxHp);
    const replay = playLife({
      map,
      tuning,
      records: first.records,
      attempt: 2,
      live: null,
      maxTick: first.attempt.tick + 60,
    });
    expect(replay.attempt.world.state.turrets[0]!.hp).toBe(hp);
  });
});

describe('enemy AI with the new roles', () => {
  it('runs deterministically', () => {
    const play = () => {
      const w = world(
        arena({
          squads: [
            {
              id: 'sq',
              members: (['sniper', 'shield', 'shotgun', 'bazooka'] as const).map((role, i) => ({
                role,
                position: { x: 800, y: 300 + i * 120 },
                facing: Math.PI,
              })),
              order: { kind: 'guard' },
            },
          ],
        }),
      );
      const id = soldierAt(w, { x: 300, y: 500 });
      run(w, 900, { [id]: walk(0.3, 0) });
      return hashState(w.state);
    };
    expect(play()).toBe(play());
  });
});
