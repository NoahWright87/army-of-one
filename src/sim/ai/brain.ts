/**
 * (07-d) Enemy soldier AI ([D44]–[D47]). An AI soldier is an ordinary soldier on the enemy team
 * whose `SoldierInput` comes from this brain instead of a player: it moves, aims, recoils, mounts
 * and throws through exactly the same code as ours. Pure and deterministic (it runs inside the
 * sim: same history, same behaviour), and never recorded: it's re-simulated every attempt.
 *
 * Per soldier, three layers:
 * 1. Perception (each decision): our soldiers it can see (sight range, cover cuts sight [D33],
 *    walls block), the last place it saw a target (shared with its squad), its danger (visible
 *    threat vs its side's nearby threat), whether it was just hurt, grenades nearby.
 * 2. Decision (every `ai.thinkSeconds`, staggered): utility scores for evade / retreat / cover /
 *    engage / approach / hold, weighted by the role's `AiProfile`; the current behaviour gets a
 *    bonus while committed.
 * 3. Execution (every tick): the behaviour becomes an input (path following, aim with a small
 *    error, fire in bursts while its spread at the target is tight enough, Grenadier wind-up).
 *
 * Dormancy: a soldier sleeps until one of ours comes within `ai.wakeRadius` and sleeps again (at
 * its post) once none is within `ai.sleepRadius`. A stand-in for "off camera" that is part of
 * the sim, so background resolves (which have no camera) agree with what you saw.
 *
 * (PHASE13) Rally points ([Q54]): a squad with `rally` points roams between them when idle, even
 * asleep (cheaply, without looking for targets), so a base is alive before you get there. Each
 * role loiters, then scores every point (distance, our soldiers near it, its side under attack
 * there, crowding, cover, rear, a little randomness) and walks to the best; to help, it sprints.
 * On arrival it takes a spot near the point: spaced from others, behind cover from the front.
 * Retreats go to the best point too, and depend on position as well as health.
 */
import type { Tuning } from '../../content/tuning';
import { roleDef, type AiProfile, type RoamProfile } from '../../content/roles';
import type { RoleId } from '../../contracts/mission';
import { hash01 } from '../core/hash';
import { compareIds } from '../core/ids';
import { secondsToTicks, type Tick } from '../core/time';
import { distance, distanceSq, leadPoint, type Vec2 } from '../core/vec';
import { hasLineOfSight } from '../combat/shots';
import { attackKind, currentSpread, gunOf } from '../combat/guns';
import { damageShare, WORTH_SHOOTING } from '../combat/armor';
import {
  IDLE_INPUT,
  isEligible,
  isOurEligible,
  soldierMaxHp,
  type SoldierInput,
  type SoldierState,
} from '../entities/soldier';
import type { World } from '../state';
import { seesThroughCover, standingCover } from '../world/cover';
import { concealmentAimError, perceivedVisibility, trenchAt } from '../world/concealment';
import type { SquadDef } from '../world/map';
import { findPath, isWalkable } from '../world/nav';
import type { SimEvent } from '../events';
import { soldierIndex } from '../soldier-index';

export type Behavior =
  | 'protect'
  | 'hold'
  | 'patrol'
  | 'roam'
  | 'approach'
  | 'engage'
  | 'cover'
  | 'retreat'
  | 'evade'
  /** (PHASE17) A Shield getting in front of its friends. */
  | 'screen';

/** Plain-data AI state, kept on the soldier (so snapshots carry it). */
export interface AiState {
  squad: string;
  /** Its post: guard point, or where its patrol starts. */
  home: Vec2;
  homeFacing: number;
  awake: boolean;
  nextThink: Tick;
  behavior: Behavior;
  behaviorSince: Tick;
  targetId: string | null;
  /** Last place a target was seen (by it or its squad). */
  lastSeen: { x: number; y: number; tick: Tick } | null;
  /** Earliest tick it may fire at its current target (reaction time). */
  reactAt: Tick;
  /** Where it's going, and the path there. */
  dest: Vec2 | null;
  path: Vec2[] | null;
  pathIdx: number;
  planTick: Tick;
  patrolIdx: number;
  /** Aim error for this decision, radians. */
  aimErr: number;
  /** HP at the last decision, and when it last took damage. */
  lastHp: number;
  hurtTick: Tick;
  /** Overwhelmed until this tick: keeps falling back to regroup instead of re-engaging. */
  shakenUntil?: Tick;
  /** (PHASE13) Rally point it's heading to or at (index into the squad's `rally`). */
  roamIdx?: number;
  /** Where exactly it's going near that point (null: there, loitering). */
  roamSpot?: Vec2 | null;
  /** (PHASE17) Where this retreat is headed: away from the threat. */
  retreatTo?: Vec2 | null;
  /** (PHASE17) A Shield's spot in front of its friends. */
  screenSpot?: Vec2 | null;
  /** Loitering until this tick (unset while moving). */
  loiterUntil?: Tick;
  /** Going to help: sprints. */
  reinforce?: boolean;
  /** (PHASE13) Badly hurt once: never advances again; falls back once, then fights from there. */
  wounded?: boolean;
  /** (PHASE17) Outnumbering its target's side: rushing in ([D137]). */
  rushing?: boolean;
  /** Wounded and already at its fallback spot. */
  fellBack?: boolean;
  /** Closing in on a shooter who outranges it: sprints. */
  charging?: boolean;
  /** Shot at but can't see the shooter: steps toward it to get a line of sight. */
  seekSight?: boolean;
  /** A squadmate it may protect, and when that one was hit. */
  protectAlly?: string;
  protectTick?: Tick;
  /** The squad it started in (it may join another when its own routs). */
  origSquad?: string;
}

const BEHAVIOR_ARRIVE = 10;

/**
 * (PHASE12-d) How close counts as "there": vehicles can't stop on a point (a truck can't even
 * turn on the spot), so they arrive within a few body radii.
 */
function arriveRadius(s: SoldierState, soldier: number): number {
  return s.drive ? Math.max(soldier, 70) : soldier;
}
/** (perf) A destination has to move this far to be worth a new path. */
const REPLAN_MOVE = 64;
/** (perf) Paths longer than this aren't searched (the chase leash is shorter anyway). */
const PATH_MAX_LENGTH = 1100;
/** After being overwhelmed, keeps regrouping this long before re-engaging. */
const SHAKEN_SECONDS = 4;

/** Spawns every squad's members as enemy soldiers ("E1", "E2", … in map order). */
export function spawnSquads(
  world: World,
  create: (opts: {
    id: string;
    squad: SquadDef;
    role: RoleId;
    position: Vec2;
    facing: number;
  }) => SoldierState,
): void {
  if (!world.tuning.ai.enabled) return;
  let n = world.state.ids['E'] ?? 0;
  for (const sq of world.map.squads ?? []) {
    for (const m of sq.members) {
      n += 1;
      const facing = m.facing ?? Math.PI / 2;
      const s = create({
        id: `E${n}`,
        squad: sq,
        role: m.role ?? 'rifleman',
        position: m.position,
        facing,
      });
      s.ai = {
        squad: sq.id,
        origSquad: sq.id,
        home: { x: m.position.x, y: m.position.y },
        homeFacing: facing,
        awake: false,
        nextThink: 0,
        behavior: sq.rally?.length ? 'roam' : sq.order.kind === 'patrol' ? 'patrol' : 'hold',
        behaviorSince: 0,
        targetId: null,
        lastSeen: null,
        reactAt: 0,
        dest: null,
        path: null,
        pathIdx: 0,
        planTick: -9999,
        patrolIdx: 0,
        aimErr: 0,
        lastHp: s.hp,
        hurtTick: -9999,
        // (PHASE13) Everyone starts loitering where they spawned, for a staggered while.
        ...(sq.rally?.length
          ? { loiterUntil: loiterTicks(`E${n}`, 0, roleDef(m.role).ai.roam), roamSpot: null }
          : {}),
      };
    }
  }
  world.state.ids['E'] = n;
}

