import type { LaneTruth, SoldierRecord, SpawnOption } from '../contracts/mission';
import { compareIds } from '../sim/core/ids';
import type { Tick } from '../sim/core/time';
import type { MapDef } from '../sim/world/map';

export interface SpawnRules {
  /** Gap between successive new soldiers at the same spawn point ([D7]). */
  spawnIntervalTicks: Tick;
  /** Lead-in before control ([D5], [D25]). */
  leadInTicks: Tick;
}

/**
 * Every respawn choice currently available. New soldiers: one option per open spawn point, at
 * that point's next free entry slot ([D7]). Resumes: every lane ending in O ([D4]). Interrupted
 * ([D24]) and unresolved lanes are not offered.
 */
export function deriveSpawnOptions(
  map: MapDef,
  soldiers: readonly SoldierRecord[],
  lanes: readonly LaneTruth[],
  rules: SpawnRules,
): SpawnOption[] {
  const used = new Map<string, number>();
  for (const s of soldiers) used.set(s.spawnPointId, (used.get(s.spawnPointId) ?? 0) + 1);

  const options: SpawnOption[] = [];
  for (const p of map.spawnPoints) {
    if (p.kind !== 'initial') continue; // capture points join in PHASE05-a
    const openTick = 0;
    options.push({
      kind: 'new',
      spawnPointId: p.id,
      entryTick: openTick + (used.get(p.id) ?? 0) * rules.spawnIntervalTicks,
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
