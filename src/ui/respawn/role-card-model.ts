/**
 * The role card shown in the role menu: three stat groups, all derived from `Tuning` so the
 * numbers stay true when tuning changes (pure; no DOM).
 *
 *  - Survivability: bar = HP, shields = armor (1 per 20 %, the best direction), arrows = regen.
 *  - Lethality: bar = damage per second as a span (low → high: e.g. a rocket at a soldier → at a
 *    vehicle); range = its own span bar; accuracy = a bar; a burst glyph marks explosive weapons.
 *  - Maneuverability: bar = walk speed, lighter extension = sprint.
 *
 * Soldiers and vehicles use separate scales so the bars compare within a group.
 */
import { ROLES, roleDef } from '../../content/roles';
import type { Tuning } from '../../content/tuning';
import type { RoleId } from '../../contracts/mission';

export interface Span {
  min: number;
  max: number;
}

export interface RoleCard {
  roleId: RoleId;
  vehicle: boolean;
  survivability: {
    hp: number;
    /** 0..1 along the group's scale. */
    hpShare: number;
    armor: number;
    /** Shield icons: one per 20 % armor (at least one for any armor). */
    shields: number;
    regenPerSecond: number;
    /** 0..4 arrows. */
    regenArrows: number;
  };
  lethality: {
    /** Damage per second, low → high. */
    dps: Span;
    /** The same as shares of the group's scale. */
    dpsShare: Span;
    range: Span;
    rangeShare: Span;
    /** 0 (sprays) … 1 (pinpoint): an absolute scale, not relative to the group. */
    accuracyShare: number;
    /** Half-angle of the cone in degrees: standing still, and at a full run. */
    spreadStandDeg: number;
    spreadMoveDeg: number;
    explosive: boolean;
    /** Raw numbers for the tooltip. */
    detail: LethalityDetail;
  };
  mobility: {
    walk: number;
    sprint: number;
    walkShare: number;
    sprintShare: number;
    /** Vehicles: how sharply they turn (radians/s) and how fast they pick up speed. */
    turnRate?: number;
    accel?: number;
  };
}

export interface LethalityDetail {
  /** Damage per hit/shot at the low end, and at the high end (against vehicles, up close…). */
  low: number;
  high: number;
  /** Seconds between shots. */
  every: number;
  /** What the low and high ends are. */
  kind: 'single' | 'falloff' | 'blast' | 'antiVehicle';
}

const REGEN_ARROW_STEP = 2; // TUNE: HP per second per arrow
const SHIELD_STEP = 0.2; // [user spec] 1 shield per 20 % armor

const r0 = (n: number): number => Math.round(n);
const deg = (rad: number): number => Math.round(((rad * 180) / Math.PI) * 10) / 10;

function isVehicle(roleId: RoleId): boolean {
  return roleDef(roleId).vehicle !== undefined;
}

interface Raw {
  dps: Span;
  range: Span;
  spread: number;
  explosive: boolean;
  detail: LethalityDetail;
}

function gun(
  damage: number,
  every: number,
  range: number,
  base: number,
  moving: number,
): Pick<Raw, 'dps' | 'range' | 'spread' | 'detail'> {
  const dps = damage / every;
  return {
    dps: { min: dps, max: dps },
    range: { min: 0, max: range },
    spread: base + moving / 2,
    detail: { low: damage, high: damage, every, kind: 'single' },
  };
}

function rawLethality(t: Tuning, roleId: RoleId): Raw {
  switch (roleDef(roleId).weapon) {
    case 'rifle':
      return {
        ...gun(
          t.rifle.damage,
          t.rifle.cooldownSeconds,
          t.rifle.range,
          t.rifle.baseSpread,
          t.rifle.movingSpread,
        ),
        explosive: false,
      };
    case 'mg':
      return {
        ...gun(t.mg.damage, t.mg.cooldownSeconds, t.mg.range, t.mg.baseSpread, t.mg.movingSpread),
        explosive: false,
      };
    case 'pistol':
      return {
        ...gun(
          t.pistol.damage,
          t.pistol.cooldownSeconds,
          t.pistol.range,
          t.pistol.baseSpread,
          t.pistol.movingSpread,
        ),
        explosive: false,
      };
    case 'sniper':
      return {
        ...gun(
          t.sniper.damage,
          t.sniper.cooldownSeconds,
          t.sniper.range,
          // The card shows the Sniper settled (prone), which is what it's for ([D160]).
          t.sniper.baseSpread *
            (1 - t.stance.noCoverShare.prone * (1 - t.sniper.coverSpreadMultiplier)),
          0,
        ),
        explosive: false,
      };
    case 'shotgun': {
      const s = t.shotgun;
      const full = (s.pellets * s.pelletDamage) / s.cooldownSeconds;
      return {
        dps: { min: full * s.falloffTo, max: full },
        range: { min: 0, max: s.range },
        spread: s.pelletSpread,
        explosive: false,
        detail: {
          low: s.pellets * s.pelletDamage * s.falloffTo,
          high: s.pellets * s.pelletDamage,
          every: s.cooldownSeconds,
          kind: 'falloff',
        },
      };
    }
    case 'grenade': {
      const g = t.grenade;
      return {
        dps: { min: g.fragmentDamage / g.cooldownSeconds, max: g.blastDamage / g.cooldownSeconds },
        range: { min: g.minRange, max: g.maxRange },
        spread: g.movingSpread / 2,
        explosive: true,
        detail: {
          low: g.fragmentDamage,
          high: g.blastDamage,
          every: g.cooldownSeconds,
          kind: 'blast',
        },
      };
    }
    case 'rocket': {
      const r = t.rocket;
      const soldier = r.directDamage + r.blastDamage;
      return {
        dps: { min: soldier / r.cooldownSeconds, max: r.vehicleDamage / r.cooldownSeconds },
        // Closer than its blast, a hit is as dangerous to the shooter as to the target.
        range: { min: r.blastRadius, max: r.range },
        spread: r.baseSpread + r.movingSpread / 2,
        explosive: true,
        detail: {
          low: soldier,
          high: r.vehicleDamage,
          every: r.cooldownSeconds,
          kind: 'antiVehicle',
        },
      };
    }
    case 'shell': {
      const s = t.shell;
      const soldier = s.directDamage + s.blastDamage;
      return {
        dps: { min: soldier / s.cooldownSeconds, max: s.vehicleDamage / s.cooldownSeconds },
        range: { min: 0, max: s.range },
        spread: s.baseSpread + s.movingSpread / 2,
        explosive: true,
        detail: {
          low: soldier,
          high: s.vehicleDamage,
          every: s.cooldownSeconds,
          kind: 'antiVehicle',
        },
      };
    }
  }
}

