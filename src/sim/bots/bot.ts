/**
 * Bot lives (PHASE05-b): headless "players" that generate realistic recordings through the
 * normal live-input path. A bot only ever produces a `SoldierInput` per tick from what it can
 * read in the world, exactly like the keyboard does; the attempt runner records the outcome.
 *
 * Bots are tooling, not sim: they may use the seeded PRNG (`core/rng.ts`). Everything is still
 * deterministic given the seed, so a stress army is reproducible.
 *
 * Kinds:
 * - `route`: walks nav paths between a few random reachable map points (some die to the turret,
 *   the traffic or mines on the way: that's the point).
 * - `hunter`: heads for the turret and shoots any hazard (turret, mine) its rifle can hit.
 * - `idler`: wanders a little from the spawn and stands around, turning now and then.
 * - `crowd`: walks to a rally point shared by every crowd bot of its spawn point and mills
 *   around it, to stress [D14] separation.
 */
import type { Tuning } from '../../content/tuning';
import { castRay } from '../combat/shots';
import { createRng, nextFloat, nextInt, type RngState } from '../core/rng';
import { secondsToTicks, type Tick } from '../core/time';
import { distance, type Vec2 } from '../core/vec';
import { IDLE_INPUT, type SoldierInput, type SoldierState } from '../entities/soldier';
import { laneInfo, vehicleRect } from '../entities/traffic';
import { createWorld, type World } from '../sim';
import { circleOverlapsRect } from '../world/collision';
import type { MapDef, SpawnPointId } from '../world/map';
import { cellCenter, findPath, isCellOpen, syncNav, type NavGrid } from '../world/nav';

export type BotKind = 'route' | 'hunter' | 'idler' | 'crowd';
export const BOT_KINDS: readonly BotKind[] = ['route', 'hunter', 'idler', 'crowd'];

/** Relative weights of each kind in an army. */
export type BotMix = Record<BotKind, number>;
export const DEFAULT_BOT_MIX: BotMix = { route: 40, hunter: 15, idler: 15, crowd: 30 };

export interface BotPlan {
  kind: BotKind;
  seed: number;
  spawnPointId: SpawnPointId;
  /** Places to walk to, in order. */
  goals: Vec2[];
  /** Ticks to stand at each goal (parallel to `goals`). */
  dwell: Tick[];
  /** The life ends (alive, an O) after this many ticks under control. */
  maxTicks: Tick;
  /** Shoots hazards it can hit within this range (0 = never shoots). */
  engageRange: number;
  /** After the last goal: mill around it within this radius until `maxTicks` (0 = stand). */
  millRadius: number;
}

export interface BotPlanParams {
  map: MapDef;
  tuning: Tuning;
  kind: BotKind;
  seed: number;
  spawnPointId: SpawnPointId;
  /** Life length range in seconds (default 30–100). */
  lifeSeconds?: [number, number];
}

// ---------- reachability (cached per map + tuning + spawn point) ----------

interface Reach {
  nav: NavGrid;
  /** Open cells reachable from the spawn point at tick 0, ascending. */
  cells: Int32Array;
}

const reachCache = new WeakMap<MapDef, WeakMap<Tuning, Map<SpawnPointId, Reach>>>();

