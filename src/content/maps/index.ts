/** Every map the game knows, by id (PHASE05-a). Pure data, shared by the app, workers and tools. */
import type { MapDef } from '../../sim/world/map';
import { MISSION_03 } from './mission-03';
import { MISSION_04 } from './mission-04';
import { TEST_RANGE } from './test-range';

/**
 * Playable missions, in title-screen order. [D31]: Breach is the template and the default;
 * mission-01/02 were removed. (07-c) Compound is a proof of concept for indoor cover ([D38]).
 */
export const MISSIONS: readonly MapDef[] = [MISSION_03, MISSION_04];

/** (06-a) The mission a fresh game plays ([D27], [D28], [D31]). */
export const DEFAULT_MISSION: MapDef = MISSION_03;

const ALL: readonly MapDef[] = [...MISSIONS, TEST_RANGE];

export function findMap(id: string): MapDef | undefined {
  return ALL.find((m) => m.id === id);
}

/**
 * The mission to play: `id` if it names a playable mission, else the default (mission-03). A
 * remembered or linked id of a removed mission (mission-01/02) falls back here too ([D31]).
 */
export function missionOrDefault(id: string | null | undefined): MapDef {
  return MISSIONS.find((m) => m.id === id) ?? DEFAULT_MISSION;
}
