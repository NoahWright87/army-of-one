import type { MapDef } from '../../sim/world/map';
import { MISSION_01 } from './mission-01';

/**
 * Mission 02: "Outpost" (PHASE05-a). Mission 01's battlefield, with two capture points:
 *
 * - **Outpost** (forward capture point) in the road corridor, just past the destructible bridge
 *   and out of the turret's range. Once captured it becomes a forward spawn point ([D8]) that
 *   opens at its capture time: later soldiers skip the switchback, the highway traffic and the
 *   bridge, so rushing it early is worth it. If the soldiers who captured it die earlier in a
 *   later attempt, the spawn is lost and everyone who entered there never spawns ([D9], [D26]).
 * - **HQ** (flag objective, [D17]) inside the compound. The mission completes when HQ is ours.
 *   There is no depot to destroy on this map.
 *
 *   R = Road, B = Beach, P = Outpost (forward spawn), H = HQ flag, T = turret.
 *
 *   │  R  │highway│ north corridor [GATE]   │  COMPOUND  H  │
 *   │     │       │ road ~[BRIDGE]~ P   T ──┘               │
 */
export const MISSION_02: MapDef = {
  ...MISSION_01,
  id: 'mission-02',
  nameKey: 'map.mission02.name',
  spawnPoints: [
    ...MISSION_01.spawnPoints,
    {
      id: 'outpost',
      nameKey: 'spawn.mission02.outpost',
      position: { x: 3470, y: 1300 },
      facing: 0,
      kind: 'capture',
      capturePointId: 'cp-outpost',
    },
  ],
  objectives: [],
  capturePoints: [
    { id: 'cp-outpost', nameKey: 'capture.mission02.outpost', position: { x: 3500, y: 1300 } },
    {
      id: 'cp-hq',
      nameKey: 'capture.mission02.hq',
      position: { x: 5750, y: 600 },
      objective: true,
    },
  ],
};
