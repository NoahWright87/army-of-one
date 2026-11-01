/**
 * Drives recorded soldiers ("echoes") through their schedules ([E1], [E8], [D4], [D24]).
 *
 * Per tick, inside `step` at the point where live soldiers move (`StepHooks.moveUncontrolled`):
 * - not spawned yet: nothing (spawning happens between steps, see `spawnDue`);
 * - past the last recorded tick, alive: turns **static** (non-interactive, frozen) → an O;
 * - **on schedule**: if the scheduled pose is within `snapDistance` and the straight move there is
 *   unobstructed, the echo is moved exactly onto it and is kinematic (pushes, isn't pushed);
 * - **off schedule** otherwise: pathfinds toward its pose `lookaheadSeconds` ahead and walks there
 *   so it arrives on time, never early: min(remaining / ticksLeft, speed × catchUpFactor). It is
 *   pushable meanwhile, and snaps back onto the schedule as soon as the snap test passes;
 * - **interrupted** if it stays more than `lateToleranceSeconds` late (or has no path in time) for
 *   `lateGraceSeconds`: frozen in place for the rest of the attempt, still killable ([D24]).
 * Recorded actions replay in the action phase (`StepHooks.actUncontrolled`) if the echo is within
 * `actionTolerance` of the recorded origin: shots fire from the echo's current position at the
 * recorded angle, interacts use the recorded target if it's in reach. Damage and death are never
 * replayed ([E3]): the sim decides those.
 *
 * Controller state (`EchoControllerState`) is plain data and goes into world snapshots.
 */
import type { Tuning } from '../../content/tuning';
import type { SoldierId, SoldierRecord, Waypoint } from '../../contracts/mission';
import { fireRifle } from '../combat/shots';
import { compareIds } from '../core/ids';
import { DT, secondsToTicks, type Tick } from '../core/time';
import { distance, type Vec2 } from '../core/vec';
import { interact, isLeverOn } from '../entities/lever';
import type { SoldierState } from '../entities/soldier';
import { emit, type World } from '../state';
import { getSoldier, spawnSoldier, type StepHooks } from '../sim';
import { moveCircle } from '../world/collision';
import type { Rect } from '../world/map';
import { findPath, pathLength } from '../world/nav';
import { isSpawnPointOpen } from '../world/spawn-points';
import { buildSchedule, poseAt, type Schedule } from './schedule';

export type EchoMode =
  /** Not spawned yet. */
  | 'pending'
  /** Snapped to its schedule (kinematic). */
  | 'following'
  /** Pathfinding back toward its schedule (pushable). */
  | 'offSchedule'
  /** Reached the end of its recording alive: an O ([D4]). */
  | 'static'
  /** Couldn't follow its schedule; frozen for the rest of the attempt ([D24]). */
  | 'interrupted'
  | 'dead'
  /** Its spawn point wasn't ours at its spawn tick ([D26]). */
  | 'neverSpawned'
  /** Not driven: the player controls this soldier now (after a resume lead-in). */
  | 'external';

export type InterruptReason = 'late' | 'noPath';

export interface EchoState {
  id: SoldierId;
  mode: EchoMode;
  /** Off schedule: the rest of the planned path (next point first). */
  path: { x: number; y: number }[] | null;
  /** Tick the path's end is scheduled for. */
  pathGoalTick: Tick;
  /** Tick the path was planned. */
  planTick: Tick;
  /** First tick of the current run of "too late" ticks. */
  lateSince: Tick | null;
  /** static: last recorded tick; interrupted: freeze tick; dead: death tick. */
  fateTick: Tick | null;
  /** interrupted: InterruptReason; neverSpawned: why. */
  reason: string | null;
}

export interface EchoControllerState {
  /** Id-sorted. */
  echoes: EchoState[];
}

/** A lane transition the attempt runner turns into a timeline marker. */
export interface EchoTransition {
  id: SoldierId;
  tick: Tick;
  kind: 'static' | 'interrupted' | 'neverSpawned';
  reason?: string;
}

const freshState = (id: SoldierId, mode: EchoMode): EchoState => ({
  id,
  mode,
  path: null,
  pathGoalTick: 0,
  planTick: 0,
  lateSince: null,
  fateTick: null,
  reason: null,
});

