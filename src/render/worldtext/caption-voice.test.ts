import { describe, expect, it } from 'vitest';
import { DEFAULT_WORLD_TEXT } from '../../content/world-text';
import { captionVoice, soldierVoice } from './caption-voice';
import { parseLine } from './markup';

const cues = (text: string, id = 'S1') =>
  captionVoice(id, parseLine(text, DEFAULT_WORLD_TEXT.speech));

describe('caption voice', () => {
  it('uses stable but distinct vocal traits for different soldiers', () => {
    expect(cues('Move!', 'S1')).toEqual(cues('Move!', 'S1'));
    expect(cues('Move!', 'S1')).not.toEqual(cues('Move!', 'S2'));
    expect(cues('Move!').map((cue) => cue.sound)).toEqual(['m', 'o', 'v', 'e']);
  });

  it('spreads instant text out and preserves a pause after the previous sounds', () => {
    const instant = cues('[all]shout now');
    expect(instant[0]?.sound).toBe('sh');
    expect(instant[1]?.atMs).toBeGreaterThan(instant[0]!.atMs);
    const paused = cues('[all]shout[p=350] now');
    expect(paused[4]!.atMs - instant[4]!.atMs).toBeGreaterThanOrEqual(350);
  });

  it('applies the chosen voice bank and increases cadence when speed goes up', () => {
    const line = parseLine('[all]Hold on', DEFAULT_WORLD_TEXT.speech);
    const original = soldierVoice('S1');
    const slow = captionVoice('S1', line, { ...original, bank: 'low', speed: 0.65 });
    const fast = captionVoice('S1', line, { ...original, bank: 'high', speed: 1.65 });
    expect(slow[0]?.bank).toBe('low');
    expect(fast[0]?.bank).toBe('high');
    expect(fast.at(-1)!.atMs).toBeLessThan(slow.at(-1)!.atMs);
  });

  it('follows letter reveals and applies emphasis from visual effects', () => {
    const line = parseLine('[letters][big][shake]MOVE!', DEFAULT_WORLD_TEXT.speech);
    const voice = captionVoice('S1', line);
    expect(voice.map((cue) => cue.atMs)).toEqual(line.glyphs.slice(0, 4).map((g) => g.appearMs));
    expect(voice[0]!.emphasis).toBeGreaterThan(cues('Move!')[0]!.emphasis);
  });
});
