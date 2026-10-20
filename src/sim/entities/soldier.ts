import type { Tuning } from '../../content/tuning';
import { DT, type Tick } from '../core/time';
import { clampLength, type Vec2 } from '../core/vec';
import { moveCircle } from '../world/collision';
import type { MapDef, Rect, SpawnPointId } from '../world/map';

export type SoldierId = string;

/** What a controlled soldier wants to do this tick. Produced by input sources, never by the sim. */
export interface SoldierInput {
  /** Desired movement; each axis in [-1, 1]. Length is clamped to 1. */
  move: Vec2;
  /** Aim direction in radians (see core/vec.ts convention). */
  aim: number;
  fire: boolean;
  interact: boolean;
}

export const IDLE_INPUT: SoldierInput = Object.freeze({
  move: Object.freeze({ x: 0, y: 0 }),
  aim: 0,
  fire: false,
  interact: false,
});

/** Plain-data soldier state (structured-clone safe for snapshots). */
export interface SoldierState {
  id: SoldierId;
  ordinal: number;
  spawnPointId: SpawnPointId;
  x: number;
  y: number;
  facing: number;
  hp: number;
  alive: boolean;
  /** Driven by player input this tick (vs. an echo controller in later phases). */
  controllable: boolean;
  /** False for static figures: no collision, can't be hit, don't count for anything. */
  interactive: boolean;
  /** HP floor while in a lead-in ([D5]): damage applies, but HP can't drop below this. */
  minHp: number;
  /**
   * Pushes other soldiers during separation but is never pushed itself ([E8]: on-schedule echoes).
   * Walls and closing gates still push it.
   */
  kinematic: boolean;
  /** Earliest tick the rifle may fire again. */
  nextFireTick: Tick;
  /** Interact was held last tick (interact is edge-triggered). */
  interactHeld: boolean;
  deathTick: Tick | null;
  /** e.g. 'turret', 'mine', 'vehicle', 'bridgeCollapse'. */
  deathCause: string | null;
}

/** Optional flags for a new soldier. Defaults: a live, interactive, killable soldier. */
export interface SoldierFlags {
  controllable?: boolean;
  interactive?: boolean;
  minHp?: number;
  kinematic?: boolean;
}

export function createSoldier(
  id: SoldierId,
  ordinal: number,
  spawnPointId: SpawnPointId,
  position: Vec2,
  facing: number,
  tuning: Tuning,
  flags: SoldierFlags = {},
): SoldierState {
  return {
    id,
    ordinal,
    spawnPointId,
    x: position.x,
    y: position.y,
    facing,
    hp: tuning.soldier.maxHp,
    alive: true,
    controllable: flags.controllable ?? true,
    interactive: flags.interactive ?? true,
    minHp: flags.minHp ?? 0,
    kinematic: flags.kinematic ?? false,
    nextFireTick: 0,
    interactHeld: false,
    deathTick: null,
    deathCause: null,
  };
}

/** Alive and interactive: can be hit, triggers mines, is targeted by turrets, collides. */
export function isEligible(s: SoldierState): boolean {
  return s.alive && s.interactive;
}

/** Static geometry that blocks soldier movement. */
export function movementSolids(map: MapDef): Rect[] {
  return [...map.walls, ...map.water];
}

/** Applies one tick of movement + facing from input. Mutates `s`. */
export function stepSoldierMovement(
  s: SoldierState,
  input: SoldierInput,
  solids: readonly Rect[],
  tuning: Tuning,
): void {
  if (!s.alive) return;
  const dir = clampLength(input.move, 1);
  const step = tuning.soldier.speed * DT;
  const next = moveCircle(
    { x: s.x, y: s.y },
    { x: dir.x * step, y: dir.y * step },
    tuning.soldier.wallRadius,
    solids,
  );
  s.x = next.x;
  s.y = next.y;
  s.facing = input.aim;
}
