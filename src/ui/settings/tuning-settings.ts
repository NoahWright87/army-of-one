/**
 * Exposes sim tuning (`src/content/tuning.ts`) through the generic settings registry. Walks the
 * Tuning object, so new sections added by later phases show up automatically. Values only take
 * effect when a world is created (the sim receives tuning at `createWorld`), so the panel offers
 * a "restart battle" action.
 */
import { withTuning, type DeepPartial, type Tuning } from '../../content/tuning';
import type { SettingDef, SettingsStore } from './registry';

export const TUNING_PREFIX = 'tuning.';
export const TUNING_GROUP = 'settings.group.tuning';

/** One setting per numeric/boolean leaf: id "tuning.soldier.speed", label "soldier.speed". */
export function tuningSettingDefs(defaults: Tuning): SettingDef[] {
  const out: SettingDef[] = [];
  const walk = (obj: unknown, path: string[]) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const p = [...path, k];
      const id = TUNING_PREFIX + p.join('.');
      const label = p.join('.');
      if (typeof v === 'number') {
        out.push({ id, label, group: TUNING_GROUP, type: 'number', default: v, ...numberRange(v) });
      } else if (typeof v === 'boolean') {
        out.push({ id, label, group: TUNING_GROUP, type: 'boolean', default: v });
      } else {
        walk(v, p);
      }
    }
  };
  walk(defaults, []);
  return out;
}

/** Heuristic slider range around a default: 0 … 4× (or ±4× for negatives). */
export function numberRange(v: number): { min: number; max: number; step: number } {
  const isInt = Number.isInteger(v);
  const mag = Math.abs(v) || 1;
  const max = v < 0 ? 0 : isInt ? Math.max(10, Math.ceil(mag * 4)) : mag * 4;
  const min = v < 0 ? -mag * 4 : 0;
  const step = isInt ? 1 : Math.pow(10, Math.floor(Math.log10(mag)) - 2);
  return { min, max, step };
}

/** Builds the overrides (only non-default values) from the store, for `withTuning`. */
export function tuningOverrides(store: SettingsStore, defaults: Tuning): DeepPartial<Tuning> {
  const out: Record<string, unknown> = {};
  for (const def of tuningSettingDefs(defaults)) {
    if (!store.has(def.id) || store.isDefault(def.id)) continue;
    const path = def.id.slice(TUNING_PREFIX.length).split('.');
    let node = out;
    for (const seg of path.slice(0, -1)) {
      node[seg] ??= {};
      node = node[seg] as Record<string, unknown>;
    }
    node[path[path.length - 1]!] = store.get(def.id);
  }
  return out as DeepPartial<Tuning>;
}

/** The tuning a new world should be created with, given the panel's current values. */
export function effectiveTuning(store: SettingsStore, defaults: Tuning): Tuning {
  return withTuning(defaults, tuningOverrides(store, defaults));
}
