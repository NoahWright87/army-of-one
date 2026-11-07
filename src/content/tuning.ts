import type { CoverMaterial } from '../sim/world/map';

/**
 * (07-c) A gun's spread ([D39]): every shot goes out at a random angle within ± the current
 * spread (half-angle, radians) = baseSpread + movingSpread × (share of full speed moved) + recoil.
 * Each shot adds `kick` to the recoil (capped at `maxRecoil`); it recovers at `recoveryPerSecond`.
 * Tapping stays accurate; holding the trigger sprays.
 */
export interface GunSpread {
  baseSpread: number;
  movingSpread: number;
  kick: number;
  maxRecoil: number;
  recoveryPerSecond: number;
}

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
    /**
     * (07-e) Sprint ([D49]): speed × this while sprint is held and the soldier moves. Can't fire
     * or throw while sprinting.
     */
    sprintMultiplier: number;
  };
  /** The soldier's hitscan rifle. (07-c) Spread and recoil: see `GunSpread` ([D39]). */
  rifle: {
    damage: number;
    /** Max shot distance. Longer than the turret's range, so a turret can be out-ranged. */
    range: number;
    /** Minimum time between shots while fire is held. */
    cooldownSeconds: number;
  } & GunSpread;
  /**
   * (07-c) The Machine Gunner's MG ([D40]): fast fire, big recoil, unless mounted. Standing still
   * next to non-solid cover for `mountSeconds` mounts it; while mounted and firing across that
   * cover, `mounted` replaces the spread numbers. Moving unmounts it at once.
   */
  mg: {
    damage: number;
    range: number;
    cooldownSeconds: number;
    mountSeconds: number;
    /** Fire counts as "across the cover" if the aim ray enters a braced piece this close. */
    braceReach: number;
    mounted: Pick<GunSpread, 'baseSpread' | 'kick' | 'maxRecoil'>;
  } & GunSpread;
  /** (07-c) Real-time cover ([D32]–[D34]). */
  cover: {
    /** Share of straight shots / lobbed objects each material stops, 0..1. */
    materials: Record<CoverMaterial, { bullet: number; lobbed: number }>;
    /** A shooter this close (to the cover's nearest edge) fires over cover below `fireOverBelow`. */
    fireOverDistance: number;
    /** Cover strictly below this value can be fired over from close up (1 = anything not solid). */
    fireOverBelow: number;
    /** Cover cuts sight past it: remaining sight × (1 − cover) ([D33]). false: cover is see-through. */
    obscuresSight: boolean;
    /** The live soldier's cover arcs show for cover and walls this close ([D34]). */
    indicatorRadius: number;
  };
  /**
   * (07-c) The Grenadier's frag grenade ([D37]). Hold fire to wind up (a ring fills); the aimed
   * distance sets the wind-up time, and releasing early throws shorter. Flight has a height, so it
   * bounces off the ground and off cover, rolls, then explodes on its fuse: a small blast plus
   * fragments that fly like bullets. Hurts everyone, your own soldiers included.
   */
  grenade: {
    /** Throws land no nearer than this, and no farther than `maxRange`. */
    minRange: number;
    maxRange: number;
    /** Wind-up = base + perUnit × aimed distance (a longer throw takes longer to wind up). */
    windupBaseSeconds: number;
    windupSecondsPerUnit: number;
    /** After a throw, before the next wind-up can start. */
    cooldownSeconds: number;
    /** From the throw. */
    fuseSeconds: number;
    /** Horizontal speed at release; the arc is set so the first landing is at the throw distance. */
    throwSpeed: number;
    /** Downward acceleration, units/s². */
    gravity: number;
    /** Share of vertical speed kept on a ground bounce. */
    groundRestitution: number;
    /** Share of horizontal speed kept on a ground bounce. */
    groundFriction: number;
    /** Below this vertical speed a landing stops bouncing and starts rolling. */
    minBounceSpeed: number;
    /** Rolling friction: horizontal deceleration on the ground, units/s². */
    rollDeceleration: number;
    /** Share of speed into a wall/cover kept on a bounce (along the wall it keeps `wallSlide`). */
    wallRestitution: number;
    wallSlide: number;
    /** Below this height the grenade is rolling, and any cover stops it (no lobbing over). */
    groundedHeight: number;
    /** Spread of a throw at a full run: ± radians and ± share of the distance. */
    movingSpread: number;
    movingDistanceSpread: number;
    /** The central blast. */
    blastRadius: number;
    blastDamage: number;
    /** Damage to turrets, vehicles, charges and objectives in the blast. */
    hazardDamage: number;
    /** Fragments: hitscan rays in a ring, rolling against cover like bullets. */
    fragments: number;
    fragmentRange: number;
    fragmentDamage: number;
  };
  /** (07-d) Enemy soldier AI ([D44]–[D47]). Role personalities live in roles.ts (`ai`). */
  ai: {
    /** Spawn the maps' enemy squads (tests of older stories turn this off). */
    enabled: boolean;
    /** A dormant enemy wakes when one of our soldiers comes this close… */
    wakeRadius: number;
    /** …and goes dormant again (back at its post) once none is within this. */
    sleepRadius: number;
    /** How often an awake soldier re-decides (staggered per soldier). */
    thinkSeconds: number;
    /** Max distance it can spot one of ours (cover cuts it further, [D33]). */
    sightRange: number;
    /** Remembers a target's last seen position this long. */
    memorySeconds: number;
    /** Delay between first seeing a target and firing at it. */
    reactionSeconds: number;
    /** ± aim error (radians) on top of the gun's own spread; re-rolled each decision. */
    aimError: number;
    /** Sticks with a behaviour at least this long unless something urgent comes up. */
    commitSeconds: number;
    /** Looks for cover this far away. */
    coverSearchRadius: number;
    /** Scatters from a grenade this close. */
    evadeRadius: number;
    /** Enemies of ours within this count toward its danger; allies within `allyRadius`. */
    dangerRadius: number;
    allyRadius: number;
    /** Checks at most this many nearest candidates for line of sight per decision. */
    maxCandidates: number;
    /** Re-plans a path at most this often. */
    replanSeconds: number;
    /**
     * (07-e) Extra ± aim error (radians) against a moving target, × how fast it moves (1 = a
     * walk, sprinting is more) ([D50]). Re-rolled every tick, so moving targets get missed.
     */
    movingTargetError: number;
    /** (07-e) AI soldiers sprint to cover under fire, away from grenades and when retreating. */
    sprints: boolean;
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
    /** (07-c) Turrets have recoil too ([D39]); `movingSpread` is unused (they don't move). */
  } & GunSpread;
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
  /** (05-a) Battlefield 2-style capture points ([D10]–[D12]). */
  capture: {
    /** Default capture radius when the map doesn't give one. */
    radius: number;
    /** Seconds for ONE soldier to complete one stage (lower the enemy flag, or raise ours). */
    stageSeconds: number;
    /**
     * More soldiers capture faster ([D10]): rate = (1 / stageSeconds) × min(n, maxContributors)^
     * contributorExponent. With 0.6: 2 soldiers ≈ 1.5×, 3 ≈ 1.9×, 6 ≈ 2.9×.
     */
    contributorExponent: number;
    /** Soldiers beyond this many don't speed the capture up further. */
    maxContributors: number;
    /**
     * Empty-circle decay ([D12]), progress per second: decayBasePerSecond × (1 + decayAccel ×
     * emptySeconds²). Defaults: a 0.5 s step-out loses ≈ 3 %, 1 s ≈ 8 %, 2 s ≈ 32 %, 3 s ≈ 90 %.
     */
    decayBasePerSecond: number;
    decayAccel: number;
  };
  nav: {
    /** Walkability grid cell size. */
    cellSize: number;
    /** findPath snaps a blocked start/goal to the nearest walkable cell within this many cells. */
    snapRadiusCells: number;
  };
  /** (03-a) How echoes follow their recorded schedule ([E1], [E8], [D24]). */
  echo: {
    /**
     * Max speed multiplier for an off-schedule echo catching up (it may "cheat" a little, [E1]).
     * It's never early: it moves at min(remaining path / ticks left, speed × catchUpFactor).
     */
    catchUpFactor: number;
    /**
     * An echo snaps to its scheduled pose when that pose is within this distance and the straight
     * move there is unobstructed. Also how far it may be off before it counts as off schedule.
     * Must exceed one tick of walking plus a separation push (≈ 2.5 + 1.2 by default).
     */
    snapDistance: number;
    /** A straight move counts as unobstructed if collision moves the end by at most this much. */
    blockEpsilon: number;
    /** Off schedule, the echo pathfinds toward where it should be this far ahead. */
    lookaheadSeconds: number;
    /** Off schedule, it replans at least this often (and whenever it reaches its lookahead). */
    replanSeconds: number;
    /** Lag (ticks it would arrive late at its lookahead point) tolerated without counting. */
    lateToleranceSeconds: number;
    /** Lag beyond tolerance for this long (or no path in time for this long) interrupts it. */
    lateGraceSeconds: number;
    /** A recorded shot/interact replays only if the echo is this close to the recorded origin. */
    actionTolerance: number;
    /**
     * How an echo replays a recorded lever press ([Q8]). 'toggle': it presses the lever again,
     * whatever state the gate/bridge is in now (a literal replay: if someone already opened the
     * gate, the echo closes it). 'restoreState': it only presses if that brings the target to
     * the state the original press produced (if the gate is already open, it leaves it open).
     */
    replayInteract: 'toggle' | 'restoreState';
    /**
     * (07-b) How echoes of auto-aimed lives replay ([Q22]). 'recorded' (the only value for now):
     * they fire the recorded shots like any echo ([E1]). A future 'retarget' would re-aim at
     * whatever is valid now.
     */
    autoAimReplay: 'recorded';
  };
  /** (03-a) Attempt runner and background resolve passes. */
  attempt: {
    /** World snapshots ([E4]) are taken every this many ticks. */
    snapshotIntervalTicks: number;
    /** A resolve pass ([D23]) reports partial observations every this many ticks. */
    resolveProgressIntervalTicks: number;
    /**
     * (05-b) Snapshot thinning: snapshots more than this far behind the newest one are kept
     * only every `snapshotSparseEveryTicks`. Saves memory with big armies; costs a longer
     * fast-forward (≤ the sparse interval) when deploying into old battle time. 0 = keep all.
     */
    snapshotDenseWindowTicks: number;
    snapshotSparseEveryTicks: number;
  };
  /** (04) New-soldier spawning and the deploy lead-in ([D7], [D5], [D25]). */
  spawn: {
    /** Gap between successive new soldiers at the same spawn point ([D7]). */
    intervalSeconds: number;
    /** Countdown before control on every deploy ([D5], [D25]). */
    leadInSeconds: number;
  };
  /** (04) Real-time pause on the frozen battlefield with a "KIA" caption after the live soldier dies. */
  deathBeatSeconds: number;
  /** (04) Battle time between in-progress autosaves while a life is played ([D6], [D20]). */
  autosaveIntervalSeconds: number;
  /** Size of the world's recent-events ring buffer. */
  eventLogCapacity: number;
  /**
   * (06-b) Revealed map ([D29]): what the soldiers have seen in the current truth. UI only (the
   * sim never reads it); used by the respawn-screen map and the in-game minimap.
   */
  reveal: {
    /** A soldier reveals everything within this distance of where it was alive. */
    radius: number;
    /** Fog grid cell size (world units). Smaller = finer edges, more work. */
    cellSize: number;
    /**
     * false: a plain radius (basic map). true: static walls block the reveal (line of sight on
     * the fog grid, so thin walls are approximate).
     */
    occludeByWalls: boolean;
    /** Recordings are sampled every this many ticks (gaps are interpolated). */
    sampleTicks: number;
  };
  /**
   * (PHASE11) Money on the timeline ([D51]–[D54]). UI and flow only: the sim never reads it.
   * Maps may override the start and base income (`map.economy`) and each capture point's
   * income (`capturePoint.income`). Role prices are `cost` in roles.ts.
   */
  economy: {
    /** Off: every role is free and no money is shown. */
    enabled: boolean;
    startMoney: number;
    /** Income per second of battle time, whatever happens ([D52]). */
    baseIncomePerSecond: number;
    /** Extra income per second while a capture point is ours. */
    captureIncomePerSecond: number;
    /** One-time bounty per enemy loss ([D53]). */
    bounty: {
      rifleman: number;
      grenadier: number;
      gunner: number;
      turret: number;
      vehicle: number;
      mine: number;
    };
  };
}

