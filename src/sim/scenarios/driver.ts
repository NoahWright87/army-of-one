/**
 * Scripted soldier inputs for headless scenario tests and `npm run sim -- --script <name>`.
 * A script is a list of steps; the driver turns the current step into one `SoldierInput` per tick.
 * Pure and deterministic like the rest of the sim (it only reads world state).
 */
import type { Tuning } from '../../content/tuning';
import { angleBetween, distance, normalize, sub, type Vec2 } from '../core/vec';
import { laneInfo } from '../entities/traffic';
import type { SoldierInput, SoldierState } from '../entities/soldier';
import type { SimEvent } from '../events';
import { createWorld, getSoldier, spawnSoldier, step, type World } from '../sim';
import type { MapDef, SpawnPointId } from '../world/map';
import { findPath } from '../world/nav';

export type ScriptStep =
  /** Walk to a point, routing around walls with the nav grid. */
  | { kind: 'moveTo'; to: Vec2; label?: string }
  /** Walk straight to a point (e.g. weaving between mines, which nav doesn't avoid). */
  | { kind: 'walkStraight'; to: Vec2; label?: string }
  /** Stand still until the predicate holds. */
  | { kind: 'waitUntil'; until: (world: World, me: SoldierState) => boolean; label?: string }
  | { kind: 'wait'; ticks: number; label?: string }
  /** Press interact once (edge-triggered). */
  | { kind: 'interact'; label?: string }
  /** Hold fire aimed at a point until the predicate holds. */
  | { kind: 'shoot'; at: Vec2; until: (world: World) => boolean; label?: string };

export interface Scenario {
  name: string;
  description: string;
  map: MapDef;
  spawn: SpawnPointId;
  steps: ScriptStep[];
  /** Hard stop. */
  maxTicks: number;
  tuning?: Tuning;
}

export interface ScenarioResult {
  world: World;
  soldierId: string;
  /** Script finished every step (vs. died or ran out of ticks). */
  completed: boolean;
  /** Index of the step the script stopped in. */
  stepIndex: number;
}

const ARRIVE_EPS = 3;

function moveInput(me: SoldierState, target: Vec2): SoldierInput {
  const d = sub(target, me);
  const len = Math.hypot(d.x, d.y);
  // Slow down on the last tick so we land on the point instead of oscillating around it.
  const scale = Math.min(1, len / 2.5);
  const dir = normalize(d);
  return {
    move: { x: dir.x * scale, y: dir.y * scale },
    aim: len > 0 ? Math.atan2(d.y, d.x) : me.facing,
    fire: false,
    interact: false,
  };
}

/**
 * Turns a script into one `SoldierInput` per tick for a soldier stepped by someone else's loop
 * (e.g. the PHASE03-a attempt runner). Call `input` exactly once per stepped tick; it returns null
 * once the script has finished every step.
 */
export interface ScriptDriver {
  input(world: World, me: SoldierState): SoldierInput | null;
  /** Index of the current step (=== steps.length when finished). */
  readonly stepIndex: number;
  readonly finished: boolean;
}

export function createScriptDriver(steps: readonly ScriptStep[], name = 'script'): ScriptDriver {
  let index = 0;
  let path: Vec2[] | null = null;
  let waypoint = 0;
  let stepTicks = 0;

  const input = (world: World, me: SoldierState): SoldierInput | null => {
    for (;;) {
      const st = steps[index];
      if (!st) return null;
      let out: SoldierInput = {
        move: { x: 0, y: 0 },
        aim: me.facing,
        fire: false,
        interact: false,
      };
      let done = false;

      switch (st.kind) {
        case 'moveTo':
        case 'walkStraight': {
          if (!path) {
            path =
              st.kind === 'moveTo' ? findPath(world, me, st.to) : [{ x: me.x, y: me.y }, st.to];
            if (!path) throw new Error(`${name}: no path for step ${index} (${st.label ?? ''})`);
            waypoint = 1;
          }
          while (waypoint < path.length && distance(me, path[waypoint]!) <= ARRIVE_EPS) waypoint++;
          if (waypoint >= path.length) done = true;
          else out = moveInput(me, path[waypoint]!);
          break;
        }
        case 'waitUntil':
          done = st.until(world, me);
          break;
        case 'wait':
          done = stepTicks >= st.ticks;
          break;
        case 'interact':
          out = { ...out, interact: stepTicks === 0 };
          done = stepTicks >= 1;
          break;
        case 'shoot':
          done = st.until(world);
          if (!done) out = { ...out, aim: angleBetween(me, st.at), fire: true };
          break;
      }

      if (done) {
        index += 1;
        path = null;
        stepTicks = 0;
        continue; // next step starts this same tick
      }
      stepTicks += 1;
      return out;
    }
  };

  return {
    input,
    get stepIndex() {
      return index;
    },
    get finished() {
      return index >= steps.length;
    },
  };
}

