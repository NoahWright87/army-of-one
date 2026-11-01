import type { Tick } from '../core/time';
import { isPointOurs } from '../entities/capture-point';
import type { World } from '../state';
import type { SpawnPointId } from './map';

/**
 * Spawn eligibility ([D26]): a recorded soldier spawns at its recorded spawn tick only if its
 * spawn point is ours at that tick in the current world. Initial points are always open ([D8]).
 * (05-a) A capture spawn point is open while its capture point is ours. Callers ask at the
 * current tick (the world is at `_tick` when soldiers spawn).
 */
export function isSpawnPointOpen(world: World, pointId: SpawnPointId, _tick: Tick): boolean {
  const p = world.map.spawnPoints.find((sp) => sp.id === pointId);
  if (!p) return false;
  if (p.kind === 'initial') return true;
  return p.capturePointId !== undefined && isPointOurs(world, p.capturePointId);
}
