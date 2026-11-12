/**
 * (PHASE12-e) The saved-replays list on the title screen ([D79]): the last few finished runs per
 * mission, kept as packed links (`share.ts`) in localStorage. Missions in progress aren't stored
 * here: they're the missions' own saves, listed alongside.
 */
export const LIBRARY_KEY = 'aoo:replays:v1';
/** Finished runs kept per mission. */
export const KEEP_PER_MISSION = 3;
/** Safety cap on the whole list (localStorage is small). */
export const MAX_LIBRARY_CHARS = 1_500_000;

export interface LibraryEntry {
  id: string;
  missionId: string;
  /** Wall-clock ms when it was saved (display only). */
  savedAt: number;
  soldiers: number;
  battleTicks: number;
  packed: string;
}

/** Minimal storage (window.localStorage in the app, a map in tests). */
export interface TextStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readLibrary(storage: TextStorage | null): LibraryEntry[] {
  try {
    const raw = storage?.getItem(LIBRARY_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter(isEntry) : [];
  } catch {
    return [];
  }
}

/**
 * The list with `entry` added: newest first, at most `KEEP_PER_MISSION` per mission, and the
 * oldest dropped while the whole thing is over `MAX_LIBRARY_CHARS`.
 */
export function withEntry(list: readonly LibraryEntry[], entry: LibraryEntry): LibraryEntry[] {
  const all = [entry, ...list.filter((e) => e.id !== entry.id)].sort(
    (a, b) => b.savedAt - a.savedAt,
  );
  const per = new Map<string, number>();
  const kept = all.filter((e) => {
    const n = (per.get(e.missionId) ?? 0) + 1;
    per.set(e.missionId, n);
    return n <= KEEP_PER_MISSION;
  });
  while (kept.length > 1 && JSON.stringify(kept).length > MAX_LIBRARY_CHARS) kept.pop();
  return kept;
}

export function addToLibrary(storage: TextStorage | null, entry: LibraryEntry): void {
  try {
    storage?.setItem(LIBRARY_KEY, JSON.stringify(withEntry(readLibrary(storage), entry)));
  } catch {
    // Full or blocked storage: the replay just isn't kept.
  }
}

function isEntry(v: unknown): v is LibraryEntry {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.missionId === 'string' &&
    typeof e.savedAt === 'number' &&
    typeof e.soldiers === 'number' &&
    typeof e.battleTicks === 'number' &&
    typeof e.packed === 'string'
  );
}
