import type {
  RecordingSegment,
  SoldierId,
  SoldierRecord,
  SpawnPointId,
} from '../../contracts/mission';
import type { Tick } from '../core/time';
import { compareIds } from '../core/ids';

/** Last recorded tick of a soldier (its O tick, if it ends alive). */
export function recordedTo(rec: SoldierRecord): Tick {
  return rec.segments[rec.segments.length - 1]!.endTick;
}

/**
 * Folds a finished live segment into the record list (returns a new, id-sorted list):
 * a new soldier gets a new record; a resumed soldier gets the segment appended (it must be
 * contiguous with its previous one).
 */
export function addSegment(
  records: readonly SoldierRecord[],
  live: { soldierId: SoldierId; spawnPointId?: SpawnPointId; ordinal?: number },
  segment: RecordingSegment,
): SoldierRecord[] {
  const existing = records.find((r) => r.id === live.soldierId);
  let next: SoldierRecord;
  if (existing) {
    const end = recordedTo(existing);
    if (segment.startTick !== end + 1) {
      throw new Error(
        `${live.soldierId}: segment starts at ${segment.startTick}, expected ${end + 1}`,
      );
    }
    next = { ...existing, segments: [...existing.segments, segment] };
  } else {
    if (!live.spawnPointId) throw new Error(`${live.soldierId}: new soldier needs a spawn point`);
    next = {
      id: live.soldierId,
      ordinal: live.ordinal ?? ordinalOf(live.soldierId, records.length + 1),
      spawnPointId: live.spawnPointId,
      spawnTick: segment.startTick,
      segments: [segment],
    };
  }
  return [...records.filter((r) => r.id !== live.soldierId), next].sort((a, b) =>
    compareIds(a.id, b.id),
  );
}

/** "S7" → 7 (or the fallback for ids without a number). */
export function ordinalOf(id: SoldierId, fallback: number): number {
  const m = /(\d+)$/.exec(id);
  return m ? Number(m[1]) : fallback;
}

/** Next free soldier id ("S<n+1>") given the existing records. */
export function nextSoldierId(records: readonly SoldierRecord[]): SoldierId {
  let max = 0;
  for (const r of records) max = Math.max(max, ordinalOf(r.id, 0));
  return `S${max + 1}`;
}
