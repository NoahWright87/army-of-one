import { describe, expect, it } from 'vitest';
import { formatBattleTime, secondsToTicks, ticksToSeconds, TICKS_PER_SECOND } from '../core/time';
import { angleOf, clampLength, fromAngle, normalize, wrapAngle, length } from '../core/vec';
import { compareIds, allocateId } from '../core/ids';
import { hashState } from '../core/hash';
import { createRng, nextFloat } from '../core/rng';

describe('time', () => {
  it('converts between ticks and seconds', () => {
    expect(TICKS_PER_SECOND).toBe(60);
    expect(secondsToTicks(2)).toBe(120);
    expect(secondsToTicks(1 / 120)).toBe(1); // half rounds up
    expect(ticksToSeconds(90)).toBe(1.5);
  });
  it('formats battle time', () => {
    expect(formatBattleTime(0)).toBe('0:00');
    expect(formatBattleTime(59)).toBe('0:00');
    expect(formatBattleTime(60 * 65)).toBe('1:05');
    expect(formatBattleTime(-60 * 3)).toBe('-0:03');
  });
});

describe('vec', () => {
  it('follows the y-down, clockwise-positive angle convention', () => {
    expect(angleOf({ x: 0, y: 1 })).toBeCloseTo(Math.PI / 2); // "down" on screen
    const v = fromAngle(Math.PI / 2);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
  });
  it('normalizes and clamps', () => {
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(length(normalize({ x: 3, y: 4 }))).toBeCloseTo(1);
    expect(length(clampLength({ x: 1, y: 1 }, 1))).toBeCloseTo(1);
    expect(clampLength({ x: 0.5, y: 0 }, 1)).toEqual({ x: 0.5, y: 0 });
  });
  it('wraps angles into (-π, π]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5);
  });
});

describe('ids', () => {
  it('allocates sequentially and sorts numerically', () => {
    const c = {};
    expect(allocateId(c, 'S')).toBe('S1');
    expect(allocateId(c, 'S')).toBe('S2');
    expect(allocateId(c, 'E')).toBe('E1');
    expect(['S10', 'S2', 'S1'].sort(compareIds)).toEqual(['S1', 'S2', 'S10']);
  });
});

describe('hashState', () => {
  it('ignores key order and distinguishes values', () => {
    expect(hashState({ a: 1, b: [1, 2] })).toBe(hashState({ b: [1, 2], a: 1 }));
    expect(hashState({ a: 1 })).not.toBe(hashState({ a: 2 }));
    expect(hashState([1, 2])).not.toBe(hashState([2, 1]));
  });
});

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = [nextFloat(a), nextFloat(a), nextFloat(a)];
    expect([nextFloat(b), nextFloat(b), nextFloat(b)]).toEqual(seqA);
    for (const x of seqA) expect(x).toBeGreaterThanOrEqual(0);
  });
});
