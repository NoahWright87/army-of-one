/** Every map the game knows, by id (PHASE05-a). Pure data, shared by the app, workers and tools. */
import type { MapDef } from '../../sim/world/map';
import { MISSION_03 } from './mission-03';
import { MISSION_04 } from './mission-04';
import { MISSION_05 } from './mission-05';
import { TEST_RANGE } from './test-range';

/**
 * Playable missions, in title-screen order. [D31]: Breach is the template and the default;
 * mission-01/02 were removed. (07-c) Compound is a proof of concept for indoor cover ([D38]).
 * (PHASE12-b) Armored Push: the long vehicle mission ([D69]).
 */
export const MISSIONS: readonly MapDef[] = [MISSION_03, MISSION_04, MISSION_05];

/** (06-a) The mission a fresh game plays ([D27], [D28], [D31]). */
export const DEFAULT_MISSION: MapDef = MISSION_03;

const ALL: readonly MapDef[] = [...MISSIONS, TEST_RANGE];

/**
 * (PHASE13-a) Maps made at runtime, e.g. the block editor's Play map. The app registers them
 * before the game starts; the same code then finds them like any other map.
 */
const RUNTIME: MapDef[] = [];

export function registerMap(map: MapDef): void {
  const i = RUNTIME.findIndex((m) => m.id === map.id);
  if (i >= 0) RUNTIME[i] = map;
  else RUNTIME.push(map);
}

export function findMap(id: string): MapDef | undefined {
  return ALL.find((m) => m.id === id) ?? RUNTIME.find((m) => m.id === id);
}

/**
 * The mission to play: `id` if it names a playable mission, else the default (mission-03). A
 * remembered or linked id of a removed mission (mission-01/02) falls back here too ([D31]).
 */
export function missionOrDefault(id: string | null | undefined): MapDef {
  return MISSIONS.find((m) => m.id === id) ?? RUNTIME.find((m) => m.id === id) ?? DEFAULT_MISSION;
}
