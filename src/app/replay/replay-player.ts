/**
 * (07-a) The after-action replay ([D42]): the whole mission re-simulated from tick 0 with every
 * recorded soldier as an echo and no live soldier. Deterministic, so it shows the history that
 * won. No new recording format: the input is the mission's own records.
 *
 * Seeking keeps snapshots taken while playing (every `SNAPSHOT_EVERY` ticks): a seek restarts
 * from the nearest snapshot at or before the target and fast-forwards; a seek past what has been
 * played fast-forwards from the latest one.
 *
 * Shareable later: `ReplayInput` is a plain value (mission id, version, recordings, end tick).
 * A URL/file export of it (with the 03-c segment codec) plus a viewer-only mode is all sharing
 * would need.
 */
import type { Tuning } from '../../content/tuning';
import type { MissionId, SoldierRecord } from '../../contracts/mission';
import { Attempt } from '../../sim/attempt/attempt';
import type { WorldSnapshot } from '../../sim/attempt/snapshots';
import type { Tick } from '../../sim/core/time';
import type { WorldView } from '../../sim/view';
import type { MapDef } from '../../sim/world/map';

export const REPLAY_VERSION = 1;
const SNAPSHOT_EVERY = 120;

export interface ReplayInput {
  version: typeof REPLAY_VERSION;
  missionId: MissionId;
  soldiers: readonly SoldierRecord[];
  /** Last tick to show (the winning tick, plus a short tail). */
  endTick: Tick;
  /** The soldier who landed the winning blow (highlighted). */
  winnerId?: string;
}

export class ReplayPlayer {
  private attempt: Attempt;
  private readonly snaps: WorldSnapshot[] = [];

  constructor(
    private readonly map: MapDef,
    private readonly tuning: Tuning,
    readonly input: ReplayInput,
  ) {
    this.attempt = this.start(null);
    this.snaps.push(this.attempt.takeSnapshot());
  }

  get tick(): Tick {
    return this.attempt.tick;
  }

  get ended(): boolean {
    return this.attempt.tick >= this.input.endTick;
  }

  /** The world being replayed (read-only for callers). */
  get world() {
    return this.attempt.world;
  }

  view(): WorldView {
    return this.attempt.view();
  }

  /** One tick forward (no-op at the end). Returns false at the end. */
  step(): boolean {
    if (this.ended) return false;
    this.attempt.step();
    if (this.attempt.tick % SNAPSHOT_EVERY === 0) this.remember();
    return true;
  }

  /** Jumps to `tick` (clamped to 0..endTick). */
  seek(tick: Tick): void {
    const t = Math.max(0, Math.min(this.input.endTick, Math.round(tick)));
    if (t === this.tick) return;
    if (t < this.tick || t - this.tick > SNAPSHOT_EVERY) {
      let best: WorldSnapshot | null = null;
      for (const s of this.snaps) if (s.tick <= t && (!best || s.tick > best.tick)) best = s;
      if (best && (t < this.tick || best.tick > this.tick)) this.attempt = this.start(best);
    }
    while (this.tick < t) this.step();
  }

  private start(from: WorldSnapshot | null): Attempt {
    return new Attempt({
      map: this.map,
      tuning: this.tuning,
      soldiers: this.input.soldiers,
      attempt: 1,
      from: from ? { kind: 'snapshot', snapshot: from } : { kind: 'start' },
      live: null,
      kind: 'resolve',
    });
  }

  private remember(): void {
    if (this.snaps.some((s) => s.tick === this.tick)) return;
    this.snaps.push(this.attempt.takeSnapshot());
  }
}
