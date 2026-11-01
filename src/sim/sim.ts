import type { Tuning } from '../content/tuning';
import { quantizeFacing, quantizePosition } from '../contracts/quantize';
import { compareIds, allocateId } from './core/ids';
import { secondsToTicks } from './core/time';
import type { Vec2 } from './core/vec';
import { trySoldierFire } from './combat/shots';
import { bridgeRaised, createBridges, stepBridges } from './entities/bridge';
import {
  CAPTURE_FULL,
  captureRadius,
  createCapturePoints,
  stepCapturePoints,
} from './entities/capture-point';
import { createGates } from './entities/gate';
import { interact, isLeverOn } from './entities/lever';
import { createMines, stepMines } from './entities/mine';
import { createObjectives, objectiveMaxHp, objectiveRadius } from './entities/objective';
import {
  createSoldier,
  isEligible,
  movementSolids,
  stepSoldierMovement,
  IDLE_INPUT,
  type SoldierFlags,
  type SoldierId,
  type SoldierInput,
  type SoldierState,
} from './entities/soldier';
import { initialVehicles, laneInfo, stepTraffic } from './entities/traffic';
import { createTurrets, stepTurrets } from './entities/turret';
import { appendEvents, createEventLog, eventLogContents } from './event-log';
import type { SimEvent } from './events';
import { emit, type World } from './state';
import { currentSolids } from './world/blockers';
import { moveCircle } from './world/collision';
import { validateMap, type MapDef, type Rect, type SpawnPointId } from './world/map';
import { createNavGrid } from './world/nav';
import { separateSoldiers } from './world/separation';
import { simPerf } from './perf';
import type { WorldView } from './view';

export type { World, WorldState } from './state';

export function createWorld(map: MapDef, tuning: Tuning): World {
  validateMap(map);
  const solids = movementSolids(map);
  const world: World = {
    map,
    tuning,
    solids,
    nav: createNavGrid(map.width, map.height, solids, tuning),
    eventLog: createEventLog(tuning.eventLogCapacity),
    stepping: false,
    state: {
      tick: 0,
      ids: {},
      soldiers: [],
      turrets: createTurrets(map.turrets ?? [], tuning),
      mines: createMines(map.mines ?? []),
      vehicles: [],
      gates: createGates(map.gates ?? []),
      bridges: createBridges(map.bridges ?? [], tuning),
      objectives: createObjectives(map.objectives ?? [], tuning),
      capturePoints: createCapturePoints(map.capturePoints ?? []),
      events: [],
      queuedEvents: [],
      missionComplete: null,
    },
  };
  initialVehicles(world);
  return world;
}

export interface SpawnOptions extends SoldierFlags {
  /** Spawn here instead of at the spawn point (e.g. tests, snapshot restores). */
  position?: Vec2;
  facing?: number;
  /**
   * (03-a) Explicit id, e.g. a recorded soldier's `SoldierRecord.id`, so ids match across
   * attempts. Must be `S<n>` and unused; the allocator skips past it so it never collides.
   */
  id?: SoldierId;
  /** (03-a) Explicit ordinal (default: the id's number, or the allocation count). */
  ordinal?: number;
}

/** Snaps a soldier's pose to the recording quanta (`contracts/quantize.ts`). */
export function quantizeSoldier(s: SoldierState): void {
  s.x = quantizePosition(s.x);
  s.y = quantizePosition(s.y);
  s.facing = quantizeFacing(s.facing);
}

/**
 * Adds a soldier at a spawn point. Defaults to a live soldier (controllable, interactive,
 * killable). Echoes/static figures pass flags, e.g. `{ controllable: false }` or
 * `{ controllable: false, interactive: false }`; lead-ins pass `{ minHp: 1 }`.
 */
export function spawnSoldier(
  world: World,
  spawnPointId: SpawnPointId,
  opts: SpawnOptions = {},
): SoldierId {
  const point = world.map.spawnPoints.find((p) => p.id === spawnPointId);
  if (!point) throw new Error(`Unknown spawn point ${spawnPointId}`);
  const st = world.state;
  let id: SoldierId;
  let ordinal: number;
  if (opts.id !== undefined) {
    const m = /^S(\d+)$/.exec(opts.id);
    if (!m) throw new Error(`Soldier id must look like S<n>: ${opts.id}`);
    if (st.soldiers.some((s) => s.id === opts.id)) throw new Error(`Duplicate soldier ${opts.id}`);
    id = opts.id;
    st.ids['S'] = Math.max(st.ids['S'] ?? 0, Number(m[1]));
    ordinal = opts.ordinal ?? Number(m[1]);
  } else {
    id = allocateId(st.ids, 'S');
    ordinal = opts.ordinal ?? st.ids['S'] ?? 1;
  }
  const soldier = createSoldier(
    id,
    ordinal,
    spawnPointId,
    opts.position ?? point.position,
    opts.facing ?? point.facing,
    world.tuning,
    opts,
  );
  quantizeSoldier(soldier);
  st.soldiers.push(soldier);
  st.soldiers.sort((a, b) => compareIds(a.id, b.id));
  emit(world, { kind: 'soldierSpawned', tick: st.tick, id });
  return id;
}

