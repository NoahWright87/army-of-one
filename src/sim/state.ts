import type { Tuning } from '../content/tuning';
import type { IdCounters } from './core/ids';
import type { Tick } from './core/time';
import type { BridgeEntity } from './entities/bridge';
import type { GateEntity } from './entities/gate';
import type { MineEntity } from './entities/mine';
import type { ObjectiveEntity } from './entities/objective';
import type { SoldierState } from './entities/soldier';
import type { VehicleEntity } from './entities/traffic';
import type { TurretEntity } from './entities/turret';
import type { SimEvent } from './events';
import type { EventLog } from './event-log';
import type { MapDef, Rect } from './world/map';
import type { NavGrid } from './world/nav';

/**
 * Everything that changes during a battle, as plain structured-clone-safe data. Snapshots are
 * just clones of this. Static context (map, tuning, derived caches) lives on `World`, outside it.
 *
 * Entity arrays for map-defined entities (turrets, mines, gates, bridges, objectives) are in the
 * same order as their defs on the MapDef: `state.turrets[i]` belongs to `map.turrets[i]`.
 * Soldiers and vehicles are kept sorted by id (allocation order).
 */
export interface WorldState {
  tick: Tick;
  ids: IdCounters;
  soldiers: SoldierState[];
  turrets: TurretEntity[];
  mines: MineEntity[];
  vehicles: VehicleEntity[];
  gates: GateEntity[];
  bridges: BridgeEntity[];
  objectives: ObjectiveEntity[];
  /** Events emitted during the most recent tick. */
  events: SimEvent[];
  /** Events emitted between ticks (e.g. spawns); they open the next tick's `events`. */
  queuedEvents: SimEvent[];
  /** Set when every objective is destroyed ([D17]). */
  missionComplete: { tick: Tick; by?: string } | null;
}

export interface World {
  readonly map: MapDef;
  readonly tuning: Tuning;
  /** Static geometry that blocks movement (walls + water). Derived, cached. */
  readonly solids: readonly Rect[];
  /** Walkability grid for pathfinding. Derived from map + state; synced lazily. */
  readonly nav: NavGrid;
  /** Ring buffer of recent events across ticks. A log, not part of the sim's state. */
  readonly eventLog: EventLog;
  /** True while `step` runs; events emitted outside a step are queued for the next tick. */
  stepping: boolean;
  state: WorldState;
}

/** Records an event for the current tick (or queues it for the next one, between steps). */
export function emit(world: World, event: SimEvent): void {
  if (world.stepping) world.state.events.push(event);
  else world.state.queuedEvents.push(event);
}
