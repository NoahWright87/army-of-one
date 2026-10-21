/**
 * Browser stress mode (PHASE05-b): `?stress=100` plays 100 bot lives (src/sim/bots/) through
 * chained attempts, time-sliced so the page stays responsive, then hands the resulting mission
 * (records, truth, snapshots) to the game controller, which opens the respawn screen: deploy and
 * play among them. `&stressSeed=n` picks another army.
 */
import type { Tuning } from '../content/tuning';
import type { MissionState } from '../contracts/mission';
import type { SnapshotStore } from '../sim/attempt';
import { ArmyBuilder } from '../sim/bots/army';
import type { MapDef } from '../sim/world/map';
import { applyObservation } from '../timeline/truth';

export interface StressMission {
  state: MissionState;
  snapshots: SnapshotStore;
  ms: number;
}

/** Plays `count` bot lives, yielding to the browser between lives. */
export async function generateStressMission(
  map: MapDef,
  tuning: Tuning,
  count: number,
  seed: number,
  onProgress: (done: number, total: number) => void,
): Promise<StressMission> {
  const t0 = performance.now();
  const army = new ArmyBuilder({ map, tuning, seed });
  let lanes: MissionState['lanes'] = [];
  let sliceStart = performance.now();
  while (army.size < count) {
    const life = army.next();
    lanes = applyObservation(lanes, life.records, life.result.observation).lanes;
    if (performance.now() - sliceStart > 40) {
      onProgress(army.size, count);
      await new Promise((r) => setTimeout(r, 0));
      sliceStart = performance.now();
    }
  }
  onProgress(count, count);
  return {
    state: {
      schemaVersion: 1,
      missionId: map.id,
      attemptCount: army.size,
      soldiers: army.records,
      lanes,
    },
    snapshots: army.snapshots,
    ms: performance.now() - t0,
  };
}
