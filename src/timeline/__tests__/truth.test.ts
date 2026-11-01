import { describe, expect, it } from 'vitest';
import type {
  AttemptObservation,
  LaneSpan,
  LaneTruth,
  RecordingSegment,
  SoldierRecord,
} from '../../contracts/mission';
import { applyObservation } from '../truth';
import { deriveSpawnOptions, leadInStart } from '../spawn-options';
import { paintSpan, spansCover } from '../spans';
import { TEST_RANGE } from '../../content/maps/test-range';

const seg = (
  start: number,
  end: number,
  endReason: RecordingSegment['endReason'] = 'death',
): RecordingSegment => ({
  startTick: start,
  endTick: end,
  waypoints: [],
  actions: [],
  endReason,
});

const soldier = (
  n: number,
  spawnPointId: string,
  ...segments: RecordingSegment[]
): SoldierRecord => ({
  id: `S${n}`,
  ordinal: n,
  spawnPointId,
  spawnTick: segments[0]!.startTick,
  segments,
});

const obs = (
  o: Partial<AttemptObservation> & Pick<AttemptObservation, 'attempt' | 'lanes'>,
): AttemptObservation => ({
  kind: 'attempt',
  fromTick: 0,
  toTick: 0,
  markers: [],
  endReason: 'death',
  ...o,
});

const lane = (lanes: LaneTruth[], id: string) => lanes.find((l) => l.soldierId === id)!;

function assertInvariants(lanes: LaneTruth[]) {
  for (const l of lanes) expect(spansCover(l.spans, l.recordedFrom, l.recordedTo)).toBe(true);
}

/** The canonical story: S1 dies at 500; S2 saves S1 and lives to 700. */
function rescueStory() {
  const s1 = soldier(1, 'west', seg(0, 500));
  const a1 = applyObservation(
    [],
    [s1],
    obs({
      attempt: 1,
      toTick: 500,
      live: { soldierId: 'S1', mode: 'new', controlFromTick: 0 },
      lanes: { S1: { kind: 'died', tick: 500, cause: 'turret' } },
      markers: [{ soldierId: 'S1', tick: 500, kind: 'death', stringKey: 'marker.death' }],
    }),
  );
  const s2 = soldier(2, 'west', seg(120, 700));
  const a2 = applyObservation(
    a1.lanes,
    [s1, s2],
    obs({
      attempt: 2,
      toTick: 700,
      live: { soldierId: 'S2', mode: 'new', controlFromTick: 120 },
      lanes: { S1: { kind: 'static', tick: 500 }, S2: { kind: 'died', tick: 700, cause: 'mine' } },
    }),
  );
  return { s1, s2, a1, a2 };
}

describe('spans', () => {
  it('paints over ranges, splitting and merging', () => {
    let s: LaneSpan[] = [{ from: 0, to: 99, kind: 'alive', observedInAttempt: 1 }];
    s = paintSpan(s, 40, 59, 'lost', 2);
    expect(s.map((x) => [x.from, x.to, x.kind])).toEqual([
      [0, 39, 'alive'],
      [40, 59, 'lost'],
      [60, 99, 'alive'],
    ]);
    s = paintSpan(s, 40, 59, 'alive', 1);
    expect(s).toEqual([{ from: 0, to: 99, kind: 'alive', observedInAttempt: 1 }]);
    expect(spansCover(s, 0, 99)).toBe(true);
  });
});

