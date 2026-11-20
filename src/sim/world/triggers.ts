/**
 * (PHASE18) Mission rules (`MapDef.triggers`): when a point is captured, targets are shot down or
 * a squad is wiped out, a gate opens. Checked at the end of every tick; each fires once. A
 * replayed life that did the deed does it again, so the gate opens again at the same moment.
 */
import { emit, type World } from '../state';
import type { MapTrigger } from './map';
import { secondsToTicks } from '../core/time';

function met(world: World, t: MapTrigger): boolean {
  const st = world.state;
  const w = t.when;
  if ('captured' in w) {
    return st.capturePoints.find((c) => c.id === w.captured)?.stage === 'ours';
  }
  if ('destroyed' in w) {
    const defs = world.map.objectives ?? [];
    return w.destroyed.every((id) => {
      const i = defs.findIndex((d) => d.id === id);
      return i >= 0 && !!st.objectives[i]?.destroyed;
    });
  }
  const ids: readonly string[] = typeof w.squadDead === 'string' ? [w.squadDead] : w.squadDead;
  const squad = st.soldiers.filter((s) => s.team === 'enemy' && ids.includes(s.spawnPointId));
  return squad.length > 0 && squad.every((s) => !s.alive);
}

export function stepTriggers(world: World): void {
  const triggers = world.map.triggers;
  if (!triggers?.length) return;
  const st = world.state;
  for (const t of triggers) {
    if (st.triggered?.includes(t.id) || !met(world, t)) continue;
    if (t.delaySeconds) {
      const met = (st.triggerMet ??= {});
      const since = met[t.id] ?? (met[t.id] = st.tick);
      if (st.tick - since < secondsToTicks(t.delaySeconds)) continue;
    }
    st.triggered = [...(st.triggered ?? []), t.id].sort();
    const gate = st.gates.find((g) => g.id === t.openGate);
    if (gate && !gate.open) {
      gate.open = true;
      emit(world, { kind: 'gateChanged', tick: st.tick, id: gate.id, open: true });
    }
  }
}
