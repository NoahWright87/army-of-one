/**
 * (PHASE19) The respawn view's clock: battle time as a smooth, fractional tick that plays at a
 * rate (0 = paused, 0.25 = the slow-motion after a death) or travels to a time. Travel never
 * jumps: it speeds up, covers the distance (50× and more for long trips), and slows down as it
 * settles, in about the same short time however far it goes. Time stays inside what has played
 * (`min` … `frontier`). Pure: the caller passes real time in.
 */

/** Ease in and out: fast in the middle, gentle at both ends. */
export function easeInOut(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** How long a trip of `ticks` takes (ms): short hops are quick, long trips cap out. TUNE */
export function travelMs(ticks: number): number {
  const d = Math.abs(ticks);
  if (d < 1) return 0;
  return Math.min(1300, 280 + 230 * Math.log2(1 + d / 60));
}

export interface ClockBounds {
  /** Earliest time (the tape's start). */
  min(): number;
  /** Latest time that has played (the tape's end). */
  frontier(): number;
}

interface Trip {
  from: number;
  to: number;
  startMs: number;
  ms: number;
  done: () => void;
}

export class TimeClock {
  /** Battle ticks per real tick (60 per second) while not travelling. */
  rate: number;
  private t: number;
  private trip: Trip | null = null;

  constructor(
    private readonly bounds: ClockBounds,
    start: number,
    rate = 0,
  ) {
    this.t = this.clamp(start);
    this.rate = rate;
  }

  get tick(): number {
    return this.t;
  }

  get traveling(): boolean {
    return this.trip !== null;
  }

  /** Where a trip is heading (or the current time). */
  get destination(): number {
    return this.trip?.to ?? this.t;
  }

  /** Battle ticks per second right now (for deciding whether to play sounds and effects). */
  speedNow(): number {
    if (!this.trip) return this.rate * 60;
    const { from, to, ms } = this.trip;
    return ms > 0 ? (Math.abs(to - from) / ms) * 1000 * 1.5 : Infinity;
  }

  /** Smoothly travels to `tick` (clamped to what has played); resolves on arrival. */
  travelTo(tick: number, nowMs: number): Promise<void> {
    const to = this.clamp(tick);
    this.trip?.done();
    return new Promise((done) => {
      const ms = travelMs(to - this.t);
      if (ms === 0) {
        this.t = to;
        this.trip = null;
        done();
        return;
      }
      this.trip = { from: this.t, to, startMs: nowMs, ms, done };
    });
  }

  /** Sets the time at once (dragging the scrub bar: the finger is the motion). */
  set(tick: number): void {
    this.trip?.done();
    this.trip = null;
    this.t = this.clamp(tick);
  }

  /** Advances to real time `nowMs`, `dtMs` after the last update. */
  update(nowMs: number, dtMs: number): void {
    const trip = this.trip;
    if (trip) {
      const to = this.clamp(trip.to);
      const k = easeInOut((nowMs - trip.startMs) / trip.ms);
      this.t = trip.from + (to - trip.from) * k;
      if (k >= 1) {
        this.t = to;
        this.trip = null;
        trip.done();
      }
      return;
    }
    if (this.rate !== 0) this.t = this.clamp(this.t + (this.rate * dtMs * 60) / 1000);
  }

  private clamp(t: number): number {
    const lo = this.bounds.min();
    const hi = Math.max(lo, this.bounds.frontier());
    return Math.max(lo, Math.min(hi, t));
  }
}
