import { describe, expect, it } from 'vitest';
import { MISSION_02 } from '../../content/maps/mission-02';
import type {
  AttemptObservation,
  CaptureObservation,
  CaptureTruth,
  SoldierRecord,
} from '../../contracts/mission';
import { applyCaptureObservation, captureChanges } from '../captures';
import { deriveSpawnOptions, nextEntryTick, spawnPointOpenTick } from '../spawn-options';

const RULES = { spawnIntervalTicks: 120, leadInTicks: 300 };

const obs = (
  attempt: number,
  fromTick: number,
  toTick: number,
  captures: CaptureObservation[],
): AttemptObservation => ({
  kind: 'attempt',
  attempt,
  fromTick,
  toTick,
  lanes: {},
  markers: [],
  endReason: 'death',
  captures,
});
const ours = (tick: number, by = ['S1']): CaptureObservation => ({
  pointId: 'cp-outpost',
  stage: 'ours',
  tick,
  by,
});
const neutral = (tick: number, by = ['S1']): CaptureObservation => ({
  pointId: 'cp-outpost',
  stage: 'neutral',
  tick,
  by,
});
const rec = (id: string, spawnPointId: string, spawnTick: number): SoldierRecord => ({
  id,
  ordinal: Number(id.slice(1)),
  spawnPointId,
  spawnTick,
  segments: [
    {
      startTick: spawnTick,
      endTick: spawnTick + 600,
      waypoints: [
        { t: spawnTick, x: 0, y: 0, facing: 0 },
        { t: spawnTick + 600, x: 0, y: 0, facing: 0 },
      ],
      actions: [],
      endReason: 'death',
    },
  ],
});

describe('capture truth fold ([D2], [D3], [D9])', () => {
  it('adds observed captures and reports the new point', () => {
    const r = applyCaptureObservation([], obs(1, 0, 3000, [neutral(2400), ours(2700)]));
    expect(r.captures.map((c) => [c.stage, c.tick, c.observedInAttempt])).toEqual([
      ['neutral', 2400, 1],
      ['ours', 2700, 1],
    ]);
    expect(r.changes).toEqual([{ pointId: 'cp-outpost', before: null, after: 2700 }]);
  });

  it('a capture inside an observed window that is not re-observed is removed ("Point lost")', () => {
    const truth = applyCaptureObservation(
      [],
      obs(1, 0, 3000, [neutral(2400), ours(2700)]),
    ).captures;
    const r = applyCaptureObservation(truth, obs(2, 0, 2800, []));
    expect(r.captures).toEqual([]);
    expect(r.changes).toEqual([{ pointId: 'cp-outpost', before: 2700, after: null }]);
  });

  it('captures outside the window are kept ([D3]: only simulated time changes)', () => {
    const truth = applyCaptureObservation(
      [],
      obs(1, 0, 3000, [neutral(2400), ours(2700)]),
    ).captures;
    const r = applyCaptureObservation(truth, obs(2, 0, 1800, []));
    expect(r.captures).toEqual(truth);
    expect(r.changes).toEqual([]);
  });

  it('a stage is reached once: an earlier re-capture replaces the later stale one', () => {
    const truth = applyCaptureObservation(
      [],
      obs(1, 0, 3000, [neutral(2400), ours(2700)]),
    ).captures;
    // Attempt 2 simulated only up to 2200 but saw both stages earlier.
    const r = applyCaptureObservation(
      truth,
      obs(2, 0, 2200, [neutral(1800, ['S4']), ours(2100, ['S4'])]),
    );
    expect(r.captures.map((c) => [c.stage, c.tick, c.by])).toEqual([
      ['neutral', 1800, ['S4']],
      ['ours', 2100, ['S4']],
    ]);
    expect(r.changes).toEqual([{ pointId: 'cp-outpost', before: 2700, after: 2100 }]);
  });

  it('missing captures on an observation count as none observed', () => {
    const truth = applyCaptureObservation([], obs(1, 0, 3000, [ours(2700)])).captures;
    const { captures: _c, ...noCaptures } = obs(2, 0, 3000, []);
    expect(applyCaptureObservation(truth, noCaptures).captures).toEqual([]);
  });

  it('captureChanges diffs ours ticks per point', () => {
    const t = (tick: number): CaptureTruth => ({ ...ours(tick), observedInAttempt: 1 });
    expect(captureChanges([t(10)], [t(10)])).toEqual([]);
    expect(captureChanges([t(10)], [t(12)])).toEqual([
      { pointId: 'cp-outpost', before: 10, after: 12 },
    ]);
  });
});

describe('spawn options with forward points ([D7], [D8])', () => {
  const truth: CaptureTruth[] = [{ ...ours(2700), observedInAttempt: 1 }];

  it('a forward point is offered only while ours, opening at its capture tick', () => {
    expect(deriveSpawnOptions(MISSION_02, [], [], RULES)).toEqual([
      { kind: 'new', spawnPointId: 'road', entryTick: 0 },
      { kind: 'new', spawnPointId: 'beach', entryTick: 0 },
    ]);
    const opts = deriveSpawnOptions(MISSION_02, [rec('S1', 'road', 0)], [], RULES, truth);
    expect(opts).toEqual([
      { kind: 'new', spawnPointId: 'road', entryTick: 120 },
      { kind: 'new', spawnPointId: 'beach', entryTick: 0 },
      { kind: 'new', spawnPointId: 'outpost', entryTick: 2700 },
    ]);
    expect(spawnPointOpenTick(MISSION_02, 'outpost', [])).toBeNull();
  });

  it('each forward point has its own slot clock', () => {
    const soldiers = [rec('S1', 'road', 0), rec('S2', 'outpost', 2700), rec('S3', 'outpost', 2820)];
    const o = deriveSpawnOptions(MISSION_02, soldiers, [], RULES, truth);
    expect(o.find((x) => x.kind === 'new' && x.spawnPointId === 'outpost')).toEqual({
      kind: 'new',
      spawnPointId: 'outpost',
      entryTick: 2940,
    });
    expect(o.find((x) => x.kind === 'new' && x.spawnPointId === 'road')).toMatchObject({
      entryTick: 120,
    });
  });

  it('slots never collide when the capture tick moves', () => {
    // Captured later than before: the soldier at 2700 doesn't count (never spawns now).
    expect(nextEntryTick(2800, 'outpost', [rec('S2', 'outpost', 2700)], RULES)).toBe(2800);
    // Captured earlier: next slot is after the latest soldier there, not on top of it.
    expect(nextEntryTick(2650, 'outpost', [rec('S2', 'outpost', 2700)], RULES)).toBe(2820);
  });
});
