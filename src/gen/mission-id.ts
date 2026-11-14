/**
 * (PHASE13-b) Generated missions are addressed by id: `gen-<seed>` or `gen-<seed>-<budget>`.
 * The id is also the save slot, so the same seed continues the same run.
 */
export interface GenMissionId {
  seed: number;
  budget?: number;
}

const GEN_ID = /^gen-(\d{1,10})(?:-(\d{1,6}))?$/;

export function parseGenMissionId(id: string): GenMissionId | null {
  const m = GEN_ID.exec(id);
  if (!m) return null;
  const seed = Number(m[1]) >>> 0;
  return m[2] !== undefined ? { seed, budget: Number(m[2]) } : { seed };
}

export function genMissionId(seed: number, budget?: number): string {
  return budget === undefined ? `gen-${seed >>> 0}` : `gen-${seed >>> 0}-${budget}`;
}
