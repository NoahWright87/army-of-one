import { describe, expect, it } from 'vitest';
import { MISSION_01 } from '../../content/maps/mission-01';
import { DEFAULT_TUNING } from '../../content/tuning';
import { hashState } from '../core/hash';
import { secondsToTicks, ticksToSeconds } from '../core/time';
import type { SoldierInput } from '../entities/soldier';
import { runScenario } from '../scenarios/driver';
import { findScenario, MISSION_01_SCENARIOS } from '../scenarios/mission-01';
import {
  createWorld,
  findPath,
  getSoldier,
  getView,
  pathLength,
  recentEvents,
  spawnSoldier,
  step,
  type World,
} from '../sim';

function scenario(name: string) {
  const sc = findScenario(name);
  if (!sc) throw new Error(`no scenario ${name}`);
  return sc;
}

describe('mission-01 layout', () => {
  it('has two initial spawn points and every entity type', () => {
    expect(MISSION_01.spawnPoints.map((s) => s.id)).toEqual(['road', 'beach']);
    expect(MISSION_01.spawnPoints.every((s) => s.kind === 'initial')).toBe(true);
    expect(MISSION_01.turrets!.length).toBeGreaterThan(0);
    expect(MISSION_01.mines!.length).toBeGreaterThan(0);
    expect(MISSION_01.trafficLanes!.length).toBeGreaterThan(0);
    expect(MISSION_01.gates!.length).toBeGreaterThan(0);
    expect(MISSION_01.bridges!.some((b) => b.kind === 'draw')).toBe(true);
    expect(MISSION_01.objectives).toHaveLength(1);
    expect(() => createWorld(MISSION_01, DEFAULT_TUNING)).not.toThrow();
  });

  it('crossing it unopposed (gate open, drawbridge down) is ~60–90 s of walking', () => {
    const w = createWorld(MISSION_01, DEFAULT_TUNING);
    w.state.gates[0]!.open = true;
    const draw = w.state.bridges.find((b) => b.id === 'drawbridge-1')!;
    draw.state = 'down';
    draw.progressTicks = 0;
    const depot = MISSION_01.objectives![0]!.position;
    for (const sp of MISSION_01.spawnPoints) {
      const path = findPath(w, sp.position, { x: depot.x - 100, y: depot.y })!;
      const seconds = pathLength(path) / DEFAULT_TUNING.soldier.speed;
      expect(seconds, sp.id).toBeGreaterThan(50);
      expect(seconds, sp.id).toBeLessThan(90);
    }
  });

  it('the beach is cut off until the drawbridge is lowered', () => {
    const w = createWorld(MISSION_01, DEFAULT_TUNING);
    const beach = MISSION_01.spawnPoints[1]!.position;
    expect(findPath(w, beach, { x: 4000, y: 2200 })).toBeNull();
  });
});

describe('mission-01 scenarios', () => {
  it('road-naive: walks the road into the turret and dies to it', () => {
    const res = runScenario(scenario('road-naive'), DEFAULT_TUNING);
    const s = getSoldier(res.world, res.soldierId)!;
    expect(s).toMatchObject({ alive: false, deathCause: 'turret' });
    // Dies somewhere around 40–55 s, near the turret.
    expect(ticksToSeconds(s.deathTick!)).toBeGreaterThan(35);
    expect(ticksToSeconds(s.deathTick!)).toBeLessThan(60);
    expect(Math.hypot(s.x - 4500, s.y - 1300)).toBeLessThan(DEFAULT_TUNING.turret.range);
  });

  it('road-snipe-turret: destroys the turret from out of its range, then the depot', () => {
    const res = runScenario(scenario('road-snipe-turret'), DEFAULT_TUNING);
    const s = getSoldier(res.world, res.soldierId)!;
    expect(res.completed).toBe(true);
    expect(s.hp).toBe(DEFAULT_TUNING.soldier.maxHp);
    expect(res.world.state.turrets[0]!.mode).toBe('destroyed');
    expect(res.world.state.missionComplete).toMatchObject({ by: res.soldierId });
  });

  it('road-gate: opens the gate and destroys the depot without meeting the turret', () => {
    const res = runScenario(scenario('road-gate'), DEFAULT_TUNING);
    expect(res.completed).toBe(true);
    expect(res.world.state.gates[0]!.open).toBe(true);
    expect(getSoldier(res.world, res.soldierId)!.hp).toBe(DEFAULT_TUNING.soldier.maxHp);
    const t = ticksToSeconds(res.world.state.missionComplete!.tick);
    expect(t).toBeGreaterThan(55);
    expect(t).toBeLessThan(90);
  });

  it('beach-naive: walks straight up the mine channel and dies to a mine', () => {
    const res = runScenario(scenario('beach-naive'), DEFAULT_TUNING);
    expect(getSoldier(res.world, res.soldierId)).toMatchObject({
      alive: false,
      deathCause: 'mine',
    });
  });

  it('beach-drawbridge: weaves through the mines, lowers the bridge, destroys the depot', () => {
    const res = runScenario(scenario('beach-drawbridge'), DEFAULT_TUNING);
    expect(res.completed).toBe(true);
    expect(res.world.state.mines.every((m) => m.state === 'idle')).toBe(true);
    expect(res.world.state.missionComplete).not.toBeNull();
  });

  it.each(MISSION_01_SCENARIOS.map((s) => s.name))(
    '%s is deterministic: identical hash every tick across two runs',
    (name) => {
      const hashes: string[] = [];
      runScenario(scenario(name), DEFAULT_TUNING, (w) => hashes.push(hashState(w.state)));
      let i = 0;
      runScenario(scenario(name), DEFAULT_TUNING, (w) => {
        expect(hashState(w.state), `tick ${w.state.tick}`).toBe(hashes[i]);
        i++;
      });
      expect(i).toBe(hashes.length);
    },
  );
});