export class EchoController {
  readonly schedules: ReadonlyMap<SoldierId, Schedule>;
  state: EchoControllerState;
  /** Transitions since the last `drainTransitions` (not part of the state). */
  private transitions: EchoTransition[] = [];
  private readonly tuning: Tuning;
  private readonly byId = new Map<SoldierId, EchoState>();
  readonly hooks: StepHooks;

  /**
   * @param restored Controller state from a snapshot taken at the world's current tick. Records
   *   without restored state are derived from the world: present soldiers follow their schedule
   *   (e.g. the snapshot's live soldier), absent ones are pending or never spawned.
   */
  constructor(world: World, records: readonly SoldierRecord[], restored?: EchoControllerState) {
    this.tuning = world.tuning;
    const schedules = new Map<SoldierId, Schedule>();
    for (const r of [...records].sort((a, b) => compareIds(a.id, b.id))) {
      schedules.set(r.id, buildSchedule(r));
    }
    this.schedules = schedules;
    const restoredById = new Map((restored?.echoes ?? []).map((e) => [e.id, e]));
    const tick = world.state.tick;
    const echoes: EchoState[] = [];
    for (const [id, sched] of schedules) {
      const soldier = getSoldier(world, id);
      const prev = restoredById.get(id);
      let st: EchoState;
      if (prev && prev.mode !== 'external' && prev.mode !== 'pending') {
        st = structuredClone(prev);
      } else if (soldier) {
        st = freshState(id, soldier.alive ? 'following' : 'dead');
        if (!soldier.alive) st.fateTick = soldier.deathTick;
      } else if (sched.spawnTick >= tick) {
        st = freshState(id, 'pending');
      } else {
        st = freshState(id, 'neverSpawned');
        st.reason = 'notSpawned';
      }
      echoes.push(st);
      if (soldier) applyFlags(soldier, st.mode);
    }
    this.state = { echoes };
    for (const e of echoes) this.byId.set(e.id, e);
    this.hooks = {
      moveUncontrolled: (w, solids) => this.move(w, solids),
      actUncontrolled: (w, s) => this.act(w, s),
    };
  }

  echo(id: SoldierId): EchoState | undefined {
    return this.byId.get(id);
  }

  schedule(id: SoldierId): Schedule | undefined {
    return this.schedules.get(id);
  }

  drainTransitions(): EchoTransition[] {
    const out = this.transitions;
    this.transitions = [];
    return out;
  }

  /** Deep copy of the controller state, for snapshots. */
  snapshot(): EchoControllerState {
    return structuredClone(this.state);
  }

  /** Stops driving a soldier (a resumed soldier's lead-in ends and the player takes over). */
  release(id: SoldierId): void {
    const e = this.byId.get(id);
    if (!e) return;
    e.mode = 'external';
    e.path = null;
    e.lateSince = null;
  }

  /**
   * Between steps: spawns every pending echo whose spawn tick is now, at its recorded pose, if
   * its spawn point is open ([D26]); otherwise it never spawns. Returns the spawned ids.
   */
  spawnDue(world: World): SoldierId[] {
    const tick = world.state.tick;
    const out: SoldierId[] = [];
    for (const e of this.state.echoes) {
      if (e.mode !== 'pending') continue;
      const sched = this.schedules.get(e.id)!;
      if (sched.spawnTick > tick) continue;
      if (sched.spawnTick < tick || !isSpawnPointOpen(world, sched.spawnPointId, tick)) {
        e.mode = 'neverSpawned';
        e.reason = sched.spawnTick < tick ? 'notSpawned' : 'spawnPointLost';
        this.transitions.push({ id: e.id, tick, kind: 'neverSpawned', reason: e.reason });
        continue;
      }
      const pose = sched.waypoints[0]!;
      spawnSoldier(world, sched.spawnPointId, {
        id: e.id,
        ordinal: sched.ordinal,
        position: { x: pose.x, y: pose.y },
        facing: pose.facing,
        controllable: false,
        kinematic: true,
      });
      e.mode = 'following';
      out.push(e.id);
    }
    return out;
  }