/** Stable per-soldier offset in [0, n). */
function stagger(id: string, n: number): number {
  return Math.floor(hash01(`${id}:stagger`) * n);
}

interface Perception {
  target: SoldierState | null;
  targetVisible: boolean;
  /** Where to aim/approach (the target, or its last seen position). */
  targetPos: Vec2 | null;
  danger: number;
  hurt: boolean;
  grenade: Vec2 | null;
}

/**
 * One tick of AI for every awake enemy soldier, in id order. Returns their inputs (dormant ones
 * get none: they stand still at their post).
 */
export function stepAi(
  world: World,
  lastEvents: readonly SimEvent[] = [],
): Map<string, SoldierInput> {
  const out = new Map<string, SoldierInput>();
  const st = world.state;
  // (PHASE17) Each side's AI fights the other ([D142]: arena squads can be ours).
  const ours = st.soldiers.filter(isOurEligible);
  const theirs = st.soldiers.filter((o) => o.team === 'enemy' && isEligible(o));
  // (PHASE13) A hit tells the soldier (and its squad) where the shot came from.
  for (const e of lastEvents) {
    if (e.kind === 'damaged' && e.by) hearHit(world, e.target, e.by);
    // (PHASE17) A bullet whizzing past: it knows roughly where it came from ([D146]).
    else if (e.kind === 'nearMiss') hearHit(world, e.target, e.by, { x: e.fromX, y: e.fromY });
  }
  if (st.tick % 60 === 0) {
    checkRouts(world);
    checkRegroups(world); // (PHASE17) [D138]
  }
  for (const s of st.soldiers) {
    const ai = s.ai;
    if (!ai || !s.alive) continue;
    const foes = s.team === 'enemy' ? ours : theirs;
    updateDormancy(world, s, ai, foes);
    if (!ai.awake) {
      // (PHASE13) Asleep but on rally points: keep wandering, cheaply (no perception).
      const squad = squadOf(world, ai);
      if (!squad?.rally?.length) continue;
      const every = Math.max(1, world.tuning.ai.sleepRoamTicks);
      if ((st.tick + stagger(salt(world) + s.id, every)) % every === 0) {
        ai.behavior = 'roam';
        setDest(world, s, ai, roamDest(world, s, ai, squad, foes));
      }
      out.set(s.id, execute(world, s, ai));
      continue;
    }
    if (st.tick >= ai.nextThink) {
      think(world, s, ai, foes);
      ai.nextThink = st.tick + Math.max(1, secondsToTicks(world.tuning.ai.thinkSeconds));
    }
    out.set(s.id, execute(world, s, ai));
  }
  return out;
}

function updateDormancy(
  world: World,
  s: SoldierState,
  ai: AiState,
  ours: readonly SoldierState[],
): void {
  const t = world.tuning.ai;
  const every = 30;
  if ((world.state.tick + stagger(salt(world) + s.id, every)) % every !== 0) return;
  const r = ai.awake ? t.sleepRadius : t.wakeRadius;
  const r2 = r * r;
  const near = ours.some((o) => distanceSq(o, s) <= r2);
  if (near && !ai.awake) {
    ai.awake = true;
    ai.nextThink = world.state.tick + stagger(salt(world) + s.id, secondsToTicks(t.thinkSeconds));
  } else if (
    !near &&
    ai.awake &&
    (!!squadOf(world, ai)?.rally?.length || distance(s, ai.home) < 24)
  ) {
    ai.awake = false;
    ai.targetId = null;
    ai.path = null;
  }
}

// ---------- perception ----------

function perceive(
  world: World,
  s: SoldierState,
  ai: AiState,
  ours: readonly SoldierState[],
): Perception {
  const t = skillOf(world, s);
  const tick = world.state.tick;
  const sightRange = t.sightRange * (profileOf(s.roleId).sight ?? 1);
  const { sprintBonus, firingBonus } = world.tuning.concealment;
  const maxSight2 = (sightRange * (1 + sprintBonus + firingBonus)) ** 2;
  // Concealed targets out of sight range don't use up a candidate slot.
  const cands = ours
    .map((o) => ({ o, d2: distanceSq(o, s) }))
    .filter(({ d2 }) => d2 <= maxSight2)
    .map(({ o, d2 }) => ({ o, d2, reach: sightRange * perceivedVisibility(world, s, o) }))
    .filter(({ d2, reach }) => d2 <= reach * reach)
    .sort((a, b) => a.d2 - b.d2 || compareIds(a.o.id, b.o.id))
    .slice(0, Math.max(1, t.maxCandidates));
  const visible: SoldierState[] = [];
  for (const { o, reach } of cands) {
    if (!seesThroughCover(standingCover(world), s, o, reach, world.tuning)) continue;
    if (!hasLineOfSight(world, s, o, 'enemy', s.id)) continue;
    visible.push(o);
  }
  // Target: keep the current one while visible and not much farther than the nearest.
  // (PHASE12-b) Prefer targets its weapon can hurt: a rifle doesn't waste itself on a tank
  // while a soldier is in view ([D70]).
  const kind = attackKind(s, world.tuning);
  const worth = (o: SoldierState) => damageShare(world.tuning, kind, o.roleId) >= WORTH_SHOOTING;
  const worthy = visible.filter(worth);
  const pool = worthy.length > 0 ? worthy : visible;
  let target: SoldierState | null;
  const cur = ai.targetId ? pool.find((o) => o.id === ai.targetId) : undefined;
  const nearest = pool[0] ?? null;
  if (cur && nearest && distance(cur, s) <= distance(nearest, s) * 1.3) target = cur;
  else target = nearest;
  if (target) {
    if (ai.targetId !== target.id) ai.reactAt = tick + secondsToTicks(t.reactionSeconds);
    ai.targetId = target.id;
    ai.lastSeen = { x: target.x, y: target.y, tick };
    shareWithSquad(world, s, ai);
  }
  const memory = secondsToTicks(t.memorySeconds);
  const remembered = ai.lastSeen && tick - ai.lastSeen.tick <= memory ? ai.lastSeen : null;
  if (!target && !remembered) ai.targetId = null;

  // Danger: visible threat vs. our side's threat nearby (allies + self).
  let foe = 0;
  const dr2 = t.dangerRadius * t.dangerRadius;
  for (const o of visible) if (distanceSq(o, s) <= dr2) foe += profileOf(o.roleId).threat;
  let mine = 0;
  const ar2 = t.allyRadius * t.allyRadius;
  for (const a of world.state.soldiers) {
    if (a.ai && a.team === s.team && isEligible(a) && distanceSq(a, s) <= ar2) {
      mine += profileOf(a.roleId).threat;
    }
  }
  const danger = foe / Math.max(0.5, mine);

  const hurt = s.hp < ai.lastHp;
  if (hurt) ai.hurtTick = tick;
  ai.lastHp = s.hp;

  let grenade: Vec2 | null = null;
  let gBest = t.evadeRadius * t.evadeRadius;
  for (const g of world.state.grenades ?? []) {
    const d2 = distanceSq(g, s);
    if (d2 <= gBest) {
      gBest = d2;
      grenade = { x: g.x, y: g.y };
    }
  }

  return {
    target,
    targetVisible: !!target,
    targetPos: target ? { x: target.x, y: target.y } : remembered,
    danger,
    hurt,
    grenade,
  };
}

/** Squadmates who know less learn where the target was seen. */
function shareWithSquad(world: World, s: SoldierState, ai: AiState): void {
  if (!ai.lastSeen) return;
  for (const o of world.state.soldiers) {
    const oa = o.ai;
    if (!oa || o === s || !o.alive || oa.squad !== ai.squad) continue;
    if (!oa.lastSeen || oa.lastSeen.tick < ai.lastSeen.tick) {
      oa.lastSeen = { ...ai.lastSeen };
      if (!oa.awake) {
        oa.awake = true;
        oa.nextThink = world.state.tick + 1 + stagger(salt(world) + o.id, 10);
      }
    }
  }
}

