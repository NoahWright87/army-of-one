import type { Tick } from './core/time';
import type { SoldierId } from './entities/soldier';

/**
 * Everything notable that happened during a tick, in order. Renderers turn these into effects
 * and sounds; later phases turn them into timeline markers. PHASE02-a emits most of these.
 */
export type SimEvent =
  | { kind: 'soldierSpawned'; tick: Tick; id: SoldierId }
  | {
      kind: 'shotFired';
      tick: Tick;
      by: string;
      fromX: number;
      fromY: number;
      angle: number;
      hitX: number;
      hitY: number;
      hitId?: string;
    }
  | { kind: 'damaged'; tick: Tick; target: string; amount: number; by?: string }
  | { kind: 'soldierDied'; tick: Tick; id: SoldierId; cause: string; by?: string }
  | { kind: 'hazardDestroyed'; tick: Tick; id: string; by?: string }
  | { kind: 'mineDetonated'; tick: Tick; id: string; x: number; y: number; radius: number }
  | { kind: 'turretWindup'; tick: Tick; id: string; targetId: string }
  | { kind: 'interacted'; tick: Tick; by: SoldierId; targetId: string }
  | { kind: 'gateChanged'; tick: Tick; id: string; open: boolean }
  | { kind: 'bridgeChanged'; tick: Tick; id: string; state: BridgeState }
  | { kind: 'objectiveDestroyed'; tick: Tick; id: string; by?: string };

export type BridgeState = 'down' | 'raising' | 'up' | 'lowering' | 'destroyed';
