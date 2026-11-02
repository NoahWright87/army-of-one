import type { Tuning } from '../../content/tuning';
import { DT, type Tick } from '../core/time';
import { clampLength, type Vec2 } from '../core/vec';
import { moveCircle } from '../world/collision';
import type { MapDef, Rect, SpawnPointId } from '../world/map';
import type { RoleId } from '../../contracts/mission';
import type { AiState } from '../ai/brain';

export type SoldierId = string;

/** What a controlled soldier wants to do this tick. Produced by input sources, never by the sim. */
export interface SoldierInput {
  /** Desired movement; each axis in [-1, 1]. Length is clamped to 1. */
  move: Vec2;
  /** Aim direction in radians (see core/vec.ts convention). */
  aim: number;
  fire: boolean;
  interact: boolean;
  /**
   * (07-c) Distance from the soldier to the aim point (the cursor). The Grenadier throws this far
   * ([D37]). Absent: a mid-range throw.
   */
  aimDistance?: number;
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
  /** (07-c) Role ([D36]); absent = 'rifleman'. */
  roleId?: RoleId;
  /** (07-d) Absent = 'player' (ours: live, echoes, statics). 'enemy' = AI-driven ([D44]). */
  team?: 'enemy';
  /** (07-d) AI state of an enemy soldier ([D44]). */
  ai?: AiState;
  /** (07-c) Grenadier: ticks the throw has been wound up (0 = not winding up). */
  windupTicks: number;
  /** (07-c) Grenadier: aimed distance during the current wind-up (for the view's ring). */
  windupAim: number;
  /** (07-c) Gun recoil, radians of extra spread; recovers every tick ([D39]). */
  recoil: number;
  /** (07-c) Machine Gunner: ticks spent mounting on `braceId` ([D40]). */
  mountTicks: number;
  /** (07-c) Machine Gunner: the cover piece being mounted on, or null. */
  braceId: string | null;
  /** Earliest tick the rifle may fire again. */
  nextFireTick: Tick;
  /**
   * (07-c) How far the soldier moved last movement step, as a fraction of a full-speed step
   * (0..1). Live shots spread more the higher it is ([D35]).
   */
  moveFrac: number;
  /** Interact was held last tick (interact is edge-triggered). */
  interactHeld: boolean;
  deathTick: Tick | null;
  /** e.g. 'turret', 'mine', 'vehicle', 'bridgeCollapse'. */
  deathCause: string | null;
  /**
   * (03-a) Presentation override for `WorldView.role`. Absent: derived from the flags
   * (controllable → live, interactive → echo, else static). 'live' marks the player's soldier
   * while an echo controller drives it through a lead-in; 'interrupted' marks a frozen echo.
   */
  viewRole?: 'live' | 'interrupted';
}

/** Optional flags for a new soldier. Defaults: a live, interactive, killable soldier. */
export interface SoldierFlags {
  /** (07-c) Set at spawn only. */
  roleId?: RoleId;
  /** (07-d) Set at spawn only. Default 'player'. */
  team?: SoldierTeam;
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
    ...(flags.roleId && flags.roleId !== 'rifleman' ? { roleId: flags.roleId } : {}),
    ...(flags.team === 'enemy' ? { team: 'enemy' as const } : {}),
    windupTicks: 0,
    windupAim: 0,
    recoil: 0,
    mountTicks: 0,
    braceId: null,
    nextFireTick: 0,
    moveFrac: 0,
    interactHeld: false,
    deathTick: null,
    deathCause: null,
  };
}

export type SoldierTeam = 'player' | 'enemy';

/** (07-d) A soldier's team ([D44]). */
export function teamOf(s: SoldierState): SoldierTeam {
  return s.team ?? 'player';
}

/** (07-d) One of ours (the player's side), alive and interactive. */
export function isOurEligible(s: SoldierState): boolean {
  return s.alive && s.interactive && s.team === undefined;
}

/** Alive and interactive: can be hit, triggers mines, is targeted by turrets, collides. */
export function isEligible(s: SoldierState): boolean {
  return s.alive && s.interactive;
}

/** Static geometry that blocks soldier movement. */
export function movementSolids(map: MapDef): Rect[] {
  return [...map.walls, ...map.water, ...(map.cover ?? []).map((c) => c.rect)];
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
  s.moveFrac = step > 0 ? Math.min(1, Math.hypot(next.x - s.x, next.y - s.y) / step) : 0;
  s.x = next.x;
  s.y = next.y;
  s.facing = input.aim;
}
