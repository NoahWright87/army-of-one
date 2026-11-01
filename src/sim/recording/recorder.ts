/**
 * Records a live soldier's life as a `RecordingSegment` ([E1], [E7]): one lossless waypoint per
 * controlled tick (the quantized pose the world saw, read after movement + separation and before
 * actions), plus the shots and interacts it performed. Outcomes (hits, damage, deaths) are never
 * recorded ([E3]). Plain data throughout, so a segment-so-far can be autosaved ([D6]).
 */
import type {
  RecordedAction,
  RecordingSegment,
  SegmentEndReason,
  SoldierId,
  Waypoint,
} from '../../contracts/mission';
import type { Tick } from '../core/time';
import type { SoldierState } from '../entities/soldier';
import { isLeverOn } from '../entities/lever';
import type { SimEvent } from '../events';
import type { World } from '../state';

export class Recorder {
  readonly soldierId: SoldierId;
  private readonly waypoints: Waypoint[] = [];
  private readonly actions: RecordedAction[] = [];

  constructor(soldierId: SoldierId) {
    this.soldierId = soldierId;
  }

  get startTick(): Tick | null {
    return this.waypoints[0]?.t ?? null;
  }

  get lastTick(): Tick | null {
    return this.waypoints[this.waypoints.length - 1]?.t ?? null;
  }

  get empty(): boolean {
    return this.waypoints.length === 0;
  }

  /** Records the soldier's pose for tick `t` (call once per controlled tick, in order). */
  recordPose(s: SoldierState, t: Tick): void {
    const last = this.lastTick;
    if (last !== null && t !== last + 1) {
      throw new Error(`Recorder ${this.soldierId}: tick ${t} after ${last} is not contiguous`);
    }
    this.waypoints.push({ t, x: s.x, y: s.y, facing: s.facing });
  }

  /** Picks this soldier's shots and interacts out of a tick's events (after `recordPose`). */
  recordEvents(events: readonly SimEvent[], world?: World): void {
    const pose = this.waypoints[this.waypoints.length - 1];
    for (const e of events) {
      if (!pose || e.tick !== pose.t) continue;
      if (e.kind === 'shotFired' && e.by === this.soldierId) {
        this.actions.push({ kind: 'shot', t: e.tick, x: e.fromX, y: e.fromY, angle: e.angle });
      } else if (e.kind === 'interacted' && e.by === this.soldierId) {
        this.actions.push({
          kind: 'interact',
          t: e.tick,
          x: pose.x,
          y: pose.y,
          targetId: e.targetId,
          ...leverState(world, e.targetId),
        });
      }
    }
  }

  /** The segment recorded so far (copies), or null if nothing was recorded. */
  segment(endReason: SegmentEndReason): RecordingSegment | null {
    const first = this.waypoints[0];
    const last = this.waypoints[this.waypoints.length - 1];
    if (!first || !last) return null;
    return {
      startTick: first.t,
      endTick: last.t,
      waypoints: this.waypoints.map((w) => ({ ...w })),
      actions: this.actions.map((a) => ({ ...a })),
      endReason,
    };
  }
}

function leverState(world: World | undefined, leverId: string): { on?: boolean } {
  const def = world?.map.levers?.find((l) => l.id === leverId);
  return world && def ? { on: isLeverOn(world, def) } : {};
}
