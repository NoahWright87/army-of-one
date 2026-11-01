import type { KeyValueStore, StoreResult } from '../../persistence/storage';

const STORE = 'kv';

/**
 * IndexedDB adapter (one object store of string values). Preferred over localStorage because a
 * large army's recordings can exceed localStorage's ~5 MB quota ([E9]).
 */
export class IndexedDbStore implements KeyValueStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(factory: IDBFactory, name = 'army-of-one'): Promise<IndexedDbStore> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new IndexedDbStore(db);
  }

  private request<T>(
    mode: IDBTransactionMode,
    run: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const tx = this.db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? req.error);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  }

  async get(key: string): Promise<string | undefined> {
    try {
      const v = await this.request('readonly', (s) => s.get(key));
      return typeof v === 'string' ? v : undefined;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: string): Promise<StoreResult> {
    try {
      await this.request('readwrite', (s) => s.put(value, key));
      return { ok: true };
    } catch (e) {
      const quota = (e as { name?: string }).name === 'QuotaExceededError';
      return { ok: false, error: quota ? 'quota' : 'unknown', message: String(e) };
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.request('readwrite', (s) => s.delete(key));
    } catch {
      // ignore
    }
  }

  async keys(prefix: string): Promise<string[]> {
    try {
      const all = await this.request('readonly', (s) => s.getAllKeys());
      return all
        .map(String)
        .filter((k) => k.startsWith(prefix))
        .sort();
    } catch {
      return [];
    }
  }
}

/** Best available store: IndexedDB, else localStorage, else in-memory (progress won't survive). */
export async function openBestStore(): Promise<KeyValueStore> {
  try {
    if (typeof indexedDB !== 'undefined') return await IndexedDbStore.open(indexedDB);
  } catch {
    // fall through
  }
  const { LocalStorageStore } = await import('./local-storage-store');
  try {
    if (typeof localStorage !== 'undefined') return new LocalStorageStore(localStorage);
  } catch {
    // fall through
  }
  const { MemoryStore } = await import('../../persistence/storage');
  return new MemoryStore();
}
