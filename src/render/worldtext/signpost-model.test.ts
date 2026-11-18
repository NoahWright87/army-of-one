import { describe, expect, it } from 'vitest';
import { DEFAULT_WORLD_TEXT } from '../../content/world-text';
import { SIGN_IDLE, stepSign, type SignState } from './signpost-model';

const t = DEFAULT_WORLD_TEXT.sign;
const run = (s: SignState, ms: number, dist: number | null, fired = false) => {
  for (let i = 0; i < ms; i += 10) s = stepSign(s, 10, dist, fired, t);
  return s;
};

describe('signpost', () => {
  it('fills the ring while near, then grows the frame open', () => {
    let s = run(SIGN_IDLE, t.readMs / 2, 10);
    expect(s.phase).toBe('reading');
    expect(s.ring).toBeGreaterThan(0.3);
    s = run(s, t.readMs, 10);
    s = run(s, t.openMs + 20, 10);
    expect(s).toMatchObject({ phase: 'open', open: 1 });
  });

  it('stays open a little past the read radius, closes beyond the close radius', () => {
    let s = run(SIGN_IDLE, t.readMs + t.openMs + 50, 10);
    s = run(s, 100, (t.readRadius + t.closeRadius) / 2);
    expect(s.phase).toBe('open');
    s = run(s, t.closeMs + 20, t.closeRadius + 1);
    expect(s.phase).toBe('idle');
  });

  it('firing closes it and resets the ring', () => {
    let s = run(SIGN_IDLE, t.readMs + t.openMs + 50, 10);
    s = stepSign(s, 10, 10, true, t);
    expect(s.phase).toBe('closing');
    s = run(SIGN_IDLE, t.readMs / 2, 10);
    s = stepSign(s, 10, 10, true, t);
    expect(s.ring).toBe(0);
  });

  it('walking away drains a part-filled ring', () => {
    let s = run(SIGN_IDLE, t.readMs / 2, 10);
    s = run(s, t.readMs, t.readRadius + 5);
    expect(s).toEqual(SIGN_IDLE);
  });
});
