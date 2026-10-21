import type { Vec2 } from '../core/vec';

/** Axis-aligned rectangle; (x, y) is the top-left corner. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SpawnPointId = string;

export interface SpawnPointDef {
  id: SpawnPointId;
  /** Key into src/content/strings.ts for the display name. */
  nameKey: string;
  position: Vec2;
  /** Initial facing in radians. */
  facing: number;
  /**
   * 'initial' points open at tick 0 ([D8]). (05-a) 'capture' points belong to a capture point
   * (`capturePointId`) and are open only while that point is ours ([D8], [D26]).
   */
  kind: 'initial' | 'capture';
  /** (05-a) kind 'capture' only: the capture point that opens this spawn point. */
  capturePointId?: string;
}

/** (05-a) Capture stages ([D11]): lower the enemy flag → neutral; raise ours → ours. */
export type CaptureStage = 'enemy' | 'neutral' | 'ours';

/**
 * (05-a) A Battlefield 2-style capture point ([D10]–[D12]). Stats come from `tuning.capture`.
 * A spawn point of kind 'capture' with `capturePointId` = this id makes it a forward spawn.
 */
export interface CapturePointDef {
  id: string;
  /** Key into src/content/strings.ts for the display name. */
  nameKey: string;
  position: Vec2;
  /** Overrides `tuning.capture.radius`. */
  radius?: number;
  /** Default 'enemy'. */
  initialStage?: 'enemy' | 'neutral';
  /**
   * Flag objective ([D17]): this point reaching 'ours' is a mission objective. The mission
   * completes once every objective (destroy targets and flag points) is done.
   */
  objective?: boolean;
}

/** A fixed gun emplacement ([D15]). Stats come from `tuning.turret`. */
export interface TurretDef {
  id: string;
  position: Vec2;
  /** Initial aim, radians. */
  facing: number;
}

/** A proximity mine ([D15]). Stats come from `tuning.mine`. */
export interface MineDef {
  id: string;
  position: Vec2;
}

/**
 * A frogger-style traffic lane ([D15]). Vehicles spawn at `from` on a fixed schedule from tick 0,
 * drive to `to` at constant speed, and are removed past `to`. Lanes must be axis-aligned
 * (from/to share x or y). Put the ends off-map or inside walls so vehicles appear/vanish unseen.
 */
export interface TrafficLaneDef {
  id: string;
  from: Vec2;
  to: Vec2;
  /** Overrides `tuning.vehicle.speed`. */
  speed?: number;
  /** Overrides `tuning.vehicle.intervalSeconds`. */
  intervalSeconds?: number;
  /** First spawn time; later spawns follow every interval. Default 0. */
  offsetSeconds?: number;
}

/** A gate ([D16]): blocks movement and shots while closed. Toggled by a lever. */
export interface GateDef {
  id: string;
  rect: Rect;
  initiallyOpen: boolean;
}

/**
 * A bridge over water/chasm ([D16]). The author leaves a gap in `water` exactly where `rect` is;
 * the bridge rect itself is walkable only while the bridge is down.
 * - 'draw': raised/lowered by a lever; takes `tuning.bridge.raiseSeconds`.
 * - 'destructible': starts down; shooting its `charge` blows it up for good.
 */
export interface BridgeDef {
  id: string;
  rect: Rect;
  /** Direction of travel across the bridge; soldiers are pushed off toward its nearer end. */
  axis: 'x' | 'y';
  kind: 'draw' | 'destructible';
  /** Drawbridges only. Default false (down). */
  initiallyUp?: boolean;
  /** Destructible bridges only: where the explosive charge sits. */
  charge?: Vec2;
}

/** Interactable switch. Toggles a gate, or raises/lowers a drawbridge. */
export interface LeverDef {
  id: string;
  position: Vec2;
  targetId: string;
}

/** Destructible mission target ([D17]). */
export interface ObjectiveDef {
  id: string;
  position: Vec2;
  /** Overrides `tuning.objective.radius`. */
  radius?: number;
  /** Overrides `tuning.objective.maxHp`. */
  maxHp?: number;
}

export interface MapDef {
  id: string;
  nameKey: string;
  width: number;
  height: number;
  /** Solid walls: block movement and shots. */
  walls: Rect[];
  /** Impassable for movement, transparent to shots. */
  water: Rect[];
  spawnPoints: SpawnPointDef[];
  // Entities (PHASE02-a). Optional so small test maps can leave them out.
  turrets?: TurretDef[];
  mines?: MineDef[];
  trafficLanes?: TrafficLaneDef[];
  gates?: GateDef[];
  bridges?: BridgeDef[];
  levers?: LeverDef[];
  objectives?: ObjectiveDef[];
  /** (05-a) Capture points ([D10]–[D12]); flag objectives ([D17]). */
  capturePoints?: CapturePointDef[];
}

/** Throws on authoring mistakes: duplicate entity ids, bad lever targets, bad lanes/bridges. */
export function validateMap(map: MapDef): void {
  const ids = new Set<string>();
  const all = [
    ...(map.turrets ?? []),
    ...(map.mines ?? []),
    ...(map.trafficLanes ?? []),
    ...(map.gates ?? []),
    ...(map.bridges ?? []),
    ...(map.levers ?? []),
    ...(map.objectives ?? []),
    ...(map.capturePoints ?? []),
  ];
  for (const e of all) {
    if (ids.has(e.id)) throw new Error(`${map.id}: duplicate entity id ${e.id}`);
    // Soldier ("S…") and vehicle ("V…") ids are allocated at runtime.
    if (/^[SV]\d+$/.test(e.id)) throw new Error(`${map.id}: entity id ${e.id} is reserved`);
    ids.add(e.id);
  }
  for (const l of map.trafficLanes ?? []) {
    if (l.from.x !== l.to.x && l.from.y !== l.to.y) {
      throw new Error(`${map.id}: traffic lane ${l.id} must be axis-aligned`);
    }
  }
  for (const b of map.bridges ?? []) {
    if (b.kind === 'destructible' && !b.charge) {
      throw new Error(`${map.id}: destructible bridge ${b.id} needs a charge`);
    }
  }
  for (const sp of map.spawnPoints) {
    if (sp.kind !== 'capture') continue;
    if (!(map.capturePoints ?? []).some((c) => c.id === sp.capturePointId)) {
      throw new Error(`${map.id}: capture spawn ${sp.id} needs a known capturePointId`);
    }
  }
  for (const lever of map.levers ?? []) {
    const gate = (map.gates ?? []).some((g) => g.id === lever.targetId);
    const bridge = (map.bridges ?? []).some((b) => b.id === lever.targetId && b.kind === 'draw');
    if (!gate && !bridge) {
      throw new Error(`${map.id}: lever ${lever.id} targets unknown gate/drawbridge`);
    }
  }
}

export function rectContains(r: Rect, p: Vec2): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** Helper for map authoring: walls around the map edge, `t` units thick. */
export function borderWalls(width: number, height: number, t = 20): Rect[] {
  return [
    { x: 0, y: 0, w: width, h: t },
    { x: 0, y: height - t, w: width, h: t },
    { x: 0, y: 0, w: t, h: height },
    { x: width - t, y: 0, w: t, h: height },
  ];
}

/** Square rect centered on `p` with half-size `r`. */
export function squareAround(p: Vec2, r: number): Rect {
  return { x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 };
}
