import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { fireRifle } from '../combat/shots';
import { secondsToTicks } from '../core/time';
import { getSoldier, getView, hasLineOfSight, interact, isWalkable } from '../sim';
import type { MapDef } from '../world/map';
import { arena, idle, ofKind, run, soldierAt, walk, world } from './helpers';

const T = DEFAULT_TUNING;
const WINDUP = secondsToTicks(T.turret.windupSeconds);

describe('turret', () => {
  const map = (extra: Partial<MapDef> = {}) =>
    arena({
      turrets: [{ id: 'turret-1', position: { x: 500, y: 500 }, facing: Math.PI }],
      ...extra,
    });

  it('winds up, then hits a soldier in range with line of sight', () => {
    const w = world(map());
    const id = soldierAt(w, { x: 200, y: 500 });
    const events = run(w, WINDUP + 1);
    expect(ofKind(events, 'turretWindup')[0]).toMatchObject({ id: 'turret-1', targetId: id });
    const shots = ofKind(events, 'shotFired');
    expect(shots).toHaveLength(1);
    expect(shots[0]!.hitId).toBe(id);
    expect(getSoldier(w, id)!.hp).toBe(T.soldier.maxHp - T.turret.damage);
  });

  it('keeps shooting until the soldier dies', () => {
    const w = world(map());
    const id = soldierAt(w, { x: 200, y: 500 });
    const died = ofKind(run(w, 600), 'soldierDied');
    expect(died).toEqual([expect.objectContaining({ id, cause: 'turret', by: 'turret-1' })]);
    expect(getView(w).turrets[0]!.state).toBe('idle');
  });

  it('ignores soldiers out of range or behind walls', () => {
    const w = world(map({ walls: [{ x: 300, y: 300, w: 20, h: 400 }] }));
    soldierAt(w, { x: 200, y: 500 }); // behind the wall
    soldierAt(w, { x: 500, y: 950 - 20 }); // in the open but out of range (430 > 420)
    expect(ofKind(run(w, 300), 'turretWindup')).toHaveLength(0);
    expect(w.state.turrets[0]!.mode).toBe('idle');
  });

  it('targets the nearest eligible soldier, ties by id', () => {
    const w = world(map());
    soldierAt(w, { x: 200, y: 500 });
    const near = soldierAt(w, { x: 500, y: 300 });
    soldierAt(w, { x: 500, y: 350 }, { interactive: false }); // nearer, but static
    run(w, 1);
    expect(w.state.turrets[0]!.targetId).toBe(near);
    // Two at equal distance: lower id wins.
    const w2 = world(map());
    const a = soldierAt(w2, { x: 300, y: 500 });
    soldierAt(w2, { x: 700, y: 500 });
    run(w2, 1);
    expect(w2.state.turrets[0]!.targetId).toBe(a);
  });

  it('cancels the shot if the target breaks line of sight during the wind-up', () => {
    const w = world(map({ walls: [{ x: 300, y: 520, w: 40, h: 300 }] }));
    const id = soldierAt(w, { x: 260, y: 480 });
    run(w, 2); // wind-up started
    expect(w.state.turrets[0]!.mode).toBe('windup');
    const events = run(w, WINDUP + 5, { [id]: walk(0, 1) }); // duck south behind the wall
    expect(ofKind(events, 'shotFired')).toHaveLength(0);
  });

  it('trackDuringWindup=false: the aim freezes and a sidestep dodges', () => {
    const w = world(map(), { turret: { trackDuringWindup: false } });
    const id = soldierAt(w, { x: 200, y: 500 });
    run(w, 1);
    const shots = ofKind(run(w, WINDUP + 1, { [id]: walk(0, 1) }), 'shotFired');
    expect(shots).toHaveLength(1);
    expect(shots[0]!.hitId).toBeUndefined();
    expect(getSoldier(w, id)!.hp).toBe(T.soldier.maxHp);
  });

  it('can be destroyed from outside its range, leaving a non-blocking wreck', () => {
    const w = world(map());
    const id = soldierAt(w, { x: 50, y: 500 }); // 450 away: outside 420, inside rifle 520
    expect(isWalkable(w, { x: 500, y: 500 })).toBe(false);
    const events = run(w, 120, { [id]: { ...idle(0), fire: true } });
    expect(ofKind(events, 'hazardDestroyed')).toEqual([
      expect.objectContaining({ id: 'turret-1', by: id }),
    ]);
    expect(ofKind(events, 'turretWindup')).toHaveLength(0);
    expect(getView(w).turrets[0]!.state).toBe('destroyed');
    expect(isWalkable(w, { x: 500, y: 500 })).toBe(true);
    run(w, 240, { [id]: walk(1, 0) });
    expect(getSoldier(w, id)!.x).toBeGreaterThan(550);
  });

  it('floors a lead-in soldier at minHp instead of killing them', () => {
    const w = world(map());
    const id = soldierAt(w, { x: 200, y: 500 }, { minHp: 1 });
    run(w, 600);
    expect(getSoldier(w, id)).toMatchObject({ alive: true, hp: 1 });
  });
});

