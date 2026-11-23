import { describe, expect, it } from 'vitest';
import { PauseModel, RESUME_GRACE_MS } from './pause-model';

describe('PauseModel', () => {
  it('steps while running and holds while paused', () => {
    const p = new PauseModel();
    expect(p.tick(16)).toBe(true);
    p.pause();
    expect(p.tick(16)).toBe(false);
    expect(p.tick(10_000)).toBe(false);
    expect(p.paused).toBe(true);
  });

  it('counts back in after resume, then steps again', () => {
    const p = new PauseModel();
    p.pause();
    p.resume();
    expect(p.state).toBe('resuming');
    expect(p.holding).toBe(true);
    expect(p.countdownLabel).toBe(3);
    expect(p.tick(RESUME_GRACE_MS / 2)).toBe(false);
    expect(p.countdownLabel).toBe(2);
    expect(p.tick(RESUME_GRACE_MS)).toBe(false);
    expect(p.state).toBe('running');
    expect(p.tick(16)).toBe(true);
  });

  it('pausing again during the countdown holds, and toggle flips', () => {
    const p = new PauseModel();
    p.toggle();
    expect(p.paused).toBe(true);
    p.toggle();
    expect(p.state).toBe('resuming');
    p.toggle();
    expect(p.paused).toBe(true);
    p.resume();
    expect(p.countdownLabel).toBe(3);
  });

  it('resume is a no-op unless paused', () => {
    const p = new PauseModel();
    p.resume();
    expect(p.state).toBe('running');
  });
});
