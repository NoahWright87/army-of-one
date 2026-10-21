/**
 * Resolve passes ([D23]): after an attempt, the rest of the battle (everything after its last
 * simulated tick) is re-simulated headless with no live soldier, so the respawn screen's scrubber
 * can sweep across it. Same machinery as an attempt.
 *
 * Step-wise and pure so it can run inside a Web Worker (or a requestIdleCallback loop) without
 * blocking: call `advance(maxTicks)` repeatedly until `done`. It reports partial observations
 * every `tuning.attempt.resolveProgressIntervalTicks` through `onProgress` (monotonic: toTick only
 * grows, markers only append, fates only finalize). `cancel()` stops it at once; what it simulated
 * so far is still committed (its snapshots are the truth for that window).
 */
import type { Tuning } from '../../content/tuning';
import type { AttemptObservation, SoldierRecord } from '../../contracts/mission';
import type { Tick } from '../core/time';
import type { MapDef } from '../world/map';
import { recordedTo } from '../recording/records';
import { Attempt, type AttemptFrom } from './attempt';
import type { SnapshotStore } from './snapshots';

export interface ResolveParams {
  map: MapDef;
  tuning: Tuning;
  soldiers: readonly SoldierRecord[];
  /** The attempt this pass follows. */
  attempt: number;
  from: AttemptFrom;
  snapshots?: SnapshotStore;
  onProgress?: (observationSoFar: AttemptObservation) => void;
  /** Overrides `tuning.attempt.resolveProgressIntervalTicks`. */
  progressIntervalTicks?: number;
}

export interface ResolveProgress {
  tick: Tick;
  /** The tick it runs to: the latest `recordedTo` of any soldier. */
  targetTick: Tick;
  done: boolean;
  cancelled: boolean;
}

export class Resolve {
  readonly targetTick: Tick;
  private readonly run: Attempt;
  private readonly onProgress?: (o: AttemptObservation) => void;
  private readonly interval: number;
  private lastReported: Tick;
  private state: 'running' | 'done' | 'cancelled' = 'running';
  private final: AttemptObservation | null = null;

  constructor(p: ResolveParams) {
    this.run = new Attempt({
      map: p.map,
      tuning: p.tuning,
      soldiers: p.soldiers,
      attempt: p.attempt,
      from: p.from,
      live: null,
      kind: 'resolve',
      ...(p.snapshots ? { snapshots: p.snapshots } : {}),
    });
    this.targetTick = p.soldiers.reduce((m, r) => Math.max(m, recordedTo(r)), 0);
    if (p.onProgress) this.onProgress = p.onProgress;
    this.interval = Math.max(
      1,
      p.progressIntervalTicks ?? p.tuning.attempt.resolveProgressIntervalTicks,
    );
    this.lastReported = this.run.tick;
    if (this.run.tick >= this.targetTick) this.complete();
  }

  get tick(): Tick {
    return this.run.tick;
  }

  get done(): boolean {
    return this.state !== 'running';
  }

  get cancelled(): boolean {
    return this.state === 'cancelled';
  }

  /** The world being resolved (read-only use, e.g. a debug view). */
  get world() {
    return this.run.world;
  }

  /** Simulates up to `maxTicks` more ticks. */
  advance(maxTicks: number): ResolveProgress {
    for (let i = 0; i < maxTicks && this.state === 'running'; i++) {
      this.run.step();
      if (this.run.tick - this.lastReported >= this.interval) {
        this.lastReported = this.run.tick;
        this.onProgress?.(this.run.observationSoFar('resolved'));
      }
      if (this.run.tick >= this.targetTick || this.run.world.state.missionComplete) this.complete();
    }
    return this.progress();
  }

  /** Stops now. The window simulated so far is committed; its observation stays available. */
  cancel(): ResolveProgress {
    if (this.state === 'running') {
      this.final = this.run.finish('resolved').observation;
      this.state = 'cancelled';
    }
    return this.progress();
  }

  /** Final observation when done (or cancelled), else the observation so far. */
  observation(): AttemptObservation {
    return this.final ?? this.run.observationSoFar('resolved');
  }

  progress(): ResolveProgress {
    return {
      tick: this.run.tick,
      targetTick: this.targetTick,
      done: this.done,
      cancelled: this.cancelled,
    };
  }

  private complete(): void {
    this.final = this.run.finish('resolved').observation;
    this.state = 'done';
    this.onProgress?.(this.final);
  }
}

export function startResolve(params: ResolveParams): Resolve {
  return new Resolve(params);
}
