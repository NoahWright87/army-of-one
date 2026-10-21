import type { Tuning } from '../../content/tuning';
import { secondsToTicks } from '../core/time';
import type { BridgeState } from '../events';
import { emit, type World } from '../state';
import type { BridgeDef } from '../world/map';
import { isEligible } from './soldier';

export interface BridgeEntity {
  id: string;
  state: BridgeState;
  /** 0 = fully down … raiseTicks = fully up. Integer ticks, never float seconds. */
  progressTicks: number;
  /** Destructible bridges: the charge's HP (0 once blown). Drawbridges: 0. */
  chargeHp: number;
}

export function raiseTicks(tuning: Tuning): number {
  return Math.max(1, secondsToTicks(tuning.bridge.raiseSeconds));
}

export function createBridges(defs: readonly BridgeDef[], tuning: Tuning): BridgeEntity[] {
  return defs.map((d) => {
    const up = d.kind === 'draw' && d.initiallyUp === true;
    return {
      id: d.id,
      state: up ? 'up' : 'down',
      progressTicks: up ? raiseTicks(tuning) : 0,
      chargeHp: d.kind === 'destructible' ? tuning.bridge.chargeHp : 0,
    };
  });
}

/** Only a fully lowered bridge can be walked on. Raising, lowering, up and destroyed all block. */
export function isBridgeWalkable(b: BridgeEntity): boolean {
  return b.state === 'down';
}

/** 0 = down … 1 = up (destroyed reads as 1). */
export function bridgeRaised(b: BridgeEntity, tuning: Tuning): number {
  if (b.state === 'destroyed') return 1;
  return b.progressTicks / raiseTicks(tuning);
}

/** Lever action on a drawbridge: start raising if down/lowering, start lowering if up/raising. */
export function toggleDrawbridge(world: World, index: number): void {
  const def = world.map.bridges![index]!;
  const b = world.state.bridges[index]!;
  if (def.kind !== 'draw' || b.state === 'destroyed') return;
  const wasWalkable = isBridgeWalkable(b);
  b.state = b.state === 'down' || b.state === 'lowering' ? 'raising' : 'lowering';
  if (wasWalkable) pushSoldiersOffBridge(world, def);
  emit(world, { kind: 'bridgeChanged', tick: world.state.tick, id: b.id, state: b.state });
}

/** Advances raising/lowering drawbridges by one tick. */
export function stepBridges(world: World): void {
  const full = raiseTicks(world.tuning);
  for (const b of world.state.bridges) {
    if (b.state === 'raising') {
      b.progressTicks = Math.min(full, b.progressTicks + 1);
      if (b.progressTicks === full) {
        b.state = 'up';
        emit(world, { kind: 'bridgeChanged', tick: world.state.tick, id: b.id, state: b.state });
      }
    } else if (b.state === 'lowering') {
      b.progressTicks = Math.max(0, b.progressTicks - 1);
      if (b.progressTicks === 0) {
        b.state = 'down';
        emit(world, { kind: 'bridgeChanged', tick: world.state.tick, id: b.id, state: b.state });
      }
    }
  }
}

/** Soldiers standing on the bridge (center inside its rect), in id order. */
export function soldiersOnBridge(world: World, def: BridgeDef): number[] {
  const r = def.rect;
  const out: number[] = [];
  world.state.soldiers.forEach((s, i) => {
    if (!isEligible(s)) return;
    if (s.x >= r.x && s.x <= r.x + r.w && s.y >= r.y && s.y <= r.y + r.h) out.push(i);
  });
  return out;
}

/**
 * When a bridge stops being walkable, anyone on it is moved just past its nearer end (along the
 * bridge's axis), i.e. "pushed off to the nearest walkable side". Instant, for simplicity.
 */
export function pushSoldiersOffBridge(world: World, def: BridgeDef): void {
  const r = def.rect;
  const margin = world.tuning.soldier.wallRadius + 1;
  for (const i of soldiersOnBridge(world, def)) {
    const s = world.state.soldiers[i]!;
    if (def.axis === 'y') {
      s.y = s.y - r.y <= r.y + r.h - s.y ? r.y - margin : r.y + r.h + margin;
    } else {
      s.x = s.x - r.x <= r.x + r.w - s.x ? r.x - margin : r.x + r.w + margin;
    }
  }
}
