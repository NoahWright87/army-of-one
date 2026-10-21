/**
 * The game controller (PHASE04): wires the attempt runner (03-a), the timeline truth and respawn
 * screen (03-b) and persistence (03-c) into the loop die → echo → rescue → O → resume.
 *
 * No DOM and no Phaser: screens, the battle view, timers, storage and the background resolve are
 * injected (GameAdapters), so the whole flow runs headless in tests with fakes. The browser
 * wiring lives in main.ts / adapters.ts.
 */
import type { Tuning } from '../content/tuning';
import type {
  AttemptObservation,
  InProgressLife,
  LaneChange,
  MissionState,
  SpawnOption,
} from '../contracts/mission';
import { clearMission, loadMission, MissionSaver } from '../persistence/mission-store';
import {
  createAutosavePolicy,
  markSaved,
  resetForLife,
  shouldSaveInProgress,
  type AutosavePolicy,
} from '../persistence/autosave';
import type { KeyValueStore } from '../persistence/storage';
import {
  addSegment,
  nextSoldierId,
  recordedTo,
  SnapshotStore,
  startAttempt,
  type Attempt,
  type AttemptFrom,
  type LiveSpec,
  type WorldSnapshot,
} from '../sim/attempt';
import { secondsToTicks, type Tick } from '../sim/core/time';
import type { Vec2 } from '../sim/core/vec';
import { getSoldier } from '../sim/sim';
import type { MapDef } from '../sim/world/map';
import { deriveSpawnOptions, leadInStart, spawnRules } from '../timeline/spawn-options';
import { applyObservation } from '../timeline/truth';
import type { RespawnProps, RespawnUpdate } from '../ui/respawn/respawn-model';
import {
  FlowError,
  INITIAL_FLOW,
  transition,
  type FlowEvent,
  type FlowNotice,
  type FlowState,
} from './flow';
import { LiveRun } from './live-run';
import type { ResolveJob, ResolveRunner } from './resolve-runner';

// ---------- Adapters ----------

export interface Clock {
  /** Calls `fn` after `ms` of real time. Returns a cancel function. */
  after(ms: number, fn: () => void): () => void;
}

export interface RespawnHandle {
  update(u: RespawnUpdate): void;
  destroy(): void;
}

export interface MissionStats {
  battleTicks: Tick;
  soldiersUsed: number;
  /** Lanes that flipped from X to O (or ✓) over the whole mission. */
  rescues: number;
  attempts: number;
}

export interface GameUi {
  showTitle(p: { canContinue: boolean; onNew(): void; onContinue(): void }): void;
  showRespawn(
    props: RespawnProps,
    onDeploy: (option: SpawnOption) => void,
    notice: FlowNotice,
  ): RespawnHandle;
  showComplete(stats: MissionStats, onPlayAgain: () => void): void;
  /** Hides the title / mission-complete screens. */
  hideScreens(): void;
  /** Big caption over the battlefield ("KIA" in the death beat); null hides it. */
  showCaption(text: 'kia' | 'complete' | null): void;
  /** "Preparing…" spinner while a fast-forward / reload re-simulation runs. */
  showBusy(on: boolean): void;
}

export interface BattleHost {
  /** Shows this life (the Phaser scene steps it), or drives it headless. */
  start(run: LiveRun): void;
  /** Takes the battle off screen. */
  stop(): void;
}

export interface GameOptions {
  /** Scrubber pace in battle ticks per real second; null = as fast as possible. */
  resolvePace(): number | null;
  /** [D6]: on boot with a life in progress, go straight into its resume lead-in (no title). */
  resumeOnReload: boolean;
}

export interface GameAdapters {
  map: MapDef;
  /** Tuning for a new mission (read at New mission / boot; fixed for the session after that). */
  tuning(): Tuning;
  store: KeyValueStore;
  ui: GameUi;
  battle: BattleHost;
  clock: Clock;
  resolver: ResolveRunner;
  options: GameOptions;
  /** Notifications for dev tools / autoplay / tests. */
  onEvent?: (e: GameEvent) => void;
  log?: (msg: string) => void;
}

