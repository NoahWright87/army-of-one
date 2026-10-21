/**
 * The attempt runner: one life of the player plus every recorded soldier replaying as an echo,
 * from tick 0 or from a snapshot ([D1], [E4]). PHASE04 drives it one tick at a time with the
 * player's input; resolve passes ([D23]) drive it headless with no live soldier.
 *
 * Tick conventions (the tick named by a spawn option is the soldier's first *pose*):
 * - new soldier, entryTick E: spawned between steps when the world is at tick E (its recording's
 *   first waypoint is that spawn pose); input acts from the step that produces tick E+1.
 * - resume, O tick e (= the record's last recorded tick): it follows its recording through e;
 *   input acts from tick e+1, and its new segment starts at e+1 (contiguous with the old one).
 *   `controlFromTick` may be given as e (03-b's `resumeTick`) or e+1; both mean the same.
 * `attempt.controlFromTick` is the first tick whose step honors input. Before it (the lead-in,
 * [D5], [D25]) input is ignored; it is not applied retroactively.
 */
import type { Tuning } from '../../content/tuning';
import type {
  AttemptObservation,
  RecordingSegment,
  SegmentEndReason,
  SoldierId,
  SoldierRecord,
  SpawnPointId,
} from '../../contracts/mission';
import type { Tick } from '../core/time';
import { IDLE_INPUT, type SoldierInput, type SoldierState } from '../entities/soldier';
import type { SimEvent } from '../events';
import {
  createWorld,
  getSoldier,
  getView,
  spawnSoldier,
  step,
  type StepHooks,
  type World,
} from '../sim';
import type { WorldView } from '../view';
import type { MapDef } from '../world/map';
import { isSpawnPointOpen } from '../world/spawn-points';
import { EchoController, applyFlags } from '../recording/echo-controller';
import { Recorder } from '../recording/recorder';
import { ordinalOf, recordedTo } from '../recording/records';
import { ObservationBuilder } from './observation';
import { SnapshotStore, type WorldSnapshot } from './snapshots';

export type AttemptFrom = { kind: 'start' } | { kind: 'snapshot'; snapshot: WorldSnapshot };

export type LiveSpec =
  | {
      mode: 'new';
      soldierId: SoldierId;
      spawnPointId: SpawnPointId;
      entryTick: Tick;
      /** Default: the id's number. */
      ordinal?: number;
    }
  | { mode: 'resume'; soldierId: SoldierId; controlFromTick: Tick };

export interface AttemptParams {
  map: MapDef;
  tuning: Tuning;
  /** All recorded soldiers (the live one too, when resuming). */
  soldiers: readonly SoldierRecord[];
  /** 1-based attempt index. */
  attempt: number;
  from: AttemptFrom;
  /** null: no live soldier (resolve passes; tests). */
  live: LiveSpec | null;
  /** Shared, mission-level snapshot cache. Default: a fresh store. */
  snapshots?: SnapshotStore;
  /** Internal: 'resolve' for resolve passes. */
  kind?: AttemptObservation['kind'];
}

export interface TickResult {
  tick: Tick;
  events: SimEvent[];
  /** The step that produced this tick honored the player's input. */
  controlled: boolean;
  /** Ticks until input is honored (0 once in control). */
  leadInTicksLeft: number;
  over: boolean;
}

/** Why an attempt can't continue as the player chose it ("History shifted", [D23]). */
export interface HistoryShift {
  tick: Tick;
  reason: 'leadInInterrupted' | 'leadInLost' | 'spawnPointLost';
}

export interface AttemptResult {
  observation: AttemptObservation;
  /** The live soldier's new segment; null if control never began (or no live soldier). */
  liveSegment: RecordingSegment | null;
  /** Set if the chosen deployment became impossible during the fast-forward/lead-in. */
  historyShifted: HistoryShift | null;
  /** World at the last simulated tick (committed to the store): a resolve pass starts here. */
  endSnapshot: WorldSnapshot;
}

