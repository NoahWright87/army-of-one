import type {
  InProgressLife,
  LaneTruth,
  MissionId,
  MissionState,
  SoldierRecord,
} from '../contracts/mission';
import { decodeSegment, encodeSegment } from './codec/segment-codec';
import { migrate } from './migrations';
import { isLanes, isMeta, isStoredSoldier, type MetaV1, type StoredSoldierV1 } from './schema';
import type { KeyValueStore, StoreResult } from './storage';

/**
 * Mission save layout (namespaced + versioned):
 *   aoo:v1:<missionId>:meta          attempt count, completion, soldier ids
 *   aoo:v1:<missionId>:lanes         LaneTruth[]
 *   aoo:v1:<missionId>:soldier:<id>  one SoldierRecord (segments encoded), written only on change
 *   aoo:v1:<missionId>:inprogress    the current life's partial segment
 *   …:meta:backup / …:lanes:backup   last known-good copies
 */
export const missionKeys = (missionId: MissionId) => {
  const base = `aoo:v1:${missionId}:`;
  return {
    prefix: base,
    meta: `${base}meta`,
    metaBackup: `${base}meta:backup`,
    lanes: `${base}lanes`,
    lanesBackup: `${base}lanes:backup`,
    soldier: (id: string) => `${base}soldier:${id}`,
    inProgress: `${base}inprogress`,
  };
};

export type LoadResult =
  { ok: true; state: MissionState } | { ok: false; error: 'notFound' | 'corrupt'; message: string };

/**
 * Incremental saver: remembers what it last wrote per key and only writes keys whose content
 * changed. Soldier encoding is cached by (segment count, last end tick), since recordings only grow.
 */
export class MissionSaver {
  private written = new Map<string, string>();
  private encodedSoldiers = new Map<string, { version: string; json: string }>();
  readonly keys: ReturnType<typeof missionKeys>;

  constructor(
    private readonly store: KeyValueStore,
    readonly missionId: MissionId,
  ) {
    this.keys = missionKeys(missionId);
  }

  async save(state: MissionState): Promise<StoreResult> {
    const meta: MetaV1 = {
      schemaVersion: 1,
      missionId: state.missionId,
      attemptCount: state.attemptCount,
      soldierIds: state.soldiers.map((s) => s.id),
      ...(state.completed ? { completed: state.completed } : {}),
    };
    // Soldiers first, so meta never references a soldier that wasn't written.
    for (const s of state.soldiers) {
      const r = await this.write(this.keys.soldier(s.id), this.encodeSoldier(s));
      if (!r.ok) return r;
    }
    const lanes = await this.write(
      this.keys.lanes,
      JSON.stringify(state.lanes),
      this.keys.lanesBackup,
    );
    if (!lanes.ok) return lanes;
    const metaResult = await this.write(this.keys.meta, JSON.stringify(meta), this.keys.metaBackup);
    if (!metaResult.ok) return metaResult;
    if (state.inProgress) return this.saveInProgress(state.inProgress);
    await this.clearInProgress();
    return { ok: true };
  }

  async saveInProgress(life: InProgressLife): Promise<StoreResult> {
    const { segmentSoFar, ...rest } = life;
    return this.write(
      this.keys.inProgress,
      JSON.stringify({ ...rest, segmentSoFar: encodeSegment(segmentSoFar) }),
    );
  }

  async clearInProgress(): Promise<void> {
    await this.store.remove(this.keys.inProgress);
    this.written.delete(this.keys.inProgress);
  }

  /** Forget write caches (e.g. after an external clear). */
  reset(): void {
    this.written.clear();
    this.encodedSoldiers.clear();
  }

  private encodeSoldier(s: SoldierRecord): string {
    const last = s.segments[s.segments.length - 1];
    const version = `${s.segments.length}:${last?.endTick ?? -1}:${last?.waypoints.length ?? 0}`;
    const cached = this.encodedSoldiers.get(s.id);
    if (cached?.version === version) return cached.json;
    const stored: StoredSoldierV1 = {
      id: s.id,
      ordinal: s.ordinal,
      spawnPointId: s.spawnPointId,
      spawnTick: s.spawnTick,
      segments: s.segments.map(encodeSegment),
    };
    const json = JSON.stringify(stored);
    this.encodedSoldiers.set(s.id, { version, json });
    return json;
  }