describe('mine', () => {
  const FUSE = secondsToTicks(T.mine.fuseSeconds);
  const mines = (...xs: number[]) =>
    arena({ mines: xs.map((x, i) => ({ id: `mine-${i + 1}`, position: { x, y: 500 } })) });

  it('arms on proximity, then detonates after the fuse and kills whoever stayed', () => {
    const w = world(mines(500));
    const id = soldierAt(w, { x: 465, y: 500 }); // inside trigger radius
    run(w, 1);
    expect(getView(w).mines[0]!.state).toBe('armed');
    const events = run(w, FUSE);
    expect(ofKind(events, 'mineDetonated')).toHaveLength(1);
    expect(getSoldier(w, id)).toMatchObject({ alive: false, deathCause: 'mine' });
    expect(getView(w).mines[0]!.state).toBe('detonated');
  });

  it('a soldier who runs the moment it arms escapes the blast', () => {
    const w = world(mines(500));
    const id = soldierAt(w, { x: 465, y: 500 });
    run(w, FUSE + 2, { [id]: walk(-1, 0) });
    expect(w.state.mines[0]!.state).toBe('detonated');
    expect(getSoldier(w, id)!.alive).toBe(true);
  });

  it('shooting a mine detonates it and chains to nearby mines', () => {
    const w = world(mines(500, 570, 900));
    const id = soldierAt(w, { x: 200, y: 500 });
    const res = fireRifle(w, id, { x: 200, y: 500 }, 0);
    expect(res.hitId).toBe('mine-1');
    expect(w.state.mines.map((m) => m.state)).toEqual(['detonated', 'armed', 'idle']);
    run(w, secondsToTicks(T.mine.chainFuseSeconds) + 1);
    expect(w.state.mines.map((m) => m.state)).toEqual(['detonated', 'detonated', 'idle']);
    expect(getSoldier(w, id)!.alive).toBe(true);
  });

  it('blasts damage hazards too (when enabled)', () => {
    const extra = {
      mines: [{ id: 'mine-1', position: { x: 500, y: 500 } }],
      turrets: [{ id: 'turret-1', position: { x: 560, y: 500 }, facing: 0 }],
    };
    const w = world(arena(extra), { turret: { range: 1 } });
    fireRifle(w, 'S1', { x: 200, y: 500 }, 0);
    expect(w.state.turrets[0]!.hp).toBe(T.turret.maxHp - T.mine.hazardDamage);
    const w2 = world(arena(extra), { turret: { range: 1 }, mine: { damagesHazards: false } });
    fireRifle(w2, 'S1', { x: 200, y: 500 }, 0);
    expect(w2.state.turrets[0]!.hp).toBe(T.turret.maxHp);
  });

  it('static soldiers do not trigger mines', () => {
    const w = world(mines(500));
    soldierAt(w, { x: 500, y: 500 }, { interactive: false, controllable: false });
    run(w, 120);
    expect(w.state.mines[0]!.state).toBe('idle');
  });
});

