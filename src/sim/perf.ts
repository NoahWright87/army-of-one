/**
 * PHASE05-b performance switches. Every switch selects between a straightforward reference
 * implementation and a faster one that must produce **bit-identical** results; they exist so
 * tests can run the same scenario both ways and compare world hashes tick for tick, and so the
 * bench can report before/after numbers from one build (`npm run bench -- --naive`).
 *
 * They never change gameplay, so they are not tuning and not player settings. All default on.
 */
export interface SimPerfFlags {
  /** moveCircle only tests the solids near the move (exact: far solids push by exactly 0). */
  collisionBroadphase: boolean;
  /** Soldier separation, mine triggers and vehicle contact use a spatial hash of soldiers. */
  soldierGrid: boolean;
  /** A* reuses its grid-sized buffers and a typed-array heap instead of allocating per call. */
  navBuffers: boolean;
  /** Turret targeting computes the dynamic blocker list once per turret step, not per ray. */
  turretBlockerCache: boolean;
  /** Id → soldier lookups (echo controller, observations) use a map instead of a linear scan. */
  soldierIndex: boolean;
}

export const SIM_PERF_ON: Readonly<SimPerfFlags> = Object.freeze({
  collisionBroadphase: true,
  soldierGrid: true,
  navBuffers: true,
  turretBlockerCache: true,
  soldierIndex: true,
});

export const SIM_PERF_OFF: Readonly<SimPerfFlags> = Object.freeze({
  collisionBroadphase: false,
  soldierGrid: false,
  navBuffers: false,
  turretBlockerCache: false,
  soldierIndex: false,
});

const current: SimPerfFlags = { ...SIM_PERF_ON };

/** The active switches (read on hot paths; don't hold on to the object across calls). */
export const simPerf: Readonly<SimPerfFlags> = current;

/** Changes switches; returns a function that restores the previous values. */
export function setSimPerf(flags: Partial<SimPerfFlags>): () => void {
  const before = { ...current };
  Object.assign(current, flags);
  return () => Object.assign(current, before);
}
