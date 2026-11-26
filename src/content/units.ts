/**
 * World units vs. real-world metres. The sim works in world units (a soldier's hit circle has
 * radius 11, walking is 190 units/s, a rifle reaches 520); this is only for talking and tuning in
 * metres. A soldier is about 0.5 m across and 22 units wide, so 1 m is about 44 units. It is a
 * convention, not a physical truth: ranges are game-scaled (a rifle "reaches" about 12 m).
 *
 * New tuning about distances (senses, hearing, noise) is written in metres with `meters()`, so it
 * is easy to reason about. Existing numbers stay in units.
 */
export const UNITS_PER_METER = 44; // TUNE: a convention, see above

/** Metres → world units. */
export function meters(m: number): number {
  return m * UNITS_PER_METER;
}

/** World units → metres (for readouts). */
export function toMeters(units: number): number {
  return units / UNITS_PER_METER;
}