export function getSoldier(world: World, id: SoldierId): SoldierState | undefined {
  if (simPerf.soldierIndex) return soldierIndex(world.state.soldiers).get(id);
  return world.state.soldiers.find((s) => s.id === id);
}

/**
 * (05-b) Cached id → soldier map per soldiers array. Soldiers are only ever appended (spawns)
 * and mutated in place, and a restored snapshot brings a new array, so (array, length) is a
 * safe cache key.
 */
const soldierIndexCache = new WeakMap<
  readonly SoldierState[],
  { len: number; byId: Map<SoldierId, SoldierState> }
>();

export function soldierIndex(soldiers: readonly SoldierState[]): Map<SoldierId, SoldierState> {
  const hit = soldierIndexCache.get(soldiers);
  if (hit && hit.len === soldiers.length) return hit.byId;
  const byId = new Map<SoldierId, SoldierState>();
  for (const s of soldiers) byId.set(s.id, s);
  soldierIndexCache.set(soldiers, { len: soldiers.length, byId });
  return byId;
}

/** Changes a soldier's flags (e.g. an echo taking over a live soldier, or a lead-in ending). */
export function setSoldierFlags(world: World, id: SoldierId, flags: SoldierFlags): void {
  const s = getSoldier(world, id);
  if (!s) throw new Error(`Unknown soldier ${id}`);
  if (flags.controllable !== undefined) s.controllable = flags.controllable;
  if (flags.interactive !== undefined) s.interactive = flags.interactive;
  if (flags.minHp !== undefined) s.minHp = flags.minHp;
  if (flags.kinematic !== undefined) s.kinematic = flags.kinematic;
}

/**
 * (03-a) Optional extension points inside `step`, used by the echo controller so echoes move and
 * act at exactly the point in the tick where live soldiers do. That is what makes an unchanged
 * history replay bit-exactly.
 */
export interface StepHooks {
  /** Moves non-controllable soldiers (echoes), right after live movement, before separation. */
  moveUncontrolled?(world: World, solids: readonly Rect[]): void;
  /** After movement + separation + quantization, before any action (recorders read poses here). */
  afterMovement?(world: World): void;
  /** Actions of one alive, non-controllable soldier, called in id order alongside live ones. */
  actUncontrolled?(world: World, s: SoldierState): void;
}

/**
 * Advances the world exactly one tick and returns that tick's events (also in `state.events` and
 * the event log). Inputs only drive alive, controllable soldiers; missing inputs are idle.
 *
 * Order within a tick: movement (live, then `hooks.moveUncontrolled`) → soft separation →
 * quantize poses → `hooks.afterMovement` → soldier actions (interact, fire; echoes via
 * `hooks.actUncontrolled`; id order) → turrets → mines → traffic → bridges → push soldiers out of
 * anything that became solid → quantize poses → capture points (05-a).
 */
export function step(
  world: World,
  inputs: ReadonlyMap<SoldierId, SoldierInput>,
  hooks: StepHooks = {},
): SimEvent[] {
  const st = world.state;
  const t = world.tuning;
  world.stepping = true;
  st.tick += 1;
  st.events = st.queuedEvents;
  st.queuedEvents = [];

  let solids = currentSolids(world);
  for (const s of st.soldiers) {
    if (!s.alive || !s.controllable) continue;
    stepSoldierMovement(s, inputs.get(s.id) ?? IDLE_INPUT, solids, t);
  }
  hooks.moveUncontrolled?.(world, solids);
  separateSoldiers(st.soldiers, solids, t);
  for (const s of st.soldiers) if (s.alive) quantizeSoldier(s);
  hooks.afterMovement?.(world);

  for (const s of st.soldiers) {
    if (!s.alive) continue;
    if (!s.controllable) {
      hooks.actUncontrolled?.(world, s);
      continue;
    }
    const input = inputs.get(s.id) ?? IDLE_INPUT;
    if (input.interact && !s.interactHeld) interact(world, s);
    s.interactHeld = input.interact;
    if (input.fire) trySoldierFire(world, s, input.aim);
  }

  stepTurrets(world);
  stepMines(world);
  stepTraffic(world);
  stepBridges(world);

  // Anything that became solid this tick (gate closed, wreck, bridge rising) pushes soldiers out.
  solids = currentSolids(world);
  for (const s of st.soldiers) {
    if (!isEligible(s)) continue;
    const p = moveCircle(s, { x: 0, y: 0 }, t.soldier.wallRadius, solids);
    s.x = p.x;
    s.y = p.y;
    quantizeSoldier(s);
  }

  // (05-a) Capture points read the final positions of the tick.
  stepCapturePoints(world);

  world.stepping = false;
  appendEvents(world.eventLog, st.events);
  return st.events;
}

