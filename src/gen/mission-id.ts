import type { WeatherKind } from '../sim/world/map';

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
 * (PHASE13-c/d) One level of a world map: `world-<seed>-<level>[-<budget>][-h<a>.<b>…][-r<q>][-fog]`.
 * `h` lists the neighbouring levels you hold ([D108]: their crossings are spawns, not
 * objectives; without it, the neighbours met earlier); `r` turns the map `q` quarter turns to
 * fit the screen for a playtest or an older campaign save. Fog is recorded in the id so
 * existing saves keep their weather.
 */
export interface WorldMissionId {
  seed: number;
  level: number;
  budget?: number;
  held?: number[];
  turns?: number;
  weather?: WeatherKind;
}

const WORLD_ID =
  /^world-(\d{1,10})-(\d{1,3})(?:-(\d{1,6}))?(?:-h([\d.]*))?(?:-r([0-3]))?(?:-(fog))?$/;

export function parseWorldMissionId(id: string): WorldMissionId | null {
  const m = WORLD_ID.exec(id);
  if (!m) return null;
  const out: WorldMissionId = { seed: Number(m[1]) >>> 0, level: Number(m[2]) };
  if (m[3] !== undefined) out.budget = Number(m[3]);
  if (m[4] !== undefined) out.held = m[4] ? m[4].split('.').map(Number) : [];
  if (m[5] !== undefined) out.turns = Number(m[5]);
  if (m[6] === 'fog') out.weather = m[6];
  return out;
}

export function worldMissionId(
  seed: number,
  level: number,
  budget?: number,
  extra: { held?: readonly number[]; turns?: number; weather?: WeatherKind } = {},
): string {
  let id = `world-${seed >>> 0}-${level}`;
  if (budget !== undefined) id += `-${budget}`;
  if (extra.held) id += `-h${[...extra.held].sort((p, q) => p - q).join('.')}`;
  if (extra.turns) id += `-r${extra.turns}`;
  if (extra.weather) id += `-${extra.weather}`;
  return id;
}
