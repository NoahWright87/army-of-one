import { afterEach, expect, it, vi } from 'vitest';
import { createIdleLoop } from './idle-loop';

afterEach(() => vi.useRealTimers());

it('keeps a slow loader progressing across title → respawn → deployment', async () => {
  vi.useFakeTimers();
  const frameLoop = {
    running: true,
    wake() {
      this.running = true;
    },
    sleep() {
      this.running = false;
    },
  };
  let ready = false;
  let pending = false;
  const idle = createIdleLoop(
    frameLoop,
    () => ready,
    () => pending,
  );
  // New mission stops the previous battle and opens the DOM respawn screen. Image loading
  // takes longer than its 200 ms idle timer, as on a phone or an uncached connection.
  idle.sleepSoon();
  vi.advanceTimersByTime(1000);
  expect(frameLoop.running).toBe(true);
  // Model the real dependency: remaining files only finish while frame updates run.
  const finishImages = Promise.resolve().then(() => {
    if (frameLoop.running) ready = true;
  });
  pending = true;
  idle.wake();
  await finishImages;
  expect(ready).toBe(true);
  idle.sleepSoon();
  vi.advanceTimersByTime(1000);
  expect(frameLoop.running).toBe(true);
  pending = false;
  idle.sleepSoon();
  vi.advanceTimersByTime(200);
  expect(frameLoop.running).toBe(false);
  // A deployment wakes before awaiting assets, including an already sleeping loop.
  pending = true;
  idle.wake();
  expect(frameLoop.running).toBe(true);
});

it('cancels an idle timer before deployment and rechecks loading at the timer boundary', () => {
  vi.useFakeTimers();
  const loop = { running: true, wake: vi.fn(), sleep: vi.fn() };
  let ready = true;
  const idle = createIdleLoop(
    loop,
    () => ready,
    () => false,
  );
  idle.sleepSoon();
  idle.wake();
  vi.advanceTimersByTime(200);
  expect(loop.sleep).not.toHaveBeenCalled();
  idle.sleepSoon();
  ready = false;
  vi.advanceTimersByTime(200);
  expect(loop.sleep).not.toHaveBeenCalled();
});
