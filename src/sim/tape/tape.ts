/**
 * (PHASE19) The battle tape: what actually played, as frames of the whole world (every unit,
 * human and AI, plus doors, objectives, captures and what happened). It is the truth for
 * playback: rewinding, fast-forwarding and the after-action replay read it instead of
 * re-simulating, so they always show exactly what happened.
 *
 * - A frame is a `WorldView` (the renderer's contract) taken every `frameEvery` ticks; the
 *   events of the ticks in between ride on the next frame.
 * - Runs (attempts, resolve passes) are stitched in with `splice`: a run replaces the tape from
 *   the tick it starts to matter (the live soldier's control tick; a resolve's first tick) on,
 *   and the tape ends where the run ended (later battle time is re-simulated as it plays).
 * - `viewAt(tick)` blends the frames around `tick`, so playback is smooth at any rate.
 *
 * Pure: no DOM, no clocks.
 */
import type { Tick } from '../core/time';
import type { SoldierView, WorldView } from '../view';

export interface TapeFrame {
  tick: Tick;
  /** The world at `tick`; `view.events` holds every event since the previous frame. */
  view: WorldView;
}

/** A frame for the tape: the view without per-live-soldier extras the tape never shows. */
export function tapeFrame(view: WorldView, events: WorldView['events']): TapeFrame {
  const v: WorldView = { ...view, events };
  delete v.coverArcs;
  return { tick: view.tick, view: v };
}

/** Collects a run's frames: one every `every` ticks (and on demand), events in between. */
export class TapeRecorder {
  private frames: TapeFrame[] = [];
  private events: WorldView['events'] = [];
  private lastTick: Tick = -1;

  constructor(private readonly every: number) {}

  /** After every step (and at the start): keeps the events, takes a frame when due. */
  onTick(tick: Tick, events: WorldView['events'], view: () => WorldView, force = false): void {
    if (events.length) this.events.push(...events);
    if (tick === this.lastTick) return;
    if (!force && tick % this.every !== 0) return;
    this.frames.push(tapeFrame(view(), this.events));
    this.events = [];
    this.lastTick = tick;
  }

  /** Frames recorded since the last drain. */
  drain(): TapeFrame[] {
    return this.frames.splice(0, this.frames.length);
  }
}

export class Tape {
  private frames: TapeFrame[] = [];

  constructor(frames: readonly TapeFrame[] = []) {
    this.frames = [...frames].sort((a, b) => a.tick - b.tick);
  }

  get length(): number {
    return this.frames.length;
  }

  /** First and last recorded tick (null when empty). */
  get start(): Tick | null {
    return this.frames[0]?.tick ?? null;
  }
  get end(): Tick | null {
    return this.frames[this.frames.length - 1]?.tick ?? null;
  }

  all(): readonly TapeFrame[] {
    return this.frames;
  }

  clear(): void {
    this.frames = [];
  }

  /**
   * Stitches a run in. Frames before `fromTick` stay (the past didn't change), except where the
   * tape had nothing yet (the run fills the gap); from `fromTick` on, the run's frames replace
   * everything, and the tape ends where the run ends.
   */
  splice(fromTick: Tick, run: readonly TapeFrame[]): void {
    if (run.length === 0) return;
    const oldEnd = this.end ?? -1;
    const keep = this.frames.filter((f) => f.tick < fromTick);
    const add = run.filter((f) => f.tick >= fromTick || f.tick > oldEnd);
    this.frames = [...keep, ...add].sort((a, b) => a.tick - b.tick);
    this.dedupe();
  }

  /**
   * Appends frames that continue the tape (a resolve pass streaming in): anything at or after
   * the first new frame is replaced.
   */
  append(run: readonly TapeFrame[]): void {
    if (run.length === 0) return;
    this.splice(run[0]!.tick, run);
  }

  /** Drops every frame after `tick`. */
  truncateAfter(tick: Tick): void {
    this.frames = this.frames.filter((f) => f.tick <= tick);
  }

  /** The frame at or before `tick` (index), or -1. */
  private indexAtOrBefore(tick: Tick): number {
    let lo = 0;
    let hi = this.frames.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.frames[mid]!.tick <= tick) {
        best = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return best;
  }

