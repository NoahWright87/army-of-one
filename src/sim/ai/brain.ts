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
 */
import { roleDef, type AiProfile } from '../../content/roles';
import type { RoleId } from '../../contracts/mission';
import { hash01 } from '../core/hash';
import { compareIds } from '../core/ids';
import { secondsToTicks, type Tick } from '../core/time';
import { distance, distanceSq, type Vec2 } from '../core/vec';
import { hasLineOfSight } from '../combat/shots';
import { currentSpread, gunOf } from '../combat/guns';
import { aimedThrowDistance, windupTicksFor } from '../combat/weapons';
import {
  IDLE_INPUT,
  isEligible,
  isOurEligible,
  type SoldierInput,
  type SoldierState,
} from '../entities/soldier';
import type { World } from '../state';
import { seesThroughCover } from '../world/cover';
import type { SquadDef } from '../world/map';
import { findPath, isWalkable } from '../world/nav';

export type Behavior = 'hold' | 'patrol' | 'approach' | 'engage' | 'cover' | 'retreat' | 'evade';

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
}

const BEHAVIOR_ARRIVE = 10;
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
        home: { x: m.position.x, y: m.position.y },
        homeFacing: facing,
        awake: false,
        nextThink: 0,
        behavior: sq.order.kind === 'patrol' ? 'patrol' : 'hold',
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
export function stepAi(world: World): Map<string, SoldierInput> {
  const out = new Map<string, SoldierInput>();
  const st = world.state;
  const ours = st.soldiers.filter(isOurEligible);
  for (const s of st.soldiers) {
    const ai = s.ai;
    if (!ai || !s.alive) continue;
    updateDormancy(world, s, ai, ours);
    if (!ai.awake) continue;
    if (st.tick >= ai.nextThink) {
      think(world, s, ai, ours);
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
  if ((world.state.tick + stagger(s.id, every)) % every !== 0) return;
  const r = ai.awake ? t.sleepRadius : t.wakeRadius;
  const r2 = r * r;
  const near = ours.some((o) => distanceSq(o, s) <= r2);
  if (near && !ai.awake) {
    ai.awake = true;
    ai.nextThink = world.state.tick + stagger(s.id, secondsToTicks(t.thinkSeconds));
  } else if (!near && ai.awake && distance(s, ai.home) < 24) {
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
  const t = world.tuning.ai;
  const tick = world.state.tick;
  const sight2 = t.sightRange * t.sightRange;
  // Nearest few candidates in range, then line of sight (cover cuts sight, walls block).
  const cands = ours
    .filter((o) => distanceSq(o, s) <= sight2)
    .sort((a, b) => distanceSq(a, s) - distanceSq(b, s) || compareIds(a.id, b.id))
    .slice(0, Math.max(1, t.maxCandidates));
  const visible: SoldierState[] = [];
  for (const o of cands) {
    if (!seesThroughCover(world.cover, s, o, t.sightRange, world.tuning)) continue;
    if (!hasLineOfSight(world, s, o, 'enemy', s.id)) continue;
    visible.push(o);
  }
  // Target: keep the current one while visible and not much farther than the nearest.
  let target: SoldierState | null;
  const cur = ai.targetId ? visible.find((o) => o.id === ai.targetId) : undefined;
  const nearest = visible[0] ?? null;
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
    if (a.ai && isEligible(a) && distanceSq(a, s) <= ar2) mine += profileOf(a.roleId).threat;
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
        oa.nextThink = world.state.tick + 1 + stagger(o.id, 10);
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
  return w === 'mg' ? t.mg.range : w === 'grenade' ? t.grenade.maxRange : t.rifle.range;
}

// ---------- decision ----------

function think(world: World, s: SoldierState, ai: AiState, ours: readonly SoldierState[]): void {
  const t = world.tuning.ai;
  const tick = world.state.tick;
  const prof = profileOf(s.roleId);
  const p = perceive(world, s, ai, ours);
  const range = weaponRange(world, s);
  const squad = (world.map.squads ?? []).find((q) => q.id === ai.squad);
  const leashOk = (pt: Vec2) => distance(pt, ai.home) <= prof.leash + 1;
  const underFire = p.hurt || tick - ai.hurtTick < secondsToTicks(1.5);
  const hpFrac = s.hp / Math.max(1, world.tuning.soldier.maxHp);

  const scores: Record<Behavior, number> = {
    evade: 0,
    retreat: 0,
    cover: 0,
    engage: 0,
    approach: 0,
    hold: 0.1,
    patrol: 0,
  };
  let coverSpot: Vec2 | null = null;
  if (p.grenade) scores.evade = 2;
  if (p.danger > prof.bravery) ai.shakenUntil = tick + secondsToTicks(SHAKEN_SECONDS);
  const shaken = (ai.shakenUntil ?? -1) > tick;
  if (hpFrac < prof.retreatHp) scores.retreat = 1.2;
  else if (shaken) {
    scores.retreat = 0.9 + Math.min(0.3, Math.max(0, p.danger - prof.bravery) * 0.1);
  }
  if (p.targetPos && (p.targetVisible || underFire)) {
    coverSpot = findCoverSpot(world, s, p.targetPos);
    if (coverSpot) {
      const d = distance(s, coverSpot);
      const near = 1 - Math.min(1, d / t.coverSearchRadius);
      scores.cover = prof.coverPreference * (0.4 + 0.6 * near) * (underFire ? 1.1 : 0.85);
    }
  }
  if (p.target && p.targetVisible) {
    const d = distance(s, p.target);
    if (d <= range * 0.95) scores.engage = 0.6 + prof.aggression * 0.2;
  }
  if (p.targetPos) {
    const d = distance(s, p.targetPos);
    if (d > range * prof.preferredRange) scores.approach = 0.35 + prof.aggression * 0.35;
  }
  if (squad?.order.kind === 'patrol' && !p.targetPos) scores.patrol = 0.2;
  // Too far from its post: drop the chase.
  if (!leashOk(s)) {
    scores.approach = 0;
    scores.hold = Math.max(scores.hold, 0.5);
  }
  // Commitment: the current behaviour gets a bonus for a while (only while it still applies).
  if (tick - ai.behaviorSince < secondsToTicks(t.commitSeconds) && scores[ai.behavior] > 0) {
    scores[ai.behavior] += 0.15;
  }

  let best: Behavior = 'hold';
  for (const b of ['evade', 'retreat', 'cover', 'engage', 'approach', 'patrol', 'hold'] as const) {
    if (scores[b] > scores[best]) best = b;
  }
  if (best !== ai.behavior) {
    ai.behavior = best;
    ai.behaviorSince = tick;
  }
  ai.aimErr = (hash01(`${s.id}@${tick}:aimErr`) * 2 - 1) * t.aimError;

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
      dest = squad?.fallback ?? ai.home;
      break;
    case 'cover':
      dest = coverSpot;
      break;
    case 'approach': {
      const tp = p.targetPos!;
      const d = distance(s, tp);
      const keep = range * prof.preferredRange * 0.8;
      const k = d > 0 ? Math.max(0, (d - keep) / d) : 0;
      dest = clampToLeash(
        { x: s.x + (tp.x - s.x) * k, y: s.y + (tp.y - s.y) * k },
        ai.home,
        prof.leash,
      );
      break;
    }
    case 'patrol': {
      const route = squad?.order.kind === 'patrol' ? squad.order.route : [];
      if (route.length > 0) {
        let pt = route[ai.patrolIdx % route.length]!;
        if (distance(s, pt) < 24) {
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
      dest = distance(s, ai.home) > 24 ? ai.home : null;
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
  const moved = !ai.dest || distance(ai.dest, dest) > 24;
  const stale = tick - ai.planTick >= secondsToTicks(world.tuning.ai.replanSeconds);
  ai.dest = { x: dest.x, y: dest.y };
  if (ai.behavior === 'evade') {
    ai.path = [{ x: s.x, y: s.y }, ai.dest];
    ai.pathIdx = 1;
    return;
  }
  if (moved || stale || !ai.path) {
    ai.path = findPath(world, s, ai.dest, { maxLength: 1500 }) ?? null;
    ai.pathIdx = 1;
    ai.planTick = tick;
  }
}

/**
 * A spot behind a cover piece (relative to `threat`) within `ai.coverSearchRadius`: the side of
 * the piece facing away from the threat, at the point nearest the soldier. Nearest spot wins.
 */
export function findCoverSpot(world: World, s: SoldierState, threat: Vec2): Vec2 | null {
  const t = world.tuning;
  const R = t.ai.coverSearchRadius;
  const off = t.soldier.wallRadius + 6;
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (const c of world.cover) {
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
    best = spot;
    bestD = d;
  }
  return best;
}

// ---------- execution ----------

function execute(world: World, s: SoldierState, ai: AiState): SoldierInput {
  const tick = world.state.tick;
  const target = ai.targetId ? world.state.soldiers.find((o) => o.id === ai.targetId) : undefined;
  const live = target && isOurEligible(target) ? target : undefined;
  const aimAt: Vec2 | null = live ? live : ai.lastSeen;
  let move = { x: 0, y: 0 };
  if (ai.path && ai.pathIdx < ai.path.length) {
    while (ai.pathIdx < ai.path.length && distance(s, ai.path[ai.pathIdx]!) <= BEHAVIOR_ARRIVE) {
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
    aim = Math.atan2(aimAt.y - s.y, aimAt.x - s.x) + ai.aimErr;
    aimDistance = distance(s, aimAt);
  } else if (move.x !== 0 || move.y !== 0) {
    aim = Math.atan2(move.y, move.x);
  } else if (ai.behavior === 'hold') {
    aim = ai.homeFacing;
  }

  let fire = false;
  if (live && tick >= ai.reactAt && ai.behavior !== 'evade') {
    const d = distance(s, live);
    const gun = gunOf(s);
    if (gun) {
      // Bursts: fire while the cone at the target is tight enough, let recoil recover otherwise.
      const spreadAtTarget = d * Math.tan(currentSpread(world, s, aim));
      const tol = world.tuning.soldier.hitboxRadius * profileOf(s.roleId).burstTolerance;
      fire = spreadAtTarget <= Math.max(tol, world.tuning.soldier.hitboxRadius);
    } else {
      // Grenadier: don't throw onto its own squad; wind up to full, then release (throws).
      const allyNear = world.state.soldiers.some(
        (a) => a.ai && a !== s && isEligible(a) && distanceSq(a, live) <= 110 * 110,
      );
      const input = { move, aim, fire: true, interact: false, aimDistance: d };
      const need = windupTicksFor(world, aimedThrowDistance(world, input));
      fire = !allyNear && d <= world.tuning.grenade.maxRange && s.windupTicks < need;
    }
  }
  // Holding still steadies the aim: engaging soldiers stand; others move.
  if (ai.behavior === 'engage') move = { x: 0, y: 0 };
  return {
    move,
    aim,
    fire,
    interact: false,
    ...(aimDistance !== undefined ? { aimDistance } : {}),
  };
}

/** For tests/debug: idle input for a dormant soldier. */
export const DORMANT_INPUT = IDLE_INPUT;
