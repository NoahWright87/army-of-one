/**
 * Hand-rolled shape guards for persisted data. They check structure (not every semantic
 * invariant) so garbage in storage turns into a clean load error instead of a crash later.
 */
import type { LaneTruth, SoldierRecord } from '../contracts/mission';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

export interface MetaV1 {
  schemaVersion: 1;
  missionId: string;
  attemptCount: number;
  soldierIds: string[];
  completed?: { attempt: number; tick: number; bySoldierId: string };
}

export function isMeta(v: unknown): v is MetaV1 {
  if (!isObj(v)) return false;
  if (v.schemaVersion !== 1 || !isStr(v.missionId) || !isNum(v.attemptCount)) return false;
  if (!Array.isArray(v.soldierIds) || !v.soldierIds.every(isStr)) return false;
  if (v.completed !== undefined) {
    const c = v.completed;
    if (!isObj(c) || !isNum(c.attempt) || !isNum(c.tick) || !isStr(c.bySoldierId)) return false;
  }
  return true;
}

/** Soldier header as stored (segments are encoded separately). */
export interface StoredSoldierV1 {
  id: string;
  ordinal: number;
  spawnPointId: string;
  spawnTick: number;
  segments: string[];
}

export function isStoredSoldier(v: unknown): v is StoredSoldierV1 {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isNum(v.ordinal) &&
    isStr(v.spawnPointId) &&
    isNum(v.spawnTick) &&
    Array.isArray(v.segments) &&
    v.segments.every(isStr)
  );
}

const SPAN_KINDS = new Set(['alive', 'lost', 'frozen', 'unresolved']);
const END_KINDS = new Set([
  'death',
  'open',
  'interrupted',
  'neverSpawned',
  'unresolved',
  'complete',
]);

function isLane(v: unknown): v is LaneTruth {
  if (!isObj(v) || !isStr(v.soldierId) || !isNum(v.recordedFrom) || !isNum(v.recordedTo)) {
    return false;
  }
  if (!Array.isArray(v.spans) || !Array.isArray(v.markers) || !isObj(v.end)) return false;
  if (!END_KINDS.has(v.end.kind as string)) return false;
  return v.spans.every(
    (s) =>
      isObj(s) &&
      isNum(s.from) &&
      isNum(s.to) &&
      SPAN_KINDS.has(s.kind as string) &&
      isNum(s.observedInAttempt),
  );
}

export function isLanes(v: unknown): v is LaneTruth[] {
  return Array.isArray(v) && v.every(isLane);
}

export function soldierMatchesRecord(s: SoldierRecord): boolean {
  return s.segments.length > 0 && s.segments[0]!.startTick === s.spawnTick;
}
