import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { TEST_RANGE } from '../../content/maps/test-range';
import { hashState } from '../core/hash';
import { circleRectPush, moveCircle } from '../world/collision';
import { createWorld, getSoldier, getView, spawnSoldier, step, type World } from '../sim';
import type { SoldierInput } from '../entities/soldier';

describe('collision', () => {
  const wall = { x: 100, y: 0, w: 20, h: 200 };
  it('pushes a circle out of a rect', () => {
    const p = circleRectPush({ x: 95, y: 50 }, 10, wall);
    expect(p.x).toBeCloseTo(-5);
    expect(p.y).toBeCloseTo(0);
  });
  it('slides along a wall instead of stopping', () => {
    const end = moveCircle({ x: 80, y: 50 }, { x: 30, y: 30 }, 10, [wall]);
    expect(end.x).toBeLessThanOrEqual(90 + 1e-9);
    expect(end.y).toBeCloseTo(80);
  });
  it('does not tunnel through thin walls at high speed', () => {
    const end = moveCircle({ x: 80, y: 50 }, { x: 200, y: 0 }, 10, [wall]);
    expect(end.x).toBeLessThan(100);
  });
});

/** A scripted input: walk a square while sweeping aim. */
function scriptedInput(tick: number): SoldierInput {
  const phase = Math.floor(tick / 90) % 4;
  const dirs = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ];
  return { move: dirs[phase]!, aim: tick * 0.05, fire: false, interact: false };
}

function runScript(ticks: number): World {
  const world = createWorld(TEST_RANGE, DEFAULT_TUNING);
  const id = spawnSoldier(world, 'west');
  for (let t = 0; t < ticks; t++) step(world, new Map([[id, scriptedInput(t)]]));
  return world;
}

describe('world', () => {
  it('moves a soldier at the tuned speed', () => {
    const world = createWorld(TEST_RANGE, DEFAULT_TUNING);
    const id = spawnSoldier(world, 'west');
    const input: SoldierInput = { move: { x: 1, y: 0 }, aim: 0, fire: false, interact: false };
    for (let t = 0; t < 60; t++) step(world, new Map([[id, input]]));
    expect(getSoldier(world, id)!.x).toBeCloseTo(120 + DEFAULT_TUNING.soldier.speed);
    expect(world.state.tick).toBe(60);
  });

  it('keeps soldiers inside walls and out of water', () => {
    const world = createWorld(TEST_RANGE, DEFAULT_TUNING);
    const id = spawnSoldier(world, 'west');
    const input: SoldierInput = { move: { x: -1, y: 0 }, aim: 0, fire: false, interact: false };
    for (let t = 0; t < 600; t++) step(world, new Map([[id, input]]));
    expect(getSoldier(world, id)!.x).toBeGreaterThanOrEqual(
      20 + DEFAULT_TUNING.soldier.wallRadius - 1e-6,
    );
  });

  it('is deterministic: same script, same hash, every tick', () => {
    const a = createWorld(TEST_RANGE, DEFAULT_TUNING);
    const b = createWorld(TEST_RANGE, DEFAULT_TUNING);
    const ia = spawnSoldier(a, 'west');
    const ib = spawnSoldier(b, 'west');
    for (let t = 0; t < 600; t++) {
      step(a, new Map([[ia, scriptedInput(t)]]));
      step(b, new Map([[ib, scriptedInput(t)]]));
      expect(hashState(a.state)).toBe(hashState(b.state));
    }
  });

  it('state survives a structured-clone snapshot round trip', () => {
    const w = runScript(300);
    const clone = structuredClone(w.state);
    expect(hashState(clone)).toBe(hashState(w.state));
  });

  it('exposes a soldier view', () => {
    const w = runScript(10);
    const v = getView(w);
    expect(v.soldiers).toHaveLength(1);
    expect(v.soldiers[0]).toMatchObject({ kind: 'soldier', id: 'S1', role: 'live', alive: true });
  });
});