/** Recent events across ticks, oldest first (ring buffer of `tuning.eventLogCapacity`). */
export function recentEvents(world: World): SimEvent[] {
  return eventLogContents(world.eventLog);
}

export function getView(world: World): WorldView {
  const { map, state: st, tuning } = world;
  const lanes = (map.trafficLanes ?? []).map((d) => laneInfo(d, tuning));
  const windupTotal = Math.max(1, secondsToTicks(tuning.turret.windupSeconds));
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
      maxHp: tuning.soldier.maxHp,
      alive: s.alive,
      role: s.viewRole ?? (s.controllable ? 'live' : s.interactive ? 'echo' : 'static'),
      leadIn: s.minHp > 0,
      ...(s.deathCause ? { deathCause: s.deathCause } : {}),
    })),
    turrets: (map.turrets ?? []).map((def, i) => {
      const tu = st.turrets[i]!;
      return {
        kind: 'turret',
        id: def.id,
        x: def.position.x,
        y: def.position.y,
        aim: tu.aim,
        state: tu.mode,
        hp: tu.hp,
        maxHp: tuning.turret.maxHp,
        range: tuning.turret.range,
        ...(tu.mode === 'windup' ? { windup: 1 - tu.windupTicks / windupTotal } : {}),
        ...(tu.targetId ? { targetId: tu.targetId } : {}),
      };
    }),
    mines: (map.mines ?? []).map((def, i) => ({
      kind: 'mine',
      id: def.id,
      x: def.position.x,
      y: def.position.y,
      state: st.mines[i]!.state,
      triggerRadius: tuning.mine.triggerRadius,
      blastRadius: tuning.mine.blastRadius,
      radius: tuning.mine.radius,
    })),
    vehicles: st.vehicles.map((v) => {
      const info = lanes[v.lane]!;
      return {
        kind: 'vehicle',
        id: v.id,
        x: v.x,
        y: v.y,
        w: info.w,
        h: info.h,
        heading: info.heading,
        state: v.state,
        hp: v.hp,
        maxHp: tuning.vehicle.maxHp,
      };
    }),
    gates: (map.gates ?? []).map((def, i) => ({
      kind: 'gate',
      id: def.id,
      ...def.rect,
      open: st.gates[i]!.open,
    })),
    levers: (map.levers ?? []).map((def) => ({
      kind: 'lever',
      id: def.id,
      x: def.position.x,
      y: def.position.y,
      on: isLeverOn(world, def),
      targetId: def.targetId,
    })),
    bridges: (map.bridges ?? []).map((def, i) => {
      const b = st.bridges[i]!;
      const charge =
        def.charge && b.state !== 'destroyed'
          ? {
              charge: {
                x: def.charge.x,
                y: def.charge.y,
                radius: tuning.bridge.chargeRadius,
                hp: b.chargeHp,
                maxHp: tuning.bridge.chargeHp,
              },
            }
          : {};
      return {
        kind: 'bridge',
        id: def.id,
        ...def.rect,
        state: b.state,
        raised: bridgeRaised(b, tuning),
        bridgeKind: def.kind,
        axis: def.axis,
        ...charge,
      };
    }),
    objectives: (map.objectives ?? []).map((def, i) => {
      const o = st.objectives[i]!;
      return {
        kind: 'objective',
        id: def.id,
        x: def.position.x,
        y: def.position.y,
        radius: objectiveRadius(def, tuning),
        hp: o.hp,
        maxHp: objectiveMaxHp(def, tuning),
        destroyed: o.destroyed,
      };
    }),
    capturePoints: (map.capturePoints ?? []).map((def, i) => {
      const cp = st.capturePoints[i]!;
      return {
        kind: 'capturePoint',
        id: def.id,
        nameKey: def.nameKey,
        x: def.position.x,
        y: def.position.y,
        radius: captureRadius(def, tuning),
        stage: cp.stage,
        progress: cp.progress / CAPTURE_FULL,
        contributors: cp.contributors.slice(),
        objective: !!def.objective,
        spawnPointIds: map.spawnPoints
          .filter((sp) => sp.kind === 'capture' && sp.capturePointId === def.id)
          .map((sp) => sp.id),
      };
    }),
    events: st.events.slice(),
    missionComplete: st.missionComplete ? { ...st.missionComplete } : null,
  };
}

export type { SoldierFlags, SoldierId, SoldierInput, SoldierState } from './entities/soldier';
export { fireRifle, trySoldierFire, castRay, hasLineOfSight } from './combat/shots';
export { interact } from './entities/lever';
export { isSpawnPointOpen } from './world/spawn-points';
export { findPath, isWalkable, isSegmentWalkable, pathLength, syncNav } from './world/nav';