export type GameEvent =
  | { type: 'flow'; state: FlowState }
  | { type: 'respawnShown'; options: SpawnOption[] }
  | { type: 'runStarted'; run: LiveRun }
  | { type: 'attemptEnded'; observation: AttemptObservation; changes: LaneChange[] }
  | { type: 'resolveProgress'; observation: AttemptObservation; done: boolean }
  | { type: 'saved' };

/** Fast-forwards longer than this show the spinner first (≈150 ms at mission-01 speeds). */
const SPINNER_TICKS = 1500;

export function emptyMission(missionId: string): MissionState {
  return { schemaVersion: 1, missionId, attemptCount: 0, soldiers: [], lanes: [] };
}

export function isRescue(c: LaneChange): boolean {
  return c.before.kind === 'death' && (c.after.kind === 'open' || c.after.kind === 'complete');
}

export class GameController {
  flow: FlowState = INITIAL_FLOW;
  mission: MissionState;
  tuning: Tuning;
  snapshots = new SnapshotStore();
  run: LiveRun | null = null;
  rescues = 0;
  /** Last simulated tick of the latest attempt (respawn header). */
  reachedTick: Tick | null = null;
  lastObservation: AttemptObservation | null = null;
  /** Scrubber position while a resolve runs, else null. */
  resolvedUntil: Tick | null = null;

  private saver: MissionSaver;
  private respawn: RespawnHandle | null = null;
  private pendingChanges: LaneChange[] = [];
  private resolveJob: ResolveJob | null = null;
  private resolve: { attempt: number; fromTick: Tick; snaps: WorldSnapshot[] } | null = null;
  private policy: AutosavePolicy;
  private saveChain: Promise<void> = Promise.resolve();
  private beatTimer: (() => void) | null = null;

  constructor(private readonly a: GameAdapters) {
    this.mission = emptyMission(a.map.id);
    this.tuning = a.tuning();
    this.saver = new MissionSaver(a.store, a.map.id);
    this.policy = createAutosavePolicy(secondsToTicks(this.tuning.autosaveIntervalSeconds));
  }

  // ---------- Boot / title ----------

  async boot(): Promise<void> {
    const res = await loadMission(this.a.store, this.a.map.id);
    if (res.ok) {
      this.mission = res.state;
      await this.loadStats();
    } else if (res.error === 'corrupt') {
      this.log(`Save unreadable (${res.message}); starting fresh`);
    }
    const hasSave =
      res.ok && (res.state.soldiers.length > 0 || !!res.state.completed || !!res.state.inProgress);
    if (hasSave && this.mission.inProgress && this.a.options.resumeOnReload) {
      if (await this.recover()) return;
    }
    this.go({ type: 'loaded', hasSave });
    this.a.ui.showTitle({
      canContinue: hasSave,
      onNew: () => void this.newMission(),
      onContinue: () => void this.continueMission(),
    });
  }

  /** Clears any save and starts a fresh mission at the (empty) respawn screen. */
  async newMission(): Promise<void> {
    this.teardown();
    await clearMission(this.a.store, this.a.map.id);
    this.saver.reset();
    this.mission = emptyMission(this.a.map.id);
    this.tuning = this.a.tuning();
    this.policy = createAutosavePolicy(secondsToTicks(this.tuning.autosaveIntervalSeconds));
    this.snapshots = new SnapshotStore();
    this.rescues = 0;
    this.reachedTick = null;
    this.lastObservation = null;
    this.pendingChanges = [];
    this.a.ui.hideScreens();
    this.go(this.flow.kind === 'title' ? { type: 'newMission' } : { type: 'reset' });
    this.showRespawn();
  }

  async continueMission(): Promise<void> {
    if (this.flow.kind !== 'title') return;
    if (this.mission.inProgress && (await this.recover())) return;
    this.a.ui.hideScreens();
    this.go({ type: 'continue', completed: !!this.mission.completed });
    if (this.mission.completed) {
      this.showComplete();
      return;
    }
    // Snapshots aren't persisted: re-derive the battle from tick 0 in the background. This also
    // finishes a resolve the last session didn't get to.
    this.startResolve(null, null);
    this.showRespawn();
  }

  // ---------- Respawn → deploy ----------

  options(): SpawnOption[] {
    return deriveSpawnOptions(
      this.a.map,
      this.mission.soldiers,
      this.mission.lanes,
      spawnRules(this.tuning),
    );
  }

