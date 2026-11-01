import { compareIds } from '../core/ids';
import { distanceSq } from '../core/vec';
import { emit, type World } from '../state';
import type { LeverDef } from '../world/map';
import { toggleDrawbridge } from './bridge';
import { toggleGate } from './gate';
import { isEligible, type SoldierState } from './soldier';

/**
 * Levers hold no state of their own: a lever reads "on" when its target is open/lowered, so
 * several levers on one target always agree.
 */
export function isLeverOn(world: World, def: LeverDef): boolean {
  const gi = (world.map.gates ?? []).findIndex((g) => g.id === def.targetId);
  if (gi >= 0) return world.state.gates[gi]!.open;
  const bi = (world.map.bridges ?? []).findIndex((b) => b.id === def.targetId);
  if (bi >= 0) {
    const s = world.state.bridges[bi]!.state;
    return s === 'down' || s === 'lowering';
  }
  return false;
}

function activateLever(world: World, def: LeverDef): void {
  const gi = (world.map.gates ?? []).findIndex((g) => g.id === def.targetId);
  if (gi >= 0) return toggleGate(world, gi);
  const bi = (world.map.bridges ?? []).findIndex((b) => b.id === def.targetId);
  if (bi >= 0) return toggleDrawbridge(world, bi);
}

/**
 * The soldier uses the nearest interactable within reach (ties by id), or, if `targetId` is
 * given, exactly that one if it's in reach (how echoes replay recorded interacts). Returns the
 * id used, or null if nothing was in reach.
 */
export function interact(world: World, s: SoldierState, targetId?: string): string | null {
  if (!isEligible(s)) return null;
  const reach2 = world.tuning.interact.reach ** 2;
  let best: LeverDef | null = null;
  let bestD = Infinity;
  for (const def of world.map.levers ?? []) {
    if (targetId !== undefined && def.id !== targetId) continue;
    const d = distanceSq(s, def.position);
    if (d > reach2) continue;
    if (d < bestD || (d === bestD && best && compareIds(def.id, best.id) < 0)) {
      best = def;
      bestD = d;
    }
  }
  if (!best) return null;
  emit(world, { kind: 'interacted', tick: world.state.tick, by: s.id, targetId: best.id });
  activateLever(world, best);
  return best.id;
}