describe('traffic', () => {
  const STEP = T.vehicle.speed / 60;
  const INTERVAL = secondsToTicks(T.vehicle.intervalSeconds);
  const lane = (extra: Partial<MapDef> = {}) =>
    arena({
      trafficLanes: [{ id: 'lane-1', from: { x: -100, y: 500 }, to: { x: 1100, y: 500 } }],
      ...extra,
    });

  it('spawns on a fixed schedule from tick 0 and removes vehicles past the lane end', () => {
    const w = world(lane(), { vehicle: { prewarm: false } });
    expect(w.state.vehicles.map((v) => v.x)).toEqual([-100]);
    const spawnTicks: number[] = [];
    let seen = new Set(['V1']);
    for (let t = 0; t < INTERVAL * 3; t++) {
      run(w, 1);
      for (const v of w.state.vehicles) {
        if (!seen.has(v.id)) spawnTicks.push(w.state.tick);
      }
      seen = new Set([...seen, ...w.state.vehicles.map((v) => v.id)]);
    }
    expect(spawnTicks).toEqual([INTERVAL, INTERVAL * 2, INTERVAL * 3]);
    // V1 drove 1200 units and left.
    expect(w.state.vehicles.some((v) => v.id === 'V1')).toBe(false);
  });

  it('prewarm fills the lane at tick 0 as if traffic had always run', () => {
    const w = world(lane());
    const xs = w.state.vehicles.map((v) => Math.round(v.x));
    expect(xs).toEqual([Math.round(-100 + INTERVAL * STEP), -100]);
  });

  it('kills soldiers on contact (lead-ins are floored instead)', () => {
    const w = world(lane());
    const a = soldierAt(w, { x: 300, y: 500 });
    const b = soldierAt(w, { x: 320, y: 520 }, { minHp: 1 });
    const died = ofKind(run(w, INTERVAL), 'soldierDied');
    expect(died).toEqual([expect.objectContaining({ id: a, cause: 'vehicle' })]);
    expect(getSoldier(w, b)).toMatchObject({ alive: true, hp: 1 });
  });

  it('a shot-up vehicle becomes a wreck that blocks movement; traffic stops behind it', () => {
    const w = world(lane(), { vehicle: { prewarm: false } });
    run(w, 60); // V1 at x = -100 + 60 × 7 = 320
    const v1 = w.state.vehicles[0]!;
    const shots = Math.ceil(T.vehicle.maxHp / T.rifle.damage);
    for (let i = 0; i < shots; i++) fireRifle(w, 'S1', { x: v1.x, y: 900 }, -Math.PI / 2);
    expect(v1.state).toBe('wreck');
    const wreckX = v1.x;
    expect(isWalkable(w, { x: wreckX, y: 500 })).toBe(false);
    run(w, INTERVAL * 2);
    expect(w.state.vehicles[0]!.x).toBe(wreckX);
    const v2 = w.state.vehicles.find((v) => v.id === 'V2')!;
    expect(v2.state).toBe('stopped');
    expect(wreckX - v2.x).toBeCloseTo(T.vehicle.length + T.vehicle.stopGap, 5);
    expect(getView(w).vehicles.map((v) => v.state)).toContain('wreck');
    // A soldier walking into the wreck is stopped by it.
    const id = soldierAt(w, { x: wreckX, y: 700 });
    run(w, 120, { [id]: walk(0, -1) });
    expect(getSoldier(w, id)!.y).toBeGreaterThan(500 + T.vehicle.width / 2);
  });

  it("blockedBehavior='passThrough': traffic drives through wrecks", () => {
    const w = world(lane(), { vehicle: { prewarm: false, blockedBehavior: 'passThrough' } });
    run(w, 60);
    for (let i = 0; i < 4; i++)
      fireRifle(w, 'S1', { x: w.state.vehicles[0]!.x, y: 900 }, -Math.PI / 2);
    run(w, INTERVAL + 60);
    expect(w.state.vehicles.filter((v) => v.state === 'stopped')).toHaveLength(0);
    expect(w.state.vehicles.find((v) => v.id === 'V2')!.x).toBeGreaterThan(w.state.vehicles[0]!.x);
  });
});

