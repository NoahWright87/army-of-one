import { DEFAULT_TUNING, type Tuning } from '../../content/tuning';
import { hash01 } from '../core/hash';
import { POSITION_QUANTUM } from '../../contracts/quantize';
import { secondsToTicks, type Tick } from '../core/time';
import { distanceSq, type Vec2 } from '../core/vec';
import type { SoldierState } from '../entities/soldier';
import { soldierIndex } from '../soldier-index';
import type { World } from '../state';
import { rayCircle, rayRect } from './collision';
import { atmosphericTransmission, type Atmosphere } from './atmosphere';
import { rectContains, type ConcealmentArea, type Rect } from './map';

export interface SmokeCloud extends Vec2 {
  id: string;
  radius: number;
  start: Tick;
  end: Tick;
}

export interface SmokeView extends Vec2 {
  id: string;
  radius: number;
  density: number;
  /** Visibility multiplier when looking through the cloud. */
  transmission: number;
}

export function depthInRect(p: Vec2, r: Rect): number {
  return Math.min(p.x - r.x, r.x + r.w - p.x, p.y - r.y, r.y + r.h - p.y);
}

export function trenchAt(areas: readonly ConcealmentArea[] | undefined, p: Vec2) {
  return areas?.find((area) => area.kind === 'trench' && rectContains(area.rect, p));
}

/** Distance to the first exposed lip along a ray that starts inside a trench. */
export function trenchExitDistance(
  areas: readonly ConcealmentArea[] | undefined,
  from: Vec2,
  dir: Vec2,
  limit: number,
): number {
  let trench = trenchAt(areas, from);
  let exit = Infinity;
  while (trench) {
    const r = trench.rect;
    const x = Math.abs(dir.x) < 1e-10 ? Infinity : ((dir.x > 0 ? r.x + r.w : r.x) - from.x) / dir.x;
    const y = Math.abs(dir.y) < 1e-10 ? Infinity : ((dir.y > 0 ? r.y + r.h : r.y) - from.y) / dir.y;
    exit = Math.min(x, y);
    if (exit > limit) break;
    const past = exit + POSITION_QUANTUM;
    const next = trenchAt(areas, { x: from.x + dir.x * past, y: from.y + dir.y * past });
    if (next === trench) break;
    trench = next;
  }
  return exit;
}

export function markFired(world: World, by: string): void {
  const soldier = soldierIndex(world.state.soldiers).get(by);
  if (soldier) soldier.lastFiredTick = world.state.tick;
}

export function addSmoke(world: World, id: string, at: Vec2, blastRadius: number): void {
  const { smoke } = world.tuning.concealment;
  const start = world.state.tick;
  const end = start + secondsToTicks(smoke.seconds);
  if (end <= start || smoke.radiusMultiplier <= 0 || blastRadius <= 0) return;
  (world.state.smoke ??= []).push({
    id,
    x: at.x,
    y: at.y,
    radius: blastRadius * smoke.radiusMultiplier,
    start,
    end,
  });
}

function density(cloud: SmokeCloud, tick: Tick): number {
  return Math.max(0, Math.min(1, (cloud.end - tick) / (cloud.end - cloud.start)));
}

function transmission(strength: number, tuning: Tuning['concealment']): number {
  return 1 - strength * (1 - tuning.smoke.visibility);
}

export function smokeView(world: World): SmokeView[] | undefined {
  const { smoke, tick } = world.state;
  if (!smoke?.length) return undefined;
  return smoke.map((cloud) => {
    const { id, x, y, radius } = cloud;
    const strength = density(cloud, tick);
    return {
      id,
      x,
      y,
      radius,
      density: strength,
      transmission: transmission(strength, world.tuning.concealment),
    };
  });
}

export function onRaisedGround(world: World, p: Vec2): boolean {
  return world.map.raisedGround?.some((r) => rectContains(r, p)) ?? false;
}

