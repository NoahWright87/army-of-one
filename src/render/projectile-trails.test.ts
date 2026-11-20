import { describe, expect, it } from 'vitest';
import { ProjectileTrails, projectileStyle } from './projectile-trails';

const position = (x: number, y = 0) => [{ id: 'bullet', x, y }];

describe('projectile travel history', () => {
  it('ends at the interpolated head and clips the tail by age', () => {
    const trails = new ProjectileTrails();
    for (let tick = 0; tick <= 4; tick++) trails.record(tick, position(tick * 10));
    const segments = trails.segments('bullet', 35, 0, 3.5, 2.4, 100);
    expect(segments[0]?.x0).toBe(35);
    expect(segments.at(-1)?.x1).toBeCloseTo(11);
    expect(segments.every((s) => s.x0 <= 35 && s.x1 < s.x0)).toBe(true);
    expect(segments[0]!.strength).toBeGreaterThan(segments.at(-1)!.strength);
  });

  it('caps distance along the actual path, including corners', () => {
    const trails = new ProjectileTrails();
    trails.record(0, position(0));
    trails.record(1, position(20));
    trails.record(2, position(20, 20));
    const segments = trails.segments('bullet', 20, 20, 2, 10, 30);
    expect(segments.map((s) => [s.x0, s.y0, s.x1, s.y1])).toEqual([
      [20, 20, 20, 10],
      [20, 10, 20, 0],
      [20, 0, 10, 0],
    ]);
  });

  it('drops stopped projectiles immediately, with no path carried into reused ids', () => {
    const trails = new ProjectileTrails();
    trails.record(0, position(0));
    trails.record(1, position(20));
    trails.record(2, []);
    expect(trails.segments('bullet', 20, 0, 2, 3, 50)).toEqual([]);
    trails.record(3, position(40));
    expect(trails.segments('bullet', 40, 0, 3, 3, 50)).toEqual([]);
  });

  it('resets on seeks, skipped views and teleport jumps', () => {
    for (const [nextTick, nextX] of [
      [0, 20],
      [5, 20],
      [2, 600],
    ]) {
      const trails = new ProjectileTrails();
      trails.record(0, position(0));
      trails.record(1, position(10));
      trails.record(nextTick!, position(nextX!));
      expect(trails.segments('bullet', nextX!, 0, nextTick!, 5, 100)).toEqual([]);
    }
  });

  it('does not change while paused, and bounds history in long flights', () => {
    const trails = new ProjectileTrails();
    for (let tick = 0; tick <= 1000; tick++) trails.record(tick, position(tick));
    const first = structuredClone(trails.segments('bullet', 1000, 0, 1000, 100, 100));
    expect(first).toHaveLength(7);
    expect(trails.segments('bullet', 1000, 0, 1000, 100, 100)).toEqual(first);
  });

  it('does not invent travel before the first observed position', () => {
    const trails = new ProjectileTrails();
    trails.record(10, position(100));
    expect(trails.segments('bullet', 100, 0, 10, 3, 50)).toEqual([]);
  });
});

it('distinguishes enemies and subdues echoes within the player palette', () => {
  const live = projectileStyle(false, 'S1', 'S1');
  const echo = projectileStyle(false, 'S2', 'S1');
  const hostile = projectileStyle(true, 'S3', 'S1');
  expect(echo.alpha).toBeLessThan(live.alpha);
  expect(hostile.color).not.toBe(live.color);
  expect(projectileStyle(false, undefined, null)).toEqual(live);
  expect(projectileStyle(false, 'S1', null)).toEqual(echo);
});
