/**
 * (07-d) Traffic is a finite pool on a hidden loop ([D48]): same rhythm as before, but a
 * destroyed car never comes back.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, withTuning } from '../../content/tuning';
import { damageVehicle } from '../combat/damage';
import { laneInfo, lanePoolSize } from '../entities/traffic';
import { arena, run, world } from './helpers';

const lane = { id: 'lane-1', from: { x: -100, y: 500 }, to: { x: 1100, y: 500 } };

describe('traffic loop ([D48])', () => {
  it('the pool (on road + on the hidden loop) is constant, and loses each destroyed car', () => {
    const w = world(arena({ trafficLanes: [lane] }), {
      vehicle: { blockedBehavior: 'passThrough' },
    });
    const size = lanePoolSize(laneInfo(lane, w.tuning));
    const total = () =>
      w.state.vehicles.filter((v) => v.state !== 'wreck').length + (w.state.trafficPool?.[0] ?? 0);
    expect(total()).toBe(size);
    run(w, 600);
    expect(total()).toBe(size);
    const i = w.state.vehicles.findIndex((v) => v.state === 'moving');
    damageVehicle(w, i, 10_000, 'S1');
    run(w, 1200);
    expect(total()).toBe(size - 1);
  });

  it('with every car destroyed, the road goes quiet for good', () => {
    const w = world(arena({ trafficLanes: [lane] }), {
      vehicle: { blockedBehavior: 'passThrough' },
    });
    // Shoot every car as it appears, for a while.
    for (let k = 0; k < 2000; k++) {
      w.state.vehicles.forEach((v, i) => {
        if (v.state === 'moving') damageVehicle(w, i, 10_000, 'S1');
      });
      run(w, 1);
    }
    run(w, 3000);
    expect(w.state.vehicles.filter((v) => v.state === 'moving')).toHaveLength(0);
  });

  it('keeps the old rhythm while nothing is destroyed', () => {
    const t = withTuning(DEFAULT_TUNING, {});
    const w = world(arena({ trafficLanes: [lane] }));
    const info = laneInfo(lane, t);
    let entries = 0;
    let prev = new Set(w.state.vehicles.map((v) => v.id));
    for (let i = 0; i < info.intervalTicks * 10; i++) {
      run(w, 1);
      for (const v of w.state.vehicles) if (!prev.has(v.id)) entries++;
      prev = new Set(w.state.vehicles.map((v) => v.id));
    }
    expect(entries).toBe(10);
  });
});