describe('gate + lever', () => {
  const map = arena({
    walls: [
      { x: 480, y: 0, w: 40, h: 400 },
      { x: 480, y: 600, w: 40, h: 400 },
    ],
    gates: [{ id: 'gate-1', rect: { x: 480, y: 400, w: 40, h: 200 }, initiallyOpen: false }],
    levers: [{ id: 'lever-1', position: { x: 440, y: 650 }, targetId: 'gate-1' }],
    turrets: [{ id: 'turret-1', position: { x: 800, y: 500 }, facing: Math.PI }],
  });

  it('a closed gate blocks movement, shots and line of sight', () => {
    const w = world(map);
    const id = soldierAt(w, { x: 420, y: 500 });
    expect(hasLineOfSight(w, { x: 800, y: 500 }, { x: 420, y: 500 }, 'enemy')).toBe(false);
    expect(fireRifle(w, id, { x: 420, y: 500 }, 0).hitId).toBe('gate-1');
    const events = run(w, 120, { [id]: walk(1, 0) });
    expect(getSoldier(w, id)!.x).toBeLessThan(480);
    expect(ofKind(events, 'turretWindup')).toHaveLength(0);
  });

  it('the lever toggles the gate, edge-triggered, only within reach', () => {
    const w = world(map);
    const id = soldierAt(w, { x: 300, y: 650 }); // 140 from the lever
    run(w, 5, { [id]: { ...idle(), interact: true } });
    expect(w.state.gates[0]!.open).toBe(false);
    getSoldier(w, id)!.x = 420; // 20 from the lever
    run(w, 5, { [id]: { ...idle(), interact: true } }); // still held from before: no new press
    expect(w.state.gates[0]!.open).toBe(false);
    run(w, 1); // release
    const events = run(w, 30, { [id]: { ...idle(), interact: true } }); // held: one toggle
    expect(ofKind(events, 'interacted')).toEqual([
      expect.objectContaining({ by: id, targetId: 'lever-1' }),
    ]);
    expect(ofKind(events, 'gateChanged')).toEqual([expect.objectContaining({ open: true })]);
    expect(getView(w).levers[0]!.on).toBe(true);
    expect(getView(w).gates[0]!.open).toBe(true);
    run(w, 1); // release
    run(w, 1, { [id]: { ...idle(), interact: true } });
    expect(w.state.gates[0]!.open).toBe(false);
  });

  it('closing on a soldier pushes them out of the gate', () => {
    const w = world(map);
    const id = soldierAt(w, { x: 500, y: 500 }, { controllable: false });
    w.state.gates[0]!.open = true;
    const lever = soldierAt(w, { x: 440, y: 660 }, { controllable: false });
    interact(w, getSoldier(w, lever)!, 'lever-1'); // echoes replay recorded interacts like this
    expect(w.state.gates[0]!.open).toBe(false);
    run(w, 1);
    const s = getSoldier(w, id)!;
    expect(s.x < 480 - T.soldier.wallRadius + 1e-6 || s.x > 520 + T.soldier.wallRadius - 1e-6).toBe(
      true,
    );
  });
});

