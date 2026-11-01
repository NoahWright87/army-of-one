/**
 * World snapshots ([E4]): plain-data, structured-clone-able copies of `world.state` plus the echo
 * controller state, taken every `tuning.attempt.snapshotIntervalTicks`. They're in-memory caches,
 * never persisted: any state can be rebuilt by re-simulating from tick 0 ([E2]).
 *
 * Validity: the latest attempt is the truth ([D2]), but only for the battle time it simulated
 * ([D3]). So when an attempt (or resolve pass) commits its window [fromTick, toTick]:
 * - its own snapshots inside the window become valid;
 * - snapshots from other (earlier) attempts at ticks >= fromTick are stale (the new live soldier, or the
 *   changed world, may have altered everything from there on) and are dropped.
 * Snapshots from earlier attempts at ticks < fromTick stay valid, and a resolve pass shares its
 * attempt's number, so it never invalidates that attempt's snapshots.
 */
import type { Tuning } from '../../content/tuning';
import type { Tick } from '../core/time';
import type { WorldState } from '../state';
import type { EchoControllerState } from '../recording/echo-controller';

export interface WorldSnapshot {
  tick: Tick;
  /** Attempt that produced it (a resolve pass uses the attempt it follows). */
  attempt: number;
  source: 'attempt' | 'resolve';
  state: WorldState;
  echoes: EchoControllerState;
}

export interface SnapshotWindow {
  attempt: number;
  fromTick: Tick;
  toTick: Tick;
}

/**
 * (05-b) Snapshot thinning for old battle time: committed snapshots more than `denseWindowTicks`
 * behind the newest one are kept only at multiples of `sparseEveryTicks` (and tick 0). Memory
 * goes down a lot for big armies; the price is a longer fast-forward when deploying deep into
 * old battle time. Outcomes never change: any snapshot reproduces the same history.
 */
export interface SnapshotThinning {
  denseWindowTicks: Tick;
  sparseEveryTicks: Tick;
}

/** The thinning a mission plays with, from `tuning.attempt` (null when switched off). */
export function snapshotThinning(tuning: Pick<Tuning, 'attempt'>): SnapshotThinning | null {
  const a = tuning.attempt;
  return a.snapshotSparseEveryTicks > 0
    ? { denseWindowTicks: a.snapshotDenseWindowTicks, sparseEveryTicks: a.snapshotSparseEveryTicks }
    : null;
}

export class SnapshotStore {
  /** Committed (valid) snapshots, sorted by tick. */
  private valid: WorldSnapshot[] = [];
  constructor(private thinning: SnapshotThinning | null = null) {}

  setThinning(thinning: SnapshotThinning | null): void {
    this.thinning = thinning;
  }
  /** Snapshots from a running attempt, not valid until it commits. */
  private staged: WorldSnapshot[] = [];

  /** Adds a snapshot from a running attempt / resolve pass (pending until `commit`). */
  stage(snapshot: WorldSnapshot): void {
    this.staged.push(snapshot);
  }

  /** Makes a finished attempt's snapshots valid and drops what it made stale (see above). */
  commit(window: SnapshotWindow): void {
    this.valid = this.valid.filter((s) => s.attempt === window.attempt || s.tick < window.fromTick);
    for (const s of this.staged) {
      if (s.attempt === window.attempt && s.tick >= window.fromTick && s.tick <= window.toTick) {
        this.valid.push(s);
      }
    }
    this.staged = [];
    this.valid.sort((a, b) => a.tick - b.tick);
    // One snapshot per tick: keep the newest.
    this.valid = this.valid.filter((s, i, arr) => arr[i + 1]?.tick !== s.tick);
    const th = this.thinning;
    if (th && th.sparseEveryTicks > 0 && this.valid.length) {
      const newest = this.valid[this.valid.length - 1]!.tick;
      this.valid = this.valid.filter(
        (s) =>
          s.tick === 0 ||
          s.tick >= newest - th.denseWindowTicks ||
          s.tick % th.sparseEveryTicks === 0,
      );
    }
  }

  /** Throws away staged snapshots (an attempt abandoned without committing). */
  discardStaged(): void {
    this.staged = [];
  }

  /** Drops every valid snapshot at or after `tick`. */
  invalidateFrom(tick: Tick): void {
    this.valid = this.valid.filter((s) => s.tick < tick);
  }

  /** Latest valid snapshot at or before `atOrBefore`, or null (then start from tick 0). */
  nearestValidSnapshot(atOrBefore: Tick): WorldSnapshot | null {
    let best: WorldSnapshot | null = null;
    for (const s of this.valid) {
      if (s.tick > atOrBefore) break;
      best = s;
    }
    return best;
  }

  /** Highest tick with a valid snapshot (-1 if none): history up to here is cached. */
  validUntil(): Tick {
    return this.valid[this.valid.length - 1]?.tick ?? -1;
  }

  get size(): number {
    return this.valid.length;
  }

  ticks(): Tick[] {
    return this.valid.map((s) => s.tick);
  }
}