  /** Deploys a spawn option from the respawn screen. */
  async deploy(option: SpawnOption): Promise<void> {
    if (this.flow.kind !== 'respawn') return;
    this.cancelResolve();
    this.respawn?.destroy();
    this.respawn = null;
    this.go({ type: 'deploy', option });
    await this.prepare(option);
  }

  /** Snapshot ≤ lead-in start, headless fast-forward, then the countdown on screen. */
  private async prepare(option: SpawnOption): Promise<void> {
    const rules = spawnRules(this.tuning);
    const start = leadInStart(option, rules);
    const ffTarget = Math.max(0, start);
    const hold = Math.max(0, -start);
    const snap = this.snapshots.nearestValidSnapshot(ffTarget);
    const from: AttemptFrom = snap ? { kind: 'snapshot', snapshot: snap } : { kind: 'start' };
    const live: LiveSpec =
      option.kind === 'new'
        ? {
            mode: 'new',
            soldierId: nextSoldierId(this.mission.soldiers),
            spawnPointId: option.spawnPointId,
            entryTick: option.entryTick,
          }
        : { mode: 'resume', soldierId: option.soldierId, controlFromTick: option.resumeTick };

    const ffTicks = ffTarget - (snap?.tick ?? 0);
    if (ffTicks > SPINNER_TICKS) {
      this.a.ui.showBusy(true);
      await this.yieldFrame();
    }
    const attempt = startAttempt({
      map: this.a.map,
      tuning: this.tuning,
      soldiers: this.mission.soldiers,
      attempt: this.mission.attemptCount + 1,
      from,
      live,
      snapshots: this.snapshots,
    });
    attempt.runHeadless(ffTarget);
    this.a.ui.showBusy(false);

    const run = new LiveRun(attempt, option, hold, this.cameraHome(attempt, option), {
      onControl: (r) => this.onControl(r),
      onTick: (r) => this.onTick(r),
      onOver: (r) => this.onOver(r),
    });
    if (attempt.isOver()) {
      // The fast-forward itself ended it: the choice was invalidated ("History shifted", [D23]),
      // or an echo finished the mission before the countdown (shown on the frozen field).
      if (attempt.overReason() !== 'historyShifted') {
        this.run = run;
        this.a.battle.start(run);
      }
      this.endAttempt(attempt, option);
      return;
    }
    this.run = run;
    this.go({ type: 'prepared' });
    // Make sure a mission save exists, so an in-progress autosave can be loaded ([D6]).
    this.saveMission();
    this.a.battle.start(run);
    this.emit({ type: 'runStarted', run });
  }

  private cameraHome(attempt: Attempt, option: SpawnOption): Vec2 {
    const id = attempt.liveSoldierId!;
    const s = getSoldier(attempt.world, id);
    if (s?.alive) return { x: s.x, y: s.y };
    const pointId =
      option.kind === 'new'
        ? option.spawnPointId
        : this.mission.soldiers.find((r) => r.id === id)?.spawnPointId;
    const p = this.a.map.spawnPoints.find((sp) => sp.id === pointId) ?? this.a.map.spawnPoints[0];
    return p ? { ...p.position } : { x: this.a.map.width / 2, y: this.a.map.height / 2 };
  }

  // ---------- Live ----------

  private onControl(run: LiveRun): void {
    if (run !== this.run) return;
    resetForLife(this.policy, run.tick);
    this.go({ type: 'controlStarted' });
  }

  private onTick(run: LiveRun): void {
    if (run !== this.run || !run.attempt.inControl || run.ended) return;
    if (shouldSaveInProgress(this.policy, run.tick, 'tick')) this.saveInProgressNow('tick');
  }

  /** Autosave the life in progress now (interval, `visibilitychange`, `pagehide`). */
  saveInProgressNow(trigger: 'tick' | 'hidden' = 'hidden'): void {
    const run = this.run;
    if (!run || run.ended || !run.attempt.inControl) return;
    if (!shouldSaveInProgress(this.policy, run.tick, trigger)) return;
    const seg = run.attempt.liveSegmentSoFar();
    if (!seg) return;
    const life: InProgressLife = {
      soldierId: run.liveId,
      mode: run.option.kind,
      attempt: run.attempt.attemptNumber,
      attemptFromTick: run.attempt.fromTick,
      segmentSoFar: seg,
      ...(run.option.kind === 'new' ? { spawnPointId: run.option.spawnPointId } : {}),
    };
    markSaved(this.policy, run.tick);
    this.queue(async () => {
      const r = await this.saver.saveInProgress(life);
      if (!r.ok) this.log(`Autosave failed: ${r.message}`);
    });
  }

