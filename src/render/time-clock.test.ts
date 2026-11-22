import { describe, expect, it } from 'vitest';
import { TimeClock, travelMs } from './time-clock';

const bounds = (frontier: () => number) => ({ min: () => 0, frontier });

describe('respawn time clock', () => {
  it('plays at its rate and stops at the frontier', () => {
    let f = 120;
    const c = new TimeClock(
      bounds(() => f),
      100,
      0.25,
    );
    c.update(0, 1000); // 1 s at quarter speed: 15 ticks
    expect(c.tick).toBeCloseTo(115);
    c.update(0, 1000);
    expect(c.tick).toBe(120); // held at the frontier
    f = 200;
    c.update(0, 1000);
    expect(c.tick).toBeCloseTo(135);
  });

  it('travels without jumping: slow, fast, slow, then arrives', async () => {
    const c = new TimeClock(
      bounds(() => 6000),
      0,
    );
    const arrived = c.travelTo(3600, 0);
    const ms = travelMs(3600);
    const samples: number[] = [];
    for (let t = 0; t <= ms; t += ms / 20) {
      c.update(t, ms / 20);
      samples.push(c.tick);
    }
    c.update(ms + 1, 1);
    await arrived;
    expect(c.tick).toBe(3600);
    const steps = samples.slice(1).map((v, i) => v - samples[i]!);
    // Never backwards, small at both ends, biggest in the middle.
    expect(steps.every((d) => d >= 0)).toBe(true);
    expect(steps[0]!).toBeLessThan(steps[10]!);
    expect(steps[19]!).toBeLessThan(steps[10]!);
    expect(ms).toBeLessThan(1400);
  });

  it('clamps trips to what has played', async () => {
    const c = new TimeClock(
      bounds(() => 500),
      400,
    );
    const p = c.travelTo(9000, 0);
    c.update(5000, 5000);
    await p;
    expect(c.tick).toBe(500);
  });
});
