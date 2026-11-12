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
 * - Candidates: live turrets and enemy soldiers, then live objectives, in weapon range, with a clear line past solid
 *   walls and closed gates (partial cover doesn't block: shots roll against it).
 * - Priority: a turret winding up on you > a turret tracking you > any other turret > objective;
 *   within a tier, the nearest (ties by id).
 * - Sticky: keep the current target while it's still a valid candidate, unless a turret starts
 *   winding up on you.
 */
import type { Tuning } from '../../content/tuning';
import { roleDef } from '../../content/roles';
import { hash01 } from '../../sim/core/hash';
import { damageShare, WORTH_SHOOTING } from '../../sim/combat/armor';
import { leadPoint, type Vec2 } from '../../sim/core/vec';
export { leadPoint };
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

/** Weapon reach for auto-aim, by role (PHASE12-a: and the gun in hand, `SoldierView.gun`). */
export function autoAimRange(
  tuning: Tuning,
  roleId: SoldierView['roleId'],
  gun?: SoldierView['gun'],
): number {
  switch (gun ?? roleDef(roleId).weapon) {
    case 'mg':
      return tuning.mg.range;
    case 'grenade':
      return tuning.grenade.maxRange;
    case 'pistol':
      return tuning.pistol.range;
    case 'sniper':
      return tuning.sniper.range;
    case 'shotgun':
      return tuning.shotgun.range;
    case 'rocket':
      return tuning.rocket.range;
    case 'shell':
      return tuning.shell.range;
    default:
      return tuning.rifle.range;
  }
}

/**
 * (PHASE12-a) Auto-aim's own error ([D59], [D62]), radians: a Sniper's rifle is bad against
 * moving targets (× their speed, a walk = 1), and a Bazooka is bad against people (vehicles
 * and structures get none). A deterministic jitter per tick and target.
 */
export function autoAimError(
  tuning: Tuning,
  gun: SoldierView['gun'],
  target: { id: string; soldier: boolean; speedFrac: number },
  tick: number,
): number {
  let size = 0;
  if (gun === 'sniper' && target.soldier) {
    size = tuning.sniper.movingTargetAimError * target.speedFrac;
  } else if (gun === 'rocket' && target.soldier) {
    size = tuning.rocket.soldierAimError;
  }
  return size > 0 ? (hash01(`autoaim@${tick}:${target.id}`) * 2 - 1) * size : 0;
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
  /** (PHASE12-a) The Bazooka goes for vehicles first ([D62]). */
  preferVehicles = false,
  /** (PHASE12-b) Share of a hit that gets through a soldier/vehicle of this role ([D70]). */
  share: (roleId: SoldierView['roleId']) => number = () => 1,
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
  if (preferVehicles) {
    for (const v of view.vehicles) if (v.state !== 'wreck') consider(v.id, v.x, v.y, -1);
  }
  // (07-d) Enemy soldiers are threats like turrets ([D44]).
  // (PHASE12-b) Units the weapon can barely hurt (a tank vs a rifle) come last, and (PHASE12-a)
  // a Bazooka goes for enemy vehicles first.
  for (const s of view.soldiers) {
    if (!s.alive || s.role !== 'enemy') continue;
    const armored = share(s.roleId) < WORTH_SHOOTING;
    const vehicle = s.roleId === 'truck' || s.roleId === 'tank';
    consider(s.id, s.x, s.y, preferVehicles && vehicle ? -1 : armored ? 4 : 2);
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
  preferVehicles = false,
  share?: (roleId: SoldierView['roleId']) => number,
): AimTarget | null {
  const ranked = rankTargets(view, map, me, range, preferVehicles, share);
  if (ranked.length === 0) return null;
  const best = ranked[0]!;
  const current = currentId ? ranked.find((c) => c.id === currentId) : undefined;
  const pick = current && !(best.tier <= 0 && current.tier > best.tier) ? current : best;
  return { id: pick.id, x: pick.x, y: pick.y };
}

export type AutoFireMode = 'auto' | 'hold';

/**
 * (PHASE12-d) Would an explosive landing at `at` catch one of ours (the shooter included) in
 * its blast? Auto-aim holds fire then, so the Bazooka doesn't blow up its friends.
 */
export function friendlyInBlast(view: WorldView, at: Vec2, radius: number): boolean {
  return view.soldiers.some(
    (s) =>
      s.alive &&
      (s.role === 'live' || s.role === 'echo') &&
      Math.hypot(s.x - at.x, s.y - at.y) <= radius,
  );
}

/** The reticle stops this far short of an auto-aim target (world units). */
export const RETICLE_SHORT_OF_TARGET = 36;

export interface AutoAimOptions {
  map: MapDef;
  tuning: Tuning;
  liveId: string;
  /** 'auto': fire whenever there's a target; 'hold': fire only while the base source fires. */
  fireMode(): AutoFireMode;
  /** (PHASE12-d) Auto-aim on for this role? (settings per role; default every role.) */
  enabledFor?(roleId: SoldierView['roleId']): boolean;
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
  /** (PHASE12-a) Positions one view ago (target speed: the Sniper's error, rocket leading). */
  private prevSoldiers = new Map<string, Vec2>();
  private prevTicks = 1;

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
    // (PHASE12-d) Off for this role, or the player is aiming by hand (tap-to-aim): pass through.
    if (this.opts.enabledFor?.(me.roleId) === false || this.base.manualAim?.()) {
      this.target = null;
      return input;
    }
    const range = autoAimRange(this.opts.tuning, me.roleId, me.gun);
    const rockets = me.gun === 'rocket' || me.gun === 'shell';
    const kind = me.gun ?? (roleDef(me.roleId).weapon === 'grenade' ? 'grenade' : 'rifle');
    const tuning = this.opts.tuning;
    this.target = pickTarget(
      view,
      this.opts.map,
      me,
      range,
      this.target?.id ?? null,
      rockets,
      (r) => damageShare(tuning, kind, r),
    );
    if (!this.target) return input;
    const tgt = this.target;
    const sv = view.soldiers.find((s) => s.id === tgt.id);
    const prev = this.prevSoldiers.get(tgt.id);
    const walk = this.opts.tuning.soldier.speed / 60;
    const vel = prev
      ? { x: (tgt.x - prev.x) / this.prevTicks, y: (tgt.y - prev.y) / this.prevTicks }
      : { x: 0, y: 0 };
    const speedFrac = sv ? Math.hypot(vel.x, vel.y) / walk : 0;
    const isVehicle = sv
      ? sv.roleId === 'truck' || sv.roleId === 'tank'
      : view.vehicles.some((v) => v.id === tgt.id);
    // (PHASE12-d) A rocket or shell is slow: lead a moving vehicle so it meets it.
    const projectile =
      me.gun === 'rocket' ? tuning.rocket.speed : me.gun === 'shell' ? tuning.shell.speed : 0;
    const aimAt =
      projectile > 0 && isVehicle
        ? leadPoint(me, tgt, vel, projectile / 60)
        : { x: tgt.x, y: tgt.y };
    const err = autoAimError(
      this.opts.tuning,
      me.gun,
      // (PHASE12-b) Vehicles aren't "people" for the Bazooka's error ([D62]).
      { id: tgt.id, soldier: !!sv && !isVehicle, speedFrac },
      view.tick,
    );
    const aim = Math.atan2(aimAt.y - me.y, aimAt.x - me.x) + err;
    const aimDistance = Math.hypot(aimAt.x - me.x, aimAt.y - me.y);
    let fire = this.opts.fireMode() === 'auto' ? true : input.fire;
    // (PHASE12-d) Never set off an explosive on our own soldiers (or ourselves).
    const weapon = roleDef(me.roleId).weapon;
    const blast =
      weapon === 'rocket'
        ? tuning.rocket.blastRadius
        : weapon === 'shell'
          ? tuning.shell.blastRadius
          : weapon === 'grenade'
            ? tuning.grenade.blastRadius * 1.5
            : 0;
    if (fire && blast > 0 && friendlyInBlast(view, aimAt, blast + tuning.soldier.hitboxRadius)) {
      fire = false;
    }
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
    if (this.view && this.view.tick !== view.tick) {
      this.prevSoldiers = new Map([
        ...this.view.soldiers.map((s) => [s.id, { x: s.x, y: s.y }] as const),
        ...this.view.vehicles.map((v) => [v.id, { x: v.x, y: v.y }] as const),
      ]);
      this.prevTicks = Math.max(1, view.tick - this.view.tick);
    }
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
