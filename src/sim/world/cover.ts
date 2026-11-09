/**
 * (07-c) Real-time cover ([D32]). Every cover piece has two numbers in 0..1: the share of straight
 * shots (bullets, fragments) it stops, and the share of lobbed objects (grenades) it stops.
 * Solid walls are implicit full cover (1 / 1) and live in `map.walls`, not here.
 *
 * - A bullet crossing a cover piece is stopped with probability `bullet`. The roll is a hash of
 *   (shot key, cover id), not a shared random stream: the same shot through the same cover gives
 *   the same answer in every replay, whatever else changed in history.
 * - Fire over cover: a shooter within `tuning.cover.fireOverDistance` of a piece below
 *   `tuning.cover.fireOverBelow` ignores that piece for their own shots and sight.
 * - Sight past cover: crossing a piece multiplies the remaining sight distance by (1 − bullet).
 */
import { throughArmor, pierceOf } from '../combat/armor';
import { emit, type World } from '../state';
import { circleOverlapsRect } from './collision';
import type { Tuning } from '../../content/tuning';
import { hash01 } from '../core/hash';
import type { Vec2 } from '../core/vec';
import { rayRect } from './collision';
import type { CoverDef, MapDef, Rect } from './map';

/** A cover piece with its material numbers resolved. */
export interface CoverPiece {
  id: string;
  rect: Rect;
  material: string;
  /** Share of straight shots stopped, 0..1. */
  bullet: number;
  /** Share of lobbed objects stopped, 0..1. */
  lobbed: number;
  /** (PHASE12-b) Damage that destroys it; 0 = unbreakable ([Q40]). */
  hp: number;
  /** (PHASE12-b) Its armor ([D70]). */
  armor: number;
}

export function resolveCover(map: MapDef, tuning: Tuning): CoverPiece[] {
  return (map.cover ?? []).map((c: CoverDef) => {
    const m = tuning.cover.materials[c.material];
    if (!m) throw new Error(`${map.id}: cover ${c.id} has unknown material ${c.material}`);
    return {
      id: c.id,
      rect: c.rect,
      material: c.material,
      bullet: clamp01(c.bullet ?? m.bullet),
      lobbed: clamp01(c.lobbed ?? m.lobbed),
      hp: m.hp,
      armor: m.armor,
    };
  });
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Shortest distance from a point to a rect (0 inside). */
export function distanceToRect(p: Vec2, r: Rect): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/** Closest point of a rect to `p`. */
export function closestPointOnRect(p: Vec2, r: Rect): Vec2 {
  return {
    x: Math.max(r.x, Math.min(p.x, r.x + r.w)),
    y: Math.max(r.y, Math.min(p.y, r.y + r.h)),
  };
}

/** Can someone standing at `p` fire over this piece (for `value` = its bullet or lobbed number)? */
export function canFireOver(p: Vec2, piece: CoverPiece, value: number, tuning: Tuning): boolean {
  return (
    value < tuning.cover.fireOverBelow &&
    distanceToRect(p, piece.rect) <= tuning.cover.fireOverDistance
  );
}

/** Deterministic roll: does cover stop this shot? */
export function coverStops(shotKey: string, coverId: string, value: number): boolean {
  if (value <= 0) return false;
  if (value >= 1) return true;
  return hash01(`${shotKey}|${coverId}`) < value;
}

/** One crossing of a ray through a cover piece. */
export interface CoverCrossing {
  piece: CoverPiece;
  /** Distance along the ray to where it enters the piece. */
  distance: number;
}

/**
 * Cover pieces the ray from `from` along unit `dir` enters within `range`, nearest first (ties
 * by id). Pieces the origin can fire over are left out (`fireOver` false keeps them).
 */
export function coverCrossings(
  cover: readonly CoverPiece[],
  from: Vec2,
  dir: Vec2,
  range: number,
  tuning: Tuning,
  value: 'bullet' | 'lobbed',
  fireOver = true,
): CoverCrossing[] {
  const out: CoverCrossing[] = [];
  for (const piece of cover) {
    const t = rayRect(from, dir, piece.rect);
    if (t === null || t > range) continue;
    if (fireOver && canFireOver(from, piece, piece[value], tuning)) continue;
    out.push({ piece, distance: t });
  }
  out.sort((a, b) => a.distance - b.distance || (a.piece.id < b.piece.id ? -1 : 1));
  return out;
}

/**
 * How far a viewer at `from` sees toward `to` ([D33]): the full `range`, cut by each cover piece
 * crossed on the way. After crossing a piece at distance d with cover c, the remaining sight
 * (range − d) is multiplied by (1 − c). Returns true if `to` is within that reach.
 */
export function seesThroughCover(
  cover: readonly CoverPiece[],
  from: Vec2,
  to: Vec2,
  range: number,
  tuning: Tuning,
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d > range) return false;
  if (d === 0 || !tuning.cover.obscuresSight) return true;
  const dir = { x: dx / d, y: dy / d };
  let reach = range;
  for (const c of coverCrossings(cover, from, dir, d, tuning, 'bullet')) {
    reach = c.distance + (reach - c.distance) * (1 - c.piece.bullet);
    if (d > reach) return false;
  }
  return d <= reach;
}

