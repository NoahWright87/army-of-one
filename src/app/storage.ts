import { MemoryStorage, type KeyValueStorage } from '../ui/settings/registry';

/**
 * Browser localStorage adapter. Falls back to in-memory storage when localStorage is missing
 * or throws (private mode, blocked site data, sandboxed previews).
 */
export function browserStorage(): KeyValueStorage {
  try {
    const s = window.localStorage;
    const probe = '__aoo_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return new MemoryStorage();
  }
}
