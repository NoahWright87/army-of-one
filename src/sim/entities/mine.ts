import { secondsToTicks } from '../core/time';
import { distanceSq } from '../core/vec';
import { detonateMine } from '../combat/damage';
import type { World } from '../state';
import type { MineDef } from '../world/map';
import { isEligible } from './soldier';

export type MineMode = 'idle' | 'armed' | 'detonated';

export interface MineEntity {
  id: string;
  state: MineMode;
  /** Ticks until detonation while armed. */
  fuseTicks: number;
}

export function createMines(defs: readonly MineDef[]): MineEntity[] {
  return defs.map((d) => ({ id: d.id, state: 'idle', fuseTicks: 0 }));
}

/** Arms the fuse (or shortens it, if already armed with a longer one). */
export function armMine(m: MineEntity, fuseTicks: number): void {
  if (m.state === 'detonated') return;
  const fuse = Math.max(1, fuseTicks);
  if (m.state === 'armed') {
    m.fuseTicks = Math.min(m.fuseTicks, fuse);
  } else {
    m.state = 'armed';
    m.fuseTicks = fuse;
  }
}

/** Proximity trigger → short fuse → blast. Mines are processed in map order. */
export function stepMines(world: World): void {
  const mt = world.tuning.mine;
  const defs = world.map.mines ?? [];
  const trigger2 = mt.triggerRadius * mt.triggerRadius;
  world.state.mines.forEach((m, i) => {
    if (m.state === 'detonated') return;
    if (m.state === 'armed') {
      m.fuseTicks -= 1;
      if (m.fuseTicks <= 0) detonateMine(world, i, m.id);
      return;
    }
    const pos = defs[i]!.position;
    if (world.state.soldiers.some((s) => isEligible(s) && distanceSq(s, pos) <= trigger2)) {
      armMine(m, secondsToTicks(mt.fuseSeconds));
    }
  });
}