  frameAtOrBefore(tick: Tick): TapeFrame | null {
    const i = this.indexAtOrBefore(tick);
    return i >= 0 ? this.frames[i]! : null;
  }

  /** True if the tape covers `tick` (between its first and last frame). */
  covers(tick: Tick): boolean {
    const s = this.start;
    const e = this.end;
    return s !== null && e !== null && tick >= s && tick <= e;
  }

  /**
   * The world at `tick` (may be fractional), blended between the frames around it. Events are
   * those of every frame in (`sinceTick`, tick] (default: only a frame exactly at `tick`), so a
   * player stepping through the tape fires each event once. Null outside the tape.
   */
  viewAt(tick: number, sinceTick?: number): WorldView | null {
    if (!this.covers(Math.floor(tick)) && !this.covers(Math.ceil(tick))) return null;
    const i = this.indexAtOrBefore(Math.floor(tick));
    if (i < 0) return null;
    const a = this.frames[i]!;
    const b = this.frames[i + 1];
    const events: WorldView['events'] = [];
    const from = sinceTick ?? Math.floor(tick) - 1;
    for (let k = i; k >= 0 && this.frames[k]!.tick > from; k--) {
      events.unshift(...this.frames[k]!.view.events);
    }
    if (!b || tick <= a.tick) return { ...a.view, tick: Math.floor(tick), events };
    const t = (tick - a.tick) / (b.tick - a.tick);
    return { ...blendViews(a.view, b.view, t), tick: Math.floor(tick), events };
  }

  private dedupe(): void {
    const out: TapeFrame[] = [];
    for (const f of this.frames) {
      if (out.length && out[out.length - 1]!.tick === f.tick) out[out.length - 1] = f;
      else out.push(f);
    }
    this.frames = out;
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

/** Moving things lerp toward their next position (matched by id); everything else is `a`'s. */
export function blendViews(a: WorldView, b: WorldView, t: number): WorldView {
  if (t <= 0) return a;
  const byId = <T extends { id: string }>(xs: readonly T[] | undefined) =>
    new Map((xs ?? []).map((x) => [x.id, x]));
  const nextSoldier = byId(b.soldiers);
  const soldiers = a.soldiers.map((s): SoldierView => {
    const n = nextSoldier.get(s.id);
    if (!n || !s.alive) return s;
    return {
      ...s,
      x: lerp(s.x, n.x, t),
      y: lerp(s.y, n.y, t),
      facing: lerpAngle(s.facing, n.facing, t),
      ...(s.turret !== undefined && n.turret !== undefined
        ? { turret: lerpAngle(s.turret, n.turret, t) }
        : {}),
    };
  });
  // Soldiers who appear in `b` (spawned between the frames) show up halfway.
  if (t >= 0.5) {
    const had = new Set(a.soldiers.map((s) => s.id));
    for (const s of b.soldiers) if (!had.has(s.id)) soldiers.push(s);
  }
  const moving = <T extends { id: string; x: number; y: number }>(
    xs: readonly T[] | undefined,
    ys: readonly T[] | undefined,
  ): T[] | undefined => {
    if (!xs) return undefined;
    const next = byId(ys);
    return xs.map((x) => {
      const n = next.get(x.id);
      return n ? { ...x, x: lerp(x.x, n.x, t), y: lerp(x.y, n.y, t) } : x;
    });
  };
  const out: WorldView = { ...a, soldiers };
  const bullets = moving(a.bullets, b.bullets);
  if (bullets) out.bullets = bullets;
  const rockets = moving(a.rockets, b.rockets);
  if (rockets) out.rockets = rockets;
  const grenades = moving(a.grenades, b.grenades);
  if (grenades) out.grenades = grenades;
  out.vehicles = moving(a.vehicles, b.vehicles) ?? a.vehicles;
  out.turrets = a.turrets.map((tu) => {
    const n = b.turrets.find((x) => x.id === tu.id);
    return n ? { ...tu, aim: lerpAngle(tu.aim, n.aim, t) } : tu;
  });
  return out;
}
