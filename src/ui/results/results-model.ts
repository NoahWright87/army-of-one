/**
 * (07-a) Results screen numbers ([D42]): stats from the mission state, the play-style radar
 * ([D18], provisional axes the owner may redefine), and personal bests. Pure and tested.
 */
import type {
  LaneTruth,
  MissionState,
  SoldierRecord,
  TimelineMarker,
} from '../../contracts/mission';
import { TICKS_PER_SECOND, type Tick } from '../../sim/core/time';

export interface ResultStats {
  battleTicks: Tick;
  soldiersUsed: number;
  attempts: number;
  deaths: number;
  rescues: number;
  captures: number;
  kills: number;
  shots: number;
  longestLifeTicks: Tick;
  /** The soldier with the most kills, captures and objective hits (ties: lower ordinal). */
  mvp: { soldierId: string; ordinal: number; score: number } | null;
}

const lifeTicks = (r: SoldierRecord): number =>
  r.segments[r.segments.length - 1]!.endTick - r.spawnTick;

export function resultStats(m: MissionState, rescues: number, battleTicks: Tick): ResultStats {
  const markers: TimelineMarker[] = m.lanes.flatMap((l: LaneTruth) => l.markers);
  const count = (k: TimelineMarker['kind']) => markers.filter((x) => x.kind === k).length;
  const score = new Map<string, number>();
  for (const x of markers) {
    if (x.kind === 'kill' || x.kind === 'hazardDestroyed' || x.kind === 'capture') {
      score.set(x.soldierId, (score.get(x.soldierId) ?? 0) + 1);
    } else if (x.kind === 'objective') {
      score.set(x.soldierId, (score.get(x.soldierId) ?? 0) + 2);
    }
  }
  let mvp: ResultStats['mvp'] = null;
  for (const r of m.soldiers) {
    const s = score.get(r.id) ?? 0;
    if (s > 0 && (!mvp || s > mvp.score || (s === mvp.score && r.ordinal < mvp.ordinal))) {
      mvp = { soldierId: r.id, ordinal: r.ordinal, score: s };
    }
  }
  return {
    battleTicks,
    soldiersUsed: m.soldiers.length,
    attempts: m.attemptCount,
    deaths: m.lanes.filter((l) => l.end.kind === 'death').length,
    rescues,
    captures: (m.captureTruth ?? []).filter((c) => c.stage === 'ours').length,
    kills: count('kill') + count('hazardDestroyed'),
    shots: m.soldiers.reduce(
      (n, r) =>
        n + r.segments.reduce((k, s) => k + s.actions.filter((a) => a.kind === 'shot').length, 0),
      0,
    ),
    longestLifeTicks: m.soldiers.reduce((n, r) => Math.max(n, lifeTicks(r)), 0),
    mvp,
  };
}

/** One radar axis, normalized 0..1. */
export interface RadarAxis {
  key: 'speed' | 'economy' | 'teamwork' | 'aggression' | 'survival' | 'tactics';
  value: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Provisional play-style axes ([D18], [Q23]): each 0..1, higher = more of that style.
 * - Speed: 1 at ≤ 60 s battle time, 0 at ≥ 6 min.
 * - Economy: 1 with one soldier, 0 at 40+.
 * - Teamwork: rescues per soldier (1 at ≥ 0.5).
 * - Aggression: kills per life (1 at ≥ 2).
 * - Survival: average life (1 at ≥ 60 s).
 * - Tactics: captures + interact markers per life (1 at ≥ 1).
 */
export function radarAxes(s: ResultStats, m: MissionState): RadarAxis[] {
  const lives = Math.max(1, s.soldiersUsed);
  const secs = s.battleTicks / TICKS_PER_SECOND;
  const avgLife = m.soldiers.reduce((n, r) => n + lifeTicks(r), 0) / lives / TICKS_PER_SECOND;
  const interacts = m.lanes.flatMap((l) => l.markers).filter((x) => x.kind === 'interact').length;
  return [
    { key: 'speed', value: clamp01(1 - (secs - 60) / 300) },
    { key: 'economy', value: clamp01(1 - (s.soldiersUsed - 1) / 39) },
    { key: 'teamwork', value: clamp01(s.rescues / lives / 0.5) },
    { key: 'aggression', value: clamp01(s.kills / lives / 2) },
    { key: 'survival', value: clamp01(avgLife / 60) },
    { key: 'tactics', value: clamp01((s.captures + interacts) / lives) },
  ];
}

/** Personal bests for one mission. */
export interface Bests {
  fastestTicks?: Tick;
  fewestSoldiers?: number;
  mostRescues?: number;
}

/** Folds a result into the bests; `improved` lists what's new. */
export function updateBests(
  prev: Bests,
  s: ResultStats,
): { bests: Bests; improved: (keyof Bests)[] } {
  const bests: Bests = { ...prev };
  const improved: (keyof Bests)[] = [];
  if (prev.fastestTicks === undefined || s.battleTicks < prev.fastestTicks) {
    bests.fastestTicks = s.battleTicks;
    improved.push('fastestTicks');
  }
  if (prev.fewestSoldiers === undefined || s.soldiersUsed < prev.fewestSoldiers) {
    bests.fewestSoldiers = s.soldiersUsed;
    improved.push('fewestSoldiers');
  }
  if (prev.mostRescues === undefined || s.rescues > prev.mostRescues) {
    bests.mostRescues = s.rescues;
    improved.push('mostRescues');
  }
  return { bests, improved };
}

export function parseBests(raw: string | null): Bests {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const out: Bests = {};
    if (typeof v.fastestTicks === 'number') out.fastestTicks = v.fastestTicks;
    if (typeof v.fewestSoldiers === 'number') out.fewestSoldiers = v.fewestSoldiers;
    if (typeof v.mostRescues === 'number') out.mostRescues = v.mostRescues;
    return out;
  } catch {
    return {};
  }
}

/** Scrub-bar marks: deaths, captures, kills and the objective, by tick. */
export interface ScrubMark {
  tick: Tick;
  kind: 'death' | 'capture' | 'kill' | 'objective';
}

export function scrubMarks(m: MissionState): ScrubMark[] {
  const out: ScrubMark[] = [];
  for (const l of m.lanes) {
    if (l.end.kind === 'death') out.push({ tick: l.end.tick, kind: 'death' });
    for (const x of l.markers) {
      if (x.kind === 'capture') out.push({ tick: x.tick, kind: 'capture' });
      else if (x.kind === 'kill' || x.kind === 'hazardDestroyed')
        out.push({ tick: x.tick, kind: 'kill' });
    }
  }
  if (m.completed) out.push({ tick: m.completed.tick, kind: 'objective' });
  return out.sort((a, b) => a.tick - b.tick);
}
