import { describe, expect, it } from 'vitest';
import { DEFAULT_WORLD_TEXT } from '../../content/world-text';
import { layoutGlyphs, parseLine, plainText } from './markup';

const tm = DEFAULT_WORLD_TEXT.speech;

describe('speech markup', () => {
  it('strips tags to plain text and keeps unknown brackets literal', () => {
    expect(plainText('[shake]INCOMING![/] get [red]down[/]', tm)).toBe('INCOMING! get down');
    expect(plainText('[[ok] and [nope]', tm)).toBe('[ok] and [nope]');
  });

  it('applies nested effects, colours and sizes', () => {
    const line = parseLine('[big][shake]A[red]B[/]C[/shake]D', tm);
    const [a, b, c, d] = line.glyphs;
    expect(a!.effects).toEqual(['shake']);
    expect(a!.size).toBe(tm.bigScale);
    expect(b!.color).toBe('#ff4b3e');
    expect(c!.color).toBeNull();
    expect(d!.effects).toEqual([]);
    expect(d!.size).toBe(tm.bigScale);
  });

  it('short lines appear all at once, long ones word by word', () => {
    const short = parseLine('TAKE COVER!', tm);
    expect(new Set(short.glyphs.map((g) => g.appearMs))).toEqual(new Set([0]));
    const long = parseLine('Stay behind the wall and wait', tm);
    const words = long.glyphs.filter((g) => g.word >= 0);
    const firstOf = (w: number) => words.find((g) => g.word === w)!.appearMs;
    expect(firstOf(1)).toBeGreaterThan(firstOf(0));
    expect(firstOf(5)).toBeGreaterThan(firstOf(4));
    // All letters of a word appear together.
    expect(new Set(words.filter((g) => g.word === 2).map((g) => g.appearMs)).size).toBe(1);
  });

  it('mixes a shout with spoken words and pauses', () => {
    const line = parseLine('[all]INCOMING!![p=500][words] Get behind something', tm);
    const shout = line.glyphs.filter((g) => g.word === 0);
    expect(shout.every((g) => g.appearMs === 0)).toBe(true);
    const get = line.glyphs.find((g) => g.word === 1)!;
    expect(get.appearMs).toBe(tm.popMs + 500);
    expect(line.revealEndMs).toBeGreaterThan(get.appearMs);
  });

  it('letter pacing staggers each letter', () => {
    const line = parseLine('[letters]abc', tm);
    expect(line.glyphs.map((g) => g.appearMs)).toEqual([0, tm.letterMs, tm.letterMs * 2]);
  });

  it('records screen-shake cues', () => {
    const line = parseLine('[words]one [quake]two', tm);
    expect(line.cues).toHaveLength(1);
    expect(line.cues[0]!.atMs).toBeGreaterThan(0);
  });

  it('wraps and stacks lines upward from the anchor', () => {
    const line = parseLine('aaaa bbbb cccc', tm);
    const pos = layoutGlyphs(
      line.glyphs,
      () => 10,
      () => 20,
      95,
    );
    // "aaaa bbbb" (90 px) fits, "cccc" wraps to the bottom line.
    expect(pos[0]!.y).toBe(-30);
    expect(pos[10]!.y).toBe(-10);
    // Each line is centred.
    expect(pos[10]!.x + pos[13]!.x).toBeCloseTo(0);
    expect(pos[0]!.x + pos[8]!.x).toBeCloseTo(0);
  });
});