export const DEFAULT_TUNING: Tuning = {
  soldier: {
    maxHp: 100, // TUNE
    speed: 190, // TUNE
    spriteRadius: 16, // TUNE
    hitboxRadius: 11, // TUNE
    blockerRadius: 4, // TUNE
    wallRadius: 10, // TUNE
    sprintMultiplier: 1.6, // TUNE
  },
  rifle: {
    damage: 25, // TUNE
    range: 520, // TUNE
    cooldownSeconds: 0.15, // TUNE
    baseSpread: 0, // TUNE: a tap from a standing rifleman is exact
    movingSpread: 0.1, // TUNE: about ±6° at a full run
    kick: 0.04, // TUNE
    maxRecoil: 0.12, // TUNE
    recoveryPerSecond: 0.2, // TUNE: held fire blooms slowly; a tap every 0.2 s stays exact
  },
  mg: {
    damage: 14, // TUNE
    range: 560, // TUNE
    cooldownSeconds: 0.07, // TUNE: ~14 shots/s
    baseSpread: 0.03, // TUNE
    movingSpread: 0.25, // TUNE: firing on the move sprays
    kick: 0.05, // TUNE
    maxRecoil: 0.32, // TUNE
    recoveryPerSecond: 0.4, // TUNE
    mountSeconds: 0.6, // TUNE
    braceReach: 60, // TUNE
    mounted: {
      baseSpread: 0.005, // TUNE
      kick: 0.006, // TUNE
      maxRecoil: 0.04, // TUNE
    },
  },
  cover: {
    materials: {
      fence: { bullet: 0.1, lobbed: 0.5 }, // TUNE: chain link: bullets go through, grenades bounce
      sandbags: { bullet: 0.5, lobbed: 0.15 }, // TUNE: half cover, easy to lob over
      halfWall: { bullet: 0.6, lobbed: 0.15 }, // TUNE
      window: { bullet: 0.3, lobbed: 0.4 }, // TUNE: an opening in a wall (frame + sill)
      bunkerWindow: { bullet: 0.9, lobbed: 0.7 }, // TUNE: a narrow armored slit
      crate: { bullet: 0.75, lobbed: 0.3 }, // TUNE
    },
    fireOverDistance: 30, // TUNE: about a soldier's width from the edge
    fireOverBelow: 1, // TUNE: anything that isn't solid
    obscuresSight: true, // TUNE
    indicatorRadius: 30, // TUNE: same as fireOverDistance
  },
  grenade: {
    minRange: 60, // TUNE
    maxRange: 420, // TUNE: a bit under the rifle's range
    windupBaseSeconds: 0.2, // TUNE
    windupSecondsPerUnit: 0.0022, // TUNE: max range ≈ 1.1 s
    cooldownSeconds: 0.6, // TUNE
    fuseSeconds: 2.2, // TUNE
    throwSpeed: 480, // TUNE
    gravity: 900, // TUNE
    groundRestitution: 0.3, // TUNE
    groundFriction: 0.45, // TUNE
    minBounceSpeed: 70, // TUNE
    rollDeceleration: 520, // TUNE
    wallRestitution: 0.5, // TUNE
    wallSlide: 0.7, // TUNE
    groundedHeight: 3, // TUNE
    movingSpread: 0.15, // TUNE: about ±9°
    movingDistanceSpread: 0.2, // TUNE
    blastRadius: 40, // TUNE: small; the fragments do the reach
    blastDamage: 90, // TUNE
    hazardDamage: 120, // TUNE
    fragments: 14, // TUNE
    fragmentRange: 170, // TUNE
    fragmentDamage: 30, // TUNE
  },
  ai: {
    enabled: true,
    wakeRadius: 900, // TUNE: about a screen and a half
    sleepRadius: 1300, // TUNE
    thinkSeconds: 0.25, // TUNE
    sightRange: 600, // TUNE
    memorySeconds: 4, // TUNE
    reactionSeconds: 0.45, // TUNE: [D47] beatable on purpose
    aimError: 0.05, // TUNE: about ±3°
    commitSeconds: 0.8, // TUNE
    coverSearchRadius: 260, // TUNE
    evadeRadius: 140, // TUNE
    dangerRadius: 500, // TUNE
    allyRadius: 260, // TUNE
    maxCandidates: 6, // TUNE
    replanSeconds: 1, // TUNE
    movingTargetError: 0.12, // TUNE: ±7° at a walk, ±11° at a sprint
    sprints: true, // TUNE
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
    cooldownSeconds: 0.45, // TUNE
    damage: 40, // TUNE: 3 hits kill a full-HP soldier
    trackDuringWindup: true, // TUNE
    baseSpread: 0, // TUNE
    movingSpread: 0,
    kick: 0.03, // TUNE: recovers fully between its shots at the default timings
    maxRecoil: 0.1, // TUNE
    recoveryPerSecond: 0.2, // TUNE
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
  capture: {
    radius: 110, // TUNE
    stageSeconds: 4, // TUNE: one soldier takes 8 s for both stages
    contributorExponent: 0.6, // TUNE
    maxContributors: 6, // TUNE
    decayBasePerSecond: 0.05, // TUNE
    decayAccel: 1.667, // TUNE: ~3 s empty drains a 90 % bar ([D12])
  },
  nav: {
    cellSize: 16, // TUNE
    snapRadiusCells: 2, // TUNE
  },
  echo: {
    catchUpFactor: 1.25, // TUNE
    snapDistance: 4, // TUNE
    blockEpsilon: 0.05, // TUNE
    lookaheadSeconds: 0.5, // TUNE
    replanSeconds: 0.25, // TUNE
    lateToleranceSeconds: 0.75, // TUNE
    lateGraceSeconds: 1, // TUNE
    actionTolerance: 12, // TUNE: about a hitbox radius
    replayInteract: 'toggle', // TUNE
    autoAimReplay: 'recorded',
  },
  attempt: {
    snapshotIntervalTicks: 60, // TUNE: 1 s of battle time [E4]
    resolveProgressIntervalTicks: 60, // TUNE
    snapshotDenseWindowTicks: 3600, // TUNE: last 60 s of battle time stay at 1 s density
    snapshotSparseEveryTicks: 300, // TUNE: older battle time every 5 s (0 = no thinning)
  },
  spawn: {
    intervalSeconds: 2, // TUNE [D7]
    leadInSeconds: 5, // TUNE [D5]
  },
  deathBeatSeconds: 0.6, // TUNE (06-c: was 1; [D28] cut the waits)
  autosaveIntervalSeconds: 5, // TUNE
  eventLogCapacity: 512, // TUNE
  reveal: {
    radius: 480, // TUNE: about half a screen at zoom 1
    cellSize: 64, // TUNE
    occludeByWalls: false, // TUNE
    sampleTicks: 30, // TUNE: 0.5 s; the gaps between samples are interpolated
  },
  economy: {
    enabled: true,
    startMoney: 100, // TUNE [D51] (owner's example)
    baseIncomePerSecond: 1, // TUNE [D51]
    captureIncomePerSecond: 2, // TUNE [D51]
    bounty: {
      rifleman: 5, // TUNE
      grenadier: 8, // TUNE
      gunner: 10, // TUNE
      turret: 20, // TUNE
      vehicle: 5, // TUNE
      mine: 2, // TUNE
    },
  },
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
