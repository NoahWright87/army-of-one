/**
 * Background resolve ([D23]) behind one interface, so the game controller doesn't care where it
 * runs:
 *  - `createWorkerResolveRunner()`: a Web Worker (resolve-worker.ts). The browser default.
 *  - `createInlineResolveRunner(schedule)`: time-sliced on the calling thread. Used by tests and
 *    headless tools, and as the browser fallback when Workers are unavailable.
 * Both report progressive observations plus the snapshots produced since the last report; the
 * controller stages and commits those into the mission's SnapshotStore itself.
 */
import { findMap } from '../content/maps';
import type { Tuning } from '../content/tuning';
import type { AttemptObservation, SoldierRecord } from '../contracts/mission';
import { SnapshotStore, startResolve, type WorldSnapshot } from '../sim/attempt';
import type { MapDef } from '../sim/world/map';

export interface ResolveRequest {
  mapId: string;
  tuning: Tuning;
  soldiers: readonly SoldierRecord[];
  /** The attempt this pass follows. */
  attempt: number;
  /** Where the pass starts; null = tick 0 (after a reload: snapshots aren't persisted). */
  from: WorldSnapshot | null;
  /**
   * Max battle ticks resolved per real second, so the scrubber visibly sweeps; null = flat out.
   * (Setting `game.resolveSpeed`.)
   */
  pace?: number | null;
}

/** Real-time slice length for paced passes. */
export const PACE_SLICE_MS = 50;

/** Ticks per slice: flat-out passes use `flatOut`, paced ones what the pace allows per slice. */
export function sliceTicks(pace: number | null | undefined, flatOut: number): number {
  if (!pace || pace <= 0) return flatOut;
  return Math.max(1, Math.round((pace * PACE_SLICE_MS) / 1000));
}

export interface ResolveCallbacks {
  /** A partial observation (monotonic) and the snapshots made since the last call. */
  onProgress(obs: AttemptObservation, snapshots: WorldSnapshot[]): void;
  /** Final observation; called once (not after cancel). */
  onDone(obs: AttemptObservation, snapshots: WorldSnapshot[]): void;
  onError?(message: string): void;
}

export interface ResolveJob {
  /** Stops at once. No callbacks fire afterwards. */
  cancel(): void;
}

export interface ResolveRunner {
  readonly kind: 'worker' | 'inline';
  start(req: ResolveRequest, cb: ResolveCallbacks): ResolveJob;
}

export function mapById(id: string): MapDef {
  const m = findMap(id);
  if (!m) throw new Error(`Unknown map ${id}`);
  return m;
}

/** Snapshot store that also hands every staged snapshot to `out` (so a runner can forward it). */
export class ForwardingSnapshotStore extends SnapshotStore {
  constructor(private readonly out: WorldSnapshot[]) {
    super();
  }

  override stage(snapshot: WorldSnapshot): void {
    super.stage(snapshot);
    this.out.push(snapshot);
  }
}

/**
 * Drives one resolve pass in slices: `slice()` simulates up to `ticks` and fires callbacks.
 * Shared by the inline runner and the worker.
 */
export function createResolveDriver(req: ResolveRequest, cb: ResolveCallbacks) {
  const pending: WorldSnapshot[] = [];
  const take = () => pending.splice(0, pending.length);
  let finished = false;
  let r: ReturnType<typeof startResolve> | undefined = undefined;
  r = startResolve({
    map: mapById(req.mapId),
    tuning: req.tuning,
    soldiers: req.soldiers,
    attempt: req.attempt,
    from: req.from ? { kind: 'snapshot', snapshot: req.from } : { kind: 'start' },
    snapshots: new ForwardingSnapshotStore(pending),
    onProgress: (obs) => {
      if (r?.done) return; // the final report goes through onDone
      cb.onProgress(obs, take());
    },
  });
  const finish = () => {
    if (finished) return;
    finished = true;
    cb.onDone(r!.observation(), take());
  };
  return {
    /** Returns true when the pass is complete. */
    slice(ticks: number): boolean {
      if (finished) return true;
      if (!r!.done) r!.advance(ticks);
      if (r!.done) finish();
      return finished;
    },
  };
}

export type SliceScheduler = (run: () => void) => () => void;

export type SliceSchedulerFactory = (delayMs: number) => SliceScheduler;

/** Main-thread scheduler: one slice per macrotask. */
export const timeoutScheduler: SliceSchedulerFactory = (delayMs) => (run) => {
  const id = setTimeout(run, delayMs);
  return () => clearTimeout(id);
};

/**
 * Time-sliced resolve on the calling thread. Each slice runs `ticksPerSlice` ticks (≈ a few ms
 * at mission-01 speeds), then yields through `schedule`.
 */
export function createInlineResolveRunner(
  scheduler: SliceSchedulerFactory = timeoutScheduler,
  flatOutTicksPerSlice = 120,
): ResolveRunner {
  return {
    kind: 'inline',
    start(req, cb) {
      const ticksPerSlice = sliceTicks(req.pace, flatOutTicksPerSlice);
      const schedule = scheduler(req.pace ? PACE_SLICE_MS : 0);
      let cancelled = false;
      let cancelNext: (() => void) | null = null;
      let driver: ReturnType<typeof createResolveDriver> | null = null;
      const loop = () => {
        cancelNext = null;
        if (cancelled) return;
        try {
          driver ??= createResolveDriver(req, cb);
          if (!driver.slice(ticksPerSlice)) cancelNext = schedule(loop);
        } catch (e) {
          cb.onError?.(String(e));
        }
      };
      cancelNext = schedule(loop);
      return {
        cancel() {
          cancelled = true;
          cancelNext?.();
        },
      };
    },
  };
}

// ---------- Worker protocol ----------

export type ToWorker = { type: 'start'; req: ResolveRequest } | { type: 'cancel' };
export type FromWorker =
  | { type: 'progress'; obs: AttemptObservation; snapshots: WorldSnapshot[] }
  | { type: 'done'; obs: AttemptObservation; snapshots: WorldSnapshot[] }
  | { type: 'error'; message: string };

/**
 * Resolve in a Web Worker. One worker per pass: cancel terminates it outright (instant, and
 * nothing can arrive late); snapshots already received stay with the caller.
 */
export function createWorkerResolveRunner(makeWorker: () => Worker): ResolveRunner {
  return {
    kind: 'worker',
    start(req, cb) {
      const w = makeWorker();
      let live = true;
      w.onmessage = (ev: MessageEvent<FromWorker>) => {
        if (!live) return;
        const m = ev.data;
        if (m.type === 'progress') cb.onProgress(m.obs, m.snapshots);
        else if (m.type === 'done') {
          live = false;
          cb.onDone(m.obs, m.snapshots);
          w.terminate();
        } else {
          live = false;
          cb.onError?.(m.message);
          w.terminate();
        }
      };
      w.onerror = (e) => {
        if (!live) return;
        live = false;
        cb.onError?.(e.message);
        w.terminate();
      };
      w.postMessage({ type: 'start', req } satisfies ToWorker);
      return {
        cancel() {
          if (!live) return;
          live = false;
          w.terminate();
        },
      };
    },
  };
}