export class Attempt {
  readonly world: World;
  readonly echoes: EchoController;
  readonly snapshots: SnapshotStore;
  readonly attemptNumber: number;
  readonly fromTick: Tick;
  readonly live: LiveSpec | null;
  /** First tick whose step honors input (Infinity without a live soldier). */
  readonly controlFromTick: Tick;
  private readonly kind: AttemptObservation['kind'];
  private readonly obs: ObservationBuilder;
  private recorder: Recorder | null = null;
  private controlling = false;
  private shifted: HistoryShift | null = null;
  private finished = false;
  private readonly hooks: StepHooks;

  constructor(p: AttemptParams) {
    this.kind = p.kind ?? 'attempt';
    this.attemptNumber = p.attempt;
    this.live = p.live;
    this.snapshots = p.snapshots ?? new SnapshotStore();
    const world = createWorld(p.map, p.tuning);
    if (p.from.kind === 'snapshot') world.state = structuredClone(p.from.snapshot.state);
    this.world = world;
    this.fromTick = world.state.tick;

    // A recorded soldier the player is about to control isn't an echo in this attempt.
    const records =
      p.live?.mode === 'new' ? p.soldiers.filter((r) => r.id !== p.live!.soldierId) : p.soldiers;
    if (p.live?.mode === 'new' && records.length !== p.soldiers.length) {
      throw new Error(`New soldier ${p.live.soldierId} already has a recording`);
    }
    this.echoes = new EchoController(
      world,
      records,
      p.from.kind === 'snapshot' ? p.from.snapshot.echoes : undefined,
    );

    if (!p.live) {
      this.controlFromTick = Infinity;
    } else if (p.live.mode === 'new') {
      if (p.live.entryTick < this.fromTick) {
        throw new Error(`Entry tick ${p.live.entryTick} is before the start ${this.fromTick}`);
      }
      if (getSoldier(world, p.live.soldierId)) {
        throw new Error(`New soldier ${p.live.soldierId} already exists in the snapshot`);
      }
      this.controlFromTick = p.live.entryTick + 1;
    } else {
      const rec = records.find((r) => r.id === p.live!.soldierId);
      if (!rec) throw new Error(`Resume: no recording for ${p.live.soldierId}`);
      const end = recordedTo(rec);
      if (p.live.controlFromTick !== end && p.live.controlFromTick !== end + 1) {
        throw new Error(
          `Resume ${rec.id}: controlFromTick ${p.live.controlFromTick} must be ${end} or ${end + 1}`,
        );
      }
      this.controlFromTick = end + 1;
      if (this.fromTick >= this.controlFromTick) {
        throw new Error(`Resume ${rec.id}: must start before tick ${this.controlFromTick}`);
      }
    }

    this.obs = new ObservationBuilder(
      {
        kind: this.kind,
        attempt: p.attempt,
        fromTick: this.fromTick,
        ...(p.live
          ? {
              live: {
                soldierId: p.live.soldierId,
                mode: p.live.mode,
                controlFromTick: this.controlFromTick,
              },
            }
          : {}),
      },
      world,
    );

    this.hooks = {
      moveUncontrolled: this.echoes.hooks.moveUncontrolled!,
      actUncontrolled: this.echoes.hooks.actUncontrolled!,
      afterMovement: (w) => {
        if (!this.controlling || !this.recorder) return;
        const s = getSoldier(w, this.recorder.soldierId);
        if (s?.alive) this.recorder.recordPose(s, w.state.tick);
      },
    };

    this.betweenSteps();
    this.stageSnapshot();
  }

  get tick(): Tick {
    return this.world.state.tick;
  }

  /** The live soldier's id (also during its lead-in, before it exists). */
  get liveSoldierId(): SoldierId | null {
    return this.live?.soldierId ?? null;
  }

