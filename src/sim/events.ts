import type { ShotWeapon } from '../contracts/mission';
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
      /** (PHASE12-a) The soldier weapon that fired it (recorded with the shot when it matters). */
      weapon?: ShotWeapon;
    }
  | {
      kind: 'damaged';
      tick: Tick;
      target: string;
      amount: number;
      by?: string;
      /** (PHASE12-b) Armor stopped most of the hit (a ricochet, [D70]). */
      armored?: true;
    }
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
  /** (07-c) A grenade left a soldier's hand ([D37]). Recorders turn this into a `throw` action. */
  | {
      kind: 'grenadeThrown';
      tick: Tick;
      id: string;
      by: SoldierId;
      fromX: number;
      fromY: number;
      angle: number;
      distance: number;
    }
  | { kind: 'grenadeBounced'; tick: Tick; id: string; x: number; y: number }
  /** (PHASE12-a) A Bazooka launched a rocket ([D62]). Recorders turn this into a `shot` action. */
  | {
      kind: 'rocketLaunched';
      tick: Tick;
      id: string;
      by: string;
      fromX: number;
      fromY: number;
      angle: number;
      /** (PHASE12-b) A tank shell rather than a rocket. */
      shell?: true;
    }
  /** (PHASE12-b) A cover piece was destroyed ([Q40]). */
  | { kind: 'coverDestroyed'; tick: Tick; id: string; x: number; y: number; by?: string }
  /** (PHASE12-a) A rocket's blast. */
  | {
      kind: 'rocketExploded';
      tick: Tick;
      id: string;
      by: string;
      x: number;
      y: number;
      radius: number;
    }
  /** (07-c) Blast + fragments; `fragments` are the rays' end points, for the renderer. */
  | {
      kind: 'grenadeExploded';
      tick: Tick;
      id: string;
      by: string;
      x: number;
      y: number;
      radius: number;
      fragments: { angle: number; hitX: number; hitY: number }[];
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
      /** (07-d) Enemy soldiers took it back a stage ([D45]). */
      lost?: true;
    }
  /**
   * (03-a) Debug: an echo skipped a recorded action because it was more than
   * `tuning.echo.actionTolerance` from the recorded origin (or an interact target was out of reach).
   */
  | {
      kind: 'echoDivergence';
      tick: Tick;
      id: SoldierId;
      action: 'shot' | 'interact' | 'throw';
      distance: number;
    };

export type BridgeState = 'down' | 'raising' | 'up' | 'lowering' | 'destroyed';