  private onOver(run: LiveRun): void {
    if (run !== this.run) return;
    this.endAttempt(run.attempt, run.option);
  }

  /** Dev tool: kill the live soldier. */
  devKill(): void {
    this.run?.requestKill();
  }

  // ---------- Attempt end ----------

  /** finish → addSegment → applyObservation → save → clear in-progress → (beat) → respawn. */
  private endAttempt(attempt: Attempt, option: SpawnOption): void {
    const over = attempt.overReason();
    const reason = over === 'missionComplete' || over === 'historyShifted' ? over : 'death';
    const res = attempt.finish();
    const live = attempt.live!;
    this.mission.attemptCount = Math.max(this.mission.attemptCount, attempt.attemptNumber);
    if (res.liveSegment) {
      this.mission.soldiers = addSegment(
        this.mission.soldiers,
        {
          soldierId: live.soldierId,
          ...(option.kind === 'new' ? { spawnPointId: option.spawnPointId } : {}),
        },
        res.liveSegment,
      );
    }
    const changes = this.fold(res.observation);
    this.pendingChanges = changes;
    this.reachedTick = res.observation.toTick;
    if (reason === 'missionComplete' && res.observation.missionComplete) {
      const mc = res.observation.missionComplete;
      this.mission.completed = {
        attempt: attempt.attemptNumber,
        tick: mc.tick,
        bySoldierId: mc.bySoldierId,
      };
    }
    delete this.mission.inProgress;
    this.saveMission();
    this.emit({ type: 'attemptEnded', observation: res.observation, changes });

    const ran = this.run;
    this.run = null;
    if (reason === 'historyShifted') {
      if (ran) this.a.battle.stop();
      this.go({ type: 'attemptEnded', reason });
      this.startResolve(res.endSnapshot, this.a.options.resolvePace());
      this.showRespawn();
      return;
    }
    this.go({ type: 'attemptEnded', reason });
    const complete = reason === 'missionComplete';
    this.a.ui.showCaption(complete ? 'complete' : 'kia');
    // The scrubber starts at once, during the beat ([D23]).
    if (!complete) this.startResolve(res.endSnapshot, this.a.options.resolvePace());
    this.beatTimer = this.a.clock.after(this.tuning.deathBeatSeconds * 1000, () => {
      this.beatTimer = null;
      this.a.ui.showCaption(null);
      this.a.battle.stop();
      this.go({ type: 'beatDone' });
      if (complete) this.showComplete();
      else this.showRespawn();
    });
  }

  /** Folds an observation into the truth; returns the lane changes. */
  private fold(obs: AttemptObservation): LaneChange[] {
    const { lanes, changes } = applyObservation(this.mission.lanes, this.mission.soldiers, obs);
    this.mission.lanes = lanes;
    this.rescues += changes.filter(isRescue).length;
    this.lastObservation = obs;
    return changes;
  }

  // ---------- Background resolve ([D23]) ----------

  /** Starts the scrubber from a snapshot (null = from tick 0, after a reload). */
  private startResolve(from: WorldSnapshot | null, pace: number | null): void {
    this.cancelResolve();
    const target = this.mission.soldiers.reduce((m, r) => Math.max(m, recordedTo(r)), 0);
    const fromTick = from?.tick ?? 0;
    if (this.mission.soldiers.length === 0 || fromTick >= target) return;
    const attempt = this.mission.attemptCount;
    this.resolve = { attempt, fromTick, snaps: [] };
    this.resolvedUntil = fromTick;
    const job = this.a.resolver.start(
      {
        mapId: this.a.map.id,
        tuning: this.tuning,
        soldiers: this.mission.soldiers,
        attempt,
        from,
        pace,
      },
      {
        onProgress: (obs, snaps) => {
          if (this.resolveJob !== job) return;
          this.resolve!.snaps.push(...snaps);
          this.onResolved(obs, false);
        },
        onDone: (obs, snaps) => {
          if (this.resolveJob !== job) return;
          this.resolve!.snaps.push(...snaps);
          this.onResolved(obs, true);
          this.commitResolve(obs.toTick);
          this.resolveJob = null;
          this.resolvedUntil = null;
          this.saveMission();
        },
        onError: (msg) => {
          if (this.resolveJob !== job) return;
          this.log(`Resolve failed: ${msg}`);
          this.resolveJob = null;
          this.resolve = null;
          this.resolvedUntil = null;
          this.respawn?.update({ resolvedUntil: null });
        },
      },
    );
    this.resolveJob = job;
  }