  /** After a step: echoes the world killed become dead. */
  syncDeaths(world: World): void {
    for (const e of this.state.echoes) {
      if (e.mode === 'pending' || e.mode === 'neverSpawned' || e.mode === 'dead') continue;
      const s = getSoldier(world, e.id);
      if (s && !s.alive) {
        e.mode = 'dead';
        e.fateTick = s.deathTick;
        e.path = null;
      }
    }
  }

  /**
   * Between steps: an echo that has played its last recorded tick alive turns static now, so it's
   * out of play from the next tick on ([D4]). Its fate tick is that last recorded tick.
   */
  finishEnded(world: World): void {
    const t = world.state.tick;
    for (const e of this.state.echoes) {
      if (e.mode !== 'following' && e.mode !== 'offSchedule') continue;
      const sched = this.schedules.get(e.id)!;
      if (t < sched.endTick) continue;
      const s = getSoldier(world, e.id);
      if (s?.alive) this.becomeStatic(e, s, sched.endTick);
    }
  }

  // ---------- movement ----------

  private move(world: World, solids: readonly Rect[]): void {
    const t = world.state.tick;
    for (const e of this.state.echoes) {
      if (e.mode !== 'following' && e.mode !== 'offSchedule') continue;
      const s = getSoldier(world, e.id);
      if (!s || !s.alive) continue;
      const sched = this.schedules.get(e.id)!;
      if (t > sched.endTick) {
        this.becomeStatic(e, s, sched.endTick);
        continue;
      }
      const target = poseAt(sched, t);
      if (this.trySnap(s, target, solids)) {
        if (e.mode !== 'following') {
          e.mode = 'following';
          e.path = null;
        }
        e.lateSince = null;
        s.kinematic = true;
        continue;
      }
      if (e.mode === 'following') {
        e.mode = 'offSchedule';
        e.path = null;
        s.kinematic = false;
      }
      this.followPath(world, e, s, sched, target, solids);
    }
  }

  /** Moves the echo exactly onto its scheduled pose if that's a short, unobstructed move. */
  private trySnap(s: SoldierState, target: Waypoint, solids: readonly Rect[]): boolean {
    const et = this.tuning.echo;
    const dx = target.x - s.x;
    const dy = target.y - s.y;
    if (dx !== 0 || dy !== 0) {
      const d = Math.hypot(dx, dy);
      if (d > et.snapDistance) return false;
      const res = moveCircle(s, { x: dx, y: dy }, this.tuning.soldier.wallRadius, solids);
      if (Math.hypot(res.x - target.x, res.y - target.y) > et.blockEpsilon) return false;
    }
    s.x = target.x;
    s.y = target.y;
    s.facing = target.facing;
    return true;
  }

  private followPath(
    world: World,
    e: EchoState,
    s: SoldierState,
    sched: Schedule,
    target: Waypoint,
    solids: readonly Rect[],
  ): void {
    const t = world.state.tick;
    const et = this.tuning.echo;
    const maxStep = this.tuning.soldier.speed * DT * et.catchUpFactor;
    const lateTolerance = secondsToTicks(et.lateToleranceSeconds);
    s.facing = target.facing;

    if (
      !e.path ||
      t >= e.pathGoalTick ||
      t - e.planTick >= Math.max(1, secondsToTicks(et.replanSeconds))
    ) {
      const goalTick = Math.min(
        t + Math.max(1, secondsToTicks(et.lookaheadSeconds)),
        sched.endTick,
      );
      const goal = poseAt(sched, goalTick);
      // Bounded search: a path we couldn't walk in time (plus tolerance) is as good as none.
      const budget = (goalTick - t + 1 + lateTolerance) * maxStep;
      const path = findPath(world, s, goal, { maxLength: budget });
      e.path = path ? path.slice(1).map((p) => ({ x: p.x, y: p.y })) : null;
      e.pathGoalTick = goalTick;
      e.planTick = t;
    }

    if (!e.path) {
      this.markLate(e, s, t, 'noPath');
      return;
    }

    const ticksLeft = Math.max(1, e.pathGoalTick - t + 1);
    const remaining = e.path.length > 0 ? distance(s, e.path[0]!) + pathLength(e.path) : 0;
    const lagTicks = Math.ceil(remaining / maxStep) - ticksLeft;
    if (lagTicks > lateTolerance) {
      if (this.markLate(e, s, t, 'late')) return;
    } else {
      e.lateSince = null;
    }

    // Arrive on time, never early ([E1]).
    let left = Math.min(remaining / ticksLeft, maxStep);
    let pos: Vec2 = { x: s.x, y: s.y };
    while (left > 0 && e.path.length > 0) {
      const next = e.path[0]!;
      const d = distance(pos, next);
      if (d <= left) {
        pos = next;
        left -= d;
        e.path.shift();
      } else {
        pos = {
          x: pos.x + ((next.x - pos.x) / d) * left,
          y: pos.y + ((next.y - pos.y) / d) * left,
        };
        left = 0;
      }
    }
    const res = moveCircle(
      s,
      { x: pos.x - s.x, y: pos.y - s.y },
      this.tuning.soldier.wallRadius,
      solids,
    );
    s.x = res.x;
    s.y = res.y;
  }

