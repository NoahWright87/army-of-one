import { describe, expect, it } from 'vitest';
import { TEST_RANGE } from '../../content/maps/test-range';
import { DEFAULT_TUNING } from '../../content/tuning';
import type {
  AttemptObservation,
  LaneFate,
  LaneTruth,
  RecordingSegment,
  SoldierRecord,
  TimelineMarker,
  Waypoint,
} from '../../contracts/mission';
import { createRng, nextFloat, nextInt } from '../../sim/core/rng';
import type { MapDef } from '../../sim/world/map';
import {
  destroyedRefs,
  knownThings,
  poseAtRecord,
  RevealGrid,
  revealedRuns,
  revealOptions,
  type RevealOptions,
} from '../reveal';
import { applyObservation } from '../truth';

const OPTS: RevealOptions = { radius: 200, cellSize: 50, occludeByWalls: false, sampleTicks: 10 };

/** Straight walk from a to b, one waypoint per tick ([E7]). */
function walk(
  start: number,
  end: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): Waypoint[] {
  const out: Waypoint[] = [];
  for (let t = start; t <= end; t++) {
    const k = end === start ? 0 : (t - start) / (end - start);
    out.push({ t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, facing: 0 });
  }
  return out;
}

function seg(waypoints: Waypoint[], endReason: RecordingSegment['endReason'] = 'death') {
  return {
    startTick: waypoints[0]!.t,
    endTick: waypoints[waypoints.length - 1]!.t,
    waypoints,
    actions: [],
    endReason,
  };
}

function soldier(n: number, ...segments: RecordingSegment[]): SoldierRecord {
  return {
    id: `S${n}`,
    ordinal: n,
    spawnPointId: 'west',
    spawnTick: segments[0]!.startTick,
    segments,
  };
}

function obs(
  attempt: number,
  toTick: number,
  lanes: Record<string, LaneFate>,
  markers: TimelineMarker[] = [],
): AttemptObservation {
  return { kind: 'attempt', attempt, fromTick: 0, toTick, lanes, markers, endReason: 'death' };
}

const fold = (lanes: LaneTruth[], soldiers: SoldierRecord[], o: AttemptObservation) =>
  applyObservation(lanes, soldiers, o).lanes;

// S1 walks west → east along y = 600 over 10 s (600 ticks).
const S1 = soldier(1, seg(walk(0, 600, { x: 100, y: 600 }, { x: 1500, y: 600 })));

