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

import { chevrons, spawnLabels } from './inworld-model';
import { MISSION_03 } from '../../content/maps/mission-03';
import { BASIC_TRAINING } from '../../content/maps/basic-training';
import { strDynamic, str } from '../../content/strings';

const NATO = str('inworld.nato').split(',');

describe('chevrons', () => {
  it('letters spawn points: NATO-named ones keep their letter, the rest in map order', () => {
    const breach = spawnLabels(MISSION_03, NATO, strDynamic);
    expect(MISSION_03.spawnPoints.slice(0, 3).map((s) => breach.get(s.id))).toEqual([
      { letter: 'A', name: 'Alpha' },
      { letter: 'B', name: 'Bravo' },
      { letter: 'C', name: 'Charlie' },
    ]);
    const bt = spawnLabels(BASIC_TRAINING, NATO, strDynamic);
    expect(bt.get('bt-sp-a')).toEqual({ letter: 'A', name: 'Alpha flag' });
    expect(bt.get('bt-sp-d')!.letter).toBe('D');
    expect(bt.get('bt-start')).toEqual({ letter: 'E', name: 'Echo' });
  });

  it('stacks options that share a time (new by letter, then resumes)', () => {
    const map = MISSION_03;
    const labels = spawnLabels(map, NATO, strDynamic);
    const letter = (id: string) => labels.get(id)!.letter;
    const [a, b] = map.spawnPoints;
    const opts: SpawnOption[] = [
      { kind: 'new', spawnPointId: b!.id, entryTick: 0 },
      { kind: 'new', spawnPointId: a!.id, entryTick: 0 },
      { kind: 'resume', soldierId: 'S2', resumeTick: 0, leadInFromTick: 0 },
      { kind: 'new', spawnPointId: a!.id, entryTick: 120 },
    ];
    const c = chevrons(opts, letter, () => 2, opts[3]);
    expect(c.map((x) => `${x.label}@${x.tick}/${x.stack}${x.last ? '*' : ''}`)).toEqual([
      'A@0/0',
      'B@0/1',
      '2@0/2',
      'A@120/0*',
    ]);
  });
});
