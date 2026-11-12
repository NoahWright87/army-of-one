/** (PHASE12-b) Vehicles: driving ([D64]), running over ([D66]), wrecks ([D67]), armor ([D70]). */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { damageSoldier } from '../combat/damage';
import { hashState } from '../core/hash';
import { getSoldier } from '../sim';
import { playLife } from '../scenarios/lives';
import { currentSolids } from '../world/blockers';
import { standingCover } from '../world/cover';
import { arena, idle, ofKind, run, soldierAt, walk, world } from './helpers';

const T = DEFAULT_TUNING;
const NORTH = -Math.PI / 2;
const big = () => arena();

describe('driving ([D64])', () => {
  it('a tank turns on the spot first, then drives', () => {
    const w = world(big());
    const id = soldierAt(w, { x: 500, y: 500 }, { roleId: 'tank', facing: NORTH });
    run(w, 20, { [id]: walk(1, 0) }); // east, 90° away
    let s = getSoldier(w, id)!;
    expect(s.x).toBeCloseTo(500, 0);
    expect(s.facing).toBeGreaterThan(NORTH);
    run(w, 120, { [id]: walk(1, 0) });
    s = getSoldier(w, id)!;
    expect(Math.abs(s.facing)).toBeLessThan(0.05);
    expect(s.x).toBeGreaterThan(560);
    expect(Math.abs(s.y - 500)).toBeLessThan(5);
  });

  it("a truck can't turn standing still: it rolls while turning, then speeds up", () => {
    const w = world(big());
    const id = soldierAt(w, { x: 300, y: 700 }, { roleId: 'truck', facing: NORTH });
    run(w, 10, { [id]: walk(1, 0) });
    const s = getSoldier(w, id)!;
    expect(Math.hypot(s.x - 300, s.y - 700)).toBeGreaterThan(1); // it moved to turn
    expect(Math.abs(s.drive!.speed)).toBeLessThanOrEqual(T.drive.truck.crawlSpeed + 1e-9);
    run(w, 90, { [id]: walk(1, 0) });
    expect(Math.abs(getSoldier(w, id)!.facing)).toBeLessThan(0.1);
    expect(getSoldier(w, id)!.drive!.speed).toBeGreaterThan(T.drive.truck.crawlSpeed * 2);
  });

  it('pulling straight back reverses', () => {
    const w = world(big());
    const id = soldierAt(w, { x: 500, y: 500 }, { roleId: 'tank', facing: 0 });
    run(w, 60, { [id]: walk(-1, 0) });
    const s = getSoldier(w, id)!;
    expect(s.facing).toBeCloseTo(0);
    expect(s.x).toBeLessThan(480);
    expect(s.drive!.speed).toBeLessThan(0);
  });

  it('the turret turns toward the aim at its own rate', () => {
    const w = world(big());
    const id = soldierAt(w, { x: 500, y: 500 }, { roleId: 'tank', facing: 0 });
    run(w, 10, { [id]: idle(Math.PI / 2) });
    const turret = getSoldier(w, id)!.drive!.turret;
    expect(turret).toBeCloseTo(T.drive.tank.turretTurnRate * (10 / 60), 2);
  });
});

describe('running people over ([D66])', () => {
  const ramAt = (roleId: 'truck' | 'tank', ticks: number, victimRole?: 'tank') => {
    const w = world(big());
    const v = soldierAt(w, { x: 200, y: 500 }, { roleId, facing: 0 });
    const o = soldierAt(w, { x: 200 + ticks, y: 500 }, victimRole ? { roleId: victimRole } : {});
    run(w, 240, { [v]: walk(1, 0), [o]: idle() });
    return { w, v: getSoldier(w, v)!, o: getSoldier(w, o)! };
  };

  it('a fast truck hurts badly, a crawling one only a little', () => {
    const firstHit = (throttle: number) => {
      const w = world(big());
      const v = soldierAt(w, { x: 200, y: 500 }, { roleId: 'truck', facing: 0 });
      const o = soldierAt(w, { x: 600, y: 500 });
      const ev = run(w, 600, { [v]: walk(throttle, 0), [o]: idle() });
      return ofKind(ev, 'damaged').find((e) => e.target === o)!.amount;
    };
    const fast = firstHit(1);
    const crawl = firstHit(0.25);
    expect(fast).toBeGreaterThan(60);
    expect(crawl).toBeLessThan(25);
  });

  it('a tank crushes our own soldiers too, slowly', () => {
    const { o } = ramAt('tank', 120);
    expect(o.hp).toBeLessThan(T.soldier.maxHp / 2);
  });

  it('ramming a tank with a truck hurts the truck too', () => {
    const { v, o } = ramAt('truck', 400, 'tank');
    expect(v.hp).toBeLessThan(T.soldier.maxHp * T.roleStats.truck.hp);
    expect(o.hp).toBeLessThan(T.soldier.maxHp * T.roleStats.tank.hp);
  });

  it('a tank batters through sandbags', () => {
    const bags = {
      id: 'bags',
      rect: { x: 400, y: 440, w: 30, h: 120 },
      material: 'sandbags' as const,
    };
    const w = world(arena({ cover: [bags] }));
    const id = soldierAt(w, { x: 300, y: 500 }, { roleId: 'tank', facing: 0 });
    run(w, 60 * 12, { [id]: walk(1, 0) });
    expect(standingCover(w)).toHaveLength(0);
    expect(getSoldier(w, id)!.x).toBeGreaterThan(450);
  });
});

