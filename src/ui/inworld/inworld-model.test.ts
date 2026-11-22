import { describe, expect, it } from 'vitest';
import type { LaneTruth, SpawnOption } from '../../contracts/mission';
import { buildStops, nearbyOptions, replayEnd, stepStop } from './inworld-model';

const lane = (id: string, end: LaneTruth['end'], to = 600): LaneTruth => ({
  soldierId: id,
  recordedFrom: 0,
  recordedTo: to,
  spans: [],
  end,
  markers: [],
});

const options: SpawnOption[] = [
  { kind: 'new', spawnPointId: 'a', entryTick: 240 },
  { kind: 'new', spawnPointId: 'b', entryTick: 0 },
  { kind: 'resume', soldierId: 's1', resumeTick: 900, leadInFromTick: 600 },
];
const lanes = [
  lane('s1', { kind: 'open', tick: 900 }, 900),
  lane('s2', { kind: 'death', tick: 240 }),
];

describe('in-world respawn stops', () => {
  it('orders spawns and deaths by time, deaths first on a tie', () => {
    const s = buildStops(options, lanes);
    expect(s.map((x) => `${x.kind}@${x.tick}`)).toEqual([
      'new@0',
      'death@240',
      'new@240',
      'resume@900',
    ]);
  });

  it('steps through stops on the same tick one at a time', () => {
    const s = buildStops(options, lanes);
    const a = stepStop(s, 100, 1, null)!;
    expect(a.kind).toBe('death');
    const b = stepStop(s, a.tick, 1, a.key)!;
    expect(b.kind).toBe('new');
    expect(stepStop(s, b.tick, 1, b.key)!.kind).toBe('resume');
    expect(stepStop(s, b.tick, -1, b.key)!.kind).toBe('death');
    expect(stepStop(s, 900, 1, s[3]!.key)).toBeNull();
    expect(stepStop(s, 0, -1, null)).toBeNull();
  });

  it('always offers new spawns; resumes only near their time', () => {
    expect(nearbyOptions(options, 200, 60).map((o) => o.kind)).toEqual(['new', 'new']);
    expect(nearbyOptions(options, 880, 60).map((o) => o.kind)).toEqual(['resume', 'new', 'new']);
    expect(nearbyOptions(options, 500, 60)).toHaveLength(2);
  });

  it('replays at least to the latest recording', () => {
    expect(replayEnd(lanes, 0)).toBe(900);
    expect(replayEnd(lanes, 1200)).toBe(1200);
  });
});

import { chevrons, spawnLetter } from './inworld-model';
import { MISSION_03 } from '../../content/maps/mission-03';

describe('chevrons', () => {
  it('letters spawn points in map order and stacks options that share a time', () => {
    const map = MISSION_03;
    const [a, b] = map.spawnPoints;
    expect(spawnLetter(map, a!.id)).toBe('A');
    expect(spawnLetter(map, b!.id)).toBe('B');
    const opts: SpawnOption[] = [
      { kind: 'new', spawnPointId: b!.id, entryTick: 0 },
      { kind: 'new', spawnPointId: a!.id, entryTick: 0 },
      { kind: 'resume', soldierId: 'S2', resumeTick: 0, leadInFromTick: 0 },
      { kind: 'new', spawnPointId: a!.id, entryTick: 120 },
    ];
    const c = chevrons(opts, map, () => 2, opts[3]);
    expect(c.map((x) => `${x.label}@${x.tick}/${x.stack}${x.last ? '*' : ''}`)).toEqual([
      'A@0/0',
      'B@0/1',
      '2@0/2',
      'A@120/0*',
    ]);
  });
});
