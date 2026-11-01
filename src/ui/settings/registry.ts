/**
 * Generic settings registry + store. Pure logic (no DOM): storage is injected, so this is
 * unit-testable with a fake. Any module can register definitions: display options, debug
 * switches, and sim tuning values (see tuning-settings.ts).
 *
 * Persistence: only values that differ from their default are saved, as one JSON blob. Unknown
 * or invalid stored values are ignored/clamped, and every storage access is wrapped in try/catch
 * (private windows, blocked storage, quota errors).
 */

export type SettingValue = boolean | number | string;

interface SettingBase {
  /** Stable id, e.g. "display.echoOpacity" or "tuning.soldier.speed". */
  id: string;
  /** Group heading id (a strings.ts key or literal); panel groups by this. */
  group: string;
  /** Human label (already resolved text). */
  label: string;
}

export interface BooleanSetting extends SettingBase {
  type: 'boolean';
  default: boolean;
}

export interface NumberSetting extends SettingBase {
  type: 'number';
  default: number;
  min: number;
  max: number;
  step: number;
}

export interface ChoiceSetting extends SettingBase {
  type: 'choice';
  default: string;
  options: readonly { value: string; label: string }[];
}

export type SettingDef = BooleanSetting | NumberSetting | ChoiceSetting;

/** Minimal Storage subset (localStorage-compatible). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Coerces any raw value into a valid value for `def`, or returns the default. */
export function sanitize(def: SettingDef, raw: unknown): SettingValue {
  switch (def.type) {
    case 'boolean':
      return typeof raw === 'boolean' ? raw : def.default;
    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return def.default;
      return Math.min(def.max, Math.max(def.min, raw));
    }
    case 'choice':
      return typeof raw === 'string' && def.options.some((o) => o.value === raw)
        ? raw
        : def.default;
  }
}

/** Parses the stored JSON blob; anything malformed yields `{}`. */
export function parseStored(json: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    const v: unknown = JSON.parse(json);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export type SettingsListener = (id: string, value: SettingValue) => void;

export class SettingsStore {
  private readonly defs = new Map<string, SettingDef>();
  private readonly values = new Map<string, SettingValue>();
  private readonly listeners = new Set<SettingsListener>();
  /** Raw persisted blob; keeps values for settings not registered (yet) so they aren't lost. */
  private stored: Record<string, unknown>;

  constructor(
    private readonly storage: KeyValueStorage | null,
    private readonly storageKey: string,
  ) {
    let raw: string | null;
    try {
      raw = storage?.getItem(storageKey) ?? null;
    } catch {
      raw = null;
    }
    this.stored = parseStored(raw);
  }

  /** Registers definitions (idempotent per id; re-registering replaces the definition). */
  register(defs: readonly SettingDef[]): void {
    for (const def of defs) {
      this.defs.set(def.id, def);
      const v = sanitize(def, this.stored[def.id]);
      this.values.set(def.id, v);
    }
  }

  has(id: string): boolean {
    return this.defs.has(id);
  }

  definitions(): SettingDef[] {
    return [...this.defs.values()];
  }

  get(id: string): SettingValue {
    const v = this.values.get(id);
    if (v === undefined) throw new Error(`Unknown setting ${id}`);
    return v;
  }

  getBool(id: string): boolean {
    const v = this.get(id);
    if (typeof v !== 'boolean') throw new Error(`Setting ${id} is not boolean`);
    return v;
  }

  getNumber(id: string): number {
    const v = this.get(id);
    if (typeof v !== 'number') throw new Error(`Setting ${id} is not a number`);
    return v;
  }

  getString(id: string): string {
    const v = this.get(id);
    if (typeof v !== 'string') throw new Error(`Setting ${id} is not a string`);
    return v;
  }

  isDefault(id: string): boolean {
    const def = this.defs.get(id);
    return def !== undefined && this.values.get(id) === def.default;
  }

  set(id: string, value: unknown): void {
    const def = this.defs.get(id);
    if (!def) throw new Error(`Unknown setting ${id}`);
    const v = sanitize(def, value);
    if (this.values.get(id) === v) return;
    this.values.set(id, v);
    if (v === def.default) delete this.stored[id];
    else this.stored[id] = v;
    this.persist();
    for (const l of this.listeners) l(id, v);
  }

  toggle(id: string): void {
    this.set(id, !this.getBool(id));
  }

  /** Resets one setting, or every registered setting matching `filter`. */
  reset(id?: string, filter: (def: SettingDef) => boolean = () => true): void {
    const targets = id ? [id] : [...this.defs.values()].filter(filter).map((d) => d.id);
    for (const t of targets) {
      const def = this.defs.get(t);
      if (def) this.set(t, def.default);
    }
  }

  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private persist(): void {
    try {
      if (Object.keys(this.stored).length === 0) this.storage?.removeItem(this.storageKey);
      else this.storage?.setItem(this.storageKey, JSON.stringify(this.stored));
    } catch {
      // Storage unavailable or full: settings still work for this session.
    }
  }
}

/** In-memory storage for tests and for when the browser blocks localStorage. */
export class MemoryStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}
