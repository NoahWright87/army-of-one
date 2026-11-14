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

/**
 * (PHASE13-c) One level of a world map: `world-<seed>-<level>` or
 * `world-<seed>-<level>-<budget>` (the world viewer's playtest).
 */
export interface WorldMissionId {
  seed: number;
  level: number;
  budget?: number;
}

const WORLD_ID = /^world-(\d{1,10})-(\d{1,3})(?:-(\d{1,6}))?$/;

export function parseWorldMissionId(id: string): WorldMissionId | null {
  const m = WORLD_ID.exec(id);
  if (!m) return null;
  const out: WorldMissionId = { seed: Number(m[1]) >>> 0, level: Number(m[2]) };
  if (m[3] !== undefined) out.budget = Number(m[3]);
  return out;
}

export function worldMissionId(seed: number, level: number, budget?: number): string {
  const base = `world-${seed >>> 0}-${level}`;
  return budget === undefined ? base : `${base}-${budget}`;
}
