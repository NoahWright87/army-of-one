/** Every map the game knows, by id (PHASE05-a). Pure data, shared by the app, workers and tools. */
import type { MapDef } from '../../sim/world/map';
import { MISSION_01 } from './mission-01';
import { MISSION_02 } from './mission-02';
import { TEST_RANGE } from './test-range';

/** Playable missions, in title-screen order. */
export const MISSIONS: readonly MapDef[] = [MISSION_01, MISSION_02];

const ALL: readonly MapDef[] = [...MISSIONS, TEST_RANGE];

export function findMap(id: string): MapDef | undefined {
  return ALL.find((m) => m.id === id);
}

/** The mission to play: `id` if it names a playable mission, else mission-01. */
export function missionOrDefault(id: string | null | undefined): MapDef {
  return MISSIONS.find((m) => m.id === id) ?? MISSION_01;
}
