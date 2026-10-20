/**
 * Every gameplay number lives here. Values marked `// TUNE` are first guesses meant to be
 * adjusted by feel. The sim receives a `Tuning` object explicitly (never imports a global), so
 * tests, headless tools and the in-game settings panel can all run with different values.
 *
 * Booleans/enums here are design options the product owner wants to try by feel. Each says what
 * the alternatives do.
 *
 * Units: distances in world units (≈ px at zoom 1), speeds in units/second, times in seconds
 * unless the name says Ticks, angles in radians.
 */
export interface Tuning {
  soldier: {
    maxHp: number;
    /** Walking speed, units/second. */
    speed: number;
    /** Visual size of the sprite ([D14]: largest). */
    spriteRadius: number;
    /** Damage hitbox ([D14]: a bit smaller than the sprite). */
    hitboxRadius: number;
    /** Tiny soldier-vs-soldier blocker so soldiers can't fully overlap ([D14]). */
    blockerRadius: number;
    /** Radius used against walls and other static geometry. */
    wallRadius: number;
  };
  /** The soldier's hitscan rifle. */
  rifle: {
    damage: number;
    /** Max shot distance. Longer than the turret's range, so a turret can be out-ranged. */
    range: number;
    /** Minimum time between shots while fire is held. */
    cooldownSeconds: number;
  };
  /** Soft soldier-vs-soldier separation ([D14]): spring-like, capped, never a hard stop. */
  separation: {
    /** Fraction of the blocker overlap resolved per tick (0..1). */
    stiffness: number;
    /** Max distance a soldier is pushed per tick by separation. */
    maxPushPerTick: number;
  };
  interact: {
    /** Max distance from a soldier to an interactable (lever) to use it. */
    reach: number;
  };
  turret: {
    maxHp: number;
    /** Body radius: hit circle for shots. Its movement blocker is the bounding square. */
    radius: number;
    /** Detection and firing range. */
    range: number;
    /** Rotation speed, radians/second. */
    turnRate: number;
    /** How close the aim must be to the target before the wind-up starts, radians. */
    aimTolerance: number;
    /** Telegraph before each shot (readability). */
    windupSeconds: number;
    /** Pause after each shot before the next wind-up can start. */
    cooldownSeconds: number;
    damage: number;
    /**
     * true: keeps rotating toward its target during the wind-up and fires straight at it, so the
     * only escape is breaking line of sight. false: the aim freezes when the wind-up starts and
     * the shot goes where it was pointing, so sidestepping can dodge.
     */
    trackDuringWindup: boolean;
  };
  mine: {
    /** Body radius, for shots. */
    radius: number;
    /** An eligible soldier this close arms the fuse. */
    triggerRadius: number;
    fuseSeconds: number;
    /** Fuse for a mine set off by another mine's blast. */
    chainFuseSeconds: number;
    blastRadius: number;
    /** Damage to soldiers inside the blast. */
    blastDamage: number;
    /** Damage to turrets, vehicles, charges and objectives inside the blast. */
    hazardDamage: number;
    /** Whether blasts damage hazards/objectives at all (soldiers are always hurt). */
    damagesHazards: boolean;
  };
  vehicle: {
    maxHp: number;
    /** Default lane speed (a lane may override). */
    speed: number;
    /** Size along the lane direction. */
    length: number;
    /** Size across the lane. */
    width: number;
    /** Default spawn interval per lane (a lane may override). */
    intervalSeconds: number;
    /** Damage per tick to a soldier touching a moving vehicle. */
    contactDamage: number;
    /** Wrecks and stopped vehicles block shots and line of sight, i.e. they're cover. */
    wreckBlocksShots: boolean;
    /**
     * What a moving vehicle does when a wreck or stopped vehicle is ahead in its lane.
     * 'stop': it stops behind it, traffic backs up, and the road downstream of the wreck goes quiet.
     * 'passThrough': it drives through wrecks as if they weren't there.
     */
    blockedBehavior: 'stop' | 'passThrough';
    /** Bumper-to-bumper gap kept when stopping behind a blocker. */
    stopGap: number;
    /** true: each lane starts full at tick 0, as if traffic had always run. false: empty road. */
    prewarm: boolean;
  };
  bridge: {
    /** Time for a drawbridge to fully raise or lower. */
    raiseSeconds: number;
    /** Whether a raised (or moving) drawbridge blocks shots and line of sight. */
    raisedBlocksShots: boolean;
    /** HP of a destructible bridge's explosive charge. */
    chargeHp: number;
    chargeRadius: number;
    /** Damage to soldiers on a bridge when it's blown up (the lead-in HP floor still applies). */
    collapseDamage: number;
  };
  objective: {
    maxHp: number;
    /** Default radius when the map doesn't give one. */
    radius: number;
  };
  nav: {
    /** Walkability grid cell size. */
    cellSize: number;
    /** findPath snaps a blocked start/goal to the nearest walkable cell within this many cells. */
    snapRadiusCells: number;
  };
  /** Size of the world's recent-events ring buffer. */
  eventLogCapacity: number;
}