  liveSoldier(): SoldierState | undefined {
    return this.live ? getSoldier(this.world, this.live.soldierId) : undefined;
  }

  /** Ticks until the player's input is honored; 0 once in control ([D5] countdown). */
  leadInTicksLeft(): number {
    if (!this.live) return 0;
    return Math.max(0, this.controlFromTick - (this.tick + 1));
  }

  inLeadIn(): boolean {
    return this.leadInTicksLeft() > 0;
  }

  /** In control: the next step applies input. */
  get inControl(): boolean {
    return this.controlling;
  }

  get historyShifted(): HistoryShift | null {
    return this.shifted;
  }

  /** Live soldier died (after control began), mission complete, or the deployment shifted away. */
  isOver(): boolean {
    if (this.shifted) return true;
    if (this.world.state.missionComplete) return true;
    if (this.live && this.controlling) {
      const s = this.liveSoldier();
      return !s || !s.alive;
    }
    return false;
  }

  overReason(): SegmentEndReason | 'historyShifted' | null {
    if (this.shifted) return 'historyShifted';
    if (this.world.state.missionComplete) return 'missionComplete';
    if (this.isOver()) return 'death';
    return null;
  }

  view(): WorldView {
    return getView(this.world);
  }

  /** Advances one tick. `input` is ignored until `controlFromTick`. */
  step(input: SoldierInput = IDLE_INPUT): TickResult {
    if (this.finished) throw new Error('Attempt already finished');
    const inputs = new Map<SoldierId, SoldierInput>();
    const live = this.liveSoldier();
    const controlled = this.controlling && !!live?.alive && live.controllable;
    if (controlled) inputs.set(live.id, input);

    const events = step(this.world, inputs, this.hooks);
    if (this.recorder && controlled) this.recorder.recordEvents(events, this.world);
    this.obs.ingest(this.world, events);
    this.echoes.syncDeaths(this.world);
    this.betweenSteps();
    if (this.tick % this.world.tuning.attempt.snapshotIntervalTicks === 0) this.stageSnapshot();
    return {
      tick: this.tick,
      events,
      controlled,
      leadInTicksLeft: this.leadInTicksLeft(),
      over: this.isOver(),
    };
  }

  /**
   * Fast-forwards until `until` (a tick, or a predicate checked after each step) or until the
   * attempt is over. `input` supplies the live soldier's input per tick (default: idle).
   */
  runHeadless(
    until: Tick | ((a: Attempt) => boolean),
    input: (a: Attempt) => SoldierInput = () => IDLE_INPUT,
  ): void {
    const done = typeof until === 'number' ? () => this.tick >= until : () => until(this);
    while (!done() && !this.isOver()) this.step(input(this));
  }

  /** A snapshot of the world right now (also how PHASE04 can checkpoint). */
  takeSnapshot(): WorldSnapshot {
    return {
      tick: this.tick,
      attempt: this.attemptNumber,
      source: this.kind,
      state: structuredClone(this.world.state),
      echoes: this.echoes.snapshot(),
    };
  }

  /** The live soldier's segment recorded so far (in-progress autosaves, [D6]); null before control. */
  liveSegmentSoFar(): RecordingSegment | null {
    return this.recorder?.segment('suspended') ?? null;
  }

  /** The observation so far (resolve passes report these progressively). */
  observationSoFar(endReason: AttemptObservation['endReason']): AttemptObservation {
    this.obs.ingestTransitions(this.echoes.drainTransitions());
    return this.obs.build(this.world, this.echoes, endReason, this.live?.soldierId);
  }

