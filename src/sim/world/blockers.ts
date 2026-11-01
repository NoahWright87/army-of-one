import { isBridgeWalkable } from '../entities/bridge';
import { objectiveRadius } from '../entities/objective';
import { laneInfo, vehicleRect } from '../entities/traffic';
import type { World } from '../state';
import { squareAround, type Rect } from './map';

/** A piece of world-state geometry that currently blocks movement. */
export interface Blocker {
  id: string;
  rect: Rect;
  /** Also stops shots/LOS as plain cover (damageable entities are handled by the ray cast). */
  blocksShots: boolean;
}

/**
 * Movement blockers that come and go with world state, in a stable order: closed gates,
 * non-walkable bridges, live turrets, halted vehicles (stopped or wrecked), live objectives.
 * Moving vehicles don't block: they kill. Destroyed turrets are non-blocking wrecks.
 */
export function dynamicBlockers(world: World): Blocker[] {
  const { map, state: st, tuning } = world;
  const out: Blocker[] = [];
  (map.gates ?? []).forEach((def, i) => {
    if (!st.gates[i]!.open) out.push({ id: def.id, rect: def.rect, blocksShots: true });
  });
  (map.bridges ?? []).forEach((def, i) => {
    const b = st.bridges[i]!;
    if (isBridgeWalkable(b)) return;
    const blocksShots = b.state !== 'destroyed' && tuning.bridge.raisedBlocksShots;
    out.push({ id: def.id, rect: def.rect, blocksShots });
  });
  (map.turrets ?? []).forEach((def, i) => {
    if (st.turrets[i]!.mode !== 'destroyed') {
      out.push({
        id: def.id,
        rect: squareAround(def.position, tuning.turret.radius),
        blocksShots: false,
      });
    }
  });
  const lanes = (map.trafficLanes ?? []).map((d) => laneInfo(d, tuning));
  for (const v of st.vehicles) {
    if (v.state === 'moving') continue;
    const blocksShots = v.state === 'wreck' && tuning.vehicle.wreckBlocksShots;
    out.push({ id: v.id, rect: vehicleRect(v, lanes[v.lane]!), blocksShots });
  }
  (map.objectives ?? []).forEach((def, i) => {
    if (!st.objectives[i]!.destroyed) {
      out.push({
        id: def.id,
        rect: squareAround(def.position, objectiveRadius(def, tuning)),
        blocksShots: false,
      });
    }
  });
  return out;
}

/** Everything that blocks soldier movement right now: static walls/water + dynamic blockers. */
export function currentSolids(world: World, blockers = dynamicBlockers(world)): Rect[] {
  return [...world.solids, ...blockers.map((b) => b.rect)];
}