export function profileOf(role: RoleId | undefined): AiProfile {
  return roleDef(role).ai;
}

function weaponRange(world: World, s: SoldierState): number {
  const w = roleDef(s.roleId).weapon;
  const t = world.tuning;
  switch (w) {
    case 'mg':
      return t.mg.range;
    case 'grenade':
      return t.grenade.maxRange;
    // (PHASE12-a) A Sniper fights at rifle range (it stands to set up when engaging, [D59]).
    case 'sniper':
      return t.sniper.range;
    case 'pistol':
      return t.pistol.range;
    case 'shotgun':
      return t.shotgun.range;
    case 'rocket':
      return t.rocket.range;
    default:
      return t.rifle.range;
  }
}

// ---------- decision ----------

function think(world: World, s: SoldierState, ai: AiState, ours: readonly SoldierState[]): void {
  const t = skillOf(world, s);
  const tick = world.state.tick;
  const prof = profileOf(s.roleId);
  const p = perceive(world, s, ai, ours);
  const range = weaponRange(world, s);
  const squad = squadOf(world, ai);
  // (PHASE12-d) A patrol's "post" is its whole route, not where it started; (PHASE13) a roaming
  // squad's, all its rally points.
  const posts: readonly Vec2[] = squad?.rally?.length
    ? squad.rally
    : squad?.order.kind === 'patrol' && squad.order.route.length > 0
      ? squad.order.route
      : [ai.home];
  const leashOk = (pt: Vec2) => posts.some((h) => distance(pt, h) <= prof.leash + 1);
  const underFire = p.hurt || tick - ai.hurtTick < secondsToTicks(1.5);
  const hpFrac = s.hp / Math.max(1, soldierMaxHp(world.tuning, s.roleId, s.team));
  const threatD = p.targetPos ? distance(s, p.targetPos) : Infinity;

  const scores: Record<Behavior, number> = {
    evade: 0,
    retreat: 0,
    cover: 0,
    engage: 0,
    approach: 0,
    hold: 0.1,
    patrol: 0,
    roam: 0,
    protect: 0,
    screen: 0,
  };
  let coverSpot: Vec2 | null = null;
  if (p.grenade) scores.evade = 2;
  // (PHASE13) Position matters as much as health: dug in with friends around, it holds on until
  // nearly dead; caught in the open by someone behind cover, it pulls back early ([Q54]).
  let retreatHp = prof.retreatHp;
  let bravery = prof.bravery;
  let covered = false;
  if (p.targetPos) {
    covered = coveredFrom(world, s, p.targetPos);
    const theyCovered = p.target ? coveredFrom(world, p.target, s) : false;
    const friends = alliesNear(world, s, t.allyRadius);
    if (covered) {
      retreatHp *= 0.5;
      bravery *= 1.6;
    } else if (theyCovered) {
      retreatHp = Math.min(0.9, retreatHp * 1.5);
      bravery *= 0.7;
    }
    if (friends >= 2) retreatHp *= 0.8;
  }
  if (p.danger > bravery) ai.shakenUntil = tick + secondsToTicks(SHAKEN_SECONDS);
  const shaken = (ai.shakenUntil ?? -1) > tick;
  // (PHASE13) No yo-yo: after being shaken it stays cautious a while (no advancing), and once
  // badly hurt it's wounded for good: it falls back once, then fights from there.
  const cautious =
    ai.shakenUntil !== undefined && tick < ai.shakenUntil + secondsToTicks(t.cautiousSeconds);
  if (hpFrac < retreatHp) ai.wounded = true;
  if (ai.wounded && ai.fellBack && underFire && !covered) ai.fellBack = false;
  if (ai.wounded) {
    if (!ai.fellBack) scores.retreat = 1.2;
  } else if (shaken) {
    scores.retreat = 0.9 + Math.min(0.3, Math.max(0, p.danger - bravery) * 0.1);
  }
  if (p.targetPos && (p.targetVisible || underFire)) {
    coverSpot = findCoverSpot(world, s, p.targetPos);
    if (coverSpot) {
      const d = distance(s, coverSpot);
      const near = 1 - Math.min(1, d / t.coverSearchRadius);
      scores.cover = prof.coverPreference * (0.4 + 0.6 * near) * (underFire ? 1.1 : 0.85);
    }
  }
  // (PHASE17) Machine Gunners dig in: cover facing the threat (searched further afield), as
  // soon as a threat is known; standing there mounts the gun.
  if (prof.digIn && p.targetPos && !ai.wounded) {
    const spot = findCoverSpot(world, s, p.targetPos, t.digInRadius);
    if (spot) {
      coverSpot = spot;
      scores.cover = Math.max(scores.cover, 0.7 + 0.4 * prof.digIn);
    }
  }
  // (PHASE17) Shields screen: in front of nearby friends, between them and the threat.
  ai.screenSpot = null;
  if (prof.screen && p.targetPos && !ai.wounded) {
    const spot = screenSpot(world, s, p.targetPos);
    if (spot) {
      ai.screenSpot = spot;
      scores.screen = 0.7 + 0.45 * prof.screen;
    }
  }
  if (p.target && p.targetVisible) {
    const d = distance(s, p.target);
    if (d <= range * 0.95) scores.engage = 0.6 + prof.aggression * 0.2;
    // (PHASE17) Behind cover it stays and shoots, out to its bullets' reach ([D146]).
    else if (covered && d <= range * t.suppressReach) scores.engage = 0.75;
  }
  // (PHASE17) Covered, the target in sight and within reach: hold the cover rather than chase.
  // (Can't see past it: stepping up to the cover is still allowed.)
  if (
    covered &&
    p.targetVisible &&
    p.targetPos &&
    distance(s, p.targetPos) <= range * t.suppressReach
  ) {
    if (!ai.rushing) scores.approach *= 0.2;
    scores.hold = Math.max(scores.hold, 0.55);
  }
  if (p.targetPos) {
    const d = distance(s, p.targetPos);
    if (d > range * prof.preferredRange) scores.approach = 0.35 + prof.aggression * 0.35;
  }
  // (PHASE13) Reacting to being shot: get in range, or get a line of sight, or (badly outranged)
  // charge in or fall back to friends, by type and health.
  ai.charging = false;
  ai.seekSight = false;
  if (underFire && p.targetPos) {
    if (threatD > range * 1.25) {
      if (prof.outranged === 'charge' && hpFrac > 0.5 && !ai.wounded) {
        scores.approach = Math.max(scores.approach, 0.95);
        ai.charging = true;
      } else {
        scores.retreat = Math.max(scores.retreat, 1.0);
      }
    } else if (!p.targetVisible && !coverSpot) {
      scores.approach = Math.max(scores.approach, 0.75);
      ai.seekSight = true;
    }
  }
  // (PHASE13) A squadmate was just hit nearby: step between it and the shooter.
  const ally =
    ai.protectAlly && tick - (ai.protectTick ?? -9999) < secondsToTicks(3)
      ? soldierIndex(world.state.soldiers).get(ai.protectAlly)
      : undefined;
  if (ally?.alive && ally.ai?.lastSeen && prof.protect > 0 && !ai.wounded) {
    scores.protect = 0.4 + prof.protect * 0.6;
  }
  // (PHASE17) Numbers ([D137]): outnumbering the soldiers around their target, they rush in
  // (and stop to shoot once close); outnumbered, they flee. Not when wounded.
  ai.rushing = false;
  if (p.targetPos && !ai.wounded && t.rushRatio > 0) {
    const mine = 1 + alliesNear(world, s, t.numbersRadius);
    const r2 = t.numbersRadius * t.numbersRadius;
    let theirs = 0;
    for (const o of ours) if (distanceSq(o, p.targetPos) <= r2) theirs++;
    const ratio = mine / Math.max(1, theirs);
    if (ratio >= t.rushRatio) {
      ai.rushing = true;
      if (threatD > range * 0.6 || !p.targetVisible) {
        scores.approach = Math.max(scores.approach, 1.05);
        ai.charging = threatD > range;
        // Can't see it (behind cover): keep pushing in until they can, don't stop at range.
        if (!p.targetVisible) ai.seekSight = true;
      } else {
        scores.engage = Math.max(scores.engage, 1.1);
      }
      scores.cover *= 0.5;
      if (!ai.wounded) scores.retreat = Math.min(scores.retreat, 0.5);
      // Covering a hurt squadmate comes before joining the rush ([D99]).
      if (scores.protect > 0) scores.protect = Math.max(scores.protect, 1.15);
    } else if (ratio <= 1 / t.fleeRatio && !covered) {
      scores.retreat = Math.max(scores.retreat, 1.0);
    }
  }
  if ((ai.wounded || cautious) && !ai.rushing) scores.approach = 0;
  if (squad?.order.kind === 'patrol' && !p.targetPos) scores.patrol = 0.2;
  if (squad?.rally?.length && !p.targetPos) scores.roam = 0.25;
  // Too far from its post: drop the chase (a rush goes further, [D137]).
  if (!leashOk(s) && !(ai.rushing && posts.some((h) => distance(s, h) <= prof.leash * 2))) {
    scores.approach = 0;
    scores.hold = Math.max(scores.hold, 0.5);
  }
  // Commitment: the current behaviour gets a bonus for a while (only while it still applies).
  if (tick - ai.behaviorSince < secondsToTicks(t.commitSeconds) && scores[ai.behavior] > 0) {
    scores[ai.behavior] += 0.15;
  }

  let best: Behavior = 'hold';
  for (const b of [
    'evade',
    'retreat',
    'cover',
    'engage',
    'protect',
    'screen',
    'approach',
    'roam',
    'patrol',
    'hold',
  ] as const) {
    if (scores[b] > scores[best]) best = b;
  }
  if (best !== ai.behavior) {
    ai.behavior = best;
    ai.behaviorSince = tick;
    if (best !== 'retreat') ai.retreatTo = null;
  }
  ai.aimErr = (hash01(`${salt(world)}${s.id}@${tick}:aimErr`) * 2 - 1) * t.aimError;

  // Where to go for the chosen behaviour.
  let dest: Vec2 | null = null;
  switch (best) {
    case 'evade': {
      const g = p.grenade!;
      const dx = s.x - g.x;
      const dy = s.y - g.y;
      const len = Math.hypot(dx, dy) || 1;
      // Run away, angled a little sideways so a squad scatters instead of bunching.
      const side = hash01(`${s.id}:evadeSide`) < 0.5 ? -1 : 1;
      const ax = dx / len - (dy / len) * 0.5 * side;
      const ay = dy / len + (dx / len) * 0.5 * side;
      const al = Math.hypot(ax, ay) || 1;
      dest = { x: s.x + (ax / al) * t.evadeRadius, y: s.y + (ay / al) * t.evadeRadius };
      ai.path = null; // straight line, now
      break;
    }
    case 'retreat':
      // (PHASE17) With a known threat: away from it ([D137]), picked once per retreat.
      if (p.targetPos || ai.lastSeen) {
        const threat = threatCentre(world, s, ours) ?? p.targetPos ?? ai.lastSeen!;
        if (!ai.retreatTo || ai.behaviorSince === tick) {
          ai.retreatTo = retreatSpot(world, s, ai, squad, ours, threat);
        }
        dest = ai.retreatTo;
      } else if (squad?.rally?.length) {
        // (PHASE13) Fall back to the best rally point (friends, away from us), spread out there.
        if (!ai.roamSpot || ai.behaviorSince === tick) {
          const i = bestRallyPoint(world, s, ai, squad, ours, 'flee');
          ai.roamIdx = i;
          ai.roamSpot = pickSpot(world, s, squad.rally[i]!);
          ai.loiterUntil = undefined;
        }
        dest = ai.roamSpot ?? squad.rally[ai.roamIdx ?? 0]!;
      } else dest = squad?.fallback ?? ai.home;
      if (ai.wounded && distance(s, dest) <= arriveRadius(s, 40)) {
        // Fallen back: this is its post now (holding never walks it back into the fight).
        ai.fellBack = true;
        ai.home = { x: s.x, y: s.y };
      }
      break;
    case 'protect': {
      const threat = ally!.ai!.lastSeen!;
      const dx = threat.x - ally!.x;
      const dy = threat.y - ally!.y;
      const len = Math.hypot(dx, dy) || 1;
      dest = { x: ally!.x + (dx / len) * 55, y: ally!.y + (dy / len) * 55 };
      break;
    }
    case 'roam':
      dest = roamDest(world, s, ai, squad!, ours);
      break;
    case 'cover':
      dest = coverSpot;
      break;
    case 'screen':
      dest = ai.screenSpot ?? null;
      break;
    case 'approach': {
      const tp = p.targetPos!;
      const d = distance(s, tp);
      // Seeking a line of sight: a step toward the shooter, not all the way.
      const keep = ai.seekSight ? Math.max(0, d - 150) : range * prof.preferredRange * 0.8;
      const k = d > 0 ? Math.max(0, (d - keep) / d) : 0;
      dest = clampToLeash(
        { x: s.x + (tp.x - s.x) * k, y: s.y + (tp.y - s.y) * k },
        ai.home,
        // (PHASE17) A rush goes further from home ([D137]), as the leash check allows.
        prof.leash * (ai.rushing ? 2 : 1),
      );
      break;
    }
    case 'patrol': {
      const route = squad?.order.kind === 'patrol' ? squad.order.route : [];
      if (route.length > 0) {
        let pt = route[ai.patrolIdx % route.length]!;
        if (distance(s, pt) < arriveRadius(s, 24)) {
          ai.patrolIdx = (ai.patrolIdx + 1) % route.length;
          pt = route[ai.patrolIdx]!;
        }
        dest = pt;
      }
      break;
    }
    case 'engage':
      dest = null;
      break;
    case 'hold':
      // (PHASE13) Shaken lately: hold where it is rather than walk back to its post.
      dest = !cautious && distance(s, ai.home) > arriveRadius(s, 24) ? ai.home : null;
      break;
  }
  setDest(world, s, ai, dest);
}