describe('applyObservation', () => {
  it('first death: one lane ending in X', () => {
    const { a1 } = rescueStory();
    const l = lane(a1.lanes, 'S1');
    expect(l.end).toEqual({ kind: 'death', tick: 500 });
    expect(l.spans).toEqual([{ from: 0, to: 500, kind: 'alive', observedInAttempt: 1 }]);
    expect(l.markers).toHaveLength(1);
    expect(a1.changes).toEqual([]);
  });

  it('rescue: X becomes O and is reported as a change', () => {
    const { a2 } = rescueStory();
    expect(lane(a2.lanes, 'S1').end).toEqual({ kind: 'open', tick: 500 });
    expect(lane(a2.lanes, 'S2').end).toEqual({ kind: 'death', tick: 700 });
    expect(a2.changes).toEqual([
      { soldierId: 'S1', before: { kind: 'death', tick: 500 }, after: { kind: 'open', tick: 500 } },
    ]);
    assertInvariants(a2.lanes);
  });

  it('history made worse: earlier death leaves a dashed remainder and drops later markers', () => {
    const { s1, s2, a2 } = rescueStory();
    const s3 = soldier(3, 'south', seg(0, 400));
    const withMarker = a2.lanes.map((l) =>
      l.soldierId === 'S1'
        ? {
            ...l,
            markers: [
              { soldierId: 'S1', tick: 450, kind: 'kill' as const, stringKey: 'marker.kill' },
            ],
          }
        : l,
    );
    const a3 = applyObservation(
      withMarker,
      [s1, s2, s3],
      obs({
        attempt: 3,
        toTick: 400,
        live: { soldierId: 'S3', mode: 'new', controlFromTick: 0 },
        lanes: {
          S1: { kind: 'died', tick: 300, cause: 'turret' },
          S2: { kind: 'alive' },
          S3: { kind: 'died', tick: 400, cause: 'traffic' },
        },
      }),
    );
    const l1 = lane(a3.lanes, 'S1');
    expect(l1.end).toEqual({ kind: 'death', tick: 300 });
    expect(l1.spans.map((s) => [s.from, s.to, s.kind])).toEqual([
      [0, 300, 'alive'],
      [301, 500, 'lost'],
    ]);
    expect(l1.markers).toEqual([]);
    // S2 observed alive to 400 only; its known death at 700 is still in the future: kept.
    expect(lane(a3.lanes, 'S2').end).toEqual({ kind: 'death', tick: 700 });
    assertInvariants(a3.lanes);
  });

  it('[D3] only simulated time changes; contradicted futures become unresolved', () => {
    const { s1, a1 } = rescueStory();
    // Attempt 2': S2 saves S1 at 300 but dies at 350, before S1's recorded death at 500.
    const s2 = soldier(2, 'west', seg(120, 350));
    const r = applyObservation(
      a1.lanes,
      [s1, s2],
      obs({
        attempt: 2,
        toTick: 350,
        live: { soldierId: 'S2', mode: 'new', controlFromTick: 120 },
        lanes: { S1: { kind: 'alive' }, S2: { kind: 'died', tick: 350, cause: 'mine' } },
      }),
    );
    // S1's death at 500 hasn't been contradicted (nobody simulated past 350): still X.
    expect(lane(r.lanes, 'S1').end).toEqual({ kind: 'death', tick: 500 });

    // Now a soldier previously dead at 300 is seen alive at 350: contradiction → unresolved.
    const dead300 = applyObservation(
      a1.lanes,
      [s1],
      obs({
        attempt: 2,
        toTick: 500,
        lanes: { S1: { kind: 'died', tick: 300, cause: 'x' } },
      }),
    );
    const r2 = applyObservation(
      dead300.lanes,
      [s1, s2],
      obs({
        attempt: 3,
        toTick: 350,
        live: { soldierId: 'S2', mode: 'new', controlFromTick: 120 },
        lanes: { S1: { kind: 'alive' }, S2: { kind: 'died', tick: 350, cause: 'mine' } },
      }),
    );
    const l = lane(r2.lanes, 'S1');
    expect(l.end).toEqual({ kind: 'unresolved' });
    expect(l.spans.map((s) => [s.from, s.to, s.kind])).toEqual([
      [0, 350, 'alive'],
      [351, 500, 'unresolved'],
    ]);
  });

  it('resume extends the same soldier lane', () => {
    const { s2, a2 } = rescueStory();
    const s1b = soldier(1, 'west', seg(0, 500), seg(501, 900));
    const a3 = applyObservation(
      a2.lanes,
      [s1b, s2],
      obs({
        attempt: 3,
        fromTick: 200,
        toTick: 900,
        live: { soldierId: 'S1', mode: 'resume', controlFromTick: 501 },
        lanes: {
          S1: { kind: 'died', tick: 900, cause: 'turret' },
          S2: { kind: 'died', tick: 700, cause: 'mine' },
        },
      }),
    );
    const l = lane(a3.lanes, 'S1');
    expect(l.recordedTo).toBe(900);
    expect(l.end).toEqual({ kind: 'death', tick: 900 });
    expect(a3.changes).toEqual([]); // the live soldier's own lane isn't a "history change"
    assertInvariants(a3.lanes);
  });

  it('interrupted and neverSpawned fates', () => {
    const { s1, s2, a2 } = rescueStory();
    const r = applyObservation(
      a2.lanes,
      [s1, s2],
      obs({
        attempt: 3,
        kind: 'resolve',
        toTick: 900,
        lanes: {
          S1: { kind: 'interrupted', tick: 250, reason: 'gate' },
          S2: { kind: 'neverSpawned', reason: 'lost point' },
        },
      }),
    );
    expect(lane(r.lanes, 'S1').end).toEqual({ kind: 'interrupted', tick: 250 });
    expect(lane(r.lanes, 'S1').spans.at(-1)).toMatchObject({ from: 251, to: 500, kind: 'frozen' });
    expect(lane(r.lanes, 'S2')).toMatchObject({
      end: { kind: 'neverSpawned' },
      spans: [{ from: 120, to: 700, kind: 'lost' }],
    });
    assertInvariants(r.lanes);
  });

  it('is idempotent and progressive resolves equal one full resolve', () => {
    const { s1, s2, a2 } = rescueStory();
    const full = obs({
      kind: 'resolve',
      attempt: 3,
      fromTick: 100,
      toTick: 700,
      lanes: {
        S1: { kind: 'died', tick: 450, cause: 'x' },
        S2: { kind: 'died', tick: 650, cause: 'y' },
      },
    });
    const partial = {
      ...full,
      toTick: 300,
      lanes: { S1: { kind: 'alive' as const }, S2: { kind: 'alive' as const } },
    };
    const once = applyObservation(a2.lanes, [s1, s2], full);
    const twice = applyObservation(once.lanes, [s1, s2], full);
    expect(twice.lanes).toEqual(once.lanes);
    const stepped = applyObservation(
      applyObservation(a2.lanes, [s1, s2], partial).lanes,
      [s1, s2],
      full,
    );
    expect(stepped.lanes).toEqual(once.lanes);
  });

  it('mission completion marks the live soldier complete', () => {
    const s1 = soldier(1, 'west', seg(0, 800, 'missionComplete'));
    const r = applyObservation(
      [],
      [s1],
      obs({
        attempt: 1,
        toTick: 800,
        live: { soldierId: 'S1', mode: 'new', controlFromTick: 0 },
        lanes: { S1: { kind: 'alive' } },
        missionComplete: { tick: 800, bySoldierId: 'S1' },
        endReason: 'missionComplete',
      }),
    );
    expect(lane(r.lanes, 'S1').end).toEqual({ kind: 'complete', tick: 800 });
  });
});

