import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import type { SoldierRecord } from '../../contracts/mission';
import { FACING_QUANTUM, POSITION_QUANTUM } from '../../contracts/quantize';
import { SnapshotStore, type WorldSnapshot } from '../attempt/snapshots';
import { addSegment, nextSoldierId } from '../recording/records';
import { buildSchedule, poseAt, validateRecord } from '../recording/schedule';
import { playLife } from '../scenarios/lives';
import { getSoldier } from '../sim';
import { arena } from './helpers';

const isMultiple = (v: number, q: number) => Number.isInteger(v / q);

describe('recorder', () => {
  it('records one quantized waypoint per tick plus shots and interacts', () => {
    const map = arena({
      gates: [{ id: 'g', rect: { x: 600, y: 300, w: 20, h: 100 }, initiallyOpen: false }],
      levers: [{ id: 'lev', position: { x: 300, y: 500 }, targetId: 'g' }],
    });
    const life = playLife({
      map,
      tuning: DEFAULT_TUNING,
      records: [],
      attempt: 1,
      live: { mode: 'new', soldierId: 'S1', spawnPointId: 'a', entryTick: 0 },
      steps: [
        { kind: 'walkStraight', to: { x: 290, y: 513 } },
        { kind: 'interact' },
        { kind: 'shoot', at: { x: 900, y: 900 }, until: (w) => w.state.tick > 200 },
        { kind: 'walkStraight', to: { x: 200, y: 700 } },
      ],
    });
    const seg = life.liveSegment!;
    expect(seg.startTick).toBe(0);
    expect(seg.endReason).toBe('suspended');
    expect(seg.waypoints).toHaveLength(seg.endTick - seg.startTick + 1);
    seg.waypoints.forEach((w, i) => {
      expect(w.t).toBe(i);
      expect(isMultiple(w.x, POSITION_QUANTUM) && isMultiple(w.y, POSITION_QUANTUM)).toBe(true);
      expect(isMultiple(w.facing, FACING_QUANTUM)).toBe(true);
    });
    // The spawn pose is the first waypoint.
    expect(seg.waypoints[0]).toMatchObject({ x: 100, y: 500 });
    const interacts = seg.actions.filter((a) => a.kind === 'interact');
    expect(interacts).toEqual([expect.objectContaining({ targetId: 'lev' })]);
    const shots = seg.actions.filter((a) => a.kind === 'shot');
    expect(shots.length).toBeGreaterThan(5);
    // Shots are recorded from exactly where the world fired them: the recorded pose.
    for (const s of shots) {
      const w = seg.waypoints[s.t - seg.startTick]!;
      expect([s.x, s.y]).toEqual([w.x, w.y]);
    }
    expect(seg.actions.map((a) => a.t)).toEqual(
      [...seg.actions.map((a) => a.t)].sort((a, b) => a - b),
    );
    expect(() => validateRecord(life.records[0]!)).not.toThrow();
  });
});

