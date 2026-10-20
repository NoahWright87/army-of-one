import type { Tuning } from '../../content/tuning';
import { DT } from '../core/time';
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
}

export function createSoldier(
  id: SoldierId,
  ordinal: number,
  spawnPointId: SpawnPointId,
  position: Vec2,
  facing: number,
  tuning: Tuning,
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
    controllable: true,
    interactive: true,
    minHp: 0,
  };
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