export function soldierVisibility(world: World, s: SoldierState): number {
  if (!s.alive) return 1;
  const t = world.tuning.concealment;
  let visibility = onRaisedGround(world, s) ? world.tuning.ladder.visibility : 1;
  if (!s.drive) {
    if (trenchAt(world.map.concealment, s)) visibility *= t.trench.visibility;
    for (const area of world.map.concealment ?? []) {
      const depth = depthInRect(s, area.rect);
      if (depth < 0 || area.kind !== 'bush') continue;
      const fullDepth = Math.min(t.bush.entryDepth, area.rect.w / 2, area.rect.h / 2);
      const share = fullDepth > 0 ? Math.min(1, depth / fullDepth) : 1;
      visibility *= 1 - share * (1 - t.bush.visibility);
    }
  }
  for (const cloud of world.state.smoke ?? []) {
    if (distanceSq(s, cloud) < cloud.radius ** 2) {
      visibility *= transmission(density(cloud, world.state.tick), t);
    }
  }
  const age = world.state.tick - (s.lastFiredTick ?? -Infinity);
  const revealTicks = secondsToTicks(t.firingSeconds);
  if (age < revealTicks) visibility += t.firingBonus * (1 - age / revealTicks);
  if (s.sprinting) visibility += t.sprintBonus;
  return Math.max(t.minVisibility, visibility);
}

export interface SightSettings {
  minVisibility: number;
  bushVisibility: number;
  mistAttenuation: number;
  fogAttenuation: number;
}

export function sightSettings(t: Tuning['concealment']): SightSettings {
  return {
    minVisibility: t.minVisibility,
    bushVisibility: t.bush.visibility,
    mistAttenuation: t.mistAttenuation,
    fogAttenuation: t.fogAttenuation,
  };
}

const DEFAULT_SIGHT = sightSettings(DEFAULT_TUNING.concealment);

/** Visibility to one observer. A supplied base already includes concealment at the target. */
export function visibilityFrom(
  from: Vec2 | undefined,
  to: Vec2,
  base: number | undefined,
  areas: readonly ConcealmentArea[] | undefined,
  smoke: readonly SmokeView[] | undefined,
  sight = DEFAULT_SIGHT,
  atmosphere?: Atmosphere,
): number {
  const across = from
    ? transmissionBetween(from, to, areas, sight.bushVisibility, smoke, base !== undefined) *
      atmosphericTransmission(from, to, atmosphere, sight.mistAttenuation, sight.fogAttenuation)
    : 1;
  return Math.max(sight.minVisibility, (base ?? 1) * across);
}

function transmissionBetween(
  from: Vec2,
  to: Vec2,
  areas: readonly ConcealmentArea[] | undefined,
  bushVisibility: number,
  smoke: readonly SmokeView[] | undefined,
  targetAlreadyConcealed: boolean,
): number {
  if (!areas?.length && !smoke?.length) return 1;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (!d) return 1;
  const dir = { x: dx / d, y: dy / d };
  let visibility = 1;
  for (const { kind, rect } of areas ?? []) {
    if (
      kind !== 'bush' ||
      rectContains(rect, from) ||
      (targetAlreadyConcealed && rectContains(rect, to))
    )
      continue;
    const entry = rayRect(from, dir, rect);
    if (entry !== null && entry < d) visibility *= bushVisibility;
  }
  for (const cloud of smoke ?? []) {
    const r2 = cloud.radius ** 2;
    if (distanceSq(from, cloud) <= r2 || (targetAlreadyConcealed && distanceSq(to, cloud) < r2))
      continue;
    const entry = rayCircle(from, dir, cloud, cloud.radius);
    if (entry !== null && entry < d) visibility *= cloud.transmission;
  }
  return visibility;
}

export function perceivedVisibility(world: World, from: Vec2, to: SoldierState): number {
  return visibilityFrom(
    from,
    to,
    soldierVisibility(world, to),
    world.map.concealment,
    smokeView(world),
    sightSettings(world.tuning.concealment),
    { map: world.map, tick: world.state.tick },
  );
}

/** Applies the same concealment-related jitter to AI and auto-aim. */
export function concealmentAimError(tuning: Tuning, visibility: number, key: string): number {
  return visibility >= 1
    ? 0
    : (hash01(key) * 2 - 1) * tuning.concealment.aimError * (1 - visibility);
}