/** Chase only within the leash: a point beyond it is pulled back onto the leash circle. */
function clampToLeash(p: Vec2, home: Vec2, leash: number): Vec2 {
  const d = distance(p, home);
  if (d <= leash) return p;
  const k = leash / d;
  return { x: home.x + (p.x - home.x) * k, y: home.y + (p.y - home.y) * k };
}

function setDest(world: World, s: SoldierState, ai: AiState, dest: Vec2 | null): void {
  const tick = world.state.tick;
  if (!dest) {
    ai.dest = null;
    ai.path = null;
    return;
  }
  const prev = ai.dest;
  ai.dest = { x: dest.x, y: dest.y };
  if (ai.behavior === 'evade') {
    ai.path = [{ x: s.x, y: s.y }, ai.dest];
    ai.pathIdx = 1;
    return;
  }
  // (perf) Re-plan only when the destination really moved or the plan is stale; a failed search
  // (unreachable) also waits out the re-plan interval before trying again.
  const since = tick - ai.planTick;
  const minGap = secondsToTicks(world.tuning.ai.replanSeconds);
  const moved = !prev || distance(prev, dest) > REPLAN_MOVE;
  if (since < minGap && (!moved || since < minGap / 4)) {
    if (ai.path) ai.path[ai.path.length - 1] = ai.dest;
    return;
  }
  if (!moved && since < minGap * 3 && ai.path) return;
  ai.path = findPath(world, s, ai.dest, { maxLength: PATH_MAX_LENGTH }) ?? null;
  ai.pathIdx = 1;
  ai.planTick = tick;
}

