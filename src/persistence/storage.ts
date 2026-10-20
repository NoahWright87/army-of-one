/**
 * Async key-value storage, implemented by browser adapters in src/app/storage/ (localStorage,
 * IndexedDB) and by MemoryStore for tests and headless tools. Failures are returned, never thrown,
 * so a full disk can't crash gameplay.
 */
export type StoreFailure = {
  ok: false;
  error: 'quota' | 'unavailable' | 'unknown';
  message: string;
};
export type StoreResult = { ok: true } | StoreFailure;

export interface KeyValueStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<StoreResult>;
  remove(key: string): Promise<void>;
  /** All keys starting with `prefix`, sorted. */
  keys(prefix: string): Promise<string[]>;
}

export class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.data.get(key);
  }

  async set(key: string, value: string): Promise<StoreResult> {
    this.data.set(key, value);
    return { ok: true };
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }

  async keys(prefix: string): Promise<string[]> {
    return [...this.data.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
}
