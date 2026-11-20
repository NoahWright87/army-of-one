import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchForStall } from './runtime-errors';

describe('startup inactivity deadline', () => {
  let doc: EventTarget & { hidden: boolean };
  beforeEach(() => {
    vi.useFakeTimers();
    doc = Object.assign(new EventTarget(), { hidden: false });
    vi.stubGlobal('document', doc);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('allows continuing progress, but reports a stalled decode/request', () => {
    const fail = vi.fn();
    const deadline = watchForStall('images', 1000, fail);
    vi.advanceTimersByTime(900);
    deadline.progress();
    vi.advanceTimersByTime(900);
    expect(fail).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fail).toHaveBeenCalledExactlyOnceWith(new Error('Timed out waiting for images'));
    deadline.stop();
  });

  it('does not fail while the phone is in another app; gives a fresh visible deadline', () => {
    const fail = vi.fn();
    const deadline = watchForStall('images', 1000, fail);
    doc.hidden = true;
    vi.advanceTimersByTime(5000);
    expect(fail).not.toHaveBeenCalled();
    doc.hidden = false;
    doc.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(999);
    expect(fail).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fail).toHaveBeenCalledOnce();
    deadline.stop();
  });

  it('cancels the timer and visibility listener once startup completes', () => {
    const fail = vi.fn();
    const deadline = watchForStall('images', 1000, fail);
    deadline.stop();
    doc.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(5000);
    expect(fail).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
