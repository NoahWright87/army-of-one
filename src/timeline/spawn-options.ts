import type { Tuning } from '../content/tuning';
import type { CaptureTruth, LaneTruth, SoldierRecord, SpawnOption } from '../contracts/mission';
import { oursTicks } from './captures';
import { compareIds } from '../sim/core/ids';
import { secondsToTicks, type Tick } from '../sim/core/time';
import type { MapDef } from '../sim/world/map';

export interface SpawnRules {
  /** Gap between successive new soldiers at the same spawn point ([D7]). */
  spawnIntervalTicks: Tick;
  /** Lead-in before control ([D5], [D25]). */
  leadInTicks: Tick;
}

/** The spawn rules a mission is played with, from `tuning.spawn` (PHASE04). */
export function spawnRules(tuning: Pick<Tuning, 'spawn'>): SpawnRules {
  return {
    spawnIntervalTicks: secondsToTicks(tuning.spawn.intervalSeconds),
    leadInTicks: secondsToTicks(tuning.spawn.leadInSeconds),
  };
}

/**
 * Tick a spawn point opens in the current truth: 0 for initial points ([D8]), the capture tick
 * for capture points held as ours in `captures` (05-a), null if it isn't open.
 */
export function spawnPointOpenTick(
  map: MapDef,
  spawnPointId: string,
  captures: readonly CaptureTruth[] = [],
): Tick | null {
  const p = map.spawnPoints.find((sp) => sp.id === spawnPointId);
  if (!p) return null;
  if (p.kind === 'initial') return 0;
  return p.capturePointId !== undefined
    ? (oursTicks(captures).get(p.capturePointId) ?? null)
    : null;
}

/**
 * Next entry slot at a spawn point ([D7]): the Nth soldier there enters at openTick + (N-1) ×
 * interval. Only soldiers who entered at or after the current open tick count (a capture that
 * moved later leaves earlier soldiers there never spawning), and a slot is never closer than one
 * interval after the latest of them, so entries never collide.
 */
export function nextEntryTick(
  openTick: Tick,
  spawnPointId: string,
  soldiers: readonly SoldierRecord[],
  rules: SpawnRules,
): Tick {
  let n = 0;
  let last = -Infinity;
  for (const s of soldiers) {
    if (s.spawnPointId !== spawnPointId || s.spawnTick < openTick) continue;
    n++;
    last = Math.max(last, s.spawnTick);
  }
  return Math.max(openTick + n * rules.spawnIntervalTicks, last + rules.spawnIntervalTicks);
}

/**
 * Every respawn choice currently available. New soldiers: one option per open spawn point, at
 * that point's next free entry slot ([D7]); capture points that are ours in the capture truth
 * open at their capture tick ([D8], 05-a). Resumes: every lane ending in O ([D4]). Interrupted
 * ([D24]) and unresolved lanes are not offered.
 */
export function deriveSpawnOptions(
  map: MapDef,
  soldiers: readonly SoldierRecord[],
  lanes: readonly LaneTruth[],
  rules: SpawnRules,
  captures: readonly CaptureTruth[] = [],
): SpawnOption[] {
  const options: SpawnOption[] = [];
  for (const p of map.spawnPoints) {
    const openTick = spawnPointOpenTick(map, p.id, captures);
    if (openTick === null) continue;
    options.push({
      kind: 'new',
      spawnPointId: p.id,
      entryTick: nextEntryTick(openTick, p.id, soldiers, rules),
    });
  }

  const resumable = lanes
    .filter((l) => l.end.kind === 'open')
    .sort((a, b) => compareIds(a.soldierId, b.soldierId));
  for (const l of resumable) {
    if (l.end.kind !== 'open') continue;
    options.push({
      kind: 'resume',
      soldierId: l.soldierId,
      resumeTick: l.end.tick,
      leadInFromTick: Math.max(l.recordedFrom, l.end.tick - rules.leadInTicks),
    });
  }
  return options;
}

/** Tick at which a deployment's lead-in countdown starts (may be negative: a pre-battle hold, [D25]). */
export function leadInStart(option: SpawnOption, rules: SpawnRules): Tick {
  const controlTick = option.kind === 'resume' ? option.resumeTick : option.entryTick;
  return controlTick - rules.leadInTicks;
}