/**
 * A spot behind a cover piece (relative to `threat`) within `ai.coverSearchRadius`: the side of
 * the piece facing away from the threat, at the point nearest the soldier. Nearest spot wins.
 */
export function findCoverSpot(
  world: World,
  s: SoldierState,
  threat: Vec2,
  radius?: number,
): Vec2 | null {
  const t = world.tuning;
  const R = radius ?? t.ai.coverSearchRadius;
  const off = t.soldier.wallRadius + 6;
  let best: Vec2 | null = null;
  let bestD = Infinity;
  if (!s.drive) {
    for (const { kind, rect } of world.map.concealment ?? []) {
      if (kind !== 'trench') continue;
      const spot = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
      const d = distance(s, spot);
      if (d > R || d >= bestD || !isWalkable(world, spot)) continue;
      if (distance(spot, threat) < distance(s, threat) - t.ai.coverAdvance) continue;
      best = spot;
      bestD = d;
    }
  }
  for (const c of standingCover(world)) {
    const r = c.rect;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    if (Math.abs(cx - s.x) > R + r.w / 2 || Math.abs(cy - s.y) > R + r.h / 2) continue;
    const dx = threat.x - cx;
    const dy = threat.y - cy;
    let spot: Vec2;
    if (Math.abs(dy) * r.w >= Math.abs(dx) * r.h) {
      // Threat above/below: stand on the far side along y.
      const x = Math.max(r.x + 6, Math.min(r.x + r.w - 6, s.x));
      spot = { x, y: dy < 0 ? r.y + r.h + off : r.y - off };
    } else {
      const y = Math.max(r.y + 6, Math.min(r.y + r.h - 6, s.y));
      spot = { x: dx < 0 ? r.x + r.w + off : r.x - off, y };
    }
    const d = distance(s, spot);
    if (d > R || d >= bestD || !isWalkable(world, spot)) continue;
    // (PHASE17) Cover that guards you: not a dash toward the shooter to reach it, and the
    // cover really is between the spot and the shooter.
    if (distance(spot, threat) < distance(s, threat) - t.ai.coverAdvance) continue;
    if (!coveredFrom(world, spot, threat)) continue;
    best = spot;
    bestD = d;
  }
  return best;
}

/**
 * (PHASE17) A Shield's spot: just in front of the nearest friends (not other shields), on the
 * line to the threat, spread sideways per shield. Null with no friends near or no room.
 */
function screenSpot(world: World, s: SoldierState, threat: Vec2): Vec2 | null {
  const t = world.tuning.ai;
  const r2 = t.screenRadius ** 2;
  const friends = world.state.soldiers.filter(
    (a) =>
      a !== s &&
      a.alive &&
      a.ai &&
      a.team === s.team &&
      (a.roleId ?? 'rifleman') !== 'shield' &&
      distanceSq(a, s) <= r2,
  );
  if (friends.length === 0) return null;
  const c = centroid(friends);
  const dx = threat.x - c.x;
  const dy = threat.y - c.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const ux = dx / len;
  const uy = dy / len;
  let front = 0;
  for (const a of friends) front = Math.max(front, (a.x - c.x) * ux + (a.y - c.y) * uy);
  const ahead = Math.min(front + t.screenAhead, len - t.screenAhead);
  if (ahead <= 0) return null;
  const side = (hash01(`${salt(world)}${s.id}:screen`) - 0.5) * 140;
  const spot = { x: c.x + ux * ahead - uy * side, y: c.y + uy * ahead + ux * side };
  return isWalkable(world, spot) ? spot : null;
}

/** (PHASE17) Where the danger is: the middle of the foes it can see nearby (null: none). */
function threatCentre(world: World, s: SoldierState, foes: readonly SoldierState[]): Vec2 | null {
  const r2 = world.tuning.ai.dangerRadius ** 2;
  let x = 0;
  let y = 0;
  let n = 0;
  for (const o of foes) {
    if (distanceSq(o, s) > r2) continue;
    x += o.x;
    y += o.y;
    n++;
  }
  return n ? { x: x / n, y: y / n } : null;
}

/**
 * (PHASE17) Where to fall back to, away from `threat`: the nearest cover that guards it (not
 * toward the shooter), else a rally point further from the threat than it is now, else behind
 * the nearest friends who are further back, else straight away. Never toward the threat.
 */
export function retreatSpot(
  world: World,
  s: SoldierState,
  ai: AiState,
  squad: SquadDef | undefined,
  foes: readonly SoldierState[],
  threat: Vec2,
): Vec2 {
  const t = world.tuning.ai;
  const here = distance(s, threat);
  const cover = findCoverSpot(world, s, threat);
  if (cover) return cover;
  if (squad?.rally?.length) {
    const away = squad.rally
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => distance(p, threat) > here + t.retreatMargin);
    if (away.length) {
      const i = bestRallyPoint(world, s, ai, squad, foes, 'flee', new Set(away.map((a) => a.i)));
      return pickSpot(world, s, squad.rally[i]!);
    }
  }
  const ux = (s.x - threat.x) / (here || 1);
  const uy = (s.y - threat.y) / (here || 1);
  // Friends further back (same side, within reach): get behind them.
  let fx = 0;
  let fy = 0;
  let n = 0;
  for (const a of world.state.soldiers) {
    if (a === s || !a.ai || !a.alive || a.team !== s.team) continue;
    if (distance(a, s) > t.retreatDistance * 2 || distance(a, threat) <= here) continue;
    fx += a.x;
    fy += a.y;
    n++;
  }
  const behind = n > 0 ? { x: fx / n + ux * 60, y: fy / n + uy * 60 } : null;
  if (behind && isWalkable(world, behind)) return behind;
  for (let k = 1; k >= 0.25; k -= 0.25) {
    const p = { x: s.x + ux * t.retreatDistance * k, y: s.y + uy * t.retreatDistance * k };
    if (isWalkable(world, p)) return p;
  }
  return { x: s.x, y: s.y };
}

// ---------- hits and routs (PHASE13) ----------

/**
 * One of ours hit an AI soldier: it now knows where the shot came from (and wakes), its squad
 * hears about it, and squadmates nearby may come to protect it.
 */
function hearHit(world: World, targetId: string, byId: string, from?: Vec2): void {
  const idx = soldierIndex(world.state.soldiers);
  const victim = idx.get(targetId);
  const by = idx.get(byId);
  const ai = victim?.ai;
  // (PHASE17) Any shooter of the other side (AI ones too: the arena), not friendly fire.
  if (!victim || !ai || !victim.alive || !by || by.team === victim.team) return;
  const tick = world.state.tick;
  ai.hurtTick = tick;
  const at = from ?? by;
  ai.lastSeen = { x: at.x, y: at.y, tick };
  if (!ai.awake) ai.awake = true;
  ai.nextThink = Math.min(ai.nextThink, tick + 1);
  shareWithSquad(world, victim, ai);
  const r2 = world.tuning.ai.protectRadius ** 2;
  for (const o of world.state.soldiers) {
    const oa = o.ai;
    if (!oa || o === victim || !o.alive || oa.squad !== ai.squad) continue;
    if (distanceSq(o, victim) > r2) continue;
    oa.protectAlly = victim.id;
    oa.protectTick = tick;
  }
}

/** Share of a squad's starting strength still standing (HP of everyone it started with). */
function squadStrength(world: World, sq: SquadDef): { strength: number; alive: SoldierState[] } {
  const members = world.state.soldiers.filter((o) => o.ai?.origSquad === sq.id);
  if (members.length === 0) return { strength: 0, alive: [] };
  const alive = members.filter((o) => o.alive);
  const sum = alive.reduce(
    (n, o) => n + o.hp / Math.max(1, soldierMaxHp(world.tuning, o.roleId, o.team)),
    0,
  );
  return { strength: sum / members.length, alive };
}