/** (07-c) One arc of the live soldier's cover indicator. */
export interface CoverArc {
  /** Direction from the soldier to the cover, radians. */
  angle: number;
  /** Half the angular width of the arc, radians. */
  halfWidth: number;
  /** Bullet cover, 0..1 (walls are 1). */
  value: number;
}

/**
 * Cover arcs around `p` ([D34]): one per cover piece or wall within `radius`, pointing at its
 * closest point, spanning the piece's angular size (clamped). Pure, for the renderer.
 */
export function coverArcs(
  p: Vec2,
  pieces: readonly { rect: Rect; value: number }[],
  radius: number,
  maxHalfWidth = Math.PI / 4,
): CoverArc[] {
  const out: CoverArc[] = [];
  for (const piece of pieces) {
    const r = piece.rect;
    if (distanceToRect(p, r) > radius) continue;
    const c = closestPointOnRect(p, r);
    const angle = Math.atan2(c.y - p.y, c.x - p.x);
    // Angular span of the rect's corners, as seen from p (clamped to the max width).
    let lo = 0;
    let hi = 0;
    for (const [x, y] of [
      [r.x, r.y],
      [r.x + r.w, r.y],
      [r.x, r.y + r.h],
      [r.x + r.w, r.y + r.h],
    ] as const) {
      let a = Math.atan2(y - p.y, x - p.x) - angle;
      while (a > Math.PI) a -= 2 * Math.PI;
      while (a < -Math.PI) a += 2 * Math.PI;
      lo = Math.min(lo, a);
      hi = Math.max(hi, a);
    }
    const inside = distanceToRect(p, r) === 0;
    const half = inside ? maxHalfWidth : Math.min(maxHalfWidth, Math.max(0.2, (hi - lo) / 2));
    out.push({ angle, halfWidth: half, value: piece.value });
  }
  return out;
}

// ---------- (PHASE12-b) Breakable cover ([Q40]) ----------

/** Cover pieces still standing (`state.coverDestroyed` removes them), in map order. */
export function standingCover(world: World): readonly CoverPiece[] {
  const down = world.state.coverDestroyed;
  if (!down || down.length === 0) return world.cover;
  return world.cover.filter((c) => !down.includes(c.id));
}

/** Rects of destroyed cover (they no longer block movement). */
export function destroyedCoverRects(world: World): ReadonlySet<Rect> {
  const down = world.state.coverDestroyed;
  if (!down || down.length === 0) return EMPTY;
  return new Set(world.cover.filter((c) => down.includes(c.id)).map((c) => c.rect));
}
const EMPTY: ReadonlySet<Rect> = new Set();

/**
 * Damages a cover piece ([Q40]) through its armor ([D70]): a bullet it stopped, a blast, a
 * vehicle driving into it. At 0 it's destroyed for the rest of the attempt: it stops blocking
 * movement, shots and sight. Unbreakable pieces (hp 0) ignore it. Emits `coverDestroyed`.
 */
export function damageCover(
  world: World,
  id: string,
  amount: number,
  kind: string,
  by: string | undefined,
): void {
  const piece = world.cover.find((c) => c.id === id);
  if (!piece || piece.hp <= 0 || amount <= 0) return;
  const st = world.state;
  if (st.coverDestroyed?.includes(id)) return;
  const dmg = amount * throughArmor(piece.armor, pierceOf(world.tuning, kind));
  const hp = st.coverHp ?? (st.coverHp = {});
  const left = (hp[id] ?? piece.hp) - dmg;
  hp[id] = left;
  if (left > 0) return;
  const down = st.coverDestroyed ?? (st.coverDestroyed = []);
  down.push(id);
  down.sort();
  const r = piece.rect;
  emit(world, {
    kind: 'coverDestroyed',
    tick: st.tick,
    id,
    x: r.x + r.w / 2,
    y: r.y + r.h / 2,
    ...(by !== undefined ? { by } : {}),
  });
}

/** Damages every breakable piece a blast of `radius` at `c` touches. */
export function blastCover(
  world: World,
  c: Vec2,
  radius: number,
  amount: number,
  kind: string,
  by: string | undefined,
): void {
  for (const piece of standingCover(world)) {
    if (piece.hp > 0 && circleOverlapsRect(c, radius, piece.rect)) {
      damageCover(world, piece.id, amount, kind, by);
    }
  }
}
