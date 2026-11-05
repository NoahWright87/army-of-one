import { describe, expect, it } from 'vitest';
import type { LaneTruth, MissionState, SoldierRecord } from '../../contracts/mission';
import { parseBests, radarAxes, resultStats, scrubMarks, updateBests } from './results-model';

const rec = (id: string, ordinal: number, from: number, to: number, shots = 0): SoldierRecord => ({
  id,
  ordinal,
  spawnPointId: 'a',
  spawnTick: from,
  segments: [
    {
      startTick: from,
      endTick: to,
      waypoints: [],
      actions: Array.from({ length: shots }, (_, i) => ({
        kind: 'shot' as const,
        t: from + i,
        x: 0,
        y: 0,
        angle: 0,
      })),
      endReason: 'death',
    },
  ],
});
const lane = (id: string, end: LaneTruth['end'], kinds: string[] = []): LaneTruth => ({
  soldierId: id,
  recordedFrom: 0,
  recordedTo: 100,
  spans: [],
  end,
  markers: kinds.map((k, i) => ({
    soldierId: id,
    tick: 10 + i,
    kind: k as LaneTruth['markers'][number]['kind'],
    stringKey: '',
  })),
});

const mission: MissionState = {
  schemaVersion: 1,
  missionId: 'm',
  attemptCount: 3,
  soldiers: [rec('S1', 1, 0, 600, 10), rec('S2', 2, 0, 3600, 5), rec('S3', 3, 100, 200)],
  lanes: [
    lane('S1', { kind: 'death', tick: 600 }, ['kill']),
    lane('S2', { kind: 'complete', tick: 3600 }, ['kill', 'capture', 'objective']),
    lane('S3', { kind: 'death', tick: 200 }),
  ],
  completed: { attempt: 3, tick: 3600, bySoldierId: 'S2' },
  captureTruth: [{ pointId: 'p', stage: 'ours', tick: 50, observedInAttempt: 2, by: ['S2'] }],
};

describe('results ([D42])', () => {
  it('stats: deaths, kills, shots, longest life, MVP', () => {
    const s = resultStats(mission, 1, 3600);
    expect(s.deaths).toBe(2);
    expect(s.kills).toBe(2);
    expect(s.shots).toBe(15);
    expect(s.captures).toBe(1);
    expect(s.longestLifeTicks).toBe(3600);
    expect(s.mvp?.soldierId).toBe('S2');
  });

  it('radar axes are all 0..1', () => {
    const axes = radarAxes(resultStats(mission, 1, 3600), mission);
    expect(axes).toHaveLength(6);
    for (const a of axes) {
      expect(a.value).toBeGreaterThanOrEqual(0);
      expect(a.value).toBeLessThanOrEqual(1);
    }
  });

  it('bests: improve and persist', () => {
    const s = resultStats(mission, 1, 3600);
    const first = updateBests({}, s);
    expect(first.improved).toEqual(['fastestTicks', 'fewestSoldiers', 'mostRescues']);
    const again = updateBests(first.bests, { ...s, battleTicks: 4000 });
    expect(again.improved).toEqual([]);
    expect(parseBests(JSON.stringify(first.bests))).toEqual(first.bests);
    expect(parseBests('nope')).toEqual({});
  });

  it('scrub marks are sorted and include the win', () => {
    const marks = scrubMarks(mission);
    expect(marks.map((x) => x.tick)).toEqual([...marks.map((x) => x.tick)].sort((a, b) => a - b));
    expect(marks.at(-1)).toEqual({ tick: 3600, kind: 'objective' });
  });
});