  /** Counts a late tick; interrupts once the grace runs out. Returns true if interrupted. */
  private markLate(e: EchoState, s: SoldierState, t: Tick, reason: InterruptReason): boolean {
    e.lateSince ??= t;
    if (t - e.lateSince < secondsToTicks(this.tuning.echo.lateGraceSeconds)) return false;
    e.mode = 'interrupted';
    e.fateTick = t;
    e.reason = reason;
    e.path = null;
    applyFlags(s, 'interrupted');
    this.transitions.push({ id: e.id, tick: t, kind: 'interrupted', reason });
    return true;
  }

  private becomeStatic(e: EchoState, s: SoldierState, endTick: Tick): void {
    e.mode = 'static';
    e.fateTick = endTick;
    e.path = null;
    e.lateSince = null;
    applyFlags(s, 'static');
    this.transitions.push({ id: e.id, tick: endTick, kind: 'static' });
  }

  // ---------- actions ----------

  private act(world: World, s: SoldierState): void {
    const e = this.byId.get(s.id);
    if (!e || (e.mode !== 'following' && e.mode !== 'offSchedule')) return;
    const t = world.state.tick;
    const actions = this.schedules.get(s.id)!.actionsByTick.get(t);
    if (!actions) return;
    const tol = this.tuning.echo.actionTolerance;
    for (const a of actions) {
      const d = Math.hypot(s.x - a.x, s.y - a.y);
      if (d > tol) {
        emit(world, { kind: 'echoDivergence', tick: t, id: s.id, action: a.kind, distance: d });
        continue;
      }
      if (a.kind === 'shot') {
        fireRifle(world, s.id, s, a.angle);
        s.nextFireTick = t + Math.max(1, secondsToTicks(this.tuning.rifle.cooldownSeconds));
      } else if (
        this.tuning.echo.replayInteract === 'restoreState' &&
        a.on !== undefined &&
        leverIsOn(world, a.targetId) === a.on
      ) {
        // Already in the state the original press produced: nothing to do.
      } else if (interact(world, s, a.targetId) === null) {
        emit(world, { kind: 'echoDivergence', tick: t, id: s.id, action: a.kind, distance: d });
      }
    }
  }
}

/** Sets a soldier's sim flags for an echo mode. */
export function applyFlags(s: SoldierState, mode: EchoMode): void {
  s.controllable = false;
  s.minHp = 0;
  delete s.viewRole;
  switch (mode) {
    case 'following':
      s.interactive = true;
      s.kinematic = true;
      break;
    case 'offSchedule':
      s.interactive = true;
      s.kinematic = false;
      break;
    case 'static':
      s.interactive = false;
      s.kinematic = true;
      break;
    case 'interrupted':
      // Frozen in place but still in the world: killable, collides, targeted ([D24]).
      s.interactive = true;
      s.kinematic = true;
      s.viewRole = 'interrupted';
      break;
    default:
      break;
  }
}

function leverIsOn(world: World, leverId: string): boolean | undefined {
  const def = world.map.levers?.find((l) => l.id === leverId);
  return def ? isLeverOn(world, def) : undefined;
}
