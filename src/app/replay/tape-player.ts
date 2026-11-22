/**
 * (PHASE19) Plays the battle tape like the after-action replay used to play a re-simulation:
 * same surface as `ReplayPlayer` (step, seek, view), but nothing is simulated, so it always
 * shows exactly what happened (the win included).
 */
import type { Tuning } from '../../content/tuning';
import type { Tick } from '../../sim/core/time';
import type { Tape } from '../../sim/tape/tape';
import type { WorldView } from '../../sim/view';
import type { MapDef } from '../../sim/world/map';
import type { ReplayInput } from './replay-player';

/** What the replay scene needs from whatever it plays. */
export interface ReplaySource {
  readonly tick: Tick;
  readonly ended: boolean;
  readonly world: { map: MapDef; tuning: Tuning };
  readonly input: Pick<ReplayInput, 'endTick' | 'winnerId'>;
  view(): WorldView;
  step(): boolean;
  seek(tick: Tick): void;
}

export class TapePlayer implements ReplaySource {
  readonly world: { map: MapDef; tuning: Tuning };
  readonly input: Pick<ReplayInput, 'endTick' | 'winnerId'>;
  private t: Tick;
  /** Last tick whose events were handed out (each event fires once while playing). */
  private shown: Tick;

  constructor(
    private readonly tape: Tape,
    map: MapDef,
    tuning: Tuning,
    input: { endTick: Tick; winnerId?: string },
  ) {
    this.world = { map, tuning };
    const end = Math.min(input.endTick, tape.end ?? 0);
    this.input = { endTick: end, ...(input.winnerId ? { winnerId: input.winnerId } : {}) };
    this.t = tape.start ?? 0;
    this.shown = this.t;
  }

  get tick(): Tick {
    return this.t;
  }

  get ended(): boolean {
    return this.t >= this.input.endTick;
  }

  view(): WorldView {
    const v = this.tape.viewAt(this.t, this.shown);
    this.shown = this.t;
    return v ?? emptyView(this.t);
  }

  step(): boolean {
    if (this.ended) return false;
    this.t++;
    return true;
  }

  seek(tick: Tick): void {
    this.t = Math.max(this.tape.start ?? 0, Math.min(this.input.endTick, Math.round(tick)));
    // A jump is a cut: nothing in between replays its sounds and effects.
    this.shown = this.t;
  }
}

function emptyView(tick: Tick): WorldView {
  return {
    tick,
    soldiers: [],
    turrets: [],
    mines: [],
    vehicles: [],
    gates: [],
    levers: [],
    bridges: [],
    objectives: [],
    capturePoints: [],
    events: [],
    missionComplete: null,
  };
}
