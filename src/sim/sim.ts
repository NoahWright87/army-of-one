import type { Tuning } from '../content/tuning';
import { compareIds, type IdCounters, allocateId } from './core/ids';
import type { Tick } from './core/time';
import {
  createSoldier,
  movementSolids,
  stepSoldierMovement,
  IDLE_INPUT,
  type SoldierId,
  type SoldierInput,
  type SoldierState,
} from './entities/soldier';
import type { SimEvent } from './events';
import type { MapDef, Rect, SpawnPointId } from './world/map';
import type { WorldView } from './view';

/**
 * Everything that changes during a battle, as plain structured-clone-safe data. Snapshots are
 * just clones of this. Static context (map, tuning) lives on `World`, outside the state.
 */
export interface WorldState {
  tick: Tick;
  ids: IdCounters;
  /** Kept sorted by id (allocation order) for deterministic iteration. */
  soldiers: SoldierState[];
  /** Events emitted during the most recent tick. */
  events: SimEvent[];
}

export interface World {
  readonly map: MapDef;
  readonly tuning: Tuning;
  /** Derived static data, cached. */
  readonly solids: readonly Rect[];
  state: WorldState;
}

export function createWorld(map: MapDef, tuning: Tuning): World {
  return {
    map,
    tuning,
    solids: movementSolids(map),
    state: { tick: 0, ids: {}, soldiers: [], events: [] },
  };
}

export function spawnSoldier(world: World, spawnPointId: SpawnPointId): SoldierId {
  const point = world.map.spawnPoints.find((p) => p.id === spawnPointId);
  if (!point) throw new Error(`Unknown spawn point ${spawnPointId}`);
  const id = allocateId(world.state.ids, 'S');
  const ordinal = world.state.ids['S'] ?? 1;
  world.state.soldiers.push(
    createSoldier(id, ordinal, spawnPointId, point.position, point.facing, world.tuning),
  );
  world.state.soldiers.sort((a, b) => compareIds(a.id, b.id));
  world.state.events.push({ kind: 'soldierSpawned', tick: world.state.tick, id });
  return id;
}

export function getSoldier(world: World, id: SoldierId): SoldierState | undefined {
  return world.state.soldiers.find((s) => s.id === id);
}

/** Advances the world exactly one tick. Inputs for soldiers not in the map are treated as idle. */
export function step(world: World, inputs: ReadonlyMap<SoldierId, SoldierInput>): void {
  const st = world.state;
  st.events = [];
  st.tick += 1;
  for (const s of st.soldiers) {
    if (!s.alive || !s.controllable) continue;
    stepSoldierMovement(s, inputs.get(s.id) ?? IDLE_INPUT, world.solids, world.tuning);
  }
}

export function getView(world: World): WorldView {
  const st = world.state;
  return {
    tick: st.tick,
    soldiers: st.soldiers.map((s) => ({
      kind: 'soldier',
      id: s.id,
      ordinal: s.ordinal,
      x: s.x,
      y: s.y,
      facing: s.facing,
      hp: s.hp,
      maxHp: world.tuning.soldier.maxHp,
      alive: s.alive,
      role: s.controllable ? 'live' : s.interactive ? 'echo' : 'static',
      leadIn: s.minHp > 0,
    })),
    turrets: [],
    mines: [],
    vehicles: [],
    gates: [],
    levers: [],
    bridges: [],
    objectives: [],
    events: st.events.slice(),
    missionComplete: null,
  };
}

export type { SoldierId, SoldierInput, SoldierState } from './entities/soldier';