describe('armor and wrecks', () => {
  it('rifles barely scratch a tank; rockets and shells hurt; the rear is weaker', () => {
    const w = world(big());
    const id = soldierAt(w, { x: 500, y: 500 }, { roleId: 'tank', facing: 0 });
    const s = getSoldier(w, id)!;
    const hit = (cause: string, from: { x: number; y: number }) => {
      const before = s.hp;
      damageSoldier(w, s, 100, 'x', cause, from);
      return before - s.hp;
    };
    expect(hit('rifle', { x: 700, y: 500 })).toBeCloseTo(1);
    expect(hit('rifle', { x: 300, y: 500 })).toBeCloseTo(10);
    expect(hit('rocket', { x: 700, y: 500 })).toBeCloseTo(51);
    expect(hit('crush', { x: 700, y: 500 })).toBeCloseTo(100);
  });

  it('a destroyed vehicle leaves a wreck that blocks movement and shots ([D67])', () => {
    const w = world(big());
    const id = soldierAt(w, { x: 500, y: 500 }, { roleId: 'truck', facing: 0 });
    const solids = currentSolids(w).length;
    damageSoldier(w, getSoldier(w, id)!, 1e6, 'x', 'crush');
    expect(currentSolids(w).length).toBe(solids + 1);
    const walker = soldierAt(w, { x: 400, y: 500 });
    run(w, 120, { [walker]: walk(1, 0) });
    expect(getSoldier(w, walker)!.x).toBeLessThan(500 - T.drive.truck.bodyRadius);
  });
});

describe('vehicle weapons', () => {
  it('the tank cannon aims, fires a shell, and reloads slowly ([D72])', () => {
    const w = world(
      arena({ turrets: [{ id: 't1', position: { x: 800, y: 500 }, facing: Math.PI }] }),
      {
        turret: { range: 1 },
      },
    );
    const id = soldierAt(w, { x: 300, y: 500 }, { roleId: 'tank', facing: 0 });
    const ev = run(w, 60 * 5, { [id]: { ...idle(0), fire: true } });
    expect(ofKind(ev, 'rocketLaunched').every((e) => e.shell)).toBe(true);
    expect(ofKind(ev, 'rocketLaunched')).toHaveLength(2); // 0.5 s aim, 4 s reload, 0.5 s aim
    expect(w.state.turrets[0]!.hp).toBe(0);
  });

  it('the truck fires its turret MG where the turret points', () => {
    const w = world(big());
    const id = soldierAt(w, { x: 300, y: 500 }, { roleId: 'truck', facing: 0 });
    const ev = run(w, 3, { [id]: { ...idle(Math.PI), fire: true } });
    const shots = ofKind(ev, 'shotFired');
    expect(shots.length).toBeGreaterThan(0);
    expect(Math.abs(shots[0]!.angle)).toBeLessThan(0.5); // still turning toward π
  });

  it('vehicles capture points unless turned off ([D68])', () => {
    const cpMap = arena({
      capturePoints: [{ id: 'cp', nameKey: 'cp', position: { x: 500, y: 500 } }],
    });
    for (const on of [true, false]) {
      const w = world(cpMap, { drive: { canCapture: on } });
      const id = soldierAt(w, { x: 500, y: 500 }, { roleId: 'tank', facing: 0 });
      run(w, 60 * 30, { [id]: idle() });
      expect(w.state.capturePoints[0]!.stage === 'ours').toBe(on);
    }
  });
});

describe('vehicle recordings', () => {
  it('an echo replays a drive and a shell exactly', () => {
    const map = arena({ turrets: [{ id: 't1', position: { x: 800, y: 300 }, facing: Math.PI }] });
    const tuning = { ...T, turret: { ...T.turret, range: 1 } };
    const first = playLife({
      map,
      tuning,
      records: [],
      attempt: 1,
      live: { mode: 'new', soldierId: 'S1', spawnPointId: 'a', entryTick: 0, roleId: 'tank' },
      steps: [
        { kind: 'moveTo', to: { x: 400, y: 400 } },
        { kind: 'shoot', at: { x: 800, y: 300 }, until: (w) => w.state.tick > 600 },
      ],
    });
    const acts = first.records[0]!.segments[0]!.actions;
    expect(acts.some((a) => a.kind === 'shot' && a.gun === 'shell')).toBe(true);
    const replay = playLife({
      map,
      tuning,
      records: first.records,
      attempt: 2,
      live: null,
      maxTick: first.attempt.tick + 60,
    });
    expect(hashState(replay.attempt.world.state.turrets)).toBe(
      hashState(first.attempt.world.state.turrets),
    );
    expect(replay.attempt.world.state.turrets[0]!.hp).toBeLessThan(T.turret.maxHp);
  });
});

describe('enemy AI and vehicles', () => {
  const squadMap = (role: 'rifleman' | 'tank') =>
    arena({
      squads: [
        {
          id: 'sq',
          members: [{ role, position: { x: 800, y: 500 }, facing: Math.PI }],
          order: { kind: 'guard' },
        },
      ],
    });

  it("a rifleman doesn't waste fire on a tank while a soldier is in view", () => {
    const w = world(squadMap('rifleman'));
    soldierAt(w, { x: 600, y: 500 }, { roleId: 'tank', facing: 0 });
    const inf = soldierAt(w, { x: 450, y: 520 });
    run(w, 60);
    const enemy = w.state.soldiers.find((s) => s.team === 'enemy')!;
    expect(enemy.ai!.targetId).toBe(inf);
  });

  it('an enemy tank drives and fires, deterministically', () => {
    const play = () => {
      const w = world(squadMap('tank'));
      const id = soldierAt(w, { x: 560, y: 500 });
      run(w, 60 * 10, { [id]: idle() });
      return { hash: hashState(w.state), hp: getSoldier(w, id)!.hp };
    };
    const a = play();
    expect(a.hp).toBeLessThan(T.soldier.maxHp);
    expect(play()).toEqual(a);
  });
});
