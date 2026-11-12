import type { Tuning, VehicleDrive } from '../../content/tuning';
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
  /** (07-e) Sprint held ([D49]): faster, but no firing or throwing while it moves you. */
  sprint?: boolean;
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
  /** (07-e) Sprinting this tick ([D49]): no firing or throwing. */
  sprinting?: boolean;
  /**
   * (PHASE12-b) A vehicle's driving state ([D63], [D64]); absent for soldiers. For a vehicle,
   * `facing` is the hull's heading (what's recorded); the turret aims separately.
   */
  drive?: DriveState;
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

/** (PHASE12-b) A vehicle's driving state. Plain data (snapshots). */
export interface DriveState {
  /** Signed speed along the hull, units/s (negative = reversing). */
  speed: number;
  /** Turret angle, radians. */
  turret: number;
  /** Last tick each soldier was run over by this one ([D66]), by id. */
  hits: Record<string, number>;
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
    hp: soldierMaxHp(tuning, flags.roleId),
    ...(isVehicleRole(flags.roleId) ? { drive: { speed: 0, turret: facing, hits: {} } } : {}),
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

/** (PHASE12-b) Is this role a vehicle ([D63])? */
export function isVehicleRole(roleId: RoleId | undefined): boolean {
  return roleId === 'truck' || roleId === 'tank';
}

/** (PHASE12-b) A vehicle's driving numbers, or null for a soldier. */
export function driveOf(tuning: Tuning, roleId: RoleId | undefined): VehicleDrive | null {
  return roleId === 'truck' || roleId === 'tank' ? tuning.drive[roleId] : null;
}

/** (PHASE12-b) Collision radius against walls (a vehicle's body, else the soldier's). */
export function wallRadiusOf(tuning: Tuning, s: SoldierState): number {
  return driveOf(tuning, s.roleId)?.bodyRadius ?? tuning.soldier.wallRadius;
}

/** (PHASE12-b) Hit circle radius (a vehicle's body, else the soldier hitbox). */
export function hitRadiusOf(tuning: Tuning, s: SoldierState): number {
  return driveOf(tuning, s.roleId)?.bodyRadius ?? tuning.soldier.hitboxRadius;
}

/** (PHASE12-a) Max HP by role ([D61]: the Shotgunner is tougher). */
export function soldierMaxHp(tuning: Tuning, roleId: RoleId | undefined): number {
  return Math.round(tuning.soldier.maxHp * (tuning.roleStats?.[roleId ?? 'rifleman']?.hp ?? 1));
}

/** (PHASE12-a) Walking speed by role ([D62]: the Bazooka is slower). */
export function soldierSpeed(tuning: Tuning, roleId: RoleId | undefined): number {
  return tuning.soldier.speed * (tuning.roleStats?.[roleId ?? 'rifleman']?.speed ?? 1);
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
  const drive = driveOf(tuning, s.roleId);
  if (drive) {
    stepVehicleMovement(s, input, solids, tuning, drive);
    return;
  }
  const dir = clampLength(input.move, 1);
  const walk = soldierSpeed(tuning, s.roleId) * DT;
  const sprinting = !!input.sprint && (dir.x !== 0 || dir.y !== 0);
  const step = sprinting ? walk * tuning.soldier.sprintMultiplier : walk;
  const next = moveCircle(
    { x: s.x, y: s.y },
    { x: dir.x * step, y: dir.y * step },
    tuning.soldier.wallRadius,
    solids,
  );
  // (07-e) Relative to a walk: a sprint is above 1 (more spread, harder to hit, [D49], [D50]).
  const moved = Math.hypot(next.x - s.x, next.y - s.y);
  s.moveFrac = walk > 0 ? Math.min(tuning.soldier.sprintMultiplier, moved / walk) : 0;
  s.sprinting = sprinting && moved > 0;
  s.x = next.x;
  s.y = next.y;
  s.facing = input.aim;
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const approach = (v: number, target: number, step: number) =>
  v < target ? Math.min(target, v + step) : Math.max(target, v - step);

/**
 * (PHASE12-b) One tick of driving ([D64]). The stick is a compass direction: the hull turns
 * toward it, then the vehicle drives. A tank turns on the spot and only throttles up once it
 * points within `alignDegrees`; a truck can't turn standing still, so it rolls at `crawlSpeed`
 * while turning and speeds up once pointed the right way. Pulling (nearly) straight back
 * reverses. The turret turns toward the aim at its own rate.
 */
function stepVehicleMovement(
  s: SoldierState,
  input: SoldierInput,
  solids: readonly Rect[],
  tuning: Tuning,
  d: VehicleDrive,
): void {
  const dv = (s.drive ??= { speed: 0, turret: s.facing, hits: {} });
  const mag = Math.min(1, Math.hypot(input.move.x, input.move.y));
  let target = 0;
  if (mag > 0.15) {
    const want = Math.atan2(input.move.y, input.move.x);
    const back = Math.abs(wrapAngle(want - s.facing));
    const reverse = back > Math.PI - (tuning.drive.reverseArc * Math.PI) / 360;
    const heading = reverse ? wrapAngle(want + Math.PI) : want;
    const diff = wrapAngle(heading - s.facing);
    let rate = d.turnRate;
    if (!d.turnInPlace) rate *= Math.min(1, Math.abs(dv.speed) / Math.max(1, d.crawlSpeed));
    const turn = Math.max(-rate * DT, Math.min(rate * DT, diff));
    s.facing = wrapAngle(s.facing + turn);
    const aligned = Math.abs(wrapAngle(heading - s.facing)) <= (d.alignDegrees * Math.PI) / 180;
    const top = (reverse ? d.reverseSpeed : d.maxSpeed) * mag;
    target = aligned ? top : d.turnInPlace ? 0 : Math.min(top, d.crawlSpeed);
    if (reverse) target = -target;
  }
  const slowing =
    Math.sign(target) !== Math.sign(dv.speed) || Math.abs(target) < Math.abs(dv.speed);
  dv.speed = approach(dv.speed, target, (slowing ? d.brake : d.accel) * DT);
  const step = dv.speed * DT;
  const dir = { x: Math.cos(s.facing) * step, y: Math.sin(s.facing) * step };
  const next = moveCircle({ x: s.x, y: s.y }, dir, d.bodyRadius, solids);
  const moved = Math.hypot(next.x - s.x, next.y - s.y);
  // Bumped into something: lose most of the speed.
  if (Math.abs(step) > 0.5 && moved < Math.abs(step) * 0.5) dv.speed *= 0.5;
  s.moveFrac = Math.min(1, moved / Math.max(1e-6, d.maxSpeed * DT));
  s.sprinting = false;
  s.x = next.x;
  s.y = next.y;
  const tr = d.turretTurnRate * DT;
  dv.turret = wrapAngle(dv.turret + Math.max(-tr, Math.min(tr, wrapAngle(input.aim - dv.turret))));
}
