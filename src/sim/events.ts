import type { Tick } from './core/time';
import type { SoldierId } from './entities/soldier';
import type { CaptureStage } from './world/map';

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
  | {
      kind: 'mineDetonated';
      tick: Tick;
      id: string;
      x: number;
      y: number;
      radius: number;
      /** (03-a) Who set it off: a shooter's id, another mine's id, or its own id (proximity). */
      by?: string;
    }
  | { kind: 'turretWindup'; tick: Tick; id: string; targetId: string }
  | { kind: 'interacted'; tick: Tick; by: SoldierId; targetId: string }
  | { kind: 'gateChanged'; tick: Tick; id: string; open: boolean }
  | { kind: 'bridgeChanged'; tick: Tick; id: string; state: BridgeState }
  | { kind: 'objectiveDestroyed'; tick: Tick; id: string; by?: string }
  /**
   * (05-a) A capture point's contributor count changed (someone stepped in or out, or died):
   * capture started, sped up, slowed or stopped. Not emitted every tick; the view has progress.
   */
  | {
      kind: 'captureProgress';
      tick: Tick;
      id: string;
      stage: CaptureStage;
      /** 0..1 within the stage. */
      progress: number;
      contributors: number;
    }
  /** (05-a) A capture point reached a new stage ([D11]); `contributors` did it (id-sorted). */
  | {
      kind: 'captureStageChanged';
      tick: Tick;
      id: string;
      stage: CaptureStage;
      contributors: SoldierId[];
    }
  /**
   * (03-a) Debug: an echo skipped a recorded action because it was more than
   * `tuning.echo.actionTolerance` from the recorded origin (or an interact target was out of reach).
   */
  | {
      kind: 'echoDivergence';
      tick: Tick;
      id: SoldierId;
      action: 'shot' | 'interact';
      distance: number;
    };

export type BridgeState = 'down' | 'raising' | 'up' | 'lowering' | 'destroyed';