/**
 * A squad torn up below `ai.routStrength` falls back to the nearest squad still above
 * `ai.healthyStrength` and joins it: its soldiers defend (and roam) that squad's ground from
 * then on. Checked once a second, squads in map order.
 */
function checkRouts(world: World): void {
  const t = world.tuning.ai;
  const squads = world.map.squads ?? [];
  if (squads.length < 2) return;
  const strength = squads.map((sq) => ({ sq, ...squadStrength(world, sq) }));
  for (const r of strength) {
    const stay = r.alive.filter((o) => o.ai!.squad === r.sq.id);
    if (stay.length === 0 || r.strength >= t.routStrength) continue;
    const at = centroid(stay);
    let best: { sq: SquadDef; where: Vec2 } | null = null;
    let bestD = Infinity;
    for (const h of strength) {
      if (h === r || h.strength < t.healthyStrength) continue;
      const theirs = h.alive.filter((o) => o.ai!.squad === h.sq.id);
      if (theirs.length === 0) continue;
      const where = centroid(theirs);
      const d = distance(at, where);
      if (d < bestD) {
        bestD = d;
        best = { sq: h.sq, where };
      }
    }
    if (!best) continue;
    for (const o of stay) {
      const oa = o.ai!;
      oa.squad = best.sq.id;
      const a = hash01(`${o.id}:rout`) * Math.PI * 2;
      oa.home = { x: best.where.x + Math.cos(a) * 60, y: best.where.y + Math.sin(a) * 60 };
      oa.roamSpot = null;
      oa.roamIdx = undefined;
      oa.loiterUntil = undefined;
      oa.behavior = 'retreat';
      oa.behaviorSince = world.state.tick;
      oa.awake = true;
      oa.nextThink = world.state.tick + 1;
    }
  }
}

/**
 * (PHASE17) A wounded soldier that got away and healed back to `ai.regroupHp` ([D138]) joins the
 * best squad within `ai.regroupRadius`: more living soldiers, and one holding a capture point
 * counts extra (it reinforces what you still have to take). It patrols that squad's ground.
 */
function checkRegroups(world: World): void {
  const t = world.tuning.ai;
  const squads = world.map.squads ?? [];
  if (squads.length === 0) return;
  const living = new Map<string, SoldierState[]>();
  for (const o of world.state.soldiers) {
    if (!o.ai || !o.alive || o.ai.wounded) continue;
    const list = living.get(o.ai.squad) ?? [];
    list.push(o);
    living.set(o.ai.squad, list);
  }
  for (const s of world.state.soldiers) {
    const ai = s.ai;
    if (!ai || !s.alive || !ai.wounded) continue;
    if (s.hp < soldierMaxHp(world.tuning, s.roleId, s.team) * t.regroupHp) continue;
    let best: { sq: SquadDef; where: Vec2; score: number } | null = null;
    for (const sq of squads) {
      const them = living.get(sq.id);
      if (!them || them.length === 0) continue;
      const where = centroid(them);
      const d = distance(s, where);
      if (d > t.regroupRadius) continue;
      const score = them.length + (sq.capturePointId ? 3 : 0) - d / 1000;
      if (!best || score > best.score) best = { sq, where, score };
    }
    ai.wounded = false;
    ai.fellBack = false;
    ai.shakenUntil = undefined;
    if (!best) continue;
    ai.squad = best.sq.id;
    const a = hash01(`${s.id}:regroup@${world.state.tick}`) * Math.PI * 2;
    ai.home = { x: best.where.x + Math.cos(a) * 60, y: best.where.y + Math.sin(a) * 60 };
    ai.roamSpot = null;
    ai.roamIdx = undefined;
    ai.loiterUntil = undefined;
    ai.behaviorSince = world.state.tick;
    ai.nextThink = world.state.tick + 1;
  }
}

/**
 * (PHASE17) A soldier's AI skill ([D142]): the tuning's, with its squad's `skill` on top (the
 * arena's HUMAN / CPU presets).
 */
/** (PHASE17) The arena's per-fight hash salt ([D142]): '' everywhere else (no change). */
function salt(world: World): string {
  return world.map.aiSeed !== undefined ? `${world.map.aiSeed}/` : '';
}

export function skillOf(world: World, s: SoldierState): Tuning['ai'] {
  const id = s.ai?.origSquad;
  const sq = id ? (world.map.squads ?? []).find((q) => q.id === id) : undefined;
  return sq?.skill ? { ...world.tuning.ai, ...sq.skill } : world.tuning.ai;
}

/** (PHASE18) Its original squad holds its post (`SquadDef.hold`). */
function holdsPost(world: World, ai: AiState): boolean {
  const id = ai.origSquad ?? ai.squad;
  return !!(world.map.squads ?? []).find((q) => q.id === id)?.hold;
}

function centroid(ss: readonly SoldierState[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const o of ss) {
    x += o.x;
    y += o.y;
  }
  return { x: x / ss.length, y: y / ss.length };
}

// ---------- rally points (PHASE13, [Q54]) ----------

function squadOf(world: World, ai: AiState): SquadDef | undefined {
  return (world.map.squads ?? []).find((q) => q.id === ai.squad);
}

function loiterTicks(id: string, tick: Tick, rp: RoamProfile): Tick {
  const [lo, hi] = rp.loiter;
  return tick + secondsToTicks(lo + (hi - lo) * hash01(`${id}@${tick}:loiter`));
}

/**
 * The roaming state machine: loiter, pick the best rally point, walk to a spot near it, loiter.
 * Returns where to go (null = stay). A squad under attack interrupts loitering for those who help.
 */
function roamDest(
  world: World,
  s: SoldierState,
  ai: AiState,
  squad: SquadDef,
  ours: readonly SoldierState[],
): Vec2 | null {
  const tick = world.state.tick;
  const rp = profileOf(s.roleId).roam;
  const pts = squad.rally!;
  if (ai.loiterUntil === undefined) {
    // Moving: arrived, or no way there?
    const spot = ai.roamSpot ?? pts[ai.roamIdx ?? 0]!;
    // A path search that failed leaves no path: settle here instead of standing in limbo.
    const stuck = ai.dest !== null && ai.path === null;
    if (distance(s, spot) <= arriveRadius(s, 28) || stuck) {
      ai.loiterUntil = loiterTicks(s.id, tick, rp);
      ai.reinforce = false;
      ai.roamSpot = null;
      return null;
    }
    return spot;
  }
  const helpNeeded =
    !ai.wounded &&
    rp.assist > 0 &&
    !ai.reinforce &&
    pts.some((p, i) => i !== ai.roamIdx && pointAttacked(world, p));
  if (tick < ai.loiterUntil && !helpNeeded) return null;
  // (PHASE13) The wounded pick points like they flee: friends, away from the fight.
  const i = bestRallyPoint(world, s, ai, squad, ours, ai.wounded ? 'flee' : 'roam');
  const here = ai.roamIdx === i && distance(s, pts[i]!) < 150;
  ai.roamIdx = i;
  if (here) {
    ai.loiterUntil = loiterTicks(s.id, tick, rp);
    return null;
  }
  ai.reinforce = !ai.wounded && rp.assist > 0 && pointAttacked(world, pts[i]!);
  ai.roamSpot = pickSpot(world, s, pts[i]!);
  ai.loiterUntil = undefined;
  return ai.roamSpot;
}