const SPREAD_WORST = 0.17; // TUNE: radians; at or past this the accuracy bar is empty

function accuracyOf(spread: number): number {
  return Math.max(0, Math.min(1, 1 - spread / SPREAD_WORST));
}

/** Spread (half-angle, radians) standing still and at a full run. */
function spreadOf(t: Tuning, roleId: RoleId): { stand: number; move: number } {
  const g = (x: { baseSpread: number; movingSpread: number }) => ({
    stand: x.baseSpread,
    move: x.baseSpread + x.movingSpread,
  });
  switch (roleDef(roleId).weapon) {
    case 'rifle':
      return g(t.rifle);
    case 'mg':
      return g(t.mg);
    case 'pistol':
      return g(t.pistol);
    case 'sniper':
      return g(t.sniper);
    case 'shotgun':
      return {
        stand: t.shotgun.pelletSpread,
        move: t.shotgun.pelletSpread + t.shotgun.movingSpread,
      };
    case 'grenade':
      return { stand: 0, move: t.grenade.movingSpread };
    case 'rocket':
      return g(t.rocket);
    case 'shell':
      return g(t.shell);
  }
}

/** Largest armor share in any direction, and its shield icons. */
export function armorShields(armor: number): number {
  if (!(armor > 0)) return 0;
  return Math.max(1, Math.round(armor / SHIELD_STEP));
}

interface Base {
  hp: number;
  armor: number;
  raw: Raw;
  walk: number;
  sprint: number;
}

function baseOf(t: Tuning, roleId: RoleId): Base {
  const a = t.armor.roles[roleId];
  const armor = a ? Math.max(a.front, a.side, a.rear) : 0;
  const rs = t.roleStats[roleId];
  const vehicle = isVehicle(roleId);
  const walk = vehicle
    ? t.drive[roleDef(roleId).vehicle === 'tank' ? 'tank' : 'truck'].maxSpeed
    : t.soldier.speed * rs.speed;
  return {
    hp: t.soldier.maxHp * rs.hp,
    armor,
    raw: rawLethality(t, roleId),
    walk,
    sprint: vehicle ? walk : walk * t.soldier.sprintMultiplier,
  };
}

const max = (xs: number[]): number => Math.max(1e-9, ...xs);

export function roleCard(t: Tuning, roleId: RoleId): RoleCard {
  const vehicle = isVehicle(roleId);
  const group = ROLES.filter((r) => isVehicle(r.id) === vehicle).map((r) => baseOf(t, r.id));
  const b = baseOf(t, roleId);
  const hpMax = max(group.map((g) => g.hp));
  const dpsMax = max(group.map((g) => g.raw.dps.max));
  const rangeMax = max(group.map((g) => g.raw.range.max));
  const speedMax = max(group.map((g) => g.sprint));
  const regen = vehicle ? 0 : Math.max(0, t.soldier.regen.perSecond);
  const drive = vehicle
    ? t.drive[roleDef(roleId).vehicle === 'tank' ? 'tank' : 'truck']
    : undefined;
  return {
    roleId,
    vehicle,
    survivability: {
      hp: r0(b.hp),
      hpShare: b.hp / hpMax,
      armor: b.armor,
      shields: armorShields(b.armor),
      regenPerSecond: regen,
      regenArrows: regen > 0 ? Math.min(4, Math.ceil(regen / REGEN_ARROW_STEP)) : 0,
    },
    lethality: {
      dps: { min: r0(b.raw.dps.min), max: r0(b.raw.dps.max) },
      dpsShare: { min: b.raw.dps.min / dpsMax, max: b.raw.dps.max / dpsMax },
      range: { min: r0(b.raw.range.min), max: r0(b.raw.range.max) },
      rangeShare: { min: b.raw.range.min / rangeMax, max: b.raw.range.max / rangeMax },
      accuracyShare: accuracyOf(b.raw.spread),
      spreadStandDeg: deg(spreadOf(t, roleId).stand),
      spreadMoveDeg: deg(spreadOf(t, roleId).move),
      explosive: b.raw.explosive,
      detail: b.raw.detail,
    },
    mobility: {
      walk: r0(b.walk),
      sprint: r0(b.sprint),
      walkShare: b.walk / speedMax,
      sprintShare: b.sprint / speedMax,
      ...(drive ? { turnRate: drive.turnRate, accel: drive.accel } : {}),
    },
  };
}
