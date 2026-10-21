import type { Tick } from '../core/time';
import type { World } from '../state';
import type { SpawnPointId } from './map';

/**
 * Spawn eligibility ([D26]): a recorded soldier spawns at its recorded spawn tick only if its
 * spawn point is ours at that tick in the current world. Initial points are always open ([D8]).
 * PHASE05-a implements capture points here; until then every known point is open.
 */
export function isSpawnPointOpen(world: World, pointId: SpawnPointId, _tick: Tick): boolean {
  return world.map.spawnPoints.some((p) => p.id === pointId);
}