describe('reveal grid', () => {
  it('reads its options from tuning', () => {
    expect(revealOptions(DEFAULT_TUNING)).toEqual({
      radius: DEFAULT_TUNING.reveal.radius,
      cellSize: DEFAULT_TUNING.reveal.cellSize,
      occludeByWalls: false,
      sampleTicks: DEFAULT_TUNING.reveal.sampleTicks,
    });
  });

  it('reveals around where a soldier was alive, and nothing else', () => {
    const lanes = fold([], [S1], obs(1, 600, { S1: { kind: 'died', tick: 600, cause: 'turret' } }));
    const g = new RevealGrid(TEST_RANGE, OPTS);
    expect(g.revealedCount).toBe(0);
    g.update([S1], lanes);
    expect(g.isRevealedAt(100, 600)).toBe(true);
    expect(g.isRevealedAt(800, 600)).toBe(true);
    expect(g.isRevealedAt(800, 760)).toBe(true); // within the radius
    expect(g.isRevealedAt(800, 1100)).toBe(false); // 500 away
    expect(g.isRevealedAt(800, 100)).toBe(false);
    expect(g.fraction).toBeGreaterThan(0.1);
    expect(g.fraction).toBeLessThan(0.5);
  });

  it('unresolved lanes reveal nothing until the truth confirms them', () => {
    const g = new RevealGrid(TEST_RANGE, OPTS);
    const unresolved = applyObservation([], [S1], obs(1, -1, {})).lanes;
    expect(unresolved[0]!.spans[0]!.kind).toBe('unresolved');
    g.update([S1], unresolved);
    expect(g.revealedCount).toBe(0);
  });

  it('un-reveals when the truth changes: the soldier now dies earlier', () => {
    let lanes = fold([], [S1], obs(1, 600, { S1: { kind: 'static', tick: 600 } }));
    const g = new RevealGrid(TEST_RANGE, OPTS);
    g.update([S1], lanes);
    expect(g.isRevealedAt(1450, 600)).toBe(true);
    const v = g.version;
    // A later attempt: S1 dies at 3 s (x ≈ 520). Its lost tail no longer reveals anything ([D2]).
    lanes = fold(lanes, [S1], obs(2, 600, { S1: { kind: 'died', tick: 180, cause: 'mine' } }));
    expect(g.update([S1], lanes)).toBe(1);
    expect(g.version).toBeGreaterThan(v);
    expect(g.isRevealedAt(520, 600)).toBe(true);
    expect(g.isRevealedAt(1450, 600)).toBe(false);
    expect(g.isRevealedAt(1000, 600)).toBe(false);
  });

  it('only re-samples lanes that changed', () => {
    const S2 = soldier(2, seg(walk(120, 400, { x: 800, y: 1100 }, { x: 800, y: 300 })));
    const all = [S1, S2];
    let lanes = fold(
      [],
      all,
      obs(1, 600, { S1: { kind: 'static', tick: 600 }, S2: { kind: 'static', tick: 400 } }),
    );
    const g = new RevealGrid(TEST_RANGE, OPTS);
    expect(g.update(all, lanes)).toBe(2);
    expect(g.update(all, lanes)).toBe(0);
    // A resolve pass that only touches S2.
    lanes = applyObservation(lanes, all, {
      ...obs(2, 600, { S2: { kind: 'died', tick: 200, cause: 'turret' } }),
      kind: 'resolve',
      endReason: 'resolved',
    }).lanes;
    expect(g.update(all, lanes)).toBe(1);
    // Dropping a lane un-reveals what only it saw.
    expect(g.isRevealedAt(800, 1150)).toBe(true);
    expect(
      g.update(
        [S1],
        lanes.filter((l) => l.soldierId === 'S1'),
      ),
    ).toBe(1);
    expect(g.isRevealedAt(800, 1150)).toBe(false);
  });

  it('incremental updates equal a full recompute (random histories)', () => {
    const rng = createRng(7);
    const map: MapDef = { ...TEST_RANGE };
    const soldiers: SoldierRecord[] = [];
    for (let i = 1; i <= 12; i++) {
      const start = nextInt(rng, 0, 300);
      const end = start + nextInt(rng, 60, 900);
      const a = { x: nextFloat(rng) * 1600, y: nextFloat(rng) * 1200 };
      const b = { x: nextFloat(rng) * 1600, y: nextFloat(rng) * 1200 };
      soldiers.push(soldier(i, seg(walk(start, end, a, b))));
    }
    const g = new RevealGrid(map, OPTS);
    let lanes: LaneTruth[] = [];
    for (let attempt = 1; attempt <= 15; attempt++) {
      const fates: Record<string, LaneFate> = {};
      for (const s of soldiers) {
        const end = s.segments[0]!.endTick;
        const r = nextFloat(rng);
        fates[s.id] =
          r < 0.4
            ? { kind: 'died', tick: nextInt(rng, s.spawnTick, end), cause: 'x' }
            : r < 0.7
              ? { kind: 'static', tick: end }
              : r < 0.85
                ? { kind: 'interrupted', tick: nextInt(rng, s.spawnTick, end), reason: 'gate' }
                : { kind: 'neverSpawned', reason: 'lost' };
      }
      const from = nextInt(rng, 0, 600);
      lanes = applyObservation(lanes, soldiers, {
        ...obs(attempt, from + nextInt(rng, 0, 900), fates),
        fromTick: from,
      }).lanes;
      g.update(soldiers, lanes);
      const full = new RevealGrid(map, OPTS);
      full.update(soldiers, lanes);
      expect(g.snapshot()).toEqual(full.snapshot());
      expect(g.revealedCount).toBe(full.revealedCount);
    }
  });

  it('interpolates sparse recordings (no gaps between waypoints)', () => {
    const sparse = soldier(
      1,
      seg([
        { t: 0, x: 100, y: 600, facing: 0 },
        { t: 600, x: 1500, y: 600, facing: 0 },
      ]),
    );
    expect(poseAtRecord(sparse, 300)).toEqual({ x: 800, y: 600 });
    const lanes = fold([], [sparse], obs(1, 600, { S1: { kind: 'static', tick: 600 } }));
    const g = new RevealGrid(TEST_RANGE, OPTS);
    g.update([sparse], lanes);
    for (let x = 100; x <= 1500; x += 25) expect(g.isRevealedAt(x, 600)).toBe(true);
  });

  it('the live layer reveals while exploring and clears', () => {
    const g = new RevealGrid(TEST_RANGE, OPTS);
    expect(g.revealLive(800, 600)).toBe(true);
    expect(g.revealLive(805, 605)).toBe(false); // same cell
    expect(g.isRevealedAt(800, 450)).toBe(true);
    g.clearLive();
    expect(g.revealedCount).toBe(0);
  });

  it('walls can block the reveal (occludeByWalls)', () => {
    const map: MapDef = {
      ...TEST_RANGE,
      walls: [{ x: 500, y: 0, w: 40, h: 1200 }],
    };
    const S = soldier(1, seg(walk(0, 60, { x: 420, y: 600 }, { x: 420, y: 600 })));
    const lanes = fold([], [S], obs(1, 60, { S1: { kind: 'static', tick: 60 } }));
    const open = new RevealGrid(map, OPTS);
    open.update([S], lanes);
    const occl = new RevealGrid(map, { ...OPTS, occludeByWalls: true });
    occl.update([S], lanes);
    expect(open.isRevealedAt(600, 600)).toBe(true);
    expect(occl.isRevealedAt(600, 600)).toBe(false); // behind the wall
    expect(occl.isRevealedAt(300, 600)).toBe(true);
    expect(occl.isRevealedAt(520, 600)).toBe(true); // the wall itself is seen
  });

  it('merges revealed cells into runs', () => {
    const g = new RevealGrid({ width: 500, height: 100, walls: [] }, { ...OPTS, radius: 1 });
    g.revealLive(25, 25);
    g.revealLive(75, 25);
    g.revealLive(225, 75);
    expect(revealedRuns(g)).toEqual([0, 0, 2, 4, 1, 1]);
  });
});

