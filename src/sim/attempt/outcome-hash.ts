import { hashState } from '../core/hash';
import type { SoldierId } from '../entities/soldier';
import type { WorldState } from '../state';

/**
 * Hash of what *happened* in a world state: everything except how soldiers are driven (live vs.
 * echo flags, presentation role, the input edge latch) and the id counters. Two runs where a
 * soldier is live in one and an echo in the other hash the same if it did exactly the same
 * things. `exclude` drops soldiers (and events about them) entirely, e.g. an idle far-away live
 * soldier in an exact-replay test.
 */
export function outcomeHash(st: WorldState, exclude: readonly SoldierId[] = []): string {
  const skip = new Set(exclude);
  const aboutSkipped = (e: object) =>
    Object.values(e).some((v) => typeof v === 'string' && skip.has(v));
  return hashState({
    tick: st.tick,
    soldiers: st.soldiers
      .filter((s) => !skip.has(s.id))
      .map((s) => ({
        id: s.id,
        ordinal: s.ordinal,
        x: s.x,
        y: s.y,
        facing: s.facing,
        hp: s.hp,
        alive: s.alive,
        nextFireTick: s.nextFireTick,
        deathTick: s.deathTick,
        deathCause: s.deathCause,
      })),
    turrets: st.turrets,
    mines: st.mines,
    vehicles: st.vehicles,
    gates: st.gates,
    bridges: st.bridges,
    objectives: st.objectives,
    capturePoints: st.capturePoints.map((c) => ({
      ...c,
      contributors: c.contributors.filter((id) => !skip.has(id)),
    })),
    events: st.events.filter((e) => !aboutSkipped(e)),
    missionComplete: st.missionComplete,
  });
}