describe('mission-01 world', () => {
  /** A live soldier walking east and firing, plus traffic and turret: exercises most of the state. */
  const input = (t: number): SoldierInput => ({
    move: { x: 1, y: t % 400 < 200 ? 0.3 : -0.3 },
    aim: t * 0.01,
    fire: t % 30 === 0,
    interact: t % 50 === 0,
  });
  const runFor = (w: World, id: string, from: number, to: number) => {
    for (let t = from; t < to; t++) step(w, new Map([[id, input(t)]]));
  };

  it('state survives structuredClone: a restored snapshot continues identically', () => {
    const a = createWorld(MISSION_01, DEFAULT_TUNING);
    const id = spawnSoldier(a, 'road');
    runFor(a, id, 0, 900);
    const b = createWorld(MISSION_01, DEFAULT_TUNING);
    b.state = structuredClone(a.state);
    expect(hashState(b.state)).toBe(hashState(a.state));
    for (let t = 900; t < 1500; t++) {
      step(a, new Map([[id, input(t)]]));
      step(b, new Map([[id, input(t)]]));
      expect(hashState(b.state)).toBe(hashState(a.state));
    }
  });

  it('getView exposes every entity from real state', () => {
    const w = createWorld(MISSION_01, DEFAULT_TUNING);
    spawnSoldier(w, 'road');
    spawnSoldier(w, 'beach');
    step(w, new Map());
    const v = getView(w);
    expect(v.soldiers).toHaveLength(2);
    expect(v.turrets).toHaveLength(MISSION_01.turrets!.length);
    expect(v.mines).toHaveLength(MISSION_01.mines!.length);
    expect(v.vehicles.length).toBeGreaterThan(0); // prewarmed traffic
    expect(v.gates).toEqual([expect.objectContaining({ id: 'gate-1', open: false })]);
    expect(v.levers.map((l) => l.on)).toEqual([false, false, false, false]);
    expect(v.bridges.map((b) => [b.id, b.state, b.raised])).toEqual([
      ['bridge-road', 'down', 0],
      ['drawbridge-1', 'up', 1],
    ]);
    expect(v.bridges[0]!.charge).toBeDefined();
    expect(v.objectives[0]).toMatchObject({ id: 'depot', destroyed: false });
    expect(v.missionComplete).toBeNull();
    expect(v.events.map((e) => e.kind)).toEqual(['soldierSpawned', 'soldierSpawned']);
    // The view is a copy: mutating it doesn't touch the sim.
    v.soldiers[0]!.x = -1;
    expect(getSoldier(w, 'S1')!.x).not.toBe(-1);
  });

  it('keeps recent events in a ring buffer', () => {
    const w = createWorld(MISSION_01, { ...DEFAULT_TUNING, eventLogCapacity: 5 });
    const id = spawnSoldier(w, 'road');
    for (let t = 0; t < secondsToTicks(3); t++) {
      step(w, new Map([[id, { move: { x: 0, y: 0 }, aim: 0, fire: true, interact: false }]]));
    }
    const log = recentEvents(w);
    expect(log).toHaveLength(5);
    expect(log.every((e, i) => i === 0 || e.tick >= log[i - 1]!.tick)).toBe(true);
    // Newest last: the most recent shot (one every rifle cooldown).
    expect(log[log.length - 1]!.tick).toBeGreaterThan(w.state.tick - 10);
    expect(log[0]!.tick).toBeGreaterThan(0);
  });
});