  private onResolved(obs: AttemptObservation, done: boolean): void {
    const changes = this.fold(obs);
    this.resolvedUntil = done ? null : obs.toTick;
    if (this.respawn) {
      this.respawn.update({
        lanes: this.mission.lanes,
        changes,
        options: this.options(),
        resolvedUntil: this.resolvedUntil,
        objectiveComplete: this.objectiveComplete(),
      });
    } else {
      this.pendingChanges = [...this.pendingChanges, ...changes];
    }
    this.emit({ type: 'resolveProgress', observation: obs, done });
  }

  /** Stops the scrubber, keeping what it resolved and the snapshots it made so far. */
  private cancelResolve(): void {
    if (!this.resolveJob) return;
    this.resolveJob.cancel();
    this.resolveJob = null;
    if (this.resolvedUntil !== null) this.commitResolve(this.resolvedUntil);
    this.resolvedUntil = null;
    this.saveMission();
  }

  private commitResolve(toTick: Tick): void {
    const r = this.resolve;
    this.resolve = null;
    if (!r) return;
    for (const s of r.snaps) if (s.tick <= toTick) this.snapshots.stage(s);
    this.snapshots.commit({ attempt: r.attempt, fromTick: r.fromTick, toTick });
  }

  get resolving(): boolean {
    return this.resolveJob !== null;
  }

  // ---------- Reload recovery ([D6]) ----------

  /**
   * Re-simulates the interrupted attempt from tick 0 with the partial segment as that soldier's
   * tail, finishes it as 'suspended', then goes straight into that soldier's resume lead-in.
   * Returns false (and drops the in-progress life) if it can't be resumed.
   */
  private async recover(): Promise<boolean> {
    const life = this.mission.inProgress;
    if (!life) return false;
    delete this.mission.inProgress;
    this.a.ui.hideScreens();
    this.a.ui.showBusy(true);
    await this.yieldFrame();
    try {
      const seg = life.segmentSoFar;
      const soldiers = addSegment(
        this.mission.soldiers,
        {
          soldierId: life.soldierId,
          ...(life.mode === 'new'
            ? { spawnPointId: life.spawnPointId ?? this.nearestSpawn(seg.waypoints[0]) }
            : {}),
        },
        seg,
      );
      const attempt = startAttempt({
        map: this.a.map,
        tuning: this.tuning,
        soldiers,
        attempt: life.attempt,
        from: { kind: 'start' },
        live: null,
        snapshots: this.snapshots,
      });
      attempt.runHeadless(seg.endTick);
      const res = attempt.finish('suspended');
      this.mission.soldiers = soldiers;
      this.mission.attemptCount = Math.max(this.mission.attemptCount, life.attempt);
      this.pendingChanges = this.fold(res.observation);
      this.reachedTick = res.observation.toTick;
      this.saveMission();
      const option = this.options().find(
        (o) => o.kind === 'resume' && o.soldierId === life.soldierId,
      );
      this.a.ui.showBusy(false);
      if (!option) {
        this.log(`Reload: ${life.soldierId} can't be resumed`);
        return false;
      }
      this.go({ type: 'recover', option });
      await this.prepare(option);
      return true;
    } catch (e) {
      this.a.ui.showBusy(false);
      this.log(`Reload recovery failed: ${String(e)}`);
      this.saveMission();
      return false;
    }
  }

  private nearestSpawn(p: Vec2 | undefined): string {
    const pts = this.a.map.spawnPoints;
    if (!p) return pts[0]!.id;
    let best = pts[0]!;
    for (const sp of pts) {
      if (
        Math.hypot(sp.position.x - p.x, sp.position.y - p.y) <
        Math.hypot(best.position.x - p.x, best.position.y - p.y)
      ) {
        best = sp;
      }
    }
    return best.id;
  }