/** Scores every rally point for this soldier; `flee` is the retreat version. */
export function bestRallyPoint(
  world: World,
  s: SoldierState,
  ai: AiState,
  squad: SquadDef,
  ours: readonly SoldierState[],
  mode: 'roam' | 'flee',
  /** (PHASE17) Only these rally points (default: all). */
  allowed?: ReadonlySet<number>,
): number {
  const tick = world.state.tick;
  const rp = profileOf(s.roleId).roam;
  const pts = squad.rally!;
  const ys = pts.map((p) => p.y);
  const minY = Math.min(...ys);
  const spanY = Math.max(...ys) - minY;
  let best = allowed ? Math.min(...allowed) : 0;
  let bestScore = -Infinity;
  pts.forEach((p, i) => {
    if (allowed && !allowed.has(i)) return;
    const d = distance(s, p);
    const danger = dangerAt(world, p, ours);
    const attacked = pointAttacked(world, p) ? 1 : 0;
    const crowd = crowdAt(world, s, ai, p, i);
    const cover = coverAt(world, p);
    // The front is where we attack from: down the map (higher y).
    const rear = spanY > 1 ? (spanY - (p.y - minY)) / spanY : 0;
    const jitter = hash01(`${s.id}@${tick}:rally${i}`) - 0.5;
    let score: number;
    if (mode === 'flee') {
      score = -2 * danger - attacked - 0.4 * crowd + 0.5 * rear + 0.4 * cover + 0.3 * jitter;
      score -= Math.min(1, d / 1200) * 0.3;
    } else {
      score =
        rp.travel * Math.min(1, d / 1000) +
        (i === ai.roamIdx && d < 150 ? rp.stay : 0) +
        rp.danger * danger +
        rp.assist * attacked -
        rp.crowd * crowd +
        rp.cover * cover +
        rp.rear * rear +
        rp.jitter * jitter;
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Our soldiers' threat near a point, 0..1 (distance-weighted, capped). */
function dangerAt(world: World, p: Vec2, ours: readonly SoldierState[]): number {
  const R = world.tuning.ai.dangerRadius;
  let sum = 0;
  for (const o of ours) {
    const d = distance(o, p);
    if (d < R) sum += profileOf(o.roleId).threat * (1 - d / R);
  }
  return Math.min(1, sum / 3);
}

/** Its side is fighting there: an enemy soldier near the point was hurt recently. */
function pointAttacked(world: World, p: Vec2): boolean {
  const t = world.tuning.ai;
  const since = world.state.tick - secondsToTicks(t.attackedSeconds);
  const r2 = t.allyRadius * t.allyRadius;
  return world.state.soldiers.some(
    (a) => a.ai && a.alive && a.ai.hurtTick >= since && distanceSq(a, p) <= r2,
  );
}

/** How many others of its side are at (or heading to) the point, 0..1+. */
function crowdAt(world: World, s: SoldierState, ai: AiState, p: Vec2, i: number): number {
  let n = 0;
  for (const a of world.state.soldiers) {
    if (a === s || !a.ai || !a.alive || a.team !== s.team) continue;
    const going = a.ai.squad === ai.squad && a.ai.roamIdx === i;
    if (going || distanceSq(a, p) <= 120 * 120) n++;
  }
  return n / 2;
}

/** Standing cover around a point, 0..1. */
function coverAt(world: World, p: Vec2): number {
  let n = 0;
  for (const c of standingCover(world)) {
    const r = c.rect;
    const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
    const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
    if (dx * dx + dy * dy <= 160 * 160) n++;
  }
  return Math.min(1, n / 2);
}

/**
 * A spot near a rally point, not the point itself: walkable, spaced from others of its side
 * (where they are and where they're going), behind cover from the front if it can, clear of
 * vehicles. Vehicles just take the point.
 */
export function pickSpot(world: World, s: SoldierState, p: Vec2): Vec2 {
  if (s.drive) return p;
  const t = world.tuning.ai;
  const space = t.roamSpacing;
  const rp = profileOf(s.roleId).roam;
  const turn = hash01(`${s.id}@${world.state.tick}:spot`) * Math.PI * 2;
  const cands: Vec2[] = [p];
  for (const [r, n] of [
    [48, 8],
    [96, 8],
  ] as const) {
    for (let k = 0; k < n; k++) {
      const a = turn + (k / n) * Math.PI * 2;
      cands.push({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r });
    }
  }
  const others: Vec2[] = [];
  for (const a of world.state.soldiers) {
    if (a === s || !a.ai || !a.alive || a.team !== s.team) continue;
    others.push(a);
    if (a.ai.roamSpot) others.push(a.ai.roamSpot);
  }
  const vehicles = world.state.soldiers.filter((a) => a.ai && a.alive && a.drive);
  let best = p;
  let bestScore = -Infinity;
  for (const c of cands) {
    if (!isWalkable(world, c)) continue;
    let score = -distance(c, p) / 200;
    for (const o of others) {
      const d = distance(c, o);
      if (d < space) score -= ((space - d) / space) * 1.5;
    }
    for (const v of vehicles) if (distance(c, v) < 110) score -= 1;
    if (coveredFrom(world, c, { x: c.x, y: c.y + 400 })) score += 0.4 + 0.6 * Math.max(0, rp.cover);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** Is there standing cover close in front of `p` toward `threat` (within ~70 units)? */
export function coveredFrom(
  world: World,
  p: Vec2 & { drive?: SoldierState['drive'] },
  threat: Vec2,
): boolean {
  if (!p.drive && trenchAt(world.map.concealment, p)) return true;
  const dx = threat.x - p.x;
  const dy = threat.y - p.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return false;
  const reach = Math.min(70, len);
  const ex = p.x + (dx / len) * reach;
  const ey = p.y + (dy / len) * reach;
  return standingCover(world).some((c) => segmentHitsRect(p.x, p.y, ex, ey, c.rect));
}

function segmentHitsRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: { x: number; y: number; w: number; h: number },
): boolean {
  // Liang–Barsky clip.
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const edges: [number, number][] = [
    [-dx, x0 - r.x],
    [dx, r.x + r.w - x0],
    [-dy, y0 - r.y],
    [dy, r.y + r.h - y0],
  ];
  for (const [pp, q] of edges) {
    if (pp === 0) {
      if (q < 0) return false;
    } else {
      const u = q / pp;
      if (pp < 0) t0 = Math.max(t0, u);
      else t1 = Math.min(t1, u);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/** Others of its side within `r`. */
function alliesNear(world: World, s: SoldierState, r: number): number {
  const r2 = r * r;
  let n = 0;
  for (const a of world.state.soldiers) {
    if (a !== s && a.ai && a.team === s.team && isEligible(a) && distanceSq(a, s) <= r2) n++;
  }
  return n;
}

// ---------- execution ----------

function execute(world: World, s: SoldierState, ai: AiState): SoldierInput {
  const tick = world.state.tick;
  const target = ai.targetId ? soldierIndex(world.state.soldiers).get(ai.targetId) : undefined;
  const candidate = target && isEligible(target) && target.team !== s.team ? target : undefined;
  const visibility = candidate ? perceivedVisibility(world, s, candidate) : 1;
  const live =
    candidate &&
    distance(s, candidate) <=
      skillOf(world, s).sightRange * (profileOf(s.roleId).sight ?? 1) * visibility
      ? candidate
      : undefined;
  const aimAt: Vec2 | null = live ? live : ai.lastSeen;
  let move = { x: 0, y: 0 };
  if (ai.path && ai.pathIdx < ai.path.length) {
    const arrive = arriveRadius(s, BEHAVIOR_ARRIVE);
    while (ai.pathIdx < ai.path.length && distance(s, ai.path[ai.pathIdx]!) <= arrive) {
      ai.pathIdx++;
    }
    const wp = ai.path[ai.pathIdx];
    if (wp) {
      const dx = wp.x - s.x;
      const dy = wp.y - s.y;
      const len = Math.hypot(dx, dy);
      const k = len > 0 ? Math.min(1, len / 2.5) / len : 0;
      move = { x: dx * k, y: dy * k };
    }
  }
  let aim = s.facing;
  let aimDistance: number | undefined;
  if (aimAt) {
    // (PHASE12-d) A rocket or shell leads a moving vehicle so it meets it.
    const proj = roleDef(s.roleId).weapon;
    let at: Vec2 = aimAt;
    if (live?.drive && (proj === 'rocket' || proj === 'shell')) {
      const v = live.drive.speed / 60;
      at = leadPoint(
        s,
        live,
        { x: Math.cos(live.facing) * v, y: Math.sin(live.facing) * v },
        world.tuning[proj].speed / 60,
      );
    }
    aim = Math.atan2(at.y - s.y, at.x - s.x) + ai.aimErr;
    if (live)
      aim += concealmentAimError(
        world.tuning,
        visibility,
        `${salt(world)}${s.id}@${tick}:concealment`,
      );
    // (07-e) Moving targets are harder to hit ([D50]): jitter that grows with their speed.
    if (live && live.moveFrac > 0) {
      const jitter = hash01(`${salt(world)}${s.id}@${tick}:moving`) * 2 - 1;
      // (PHASE12-a) Much worse with a sniper rifle ([D59]).
      const extra =
        gunOf(s, world.tuning) === 'sniper' ? world.tuning.sniper.movingTargetAimError : 0;
      aim += jitter * (skillOf(world, s).movingTargetError + extra) * live.moveFrac;
    }
    // (PHASE16) Worse at range than the player ([D132]).
    if (live && skillOf(world, s).distanceAimError > 0) {
      const jitter = hash01(`${salt(world)}${s.id}@${tick}:range`) * 2 - 1;
      aim += (jitter * skillOf(world, s).distanceAimError * distance(s, live)) / 500;
    }
    // (PHASE12-a) Rockets are very inaccurate against people ([D62]); (PHASE12-b) shells a bit.
    const heavy = roleDef(s.roleId).weapon;
    const vehicleTarget = !!live?.drive;
    if (live && !vehicleTarget && (heavy === 'rocket' || heavy === 'shell')) {
      aim +=
        (hash01(`${salt(world)}${s.id}@${tick}:rocket`) * 2 - 1) *
        world.tuning[heavy].soldierAimError;
    }
    aimDistance = distance(s, aimAt);
  } else if (move.x !== 0 || move.y !== 0) {
    aim = Math.atan2(move.y, move.x);
  } else if (ai.behavior === 'hold' || ai.behavior === 'roam') {
    aim = ai.homeFacing;
  }
  // (PHASE18) A squad that holds its post never moves (a gun nest in basic training).
  if (holdsPost(world, ai)) move = { x: 0, y: 0 };
  // (PHASE13) Roaming is a walk, not a run (unless going to help).
  if (ai.behavior === 'roam' && !ai.reinforce) {
    const pace = profileOf(s.roleId).roam.walk;
    move = { x: move.x * pace, y: move.y * pace };
  }

  let fire = false;
  // (PHASE17) Covering fire ([D146]): shot at recently by someone it can't see (or no longer
  // sees), it fires at where the shots came from, if that's within its bullets' reach.
  const t17 = skillOf(world, s);
  const suppressing =
    !live &&
    !!ai.lastSeen &&
    tick - ai.hurtTick <= secondsToTicks(t17.suppressSeconds) &&
    ai.behavior !== 'evade' &&
    ai.behavior !== 'retreat' &&
    !!gunOf(s, world.tuning) &&
    distance(s, ai.lastSeen) <= weaponRange(world, s) * t17.suppressReach;
  if (suppressing) {
    const jitter = hash01(`${salt(world)}${s.id}@${tick}:suppress`) * 2 - 1;
    aim += jitter * t17.suppressAimError;
    const on = secondsToTicks(t17.burstSeconds);
    const off = secondsToTicks(Math.max(t17.burstPauseSeconds, 0.6));
    const phase =
      (tick + Math.floor(hash01(`${salt(world)}${s.id}:burst`) * (on + off))) % (on + off);
    fire = phase < on;
  }
  if (live && tick >= ai.reactAt && ai.behavior !== 'evade') {
    const d = distance(s, live);
    const gun = gunOf(s, world.tuning);
    const weapon = roleDef(s.roleId).weapon;
    if (gun) {
      // Bursts: fire while the cone at the target is tight enough, let recoil recover otherwise.
      const spreadAtTarget = d * Math.tan(currentSpread(world, s, aim));
      const tol = world.tuning.soldier.hitboxRadius * profileOf(s.roleId).burstTolerance;
      fire = spreadAtTarget <= Math.max(tol, world.tuning.soldier.hitboxRadius);
      // (PHASE16) Bursts then a pause ([D132]), each soldier on its own offset cycle.
      const on = secondsToTicks(skillOf(world, s).burstSeconds);
      const off = secondsToTicks(skillOf(world, s).burstPauseSeconds);
      if (on > 0 && off > 0) {
        const phase =
          (tick + Math.floor(hash01(`${salt(world)}${s.id}:burst`) * (on + off))) % (on + off);
        fire &&= phase < on;
      }
      // (PHASE12-a) Only within the gun in hand's reach (a Sniper still on its pistol waits).
      if (gun === 'pistol' || gun === 'shotgun') {
        fire &&= d <= (gun === 'pistol' ? world.tuning.pistol.range : world.tuning.shotgun.range);
      }
    } else if (weapon === 'rocket' || weapon === 'shell') {
      // (PHASE12-a) Bazooka: hold to aim, unless our own squad is near the target ([D62]).
      // (PHASE12-b) A tank's cannon the same way.
      const allyNear = world.state.soldiers.some(
        (a) =>
          a.ai && a !== s && a.team === s.team && isEligible(a) && distanceSq(a, live) <= 110 * 110,
      );
      fire = !allyNear && d <= world.tuning[weapon].range;
    } else {
      // Grenadier: don't throw onto its own squad. Fire throws (PHASE18, [D159]).
      const allyNear = world.state.soldiers.some(
        (a) =>
          a.ai && a !== s && a.team === s.team && isEligible(a) && distanceSq(a, live) <= 110 * 110,
      );
      fire = !allyNear && d <= world.tuning.grenade.maxRange;
    }
  }
  // (PHASE12-b) A vehicle's turret lags the aim: hold fire until it's on target.
  if (fire && s.drive) {
    const off = Math.atan2(Math.sin(aim - s.drive.turret), Math.cos(aim - s.drive.turret));
    if (Math.abs(off) > 0.12) fire = false;
  }
  // Holding still steadies the aim: engaging soldiers stand; others move.
  if (ai.behavior === 'engage') move = { x: 0, y: 0 };
  // (07-e) Sprint ([D49]) away from grenades, on a retreat, or to cover while under fire.
  const underFire = tick - ai.hurtTick < secondsToTicks(1.5);
  const sprint =
    world.tuning.ai.sprints &&
    (move.x !== 0 || move.y !== 0) &&
    (ai.behavior === 'evade' ||
      ai.behavior === 'retreat' ||
      (ai.behavior === 'roam' && !!ai.reinforce) ||
      (ai.behavior === 'approach' && !!ai.charging) ||
      (ai.behavior === 'protect' && !!ai.dest && distance(s, ai.dest) > 200) ||
      // (PHASE17) Only sprint for cover that's close ([D137]); else walk there shooting.
      (ai.behavior === 'cover' &&
        underFire &&
        !!ai.dest &&
        distance(s, ai.dest) <= world.tuning.ai.coverSprintRadius));
  if (sprint) fire = false;
  return {
    move,
    aim,
    fire,
    interact: false,
    ...(sprint ? { sprint: true } : {}),
    ...(aimDistance !== undefined ? { aimDistance } : {}),
  };
}

/** For tests/debug: idle input for a dormant soldier. */
export const DORMANT_INPUT = IDLE_INPUT;
