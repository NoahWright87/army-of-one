/**
 * (07-b) Auto-aim ([D41]): picks a target for the live soldier from the read-only view, and an
 * `InputSource` decorator that aims (and optionally fires) at it. Works on top of keyboard/mouse
 * or touch.
 *
 * What's recorded doesn't change ([E1]): the sim sees an ordinary aim angle and fire flag, and
 * the recording stores the resulting shot (origin + angle), so echoes of auto-aimed lives replay
 * exactly like any other (`echo.autoAimReplay: 'recorded'`, [Q22]).
 *
 * Picker rules (pure, tested):
 * - Candidates: live turrets, then live objectives, in weapon range, with a clear line past solid
 *   walls and closed gates (partial cover doesn't block: shots roll against it).
 * - Priority: a turret winding up on you > a turret tracking you > any other turret > objective;
 *   within a tier, the nearest (ties by id).
 * - Sticky: keep the current target while it's still a valid candidate, unless a turret starts
 *   winding up on you.
 */
import type { Tuning } from '../../content/tuning';
import { roleDef } from '../../content/roles';
import type { Vec2 } from '../../sim/core/vec';
import type { SoldierInput } from '../../sim/entities/soldier';
import type { SoldierView, WorldView } from '../../sim/view';
import { rayRect } from '../../sim/world/collision';
import type { MapDef, Rect } from '../../sim/world/map';
import type { InputSource } from './input-source';

export interface AimTarget {
  id: string;
  x: number;
  y: number;
}

/** Weapon reach for auto-aim, by role. */
export function autoAimRange(tuning: Tuning, roleId: SoldierView['roleId']): number {
  const w = roleDef(roleId).weapon;
  return w === 'mg'
    ? tuning.mg.range
    : w === 'grenade'
      ? tuning.grenade.maxRange
      : tuning.rifle.range;
}

/** Solid line-of-sight blockers: walls and closed gates. */
export function solidBlockers(map: MapDef, view: WorldView): Rect[] {
  return [
    ...map.walls,
    ...view.gates.filter((g) => !g.open).map((g) => ({ x: g.x, y: g.y, w: g.w, h: g.h })),
  ];
}

export function clearLine(from: Vec2, to: Vec2, blockers: readonly Rect[]): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d === 0) return true;
  const dir = { x: dx / d, y: dy / d };
  for (const r of blockers) {
    const t = rayRect(from, dir, r);
    if (t !== null && t < d - 1) return false;
  }
  return true;
}

interface Candidate extends AimTarget {
  tier: number;
  d: number;
}

/** Valid targets for a soldier at `me` with reach `range`, best first. */
export function rankTargets(
  view: WorldView,
  map: MapDef,
  me: { id: string; x: number; y: number },
  range: number,
): Candidate[] {
  const blockers = solidBlockers(map, view);
  const out: Candidate[] = [];
  const consider = (id: string, x: number, y: number, tier: number) => {
    const d = Math.hypot(x - me.x, y - me.y);
    if (d > range || !clearLine(me, { x, y }, blockers)) return;
    out.push({ id, x, y, tier, d });
  };
  for (const t of view.turrets) {
    if (t.state === 'destroyed') continue;
    const onMe = t.targetId === me.id;
    consider(t.id, t.x, t.y, onMe && t.state === 'windup' ? 0 : onMe ? 1 : 2);
  }
  for (const o of view.objectives) if (!o.destroyed) consider(o.id, o.x, o.y, 3);
  out.sort((a, b) => a.tier - b.tier || a.d - b.d || (a.id < b.id ? -1 : 1));
  return out;
}

/** Picks the target: sticky on `currentId` unless a turret is winding up on us. */
export function pickTarget(
  view: WorldView,
  map: MapDef,
  me: { id: string; x: number; y: number },
  range: number,
  currentId: string | null,
): AimTarget | null {
  const ranked = rankTargets(view, map, me, range);
  if (ranked.length === 0) return null;
  const best = ranked[0]!;
  const current = currentId ? ranked.find((c) => c.id === currentId) : undefined;
  const pick = current && !(best.tier === 0 && current.tier !== 0) ? current : best;
  return { id: pick.id, x: pick.x, y: pick.y };
}

export type AutoFireMode = 'auto' | 'hold';

/** The reticle stops this far short of an auto-aim target (world units). */
export const RETICLE_SHORT_OF_TARGET = 36;

export interface AutoAimOptions {
  map: MapDef;
  tuning: Tuning;
  liveId: string;
  /** 'auto': fire whenever there's a target; 'hold': fire only while the base source fires. */
  fireMode(): AutoFireMode;
}

/**
 * Wraps an input source: with a target, aim at it (and set `aimDistance` to it); fire per
 * `fireMode`. The Grenadier's auto throw winds up to full and releases. Without a target, the
 * base input passes through unchanged.
 */
export class AutoAimInput implements InputSource {
  private target: AimTarget | null = null;
  private view: WorldView | null = null;
  private lastPos: Vec2 | null = null;

  constructor(
    private readonly base: InputSource,
    private readonly opts: AutoAimOptions,
  ) {}

  /** The current target (the renderer draws its marker). */
  get currentTarget(): AimTarget | null {
    return this.target;
  }

  read(soldierPos: Vec2): SoldierInput {
    const input = this.base.read(soldierPos);
    this.lastPos = soldierPos;
    const view = this.view;
    const me = view?.soldiers.find((s) => s.id === this.opts.liveId);
    if (!view || !me || !me.alive) {
      this.target = null;
      return input;
    }
    const range = autoAimRange(this.opts.tuning, me.roleId);
    this.target = pickTarget(view, this.opts.map, me, range, this.target?.id ?? null);
    if (!this.target) return input;
    const aim = Math.atan2(this.target.y - me.y, this.target.x - me.x);
    const aimDistance = Math.hypot(this.target.x - me.x, this.target.y - me.y);
    let fire = this.opts.fireMode() === 'auto' ? true : input.fire;
    // Throws need a release: once the wind-up is full, let go for a tick (that throws).
    if (fire && roleDef(me.roleId).weapon === 'grenade' && (me.windup ?? 0) >= 1) fire = false;
    return { ...input, aim, aimDistance, fire };
  }

  /**
   * The reticle ([D43]): with a target, along the line to it, stopping just short of it, so the
   * one reticle shows who's targeted. Otherwise wherever the base source puts it.
   */
  pointerWorld(): Vec2 | null {
    const t = this.target;
    const p = this.lastPos;
    if (t && p) {
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      const k = d > 0 ? Math.max(0, d - RETICLE_SHORT_OF_TARGET) / d : 0;
      return { x: p.x + (t.x - p.x) * k, y: p.y + (t.y - p.y) * k };
    }
    return this.base.pointerWorld();
  }

  observe(view: WorldView): void {
    this.view = view;
    this.base.observe?.(view);
  }

  aimTarget(): Vec2 | null {
    return this.target;
  }

  destroy(): void {
    this.base.destroy();
  }
}