describe('known things', () => {
  const MAP: MapDef = {
    ...TEST_RANGE,
    turrets: [
      { id: 'turret-near', position: { x: 800, y: 700 }, facing: 0 },
      { id: 'turret-far', position: { x: 800, y: 1100 }, facing: 0 },
    ],
    mines: [{ id: 'mine-1', position: { x: 300, y: 650 } }],
    trafficLanes: [{ id: 'lane-1', from: { x: 1000, y: -100 }, to: { x: 1000, y: 1300 } }],
    gates: [{ id: 'gate-far', rect: { x: 100, y: 50, w: 100, h: 20 }, initiallyOpen: false }],
    objectives: [{ id: 'depot', position: { x: 1500, y: 100 } }],
  };

  it('shows revealed threats, destroyed status, and always the objective', () => {
    const kill: TimelineMarker = {
      soldierId: 'S1',
      tick: 200,
      kind: 'kill',
      stringKey: 'marker.kill',
      refId: 'turret-near',
    };
    const lanes = fold(
      [],
      [S1],
      obs(1, 600, { S1: { kind: 'died', tick: 600, cause: 'turret' } }, [kill]),
    );
    const g = new RevealGrid(MAP, OPTS);
    g.update([S1], lanes);
    const k = knownThings(MAP, g, [S1], lanes);
    const ids = k.threats.map((t) => t.id).sort();
    expect(ids).toEqual(['lane-1', 'mine-1', 'turret-near']);
    const near = k.threats.find((t) => t.id === 'turret-near');
    expect(near).toMatchObject({ kind: 'turret', destroyed: { tick: 200, by: 'S1' } });
    expect(k.threats.find((t) => t.id === 'mine-1')).toMatchObject({ destroyed: null });
    // The traffic lane is clipped to the map.
    expect(k.threats.find((t) => t.id === 'lane-1')).toMatchObject({ y: 0, y2: 1200 });
    // The objective is unrevealed but always known.
    expect(g.isRevealedAt(1500, 100)).toBe(false);
    expect(k.objectives).toEqual([{ kind: 'destroy', id: 'depot', x: 1500, y: 100, done: null }]);
    expect(k.spawns.map((s) => s.id)).toEqual(['west', 'south']);
  });

  it('destroyed status follows the truth: a kill that no longer happens is dropped', () => {
    const kill: TimelineMarker = {
      soldierId: 'S1',
      tick: 500,
      kind: 'kill',
      stringKey: 'marker.kill',
      refId: 'turret-near',
    };
    let lanes = fold([], [S1], obs(1, 600, { S1: { kind: 'static', tick: 600 } }, [kill]));
    expect(destroyedRefs(lanes).get('turret-near')).toEqual({ tick: 500, by: 'S1' });
    lanes = fold(lanes, [S1], obs(2, 600, { S1: { kind: 'died', tick: 300, cause: 'mine' } }));
    expect(destroyedRefs(lanes).has('turret-near')).toBe(false);
  });

  it('places X at death positions and O at the end of resumable recordings', () => {
    const S2 = soldier(2, seg(walk(120, 400, { x: 800, y: 1100 }, { x: 800, y: 300 }), 'death'));
    const all = [S1, S2];
    const lanes = fold(
      [],
      all,
      obs(1, 600, {
        S1: { kind: 'died', tick: 300, cause: 'turret' },
        S2: { kind: 'static', tick: 400 },
      }),
    );
    const g = new RevealGrid(MAP, OPTS);
    g.update(all, lanes);
    const k = knownThings(MAP, g, all, lanes);
    expect(k.ends).toEqual([
      { soldierId: 'S1', ordinal: 1, kind: 'death', tick: 300, x: 800, y: 600 },
      { soldierId: 'S2', ordinal: 2, kind: 'open', tick: 400, x: 800, y: 300 },
    ]);
  });

  it('forward spawns appear once their capture point is ours', () => {
    const map: MapDef = {
      ...TEST_RANGE,
      capturePoints: [
        { id: 'cp-a', nameKey: 'cp.a', position: { x: 1400, y: 1000 } },
        { id: 'cp-hq', nameKey: 'cp.hq', position: { x: 1400, y: 100 }, objective: true },
      ],
      spawnPoints: [
        ...TEST_RANGE.spawnPoints,
        {
          id: 'fwd',
          nameKey: 'spawn.fwd',
          position: { x: 1400, y: 1000 },
          facing: 0,
          kind: 'capture',
          capturePointId: 'cp-a',
        },
      ],
    };
    const g = new RevealGrid(map, OPTS);
    let k = knownThings(map, g, [], []);
    expect(k.spawns.map((s) => s.id)).toEqual(['west', 'south']);
    expect(k.capturePoints).toEqual([]);
    expect(k.objectives).toMatchObject([{ kind: 'flag', id: 'cp-hq', done: null }]);
    k = knownThings(
      map,
      g,
      [],
      [],
      [{ pointId: 'cp-a', stage: 'ours', tick: 900, by: ['S1'], observedInAttempt: 1 }],
    );
    expect(k.spawns.find((s) => s.id === 'fwd')).toMatchObject({ open: true, kind: 'capture' });
    expect(k.capturePoints).toMatchObject([{ id: 'cp-a', oursTick: 900 }]);
  });
});
