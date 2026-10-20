import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { distance } from '../core/vec';
import { toggleGate } from '../entities/gate';
import { getSoldier } from '../sim';
import { dynamicBlockers } from '../world/blockers';
import {
  createNavGrid,
  findPath,
  isSegmentWalkable,
  isWalkable,
  pathLength,
  syncNav,
  syncNavBlockers,
} from '../world/nav';
import { arena, run, soldierAt, walk, world } from './helpers';

describe('soft separation', () => {
  it('a soldier squirms through a 10-soldier clump', () => {
    const w = world(arena());
    for (let i = 0; i < 10; i++) {
      soldierAt(
        w,
        { x: 500 + (i % 3) * 2, y: 500 + Math.floor(i / 3) * 2 },
        { controllable: false },
      );
    }
    const live = soldierAt(w, { x: 420, y: 501 });
    let minStep = Infinity;
    for (let t = 0; t < 100; t++) {
      const before = getSoldier(w, live)!.x;
      run(w, 1, { [live]: walk(1, 0) });
      minStep = Math.min(minStep, getSoldier(w, live)!.x - before);
    }
    // Never hard-stopped, and it ends up well past the clump.
    expect(minStep).toBeGreaterThan(0.5);
    expect(getSoldier(w, live)!.x).toBeGreaterThan(600);
  });

  it('pushes overlapping soldiers apart softly until they no longer overlap', () => {
    const w = world(arena());
    const ids = Array.from({ length: 10 }, () =>
      soldierAt(w, { x: 500, y: 500 }, { controllable: false }),
    );
    run(w, 1);
    const first = getSoldier(w, ids[1]!)!;
    // Capped per tick: nobody flies off.
    expect(distance(first, { x: 500, y: 500 })).toBeLessThanOrEqual(
      DEFAULT_TUNING.separation.maxPushPerTick + 1e-9,
    );
    run(w, 300);
    const ss = ids.map((id) => getSoldier(w, id)!);
    let minD = Infinity;
    for (let i = 0; i < ss.length; i++) {
      for (let j = i + 1; j < ss.length; j++) minD = Math.min(minD, distance(ss[i]!, ss[j]!));
    }
    expect(minD).toBeGreaterThan(DEFAULT_TUNING.soldier.blockerRadius * 2 * 0.9);
    // Liquid, not explosive: the crowd stays compact.
    for (const s of ss) expect(distance(s, { x: 500, y: 500 })).toBeLessThan(40);
  });

  it('kinematic soldiers push but are never pushed', () => {
    const w = world(arena());
    const echo = soldierAt(w, { x: 500, y: 500 }, { controllable: false, kinematic: true });
    const other = soldierAt(w, { x: 503, y: 500 }, { controllable: false });
    run(w, 30);
    expect(getSoldier(w, echo)).toMatchObject({ x: 500, y: 500 });
    expect(getSoldier(w, other)!.x).toBeGreaterThan(503);
  });

  it('static soldiers do not collide', () => {
    const w = world(arena());
    const ghost = soldierAt(w, { x: 500, y: 500 }, { controllable: false, interactive: false });
    const other = soldierAt(w, { x: 501, y: 500 }, { controllable: false });
    run(w, 30);
    expect(getSoldier(w, ghost)).toMatchObject({ x: 500, y: 500 });
    expect(getSoldier(w, other)).toMatchObject({ x: 501, y: 500 });
  });
});

describe('nav', () => {
  const gateMap = arena({
    walls: [
      { x: 480, y: 0, w: 40, h: 400 },
      { x: 480, y: 600, w: 40, h: 400 },
    ],
    gates: [{ id: 'gate-1', rect: { x: 480, y: 400, w: 40, h: 200 }, initiallyOpen: true }],
  });

  it('finds a smoothed path around walls; every segment is walkable', () => {
    const w = world(arena({ walls: [{ x: 480, y: 200, w: 40, h: 780 }] }));
    const from = { x: 200, y: 700 };
    const to = { x: 800, y: 700 };
    const path = findPath(w, from, to)!;
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
    expect(path.length).toBeLessThan(8); // smoothed, not one point per cell
    for (let i = 1; i < path.length; i++) {
      expect(isSegmentWalkable(w, path[i - 1]!, path[i]!)).toBe(true);
    }
    // Has to go over the top of the wall (y < 200).
    expect(Math.min(...path.map((p) => p.y))).toBeLessThan(200);
    expect(pathLength(path)).toBeGreaterThan(distance(from, to));
  });

  it('straight line when nothing is in the way', () => {
    const w = world(arena());
    expect(findPath(w, { x: 100, y: 100 }, { x: 900, y: 900 })).toEqual([
      { x: 100, y: 100 },
      { x: 900, y: 900 },
    ]);
    expect(
      pathLength([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
        { x: 3, y: 10 },
      ]),
    ).toBe(11);
  });

  it('does not cut corners through a diagonal gap', () => {
    // Two blocks touching only at a corner: no way through the corner point.
    const w = world(
      arena({
        walls: [
          { x: 20, y: 20, w: 480, h: 480 },
          { x: 500, y: 500, w: 480, h: 480 },
        ],
      }),
    );
    expect(findPath(w, { x: 700, y: 200 }, { x: 300, y: 800 })).toBeNull();
  });

  it('reacts to dynamic blockers: a closing gate cuts the route', () => {
    const w = world(gateMap);
    const from = { x: 200, y: 500 };
    const to = { x: 800, y: 500 };
    expect(findPath(w, from, to)).not.toBeNull();
    expect(isWalkable(w, { x: 500, y: 500 })).toBe(true);
    toggleGate(w, 0);
    expect(isWalkable(w, { x: 500, y: 500 })).toBe(false);
    expect(findPath(w, from, to)).toBeNull();
    toggleGate(w, 0);
    expect(findPath(w, from, to)).not.toBeNull();
  });

  it('incremental sync matches a grid built from scratch, including after a snapshot restore', () => {
    const w = world(gateMap);
    syncNav(w);
    const snapshot = structuredClone(w.state);
    toggleGate(w, 0);
    syncNav(w);
    const fresh = () => {
      const g = createNavGrid(w.map.width, w.map.height, w.solids, w.tuning);
      syncNavBlockers(g, dynamicBlockers(w));
      return g;
    };
    expect(w.nav.dynCount).toEqual(fresh().dynCount);
    w.state = snapshot;
    syncNav(w);
    expect(w.nav.dynCount).toEqual(fresh().dynCount);
    expect(isWalkable(w, { x: 500, y: 500 })).toBe(true);
  });

  it('is deterministic', () => {
    const a = world(arena({ walls: [{ x: 300, y: 100, w: 400, h: 400 }] }));
    const b = world(arena({ walls: [{ x: 300, y: 100, w: 400, h: 400 }] }));
    expect(findPath(a, { x: 500, y: 60 }, { x: 500, y: 700 })).toEqual(
      findPath(b, { x: 500, y: 60 }, { x: 500, y: 700 }),
    );
  });

  it('snaps a start hugging a wall to the nearest open cell', () => {
    const w = world(arena({ walls: [{ x: 600, y: 600, w: 200, h: 200 }] }));
    // 10 units from the border wall: legal for a soldier, but its cell center is too close.
    const path = findPath(w, { x: 30, y: 500 }, { x: 900, y: 500 });
    expect(path).not.toBeNull();
    // A goal deep inside a wall is unreachable.
    expect(findPath(w, { x: 500, y: 500 }, { x: 700, y: 700 })).toBeNull();
  });
});
