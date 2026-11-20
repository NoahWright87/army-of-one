import type { Vec2 } from '../core/vec';
import type { RoleId } from '../../contracts/mission';
import type { Tuning } from '../../content/tuning';

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
  /**
   * (PHASE13-d) Where a new soldier runs in from during the lead-in countdown, ending here
   * ([D112]): for show only, the sim never reads it. May start off the map.
   */
  approach?: Vec2[];
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
  initialStage?: CaptureStage; // (PHASE17) 'ours': an entry you hold ([D139])
  /**
   * Flag objective ([D17]): this point reaching 'ours' is a mission objective. The mission
   * completes once every objective (destroy targets and flag points) is done.
   */
  objective?: boolean;
  /**
   * (PHASE16) Objective flags with the same group count together: the mission needs
   * `map.objectiveGroups[group]` of them, not all ([D129]). Absent = this flag is needed.
   */
  group?: string;
  /**
   * (PHASE11) Extra income per second of battle time while this point is ours ([D51]).
   * Default `tuning.economy.captureIncomePerSecond`.
   */
  income?: number;
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

/**
 * (07-c) A piece of partial cover ([D32]): blocks movement like a wall, but only stops a share of
 * shots. `material` picks the numbers from `tuning.cover.materials`; `bullet` / `lobbed` override
 * them (0..1: the share of straight shots / lobbed objects it stops). Solid walls stay in `walls`.
 */
export interface CoverDef {
  id: string;
  rect: Rect;
  material: CoverMaterial;
  bullet?: number;
  lobbed?: number;
}

export type CoverMaterial = 'fence' | 'sandbags' | 'halfWall' | 'window' | 'bunkerWindow' | 'crate';

export interface ConcealmentArea {
  id: string;
  kind: 'bush' | 'trench';
  rect: Rect;
}

/**
 * (07-d) A squad of enemy soldiers ([D44]): same roles and stats as ours, AI-driven. No
 * respawns. `order` is what it does when it isn't fighting; it chases within each member's
 * role leash of its post, falls back to `fallback` when beaten, and retakes `capturePointId`.
 */
export interface SquadDef {
  id: string;
  members: { role?: RoleId; position: Vec2; facing?: number }[];
  order: { kind: 'guard' } | { kind: 'patrol'; route: Vec2[] };
  /** Retreat / regroup point (default: where the squad starts). */
  fallback?: Vec2;
  /** Hold (and retake) this capture point. */
  capturePointId?: string;
  /** (PHASE17) The arena ([D142]): a squad on our side (default: the enemy's). */
  team?: 'player';
  /** (PHASE17) AI skill on top of `tuning.ai` (the arena's HUMAN / CPU presets). */
  skill?: Partial<Tuning['ai']>;
  /**
   * (PHASE13) Rally points ([Q54]): idle members wander between them (each role by its
   * `roam` temperament), retreat to the best of them, and chase within their leash of any.
   */
  rally?: Vec2[];
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
  /**
   * (PHASE13-d) The edge of the map inside its rectangle ([D109]): ground too far from this
   * level to matter. Blocks movement like water, shots cross it; drawn dark.
   */
  bounds?: Rect[];
  /**
   * (PHASE13-d) Neighbouring levels' ground near this one ([D113]): walkable, drawn with a light
   * haze. Purely visual.
   */
  haze?: Rect[];
  /** (07-c) Partial cover ([D32]): blocks movement, stops a share of shots. */
  cover?: CoverDef[];
  /** Walkable cover. Infantry can stand inside these areas. */
  concealment?: ConcealmentArea[];
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
  /** (07-d) Enemy soldiers ([D44]). */
  squads?: SquadDef[];
  /**
   * (PHASE13-a) Painted ground ([D87]), purely visual: rows of ground letters
   * (`src/content/ground.ts`), each cell `cellSize` units square, from the map's top-left.
   * Water cells are drawn by `water`, which is what blocks movement.
   */
  ground?: { cellSize: number; rows: string[] };
  /** (PHASE11) Starting money and base income ([D51]); defaults in `tuning.economy`. */
  economy?: {
    startMoney?: number;
    baseIncomePerSecond?: number;
    /**
     * (PHASE14) Campaign reserves ([D117]): free spawns per role. The first ones of a role to
     * spawn (by tick) cost nothing.
     */
    reserves?: Partial<Record<RoleId, number>>;
  };
  /** (PHASE17) The mission is also won by killing every enemy soldier ([D139]). */
  winByKillAll?: boolean;
  /** (PHASE16) How many objective flags of each group are needed ([D129]); absent = all. */
  objectiveGroups?: Record<string, number>;
  /**
   * (PHASE17) The dev arena's fight seed ([D142]): salts the AI's and guns' random rolls so
   * repeated fights differ. Absent everywhere else.
   */
  aiSeed?: number;
  /** (PHASE14) Roles open in this mission ([D120]); absent = all. Never read by the sim. */
  roles?: readonly RoleId[];
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
    ...(map.cover ?? []),
    ...(map.concealment ?? []),
    ...(map.squads ?? []),
  ];
  for (const e of all) {
    if (ids.has(e.id)) throw new Error(`${map.id}: duplicate entity id ${e.id}`);
    // Soldier ("S…"), enemy ("E…"), vehicle ("V…"), grenade ("G…") and rocket ("R…") ids are
    // runtime ids.
    if (/^[SEVGR]\d+$/.test(e.id)) throw new Error(`${map.id}: entity id ${e.id} is reserved`);
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
