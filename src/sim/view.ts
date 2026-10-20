/**
 * The renderer contract: a read-only, plain-data view of the world for one tick.
 * Renderers (Phaser today, maybe 3D later) draw ONLY from this plus the static MapDef.
 *
 * PHASE01 implements soldiers. The other entity views are defined now so PHASE02-b can render
 * them while PHASE02-a implements them. Changes should be additive.
 */
import type { Tick } from './core/time';
import type { BridgeState, SimEvent } from './events';

export type SoldierRole = 'live' | 'echo' | 'static' | 'interrupted';

export interface SoldierView {
  kind: 'soldier';
  id: string;
  ordinal: number;
  x: number;
  y: number;
  facing: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  role: SoldierRole;
  /** In a lead-in ([D5]): unkillable, shown with a shield ring. */
  leadIn: boolean;
  /** (02-a) Dead soldiers only: what killed them ('turret', 'mine', 'vehicle', 'bridgeCollapse'). */
  deathCause?: string;
}

export type TurretState = 'idle' | 'tracking' | 'windup' | 'destroyed';
export interface TurretView {
  kind: 'turret';
  id: string;
  x: number;
  y: number;
  aim: number;
  state: TurretState;
  hp: number;
  maxHp: number;
  range: number;
  /** (02-a) While state is 'windup': 0 at wind-up start … 1 when it fires. */
  windup?: number;
  /** (02-a) The soldier it is tracking / winding up on, if any. */
  targetId?: string;
}

export type MineState = 'idle' | 'armed' | 'detonated';
export interface MineView {
  kind: 'mine';
  id: string;
  x: number;
  y: number;
  state: MineState;
  triggerRadius: number;
  blastRadius: number;
  /** (02-a) Body radius (what a shot must hit to set it off). */
  radius?: number;
}

export interface VehicleView {
  kind: 'vehicle';
  id: string;
  /** Center position. */
  x: number;
  y: number;
  w: number;
  h: number;
  heading: number;
  /** (02-a) 'stopped': halted in traffic behind a wreck; solid and harmless, can still be shot. */
  state: 'moving' | 'wreck' | 'stopped';
  hp: number;
  maxHp: number;
}

export interface GateView {
  kind: 'gate';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  open: boolean;
}

export interface LeverView {
  kind: 'lever';
  id: string;
  x: number;
  y: number;
  on: boolean;
  targetId: string;
}

export interface BridgeView {
  kind: 'bridge';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  state: BridgeState;
  /** 0 = fully down (walkable) … 1 = fully up (impassable). */
  raised: number;
  /** (02-a) Drawbridge (lever-operated) or destructible (shoot its charge). */
  bridgeKind?: 'draw' | 'destructible';
  /** (02-a) Direction of travel across the bridge. */
  axis?: 'x' | 'y';
  /** (02-a) Destructible bridges: the explosive charge to shoot (absent once blown). */
  charge?: { x: number; y: number; radius: number; hp: number; maxHp: number };
}

export interface ObjectiveView {
  kind: 'objective';
  id: string;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
}

export type EntityView =
  | SoldierView
  | TurretView
  | MineView
  | VehicleView
  | GateView
  | LeverView
  | BridgeView
  | ObjectiveView;

export interface WorldView {
  tick: Tick;
  soldiers: SoldierView[];
  turrets: TurretView[];
  mines: MineView[];
  vehicles: VehicleView[];
  gates: GateView[];
  levers: LeverView[];
  bridges: BridgeView[];
  objectives: ObjectiveView[];
  /** Events emitted during the most recent tick. */
  events: SimEvent[];
  missionComplete: { tick: Tick; by?: string } | null;
}