export const DEFAULT_TUNING: Tuning = {
  soldier: {
    maxHp: 100, // TUNE
    speed: 150, // TUNE
    spriteRadius: 16, // TUNE
    hitboxRadius: 11, // TUNE
    blockerRadius: 4, // TUNE
    wallRadius: 10, // TUNE
  },
  rifle: {
    damage: 25, // TUNE
    range: 520, // TUNE
    cooldownSeconds: 0.15, // TUNE
  },
  separation: {
    stiffness: 0.35, // TUNE
    maxPushPerTick: 1.2, // TUNE
  },
  interact: {
    reach: 48, // TUNE
  },
  turret: {
    maxHp: 200, // TUNE
    radius: 22, // TUNE
    range: 420, // TUNE
    turnRate: Math.PI, // TUNE: 180°/s
    aimTolerance: 0.15, // TUNE
    windupSeconds: 0.5, // TUNE
    cooldownSeconds: 0.6, // TUNE
    damage: 40, // TUNE: 3 hits kill a full-HP soldier
    trackDuringWindup: true, // TUNE
  },
  mine: {
    radius: 10, // TUNE
    triggerRadius: 40, // TUNE
    fuseSeconds: 0.6, // TUNE
    chainFuseSeconds: 0.15, // TUNE
    blastRadius: 90, // TUNE
    blastDamage: 150, // TUNE
    hazardDamage: 100, // TUNE
    damagesHazards: true, // TUNE
  },
  vehicle: {
    maxHp: 100, // TUNE
    speed: 420, // TUNE
    length: 110, // TUNE
    width: 60, // TUNE
    intervalSeconds: 2.5, // TUNE
    contactDamage: 1000, // TUNE: kills outright
    wreckBlocksShots: true, // TUNE
    blockedBehavior: 'stop', // TUNE
    stopGap: 12, // TUNE
    prewarm: true, // TUNE
  },
  bridge: {
    raiseSeconds: 1.5, // TUNE
    raisedBlocksShots: false, // TUNE
    chargeHp: 50, // TUNE
    chargeRadius: 12, // TUNE
    collapseDamage: 1000, // TUNE: kills outright
  },
  objective: {
    maxHp: 600, // TUNE
    radius: 40, // TUNE
  },
  nav: {
    cellSize: 16, // TUNE
    snapRadiusCells: 2, // TUNE
  },
  eventLogCapacity: 512, // TUNE
};

/** Deep-merges partial overrides onto a tuning object (used by tests and the settings panel). */
export function withTuning(base: Tuning, overrides: DeepPartial<Tuning>): Tuning {
  return deepMerge(base, overrides) as Tuning;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function deepMerge(base: unknown, over: unknown): unknown {
  if (over === undefined) return structuredClone(base);
  if (typeof base !== 'object' || base === null || typeof over !== 'object' || over === null) {
    return over;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over)) {
    out[k] = deepMerge((base as Record<string, unknown>)[k], v);
  }
  return out;
}
