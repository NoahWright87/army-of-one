import type { KeyValueStore, StoreResult } from '../../persistence/storage';

/** localStorage adapter. Takes the Storage object explicitly so it can be faked in tests. */
export class LocalStorageStore implements KeyValueStore {
  constructor(private readonly storage: Storage) {}

  async get(key: string): Promise<string | undefined> {
    try {
      return this.storage.getItem(key) ?? undefined;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: string): Promise<StoreResult> {
    try {
      this.storage.setItem(key, value);
      return { ok: true };
    } catch (e) {
      const name = (e as { name?: string }).name ?? '';
      const quota = name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
      return { ok: false, error: quota ? 'quota' : 'unknown', message: String(e) };
    }
  }

  async remove(key: string): Promise<void> {
    try {
      this.storage.removeItem(key);
    } catch {
      // ignore: nothing useful to do
    }
  }

  async keys(prefix: string): Promise<string[]> {
    const out: string[] = [];
    try {
      for (let i = 0; i < this.storage.length; i++) {
        const k = this.storage.key(i);
        if (k?.startsWith(prefix)) out.push(k);
      }
    } catch {
      return [];
    }
    return out.sort();
  }
}
