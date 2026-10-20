/**
 * Schema migrations: `migrations[n]` upgrades raw stored meta from version n to n + 1.
 * Empty until the first schema change; keep every step so old saves keep loading.
 */
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

export const CURRENT_SCHEMA_VERSION = 1;

export const migrations: Record<number, Migration> = {};

export function migrate(
  raw: Record<string, unknown>,
  table: Record<number, Migration> = migrations,
  target = CURRENT_SCHEMA_VERSION,
): Record<string, unknown> {
  let current = raw;
  let version = typeof current.schemaVersion === 'number' ? current.schemaVersion : 0;
  while (version < target) {
    const step = table[version];
    if (!step) throw new Error(`No migration from schema version ${version}`);
    current = step(current);
    version += 1;
    current = { ...current, schemaVersion: version };
  }
  return current;
}