describe('records and schedules', () => {
  const seg = (start: number, end: number, x0 = 0) => ({
    startTick: start,
    endTick: end,
    waypoints: Array.from({ length: end - start + 1 }, (_, i) => ({
      t: start + i,
      x: x0 + i,
      y: 0,
      facing: 0,
    })),
    actions: [],
    endReason: 'suspended' as const,
  });

  it('flattens contiguous segments into one schedule', () => {
    const rec: SoldierRecord = {
      id: 'S1',
      ordinal: 1,
      spawnPointId: 'a',
      spawnTick: 10,
      segments: [seg(10, 20), seg(21, 30, 100)],
    };
    const s = buildSchedule(rec);
    expect([s.spawnTick, s.endTick, s.perTick]).toEqual([10, 30, true]);
    expect(poseAt(s, 5).x).toBe(0);
    expect(poseAt(s, 21).x).toBe(100);
    expect(poseAt(s, 99).x).toBe(109);
  });

  it('interpolates sparse waypoints', () => {
    const rec: SoldierRecord = {
      id: 'S1',
      ordinal: 1,
      spawnPointId: 'a',
      spawnTick: 0,
      segments: [
        {
          startTick: 0,
          endTick: 10,
          waypoints: [
            { t: 0, x: 0, y: 0, facing: 0 },
            { t: 10, x: 100, y: 50, facing: 1 },
          ],
          actions: [],
          endReason: 'death',
        },
      ],
    };
    const p = poseAt(buildSchedule(rec), 5);
    expect(p).toMatchObject({ t: 5, x: 50, y: 25, facing: 0.5 });
  });

  it('rejects non-contiguous segments', () => {
    const rec: SoldierRecord = {
      id: 'S1',
      ordinal: 1,
      spawnPointId: 'a',
      spawnTick: 0,
      segments: [seg(0, 5), seg(7, 9)],
    };
    expect(() => validateRecord(rec)).toThrow(/contiguous/);
  });

  it('addSegment appends to resumed soldiers and creates new ones', () => {
    let recs = addSegment([], { soldierId: 'S1', spawnPointId: 'a' }, seg(0, 5));
    recs = addSegment(recs, { soldierId: 'S1' }, seg(6, 9));
    recs = addSegment(recs, { soldierId: 'S2', spawnPointId: 'a' }, seg(3, 4));
    expect(recs.map((r) => [r.id, r.ordinal, r.segments.length])).toEqual([
      ['S1', 1, 2],
      ['S2', 2, 1],
    ]);
    expect(nextSoldierId(recs)).toBe('S3');
    expect(() => addSegment(recs, { soldierId: 'S1' }, seg(20, 21))).toThrow();
  });
});

describe('SnapshotStore', () => {
  const snap = (tick: number, attempt: number): WorldSnapshot =>
    ({
      tick,
      attempt,
      source: 'attempt',
      state: {},
      echoes: { echoes: [] },
    }) as unknown as WorldSnapshot;

  it('only commits staged snapshots inside the window, and stales later ones from older attempts', () => {
    const store = new SnapshotStore();
    for (const t of [0, 60, 120, 180, 240]) store.stage(snap(t, 1));
    store.commit({ attempt: 1, fromTick: 0, toTick: 200 });
    expect(store.ticks()).toEqual([0, 60, 120, 180]);
    expect(store.nearestValidSnapshot(150)!.tick).toBe(120);
    expect(store.nearestValidSnapshot(-1)).toBeNull();

    // Attempt 2 starts at 60: attempt 1's snapshots from 60 on are stale.
    store.stage(snap(60, 2));
    store.stage(snap(120, 2));
    expect(store.nearestValidSnapshot(130)!.attempt).toBe(1); // staged isn't valid yet
    store.commit({ attempt: 2, fromTick: 60, toTick: 130 });
    expect(store.ticks()).toEqual([0, 60, 120]);
    expect(store.nearestValidSnapshot(500)).toMatchObject({ tick: 120, attempt: 2 });
    expect(store.nearestValidSnapshot(59)).toMatchObject({ tick: 0, attempt: 1 });
    expect(store.validUntil()).toBe(120);

    // A resolve pass for attempt 2 extends, without staling attempt 2's own snapshots.
    store.stage({ ...snap(180, 2), source: 'resolve' });
    store.commit({ attempt: 2, fromTick: 130, toTick: 400 });
    expect(store.ticks()).toEqual([0, 60, 120, 180]);

    store.stage(snap(300, 3));
    store.discardStaged();
    store.commit({ attempt: 3, fromTick: 100, toTick: 400 });
    expect(store.ticks()).toEqual([0, 60]);
  });
});

describe('spawning with explicit ids', () => {
  it('uses the record id and never collides with allocated ids', () => {
    const life = playLife({
      map: arena(),
      tuning: DEFAULT_TUNING,
      records: [],
      attempt: 1,
      live: { mode: 'new', soldierId: 'S7', spawnPointId: 'a', entryTick: 0 },
      steps: [{ kind: 'wait', ticks: 5 }],
    });
    const w = life.attempt.world;
    expect(getSoldier(w, 'S7')!.ordinal).toBe(7);
    expect(w.state.ids['S']).toBe(7);
  });
});
