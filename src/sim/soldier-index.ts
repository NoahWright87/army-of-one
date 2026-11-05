import type { SoldierId, SoldierState } from './entities/soldier';

/**
 * (05-b) Cached id → soldier map per soldiers array. Soldiers are only ever appended (spawns)
 * and mutated in place, and a restored snapshot brings a new array, so (array, length) is a
 * safe cache key.
 */
const soldierIndexCache = new WeakMap<
  readonly SoldierState[],
  { len: number; byId: Map<SoldierId, SoldierState> }
>();

export function soldierIndex(soldiers: readonly SoldierState[]): Map<SoldierId, SoldierState> {
  const hit = soldierIndexCache.get(soldiers);
  if (hit && hit.len === soldiers.length) return hit.byId;
  const byId = new Map<SoldierId, SoldierState>();
  for (const s of soldiers) byId.set(s.id, s);
  soldierIndexCache.set(soldiers, { len: soldiers.length, byId });
  return byId;
}