function reachable(map: MapDef, tuning: Tuning, spawnPointId: SpawnPointId): Reach {
  let byTuning = reachCache.get(map);
  if (!byTuning) reachCache.set(map, (byTuning = new WeakMap()));
  let bySpawn = byTuning.get(tuning);
  if (!bySpawn) byTuning.set(tuning, (bySpawn = new Map()));
  const hit = bySpawn.get(spawnPointId);
  if (hit) return hit;

  const world = createWorld(map, tuning);
  const nav = syncNav(world);
  const sp = map.spawnPoints.find((p) => p.id === spawnPointId);
  if (!sp) throw new Error(`Unknown spawn point ${spawnPointId}`);
  const start =
    Math.floor(sp.position.y / nav.cellSize) * nav.cols + Math.floor(sp.position.x / nav.cellSize);
  const seen = new Uint8Array(nav.cols * nav.rows);
  const queue: number[] = [start];
  seen[start] = 1;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    const c = i % nav.cols;
    const next = [c > 0 ? i - 1 : -1, c < nav.cols - 1 ? i + 1 : -1, i - nav.cols, i + nav.cols];
    for (const n of next) {
      if (n < 0 || n >= seen.length || seen[n] || !isCellOpen(nav, n)) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  const cells = Int32Array.from(queue).sort();
  const out = { nav, cells };
  bySpawn.set(spawnPointId, out);
  return out;
}

function randomReachable(reach: Reach, rng: RngState, near?: Vec2, radius = Infinity): Vec2 {
  // Rejection-sample "near" points; fall back to anywhere reachable.
  for (let k = 0; k < 64; k++) {
    const i = reach.cells[nextInt(rng, 0, reach.cells.length - 1)]!;
    const p = cellCenter(reach.nav, i % reach.nav.cols, Math.floor(i / reach.nav.cols));
    if (!near || distance(p, near) <= radius) return p;
  }
  const i = reach.cells[nextInt(rng, 0, reach.cells.length - 1)]!;
  return cellCenter(reach.nav, i % reach.nav.cols, Math.floor(i / reach.nav.cols));
}

/** The shared rally point of crowd bots from one spawn point (same for every army seed). */
export function rallyPoint(map: MapDef, tuning: Tuning, spawnPointId: SpawnPointId): Vec2 {
  const reach = reachable(map, tuning, spawnPointId);
  const sp = map.spawnPoints.find((p) => p.id === spawnPointId)!.position;
  const rng = createRng(0x5eed + spawnPointId.length * 7919);
  let best: Vec2 | null = null;
  for (let k = 0; k < 200 && !best; k++) {
    const p = randomReachable(reach, rng);
    const d = distance(p, sp);
    if (d >= 350 && d <= 900) best = p;
  }
  return best ?? randomReachable(reach, rng, sp, 600);
}

/** Deterministic plan for one bot life. */
export function planBot(p: BotPlanParams): BotPlan {
  const { map, tuning, kind, seed, spawnPointId } = p;
  const rng = createRng(seed);
  const reach = reachable(map, tuning, spawnPointId);
  const sp = map.spawnPoints.find((s) => s.id === spawnPointId)!.position;
  const [lo, hi] = p.lifeSeconds ?? [30, 100];
  const maxTicks = secondsToTicks(lo + nextFloat(rng) * (hi - lo));
  const plan: BotPlan = {
    kind,
    seed,
    spawnPointId,
    goals: [],
    dwell: [],
    maxTicks,
    engageRange: 0,
    millRadius: 0,
  };
  switch (kind) {
    case 'route': {
      const n = nextInt(rng, 2, 4);
      let from = sp;
      for (let k = 0; k < n; k++) {
        from = randomReachable(reach, rng, from, 2200);
        plan.goals.push(from);
        plan.dwell.push(nextInt(rng, 0, 90));
      }
      break;
    }
    case 'hunter': {
      const turret = (map.turrets ?? [])[
        nextInt(rng, 0, Math.max(0, (map.turrets?.length ?? 1) - 1))
      ];
      plan.engageRange = Math.min(tuning.rifle.range * 0.97, 380 + nextFloat(rng) * 140);
      if (turret) plan.goals.push(turret.position);
      plan.goals.push(randomReachable(reach, rng, turret?.position ?? sp, 1500));
      plan.dwell.push(30, 120);
      break;
    }
    case 'idler': {
      plan.goals.push(randomReachable(reach, rng, sp, 300));
      plan.dwell.push(maxTicks);
      break;
    }
    case 'crowd': {
      plan.goals.push(rallyPoint(map, tuning, spawnPointId));
      plan.dwell.push(0);
      plan.millRadius = 40 + nextFloat(rng) * 50;
      break;
    }
  }
  return plan;
}

// ---------- the driver ----------

export interface BotDriver {
  readonly plan: BotPlan;
  /** One input per tick under control; null once the life is over (it ends alive: an O). */
  input(world: World, me: SoldierState): SoldierInput | null;
  /** Ticks driven so far. */
  readonly ticks: number;
}

const ARRIVE_EPS = 3;
const HUNT_EVERY_TICKS = 6;
const TRAFFIC_LOOKAHEAD_TICKS = 50;

function moveToward(me: SoldierState, target: Vec2, aim?: number): SoldierInput {
  const dx = target.x - me.x;
  const dy = target.y - me.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { ...IDLE_INPUT, aim: aim ?? me.facing };
  const scale = Math.min(1, len / 2.5);
  return {
    move: { x: (dx / len) * scale, y: (dy / len) * scale },
    aim: aim ?? Math.atan2(dy, dx),
    fire: false,
    interact: false,
  };
}

/**
 * Would walking along `dir` at full speed run into a moving vehicle within the lookahead?
 * Only checked while the bot is not already on a lane (there it's safer to keep going).
 */
function trafficAhead(world: World, me: SoldierState, dir: Vec2): boolean {
  const t = world.tuning;
  const lanes = world.map.trafficLanes ?? [];
  if (!lanes.length) return false;
  const infos = lanes.map((d) => laneInfo(d, t));
  const r = t.soldier.hitboxRadius + 14;
  const per = t.soldier.speed / 60;
  for (const v of world.state.vehicles) {
    if (v.state !== 'moving') continue;
    const info = infos[v.lane]!;
    // Already inside this lane's band: don't freeze in the road.
    const band = vehicleRect(info.dir.x !== 0 ? { x: me.x, y: v.y } : { x: v.x, y: me.y }, info);
    if (circleOverlapsRect(me, r, band)) return false;
  }
  for (let k = 0; k <= TRAFFIC_LOOKAHEAD_TICKS; k += 5) {
    const p = { x: me.x + dir.x * per * k, y: me.y + dir.y * per * k };
    for (const v of world.state.vehicles) {
      if (v.state !== 'moving') continue;
      const info = infos[v.lane]!;
      const vp = {
        x: v.x + info.dir.x * info.stepPerTick * k,
        y: v.y + info.dir.y * info.stepPerTick * k,
      };
      if (circleOverlapsRect(p, r, vehicleRect(vp, info))) return true;
    }
  }
  return false;
}

/** Angle to the nearest hazard a shot from here would actually hit, or null. */
function huntTarget(world: World, me: SoldierState, range: number): number | null {
  const { map, state: st, tuning } = world;
  let best: { d: number; angle: number } | null = null;
  const consider = (id: string, pos: Vec2, minD: number) => {
    const d = distance(me, pos);
    if (d > range || d < minD || (best && d >= best.d)) return;
    const angle = Math.atan2(pos.y - me.y, pos.x - me.x);
    const hit = castRay(world, me, angle, range, 'player');
    if (hit.target && 'id' in hit.target && hit.target.id === id) best = { d, angle };
  };
  (map.turrets ?? []).forEach((def, i) => {
    if (st.turrets[i]!.mode !== 'destroyed') consider(def.id, def.position, 0);
  });
  // Never shoot a mine you're standing next to.
  (map.mines ?? []).forEach((def, i) => {
    if (st.mines[i]!.state !== 'detonated') {
      consider(def.id, def.position, tuning.mine.blastRadius + 30);
    }
  });
  return best ? (best as { angle: number }).angle : null;
}

export function createBotDriver(plan: BotPlan): BotDriver {
  const rng = createRng(plan.seed ^ 0x9e3779b9);
  let ticks = 0;
  let goal = 0;
  let path: Vec2[] | null = null;
  let wp = 1;
  let dwellLeft = -1;
  let millTarget: Vec2 | null = null;
  let millUntil = 0;
  let huntAngle: number | null = null;
  let stuck = 0;
  let lastPos: Vec2 | null = null;

  const input = (world: World, me: SoldierState): SoldierInput | null => {
    if (ticks >= plan.maxTicks) return null;
    ticks++;

    // Hunters stop and shoot whatever hazard they can hit.
    if (plan.engageRange > 0) {
      if (ticks % HUNT_EVERY_TICKS === 1) huntAngle = huntTarget(world, me, plan.engageRange);
      if (huntAngle !== null) return { ...IDLE_INPUT, aim: huntAngle, fire: true };
    }

    // Walk the goals.
    while (goal < plan.goals.length) {
      const g = plan.goals[goal]!;
      if (dwellLeft >= 0) {
        if (dwellLeft-- > 0) {
          const turn = ticks % 90 === 0 ? (nextFloat(rng) - 0.5) * 2 : 0;
          return { ...IDLE_INPUT, aim: me.facing + turn };
        }
        dwellLeft = -1;
        goal++;
        path = null;
        continue;
      }
      if (!path) {
        path = findPath(world, me, g);
        wp = 1;
        stuck = 0;
        if (!path) {
          // Unreachable right now (e.g. a gate shut): skip it.
          goal++;
          continue;
        }
      }
      while (wp < path.length && distance(me, path[wp]!) <= ARRIVE_EPS) wp++;
      if (wp >= path.length) {
        dwellLeft = plan.dwell[goal] ?? 0;
        continue;
      }
      // Stuck behind something for 2 s (a wreck, a crowd): replan.
      if (lastPos && distance(lastPos, me) < 0.05) stuck++;
      else stuck = 0;
      lastPos = { x: me.x, y: me.y };
      if (stuck > 120) {
        path = null;
        continue;
      }
      const target = path[wp]!;
      const len = distance(me, target);
      const dir = { x: (target.x - me.x) / len, y: (target.y - me.y) / len };
      if (trafficAhead(world, me, dir)) return { ...IDLE_INPUT, aim: Math.atan2(dir.y, dir.x) };
      return moveToward(me, target);
    }

    // Past the last goal: mill around it (crowds), or stand.
    if (plan.millRadius > 0) {
      const center = plan.goals[plan.goals.length - 1] ?? me;
      if (!millTarget || ticks >= millUntil || distance(me, millTarget) <= ARRIVE_EPS) {
        const a = nextFloat(rng) * Math.PI * 2;
        const d = nextFloat(rng) * plan.millRadius;
        millTarget = { x: center.x + Math.cos(a) * d, y: center.y + Math.sin(a) * d };
        millUntil = ticks + nextInt(rng, 30, 90);
      }
      return moveToward(me, millTarget);
    }
    return { ...IDLE_INPUT, aim: me.facing };
  };

  return {
    plan,
    input,
    get ticks() {
      return ticks;
    },
  };
}
