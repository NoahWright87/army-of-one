import { emit, type World } from '../state';
import type { GateDef } from '../world/map';

export interface GateEntity {
  id: string;
  open: boolean;
}

export function createGates(defs: readonly GateDef[]): GateEntity[] {
  return defs.map((d) => ({ id: d.id, open: d.initiallyOpen }));
}

/** Opens a closed gate or closes an open one (instant). Soldiers caught inside get pushed out. */
export function toggleGate(world: World, index: number): void {
  const gate = world.state.gates[index]!;
  gate.open = !gate.open;
  emit(world, { kind: 'gateChanged', tick: world.state.tick, id: gate.id, open: gate.open });
}
