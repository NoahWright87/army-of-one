import { describe, expect, it } from 'vitest';
import type { LaneTruth } from '../../../contracts/mission';
import { secondsToTicks } from '../../../sim/core/time';
import { spansCover } from '../../../timeline/spans';
import { buildFixture, FIXTURE_NAMES } from '../__fixtures__/respawn-fixtures';

const lane = (lanes: readonly LaneTruth[], id: string) => lanes.find((l) => l.soldierId === id)!;

function fixture(name: string) {
  const f = buildFixture(name);
  if (!f) throw new Error(name);
  return f;
}

describe('respawn fixtures (built with the real truth model)', () => {
  it('has every fixture the brief asks for', () => {
    for (const n of [
      'empty',
      'first-death',
      'rescue',
      'o-ignored',
      'worse',
      'interruption',
      'twelve',
      'dense-40',
      'scrubber',
    ]) {
      expect(FIXTURE_NAMES).toContain(n);
    }
    expect(buildFixture('nope')).toBeNull();
  });

  it('every lane in every fixture (and stream step) keeps exact span coverage', () => {
    for (const n of FIXTURE_NAMES) {
      const f = fixture(n);
      const all = [f.props.lanes, ...(f.stream ?? []).map((u) => u.lanes ?? [])];
      for (const lanes of all) {
        for (const l of lanes) {
          expect(spansCover(l.spans, l.recordedFrom, l.recordedTo), `${n} ${l.soldierId}`).toBe(
            true,
          );
        }
      }
    }
  });

  it('first death: one X, two new options', () => {
    const p = fixture('first-death').props;
    expect(p.lanes).toHaveLength(1);
    expect(p.lanes[0]!.end).toEqual({ kind: 'death', tick: secondsToTicks(41) });
    expect(p.options.map((o) => o.kind)).toEqual(['new', 'new']);
  });

  it('rescue: S1 X→O is a change and a resume option', () => {
    const p = fixture('rescue').props;
    expect(lane(p.lanes, 'S1').end.kind).toBe('open');
    expect(p.changes).toEqual([
      expect.objectContaining({
        soldierId: 'S1',
        after: { kind: 'open', tick: secondsToTicks(58) },
      }),
    ]);
    expect(p.options.some((o) => o.kind === 'resume' && o.soldierId === 'S1')).toBe(true);
  });

  it('o ignored: still O, nothing changed', () => {
    const p = fixture('o-ignored').props;
    expect(lane(p.lanes, 'S1').end.kind).toBe('open');
    expect(p.changes).toEqual([]);
  });

  it('worse: S1 and S2 die earlier and keep dashed remainders', () => {
    const p = fixture('worse').props;
    expect(lane(p.lanes, 'S1').end).toEqual({ kind: 'death', tick: secondsToTicks(58) });
    expect(lane(p.lanes, 'S1').spans.some((s) => s.kind === 'lost')).toBe(true);
    expect(lane(p.lanes, 'S2').spans.some((s) => s.kind === 'lost')).toBe(true);
    expect(p.changes?.map((c) => c.soldierId).sort()).toEqual(['S1', 'S2']);
  });

  it('interruption: S1 ends in ! with a frozen remainder and is not offered', () => {
    const p = fixture('interruption').props;
    const l = lane(p.lanes, 'S1');
    expect(l.end.kind).toBe('interrupted');
    expect(l.spans.some((s) => s.kind === 'frozen')).toBe(true);
    expect(p.options.some((o) => o.kind === 'resume')).toBe(false);
  });

  it('twelve: 12 lanes across two spawn points with every end kind we can make', () => {
    const p = fixture('twelve').props;
    expect(p.lanes).toHaveLength(12);
    expect(new Set(p.soldiers.map((s) => s.spawnPointId))).toEqual(new Set(['road', 'beach']));
    const kinds = new Set(p.lanes.map((l) => l.end.kind));
    for (const k of ['death', 'open', 'interrupted', 'unresolved']) expect(kinds).toContain(k);
  });

  it('dense: 40 lanes', () => {
    expect(fixture('dense-40').props.lanes).toHaveLength(40);
  });

  it('scrubber: streams monotonic progress with an O→X flip, an X→O flip and a neverSpawned', () => {
    const f = fixture('scrubber');
    const stream = f.stream!;
    expect(stream.length).toBeGreaterThan(10);
    expect(f.props.resolvedUntil).toBe(f.props.reachedTick);
    const ticks = stream
      .map((u) => u.resolvedUntil)
      .filter((t): t is number => typeof t === 'number');
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]!).toBeGreaterThan(ticks[i - 1]!);
    expect(stream[stream.length - 1]!.resolvedUntil).toBeNull();
    const changes = stream.flatMap((u) => u.changes ?? []);
    expect(changes).toContainEqual(
      expect.objectContaining({
        soldierId: 'S1',
        before: expect.objectContaining({ kind: 'open' }),
        after: expect.objectContaining({ kind: 'death' }),
      }),
    );
    expect(changes).toContainEqual(
      expect.objectContaining({
        soldierId: 'S2',
        after: expect.objectContaining({ kind: 'open' }),
      }),
    );
    expect(changes).toContainEqual(
      expect.objectContaining({ soldierId: 'S4', after: { kind: 'neverSpawned' } }),
    );
    const last = stream[stream.length - 1]!;
    expect(last.options!.some((o) => o.kind === 'resume' && o.soldierId === 'S2')).toBe(true);
    expect(last.options!.some((o) => o.kind === 'resume' && o.soldierId === 'S1')).toBe(false);
    // Before the sweep reaches 1:12, S1's unconfirmed O is still offered ([D23]).
    expect(f.props.options.some((o) => o.kind === 'resume' && o.soldierId === 'S1')).toBe(true);
  });

  it('empty: no lanes, both spawn points at 0:00', () => {
    const p = fixture('empty').props;
    expect(p.lanes).toEqual([]);
    expect(p.options).toEqual([
      { kind: 'new', spawnPointId: 'road', entryTick: 0 },
      { kind: 'new', spawnPointId: 'beach', entryTick: 0 },
    ]);
  });

  it('complete: the finishing lane ends in ✓', () => {
    const p = fixture('complete').props;
    expect(lane(p.lanes, 'S3').end.kind).toBe('complete');
    expect(p.objectiveComplete).toBe(true);
  });
});
