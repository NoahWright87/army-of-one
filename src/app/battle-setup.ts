import { MISSION_01 } from '../content/maps/mission-01';
import type { Tuning } from '../content/tuning';
import { createWorld, spawnSoldier } from '../sim/sim';
import type { MapDef } from '../sim/world/map';
import type { BattleSession } from '../render/phaser/services';

/** The map the default battle runs on. */
export const BATTLE_MAP: MapDef = MISSION_01;

/** Default sandbox session: fresh world, one live soldier at the first spawn point. */
export function createDefaultSession(
  tuning: Tuning,
  makeInput: BattleSession['makeInput'],
  map: MapDef = BATTLE_MAP,
): BattleSession {
  const world = createWorld(map, tuning);
  const first = map.spawnPoints[0];
  if (!first) throw new Error(`Map ${map.id} has no spawn points`);
  const liveId = spawnSoldier(world, first.id);
  return { world, liveId, makeInput };
}
