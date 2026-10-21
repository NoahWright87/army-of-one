/** Scripted runs on mission-02 (PHASE05-a): capture the Outpost, spawn forward, take HQ. */
import { MISSION_02 } from '../../content/maps/mission-02';
import { secondsToTicks } from '../core/time';
import type { World } from '../state';
import type { ScriptStep } from './driver';
import { missionComplete, ROAD_TO_HIGHWAY, TURRET, turretDestroyed } from './mission-01';

export const OUTPOST = MISSION_02.capturePoints![0]!.position;
export const HQ = MISSION_02.capturePoints![1]!.position;

const stageOf = (w: World, id: string) => w.state.capturePoints.find((c) => c.id === id)?.stage;
export const outpostOurs = (w: World) => stageOf(w, 'cp-outpost') === 'ours';
export const hqOurs = (w: World) => stageOf(w, 'cp-hq') === 'ours';

/** Road spawn → highway → over the road bridge → stand on the Outpost until it's ours. */
export const ROAD_CAPTURE_OUTPOST: ScriptStep[] = [
  ...ROAD_TO_HIGHWAY,
  { kind: 'moveTo', to: { x: OUTPOST.x + 20, y: OUTPOST.y }, label: 'to the outpost' },
  { kind: 'waitUntil', until: outpostOurs, label: 'capture the outpost' },
];

/** Like ROAD_CAPTURE_OUTPOST, but dawdles 12 s after the highway (a slow first captor). */
export const ROAD_CAPTURE_OUTPOST_SLOW: ScriptStep[] = [
  ...ROAD_TO_HIGHWAY,
  { kind: 'wait', ticks: secondsToTicks(12), label: 'dawdle' },
  { kind: 'moveTo', to: { x: OUTPOST.x + 20, y: OUTPOST.y }, label: 'to the outpost' },
  { kind: 'waitUntil', until: outpostOurs, label: 'capture the outpost' },
];

/** From the Outpost: snipe the turret, walk into the compound, raise our flag at HQ. */
export const OUTPOST_TO_HQ: ScriptStep[] = [
  { kind: 'moveTo', to: { x: 4000, y: 1300 }, label: 'just outside turret range' },
  { kind: 'shoot', at: TURRET, until: turretDestroyed, label: 'shoot the turret' },
  { kind: 'moveTo', to: { x: 5500, y: 1300 }, label: 'into the compound' },
  { kind: 'moveTo', to: { x: HQ.x, y: HQ.y + 20 }, label: 'to HQ' },
  { kind: 'waitUntil', until: missionComplete, label: 'raise our flag at HQ' },
];