describe('bridges', () => {
  const RAISE = secondsToTicks(T.bridge.raiseSeconds);
  // A river across the arena at y 450–550, with a gap at x 450–550 for the bridge.
  const river = (bridge: Record<string, unknown>, extra: Partial<MapDef> = {}): MapDef =>
    arena({
      water: [
        { x: 0, y: 450, w: 450, h: 100 },
        { x: 550, y: 450, w: 450, h: 100 },
      ],
      bridges: [
        { id: 'bridge-1', rect: { x: 450, y: 450, w: 100, h: 100 }, axis: 'y', ...bridge } as never,
      ],
      ...extra,
    });

  it('drawbridge: raised is impassable, a lever lowers it over time, then it is walkable', () => {
    const w = world(
      river(
        { kind: 'draw', initiallyUp: true },
        { levers: [{ id: 'lever-1', position: { x: 600, y: 600 }, targetId: 'bridge-1' }] },
      ),
    );
    const id = soldierAt(w, { x: 500, y: 700 });
    run(w, 120, { [id]: walk(0, -1) });
    expect(getSoldier(w, id)!.y).toBeGreaterThan(550);
    expect(isWalkable(w, { x: 500, y: 500 })).toBe(false);

    getSoldier(w, id)!.x = 580;
    getSoldier(w, id)!.y = 590;
    const events = run(w, RAISE + 1, { [id]: { ...idle(), interact: true } });
    expect(ofKind(events, 'bridgeChanged').map((e) => e.state)).toEqual(['lowering', 'down']);
    expect(getView(w).bridges[0]!.raised).toBe(0);
    expect(isWalkable(w, { x: 500, y: 500 })).toBe(true);
    getSoldier(w, id)!.x = 500;
    run(w, 120, { [id]: walk(0, -1) });
    expect(getSoldier(w, id)!.y).toBeLessThan(450);
  });

  it('raising a drawbridge pushes soldiers on it off to the nearer end', () => {
    const w = world(
      river(
        { kind: 'draw' },
        { levers: [{ id: 'lever-1', position: { x: 600, y: 600 }, targetId: 'bridge-1' }] },
      ),
    );
    const north = soldierAt(w, { x: 500, y: 470 }, { controllable: false });
    const south = soldierAt(w, { x: 490, y: 540 }, { controllable: false });
    const puller = soldierAt(w, { x: 590, y: 600 });
    run(w, 1, { [puller]: { ...idle(), interact: true } });
    expect(w.state.bridges[0]!.state).toBe('raising');
    expect(getSoldier(w, north)!.y).toBeLessThan(450);
    expect(getSoldier(w, south)!.y).toBeGreaterThan(550);
  });

  it('destructible bridge: shooting the charge collapses it for good, killing anyone on it', () => {
    const w = world(river({ kind: 'destructible', charge: { x: 500, y: 455 } }));
    const victim = soldierAt(w, { x: 500, y: 500 }, { controllable: false });
    const leadIn = soldierAt(w, { x: 470, y: 530 }, { controllable: false, minHp: 1 });
    const shooter = soldierAt(w, { x: 500, y: 300 });
    expect(getView(w).bridges[0]!.charge).toMatchObject({ hp: T.bridge.chargeHp });
    const events = run(w, 60, { [shooter]: { ...idle(Math.PI / 2), fire: true } });
    expect(ofKind(events, 'bridgeChanged')).toEqual([
      expect.objectContaining({ state: 'destroyed' }),
    ]);
    expect(getSoldier(w, victim)).toMatchObject({ alive: false, deathCause: 'bridgeCollapse' });
    expect(getSoldier(w, leadIn)).toMatchObject({ alive: true, hp: 1 });
    expect(getSoldier(w, leadIn)!.y).toBeGreaterThan(550);
    expect(getView(w).bridges[0]!.charge).toBeUndefined();
    expect(isWalkable(w, { x: 500, y: 500 })).toBe(false);
  });
});

describe('objective', () => {
  it('destroying it emits objectiveDestroyed and completes the mission', () => {
    const w = world(arena({ objectives: [{ id: 'depot', position: { x: 500, y: 500 } }] }));
    const id = soldierAt(w, { x: 200, y: 500 });
    expect(getView(w).missionComplete).toBeNull();
    const events = run(w, 300, { [id]: { ...idle(0), fire: true } });
    const destroyed = ofKind(events, 'objectiveDestroyed');
    expect(destroyed).toEqual([expect.objectContaining({ id: 'depot', by: id })]);
    expect(getView(w).missionComplete).toEqual({ tick: destroyed[0]!.tick, by: id });
    expect(getView(w).objectives[0]).toMatchObject({ destroyed: true, hp: 0 });
  });
});