  /**
   * Ends the attempt: builds the observation, closes the live segment, and commits this attempt's
   * snapshots (window [fromTick, tick]) to the store. `endReason` defaults to what happened:
   * 'death', 'missionComplete', else 'suspended'.
   */
  finish(endReason?: SegmentEndReason | 'resolved'): AttemptResult {
    if (this.finished) throw new Error('Attempt already finished');
    const reason: SegmentEndReason | 'resolved' =
      endReason ??
      (this.kind === 'resolve'
        ? 'resolved'
        : this.world.state.missionComplete
          ? 'missionComplete'
          : this.live && this.controlling && !this.liveSoldier()?.alive
            ? 'death'
            : 'suspended');
    const observation = this.observationSoFar(reason);
    const segReason: SegmentEndReason = reason === 'resolved' ? 'suspended' : reason;
    const liveSegment = this.recorder?.segment(segReason) ?? null;
    const endSnapshot = this.takeSnapshot();
    this.snapshots.stage(endSnapshot);
    this.snapshots.commit({
      attempt: this.attemptNumber,
      fromTick: this.fromTick,
      toTick: this.tick,
    });
    this.finished = true;
    return { observation, liveSegment, historyShifted: this.shifted, endSnapshot };
  }

  /** Throws the attempt away without touching the snapshot store's valid set. */
  abandon(): void {
    this.snapshots.discardStaged();
    this.finished = true;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  // ---------- internals ----------

  private stageSnapshot(): void {
    this.snapshots.stage(this.takeSnapshot());
  }

  /** Between steps: spawns, lead-in bookkeeping, history-shift checks, transitions → markers. */
  private betweenSteps(): void {
    const w = this.world;
    const tick = w.state.tick;
    this.echoes.spawnDue(w);

    const live = this.live;
    if (live?.mode === 'new' && tick === live.entryTick && !getSoldier(w, live.soldierId)) {
      if (!isSpawnPointOpen(w, live.spawnPointId, tick)) {
        this.shifted = { tick, reason: 'spawnPointLost' };
      } else {
        spawnSoldier(w, live.spawnPointId, {
          id: live.soldierId,
          ordinal: live.ordinal ?? ordinalOf(live.soldierId, 1),
        });
        this.controlling = true;
        this.recorder = new Recorder(live.soldierId);
        this.recorder.recordPose(getSoldier(w, live.soldierId)!, tick);
      }
    }

    if (live?.mode === 'resume' && !this.controlling && !this.shifted) {
      const echo = this.echoes.echo(live.soldierId);
      const s = getSoldier(w, live.soldierId);
      if (echo?.mode === 'interrupted') {
        this.shifted = { tick, reason: 'leadInInterrupted' };
      } else if (
        echo?.mode === 'neverSpawned' ||
        echo?.mode === 'dead' ||
        echo?.mode === 'static'
      ) {
        this.shifted = { tick, reason: 'leadInLost' };
      } else if (tick + 1 >= this.controlFromTick) {
        // The lead-in ends: the player takes over from the next step on.
        this.handOver();
      } else if (s?.alive) {
        // Lead-in ([D5]): plays its recording, unkillable but damageable, shown as the player's.
        s.minHp = 1;
        s.viewRole = 'live';
      }
    }

    // Echoes that just played their last recorded tick alive turn static (O, [D4]).
    this.echoes.finishEnded(w);
    this.obs.ingestTransitions(this.echoes.drainTransitions());
  }

  private handOver(): void {
    const live = this.live!;
    const s = getSoldier(this.world, live.soldierId);
    const echo = this.echoes.echo(live.soldierId);
    if (!s || !s.alive || !echo || (echo.mode !== 'following' && echo.mode !== 'offSchedule')) {
      this.shifted = { tick: this.tick, reason: 'leadInLost' };
      return;
    }
    this.echoes.release(live.soldierId);
    applyFlags(s, 'external');
    s.controllable = true;
    s.interactive = true;
    s.kinematic = false;
    s.minHp = 0;
    s.interactHeld = false;
    this.controlling = true;
    this.recorder = new Recorder(live.soldierId);
  }
}

export function startAttempt(params: AttemptParams): Attempt {
  return new Attempt(params);
}