  // ---------- Screens ----------

  private objectiveComplete(): boolean {
    return !!this.mission.completed || this.mission.lanes.some((l) => l.end.kind === 'complete');
  }

  private showRespawn(): void {
    this.respawn?.destroy();
    const options = this.options();
    const notice = this.flow.kind === 'respawn' ? this.flow.notice : null;
    this.respawn = this.a.ui.showRespawn(
      {
        map: this.a.map,
        soldiers: this.mission.soldiers,
        lanes: this.mission.lanes,
        options,
        changes: this.pendingChanges,
        attemptsPlayed: this.mission.attemptCount,
        reachedTick: this.reachedTick,
        objectiveComplete: this.objectiveComplete(),
        resolvedUntil: this.resolvedUntil,
      },
      (o) => void this.deploy(o),
      notice,
    );
    this.pendingChanges = [];
    this.emit({ type: 'respawnShown', options });
  }

  stats(): MissionStats {
    return {
      battleTicks: this.mission.completed?.tick ?? this.reachedTick ?? 0,
      soldiersUsed: this.mission.soldiers.length,
      rescues: this.rescues,
      attempts: this.mission.attemptCount,
    };
  }

  private showComplete(): void {
    this.a.ui.showComplete(this.stats(), () => void this.playAgain());
  }

  /** Mission complete → "Play again": clears the save, back to the first respawn screen. */
  async playAgain(): Promise<void> {
    if (this.flow.kind !== 'complete') return;
    await this.newMission();
  }

  // ---------- Saving ----------

  private saveMission(): void {
    const state: MissionState = { ...this.mission };
    const stats = { rescues: this.rescues, reachedTick: this.reachedTick };
    this.queue(async () => {
      const r = await this.saver.save(state);
      if (!r.ok) this.log(`Save failed: ${r.message}`);
      await this.a.store.set(this.statsKey(), JSON.stringify(stats));
      this.emit({ type: 'saved' });
    });
  }

  private statsKey(): string {
    return `${this.saver.keys.prefix}stats`;
  }

  /** App-level extras next to the mission save: rescue count and last battle time reached. */
  private async loadStats(): Promise<void> {
    try {
      const raw = await this.a.store.get(this.statsKey());
      const v = raw ? (JSON.parse(raw) as { rescues?: unknown; reachedTick?: unknown }) : null;
      if (typeof v?.rescues === 'number') this.rescues = v.rescues;
      if (typeof v?.reachedTick === 'number') this.reachedTick = v.reachedTick;
    } catch {
      // stats are cosmetic; a fresh count is fine
    }
  }

  private queue(job: () => Promise<void>): void {
    this.saveChain = this.saveChain.then(job).catch((e) => this.log(`Save error: ${String(e)}`));
  }

  /** Resolves once every queued save has been written. */
  flushSaves(): Promise<void> {
    return this.saveChain;
  }

  // ---------- Misc ----------

  /** Stops whatever is running (battle, resolve, beat) without saving a life in progress. */
  private teardown(): void {
    this.beatTimer?.();
    this.beatTimer = null;
    this.a.ui.showCaption(null);
    this.a.ui.showBusy(false);
    if (this.resolveJob) {
      this.resolveJob.cancel();
      this.resolveJob = null;
      this.resolve = null;
      this.resolvedUntil = null;
    }
    if (this.run) {
      this.run.attempt.abandon();
      this.run = null;
    }
    this.a.battle.stop();
    this.respawn?.destroy();
    this.respawn = null;
  }

  private go(e: FlowEvent): void {
    try {
      this.flow = transition(this.flow, e);
    } catch (err) {
      if (err instanceof FlowError) this.log(err.message);
      throw err;
    }
    this.emit({ type: 'flow', state: this.flow });
  }

  private emit(e: GameEvent): void {
    this.a.onEvent?.(e);
  }

  private log(msg: string): void {
    this.a.log?.(msg);
  }

  private yieldFrame(): Promise<void> {
    return new Promise((resolve) => this.a.clock.after(16, resolve));
  }
}