describe('deriveSpawnOptions', () => {
  const rules = { spawnIntervalTicks: 120, leadInTicks: 300 };

  it('[D7] each spawn point has its own slot counter', () => {
    const { s1, s2, a2 } = rescueStory();
    const opts = deriveSpawnOptions(TEST_RANGE, [s1, s2], a2.lanes, rules);
    expect(opts).toEqual([
      { kind: 'new', spawnPointId: 'west', entryTick: 240 },
      { kind: 'new', spawnPointId: 'south', entryTick: 0 },
      { kind: 'resume', soldierId: 'S1', resumeTick: 500, leadInFromTick: 200 },
    ]);
  });

  it('does not offer interrupted, unresolved or dead lanes; lead-in start may be negative', () => {
    const { s1, a1 } = rescueStory();
    const opts = deriveSpawnOptions(TEST_RANGE, [s1], a1.lanes, rules);
    expect(opts.filter((o) => o.kind === 'resume')).toEqual([]);
    expect(leadInStart({ kind: 'new', spawnPointId: 'south', entryTick: 0 }, rules)).toBe(-300);
    expect(
      leadInStart({ kind: 'resume', soldierId: 'S1', resumeTick: 100, leadInFromTick: 0 }, rules),
    ).toBe(-200);
  });
});