  private async write(key: string, value: string, backupKey?: string): Promise<StoreResult> {
    if (this.written.get(key) === value) return { ok: true };
    if (backupKey) {
      // Keep the previous good copy so a corrupt/partial write can be recovered from.
      const previous = this.written.get(key) ?? (await this.store.get(key));
      if (previous !== undefined) {
        const b = await this.store.set(backupKey, previous);
        if (!b.ok) return b;
      }
    }
    const r = await this.store.set(key, value);
    if (r.ok) this.written.set(key, value);
    return r;
  }
}

function parseJson(raw: string | undefined): unknown {
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

async function loadValidated<T>(
  store: KeyValueStore,
  key: string,
  backupKey: string,
  guard: (v: unknown) => v is T,
  prepare: (v: unknown) => unknown = (v) => v,
): Promise<T | undefined> {
  for (const k of [key, backupKey]) {
    try {
      const v = prepare(parseJson(await store.get(k)));
      if (guard(v)) return v;
    } catch {
      // fall through to the backup
    }
  }
  return undefined;
}

export async function loadMission(store: KeyValueStore, missionId: MissionId): Promise<LoadResult> {
  const keys = missionKeys(missionId);
  if (
    (await store.get(keys.meta)) === undefined &&
    (await store.get(keys.metaBackup)) === undefined
  ) {
    return { ok: false, error: 'notFound', message: `No save for ${missionId}` };
  }
  const prepareMeta = (v: unknown) =>
    typeof v === 'object' && v !== null ? migrate(v as Record<string, unknown>) : v;
  const meta = await loadValidated(store, keys.meta, keys.metaBackup, isMeta, prepareMeta);
  if (!meta) return { ok: false, error: 'corrupt', message: 'Mission metadata is unreadable' };
  const lanes = await loadValidated<LaneTruth[]>(store, keys.lanes, keys.lanesBackup, isLanes);
  if (!lanes) return { ok: false, error: 'corrupt', message: 'Timeline data is unreadable' };

  const soldiers: SoldierRecord[] = [];
  for (const id of meta.soldierIds) {
    const raw = parseJson(await store.get(keys.soldier(id)));
    if (!isStoredSoldier(raw)) {
      return { ok: false, error: 'corrupt', message: `Recording for ${id} is unreadable` };
    }
    try {
      soldiers.push({ ...raw, segments: raw.segments.map(decodeSegment) });
    } catch (e) {
      return {
        ok: false,
        error: 'corrupt',
        message: `Recording for ${id}: ${(e as Error).message}`,
      };
    }
  }

  const state: MissionState = {
    schemaVersion: 1,
    missionId: meta.missionId,
    attemptCount: meta.attemptCount,
    soldiers,
    lanes,
    ...(meta.completed ? { completed: meta.completed } : {}),
  };
  const inProgress = await loadInProgress(store, missionId);
  if (inProgress) state.inProgress = inProgress;
  return { ok: true, state };
}

async function loadInProgress(
  store: KeyValueStore,
  missionId: MissionId,
): Promise<InProgressLife | undefined> {
  const raw = parseJson(await store.get(missionKeys(missionId).inProgress));
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.soldierId !== 'string' ||
    (r.mode !== 'new' && r.mode !== 'resume') ||
    typeof r.attempt !== 'number' ||
    typeof r.attemptFromTick !== 'number' ||
    typeof r.segmentSoFar !== 'string'
  ) {
    return undefined; // a lost in-progress life is acceptable; never block loading the mission
  }
  try {
    return {
      soldierId: r.soldierId,
      mode: r.mode,
      attempt: r.attempt,
      attemptFromTick: r.attemptFromTick,
      segmentSoFar: decodeSegment(r.segmentSoFar),
      ...(typeof r.spawnPointId === 'string' ? { spawnPointId: r.spawnPointId } : {}),
    };
  } catch {
    return undefined;
  }
}

export async function clearMission(store: KeyValueStore, missionId: MissionId): Promise<void> {
  for (const k of await store.keys(missionKeys(missionId).prefix)) await store.remove(k);
}