/** Steps a scripted soldier until the script ends, it dies, or `maxTicks` pass. */
export function runScenario(
  sc: Scenario,
  tuning: Tuning,
  onTick?: (world: World, events: SimEvent[]) => void,
): ScenarioResult {
  const world = createWorld(sc.map, sc.tuning ?? tuning);
  const id = spawnSoldier(world, sc.spawn);
  const driver = createScriptDriver(sc.steps, sc.name);

  while (world.state.tick < sc.maxTicks) {
    const me = getSoldier(world, id)!;
    if (!me.alive) break;
    const input = driver.input(world, me);
    if (!input) break;
    const events = step(world, new Map([[id, input]]));
    onTick?.(world, events);
  }
  return { world, soldierId: id, completed: driver.finished, stepIndex: driver.stepIndex };
}

/**
 * True if a soldier walking straight along +x at `y` from its current x, at full speed, would
 * cross the given traffic lanes without touching a moving vehicle (with a safety margin).
 * Assumes vertical lanes. Used by scripts to time a frogger crossing.
 */
export function isCrossingSafe(
  world: World,
  me: SoldierState,
  y: number,
  laneIds: string[],
): boolean {
  const t = world.tuning;
  const perTick = t.soldier.speed / 60;
  const r = t.soldier.hitboxRadius;
  const lanes = world.map.trafficLanes ?? [];
  const marginTicks = 8;
  for (const v of world.state.vehicles) {
    if (v.state !== 'moving') continue;
    const def = lanes[v.lane]!;
    if (!laneIds.includes(def.id)) continue;
    const info = laneInfo(def, t);
    // When is the soldier inside this lane's x-band?
    const x0 = v.x - info.w / 2 - r;
    const x1 = v.x + info.w / 2 + r;
    const sIn = (x0 - me.x) / perTick;
    const sOut = (x1 - me.x) / perTick;
    if (sOut < 0) continue;
    // When is the vehicle over the soldier's y-band?
    const reach = info.h / 2 + r;
    const vy = info.dir.y * info.stepPerTick;
    const a = (y - reach - v.y) / vy;
    const b = (y + reach - v.y) / vy;
    const vIn = Math.min(a, b);
    const vOut = Math.max(a, b);
    if (vOut < 0) continue;
    if (vIn - marginTicks < sOut && sIn < vOut + marginTicks) return false;
  }
  return true;
}

/**
 * (06-a) The forward-is-up counterpart of `isCrossingSafe`: true if a soldier walking straight
 * up (−y) at column `x` from its current y, at full speed, would cross the given horizontal
 * traffic lanes without touching a moving vehicle (with a safety margin). Only vehicles already
 * on the road count, so cross far enough from the lanes' entry ends (e.g. mid-map).
 */
export function isCrossingSafeUp(
  world: World,
  me: SoldierState,
  x: number,
  laneIds: string[],
): boolean {
  const t = world.tuning;
  const perTick = t.soldier.speed / 60;
  const r = t.soldier.hitboxRadius;
  const lanes = world.map.trafficLanes ?? [];
  const marginTicks = 10;
  for (const v of world.state.vehicles) {
    if (v.state !== 'moving') continue;
    const def = lanes[v.lane]!;
    if (!laneIds.includes(def.id)) continue;
    const info = laneInfo(def, t);
    // When is the soldier inside this lane's y-band?
    const sIn = (me.y - (v.y + info.h / 2 + r)) / perTick;
    const sOut = (me.y - (v.y - info.h / 2 - r)) / perTick;
    if (sOut < 0) continue;
    // When is the vehicle over the soldier's x-band?
    const reach = info.w / 2 + r;
    const vx = info.dir.x * info.stepPerTick;
    const a = (x - reach - v.x) / vx;
    const b = (x + reach - v.x) / vx;
    const vIn = Math.min(a, b);
    const vOut = Math.max(a, b);
    if (vOut < 0) continue;
    if (vIn - marginTicks < sOut && sIn < vOut + marginTicks) return false;
  }
  return true;
}
