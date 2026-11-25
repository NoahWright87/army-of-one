/**
 * (PHASE18) Basic training's drill sergeant, as a script ([D160]). Plain data, so the in-game
 * editor (the pencil button on the training mission) can change anything here and play it again
 * at once. This file is the default; local edits are layered on top and kept in localStorage.
 *
 * NOTE: unlike the rest of the game's text (strings.ts), Sarge's words live here, so that the
 * person writing them edits them in one place.
 *
 * A BEAT says one thing when its `when` holds. `when` is a comma-separated list of TOKENS, all of
 * which must hold; `!` in front of a token negates it. Tokens come in two kinds:
 *
 *   EDGES are true for the one moment something happens:
 *     lifeStart            a new soldier's life begins
 *     enter:<room>         you walk into a room (r0 r1 r2 r3 r4 r5f r5 r6f r6 r7)
 *     captured:<flag>      a flag becomes ours (bt-a … bt-d, bt-grad)
 *     gateOpened:<gate>    a gate opens (bt-g1 … bt-g8)
 *     targetsDown          every range target is down
 *     minesShot            you set off a mine
 *     died                 your soldier died      died:<room>   … in that room
 *     nestCleared          the MG nest and its shotgunner are dead
 *     rangeCleared         the far guns on the sniper range are dead
 *     shotAtSarge          you fired through him
 *     respawnOpen          the respawn view opens
 *
 *   STATES are true for as long as they're so:
 *     room:<room>  alive  firstLife  role:<role>  deaths:<n>  deaths>n  diedIn:<room>
 *     had:<edge>           that edge has happened (e.g. had:captured:bt-a, had:minesShot), or a
 *                          beat has been said (had:r1.bags); had:station: started partway
 *                          ("start here")
 *     gate:<gate>          the gate is open now
 *     near:<spot>          you're at one of the `spots` below
 *     nextTarget:<id>      that's the next range target to shoot
 *     targetsLeft          range targets remain
 *     hurt                 you're wounded
 *     corridor             you're in the MG corridor
 *     atSpawn:<spawnId>    you stand at that spawn point (use with lifeStart)
 *     cause:mine|shot      what killed you (use with died)
 *     inRoom:<seconds>     you've been in this room that long
 *     quiet:<seconds>      he hasn't said anything for that long
 *     waited:<seconds>     everything else in the `when` has held for that long
 *                          (heckles: with `repeat`, it fires again every that-long)
 *     respawn  afterDeath  hint:<deploy|spawn|resume>  hintSpawn:<spawnId>  hintRole
 *     taught:<key>         a respawn hint was already followed
 *
 * A beat fires when its whole condition turns true (or, with `waited`, when it has held long
 * enough). By default it fires once ever; `repeat` lets it fire each time it turns true again.
 * `say` is a list of variants; they're used in turn. {place} and {role} fill in on respawn lines.
 * Markup: [shake] [big] [small] [gold] [red] [wave] [p=ms] [words] and [/] to end a style.
 */
import type { RoleId } from '../contracts/mission';

export interface SargeSpot {
  id: string;
  /** A point (with `radius`) or a rectangle (`rect`, plus `radius` as the margin around it). */
  x?: number;
  y?: number;
  rect?: { x: number; y: number; w: number; h: number };
  radius: number;
}

export interface SargeBeat {
  id: string;
  when: string;
  say: string[];
  /** Can fire again each time its condition turns true again (default: once ever). */
  repeat?: boolean;
  /** Least seconds between two firings. */
  cooldownS?: number;
  /** Cuts him off mid-sentence and drops what he hadn't said yet. */
  urgent?: boolean;
  /** Later beats don't fire in the same moment. */
  stop?: boolean;
  /** Switched off (kept for later). */
  off?: boolean;
  /** For you; he doesn't say it. */
  note?: string;
}

/** Where he stands. The first place whose `when` holds wins; otherwise he tags along behind you. */
export interface SargePlace {
  id: string;
  when: string;
  /** A point, a spot's name, or the sandbags opposite the next range target. */
  at: { x: number; y: number } | { spot: string } | { nextTarget: true; dx: number };
  /** Degrees: 0 east, 90 south, 180 west, -90 north. */
  face: number;
}

export interface SargeTiming {
  /** How long a finished line stays: base + per letter (ms). */
  holdMs: number;
  holdPerCharMs: number;
  /** Word-by-word reveal: base + per letter (ms). */
  wordMs: number;
  wordPerCharMs: number;
  /** Breath between lines (ms), and a line still waiting after this long is dropped. */
  lineGapMs: number;
  staleMs: number;
  /** How fast he runs (units/s); a sprinting soldier is about 360. */
  speed: number;
}

export interface SargeScript {
  version: 1;
  timing: SargeTiming;
  spots: SargeSpot[];
  places: SargePlace[];
  beats: SargeBeat[];
}

const b = (
  id: string,
  when: string,
  say: string | string[],
  more: Partial<SargeBeat> = {},
): SargeBeat => ({ id, when, say: Array.isArray(say) ? say : [say], ...more });

export const DEFAULT_SARGE_SCRIPT: SargeScript = {
  version: 1,
  timing: {
    holdMs: 900,
    holdPerCharMs: 45,
    wordMs: 110,
    wordPerCharMs: 18,
    lineGapMs: 250,
    staleMs: 3500,
    speed: 400,
  },
  spots: [
    { id: 'door', x: 600, y: 3940, radius: 60 },
    { id: 'bags', rect: { x: 880, y: 3380, w: 24, h: 500 }, radius: 40 },
  ],
  places: [
    { id: 'door', when: 'room:r0, alive', at: { spot: 'door' }, face: -90 },
    { id: 'bags', when: 'room:r1, alive, targetsLeft', at: { nextTarget: true, dx: -30 }, face: 0 },
    {
      id: 'flag-a',
      when: 'room:r2, alive, !had:captured:bt-a',
      at: { x: 930, y: 3030 },
      face: 180,
    },
    {
      id: 'gate-wait',
      when: 'room:r2, alive, had:captured:bt-a, !gate:bt-g2',
      at: { x: 860, y: 2910 },
      face: -90,
    },
    {
      id: 'gate-lead',
      when: 'room:r2, alive, gate:bt-g2',
      at: { x: 860, y: 2740 },
      face: -90,
    },
    {
      id: 'chute-lead',
      when: 'room:r3, alive, !had:minesShot',
      at: { x: 860, y: 2090 },
      face: -90,
    },
  ],
  beats: [
    // --- The start --------------------------------------------------------------------------
    b('intro.0', 'lifeStart, firstLife, room:r0', '[big][shake]EYES FRONT, MAGGOT!'),
    b('intro.1', 'lifeStart, firstLife, room:r0', 'That door. [p=200][gold]WASD[/] to move.'),
    b('intro.2', 'lifeStart, firstLife, room:r0', 'Move it! [shake]NORTH!'),
    b('intro.3', 'lifeStart, firstLife, room:r0', '[gold]SHIFT[/] to sprint!'),
    b(
      'r0.heckle',
      'room:r0, alive, waited:11',
      [
        'Through the door, Private! [shake]NORTH![/] WASD!',
        "That door won't walk itself! [shake]MOVE!",
      ],
      { repeat: true },
    ),
    // --- Dying ------------------------------------------------------------------------------
    b('death.first', 'died, deaths:1', '[shake]HA![/] [p=200]Happens to the best of us, kid.', {
      urgent: true,
    }),
    b(
      'death',
      'died, deaths>1',
      [
        '[shake]HA![/] [p=200]Face first!',
        "Dead again! [p=200]I've seen sandbags with better reflexes.",
        'Down you go! [p=200]Happens to the best of us.',
      ],
      { repeat: true, cooldownS: 15, urgent: true },
    ),
    // --- R1: the range ----------------------------------------------------------------------
    b('r1.enter', 'enter:r1', "Targets! [shake]Light 'em up!"),
    b(
      'r1.bags',
      'room:r1, alive, targetsLeft, !near:bags, waited:1',
      'Over here, Private! [gold]Get right up to the sandbags[/]. You shoot [shake]OVER[/] them!',
    ),
    b(
      'r1.heckle',
      'room:r1, alive, targetsLeft, !near:bags, had:r1.bags, waited:7',
      [
        'You got dirt in your ears, Private?!? [shake]I said GET OVER HERE!!!',
        'Over here, [shake]numbnuts[/]! The sandbags! [p=200]THE SANDBAGS!',
        "Walking round them won't help, maggot! [shake]Get up close!",
      ],
      { repeat: true },
    ),
    b(
      'r1.near',
      'room:r1, alive, targetsLeft, near:bags',
      "That's it! [gold]Close enough to the bags[/], and your shots clear them.",
    ),
    b(
      'r1.t1',
      'room:r1, near:bags, nextTarget:bt-t1',
      'Nothing in the way of that one. [shake]Fire!',
    ),
    b(
      'r1.t2',
      'room:r1, near:bags, nextTarget:bt-t2',
      'Chain link! [gold]Bullets go right through[/] it.',
    ),
    b(
      'r1.t3',
      'room:r1, near:bags, nextTarget:bt-t3',
      'A crate [gold]soaks up shots[/]. Keep the trigger down!',
    ),
    b(
      'r1.t4',
      'room:r1, near:bags, nextTarget:bt-t4',
      'A half wall soaks up more. [gold]Keep firing[/], it still gives.',
    ),
    b('r1.done', 'targetsDown', 'Not bad. [p=200][shake]MOVE!'),
    // --- R2: the flag, then the sprint ------------------------------------------------------
    b('r2.enter', 'enter:r2', "See that flag? [p=200]Stand on it till it's [gold]ours[/]!"),
    b('r2.done', 'captured:bt-a', "Flag's ours! [p=200]Die, you come back [gold]here[/]."),
    b(
      'r2.sprint',
      'room:r2, alive, had:captured:bt-a, !gate:bt-g2',
      "That gate's about to [gold]OPEN[/]! [p=200]When it does, hold [gold]SHIFT[/] and [shake]RUN like your life depends on it!",
      { urgent: true },
    ),
    b('r2.go', 'room:r2, alive, had:captured:bt-a, gate:bt-g2', '[big][shake]GO GO GO!', {
      urgent: true,
    }),
    b(
      'r2.heckle',
      'room:r2, alive, had:captured:bt-a, gate:bt-g2, waited:7',
      [
        "It's OPEN, maggot! [shake]SHIFT and RUN!",
        'You planning to [wave]stroll[/] through?! [shake]SPRINT!',
      ],
      { repeat: true },
    ),
    // --- R3: the chute ----------------------------------------------------------------------
    b('r3.enter', 'enter:r3, !had:minesShot', '[big][shake]SPRINT!!'),
    b(
      'r3.mine',
      'died:r3, !had:minesShot, cause:mine',
      'Watch your [red]step[/]! [p=200][shake]MINES!',
      {
        repeat: true,
        cooldownS: 15,
      },
    ),
    b('r3.shot', 'died:r3, !had:minesShot, cause:shot', 'You call that [shake]sprinting[/]?!', {
      repeat: true,
      cooldownS: 15,
    }),
    b(
      'r3.back',
      'lifeStart, atSpawn:bt-sp-a, !had:minesShot, diedIn:r3',
      'Dead? [p=200]Not here. [p=200]You come back.',
    ),
    b(
      'r3.minesHint',
      'lifeStart, atSpawn:bt-sp-a, !had:minesShot, diedIn:r3',
      'Shoot the [red]mines[/] when the gate opens!',
    ),
    b(
      'r3.minesEarly',
      'minesShot, !had:minesShot, deaths:0',
      '[shake]Shooting the mines?! [p][words]Somebody give this maggot a [gold]medal[/]!',
    ),
    b('r3.minesDone', 'minesShot, !had:minesShot, deaths>0', "That's it! [p=200][shake]NOW RUN!"),
    // --- R4 and after -----------------------------------------------------------------------
    b('r4.enter', 'enter:r4', 'Another flag! [p=200]Take it!'),
    b(
      'r4.done',
      'captured:bt-b',
      '[gold]Shield[/] unlocked! [p=200]That gate goes round [gold]behind[/] the gun!',
    ),
    b('r4.surprise', 'died:r4, corridor', "[shake]SURPRISE![/] [p]Should've checked that corner."),
    b('r4.shield', 'lifeStart, role:shield', 'Shield up front! [p=200]Push!'),
    b('r4.cleared', 'nestCleared', 'Clear! [p=200]Flip that [gold]switch[/]!'),
    b('r4.open', 'gateOpened:bt-g5', "Gate's open! [p=200][shake]NORTH!"),
    b('flag.c', 'enter:r5f', 'Flag! [p=200]Take it first!'),
    b('r5.enter', 'enter:r5', "Six of 'em! [p=200][shake]GO GET 'EM!"),
    b(
      'r5.mg',
      'lifeStart, role:gunner',
      'Sandbags. [p=200]Stand [gold]still[/]. [p=200]Aim it [gold]yourself[/]!',
    ),
    b('r5.done', 'gateOpened:bt-g6', 'Outstanding!'),
    b(
      'r5.walk',
      'gateOpened:bt-g6, hurt',
      'Hurt? [shake]Walk it off![/] [p]You heal out of the fire.',
    ),
    b('flag.d', 'enter:r6f', 'Flag first!'),
    b('r6.enter', 'enter:r6', "Bullets won't touch him."),
    b('r6.nade', 'lifeStart, role:grenadier', 'Aim at him. [p=200][gold]Throw[/]!'),
    b('r6.done', 'gateOpened:bt-g8', "Now THAT's a [gold]grenade[/]!"),
    b('r7.enter', 'enter:r7', 'Take that flag and you [gold]graduate[/]!'),
    b(
      'r7.sniper',
      'lifeStart, role:sniper',
      'Sandbags by the door. [p=200]Stand [gold]still[/]. [p=200]Aim [gold]far[/]!',
    ),
    b('r7.clear', 'rangeCleared', 'Clear! [p=200]Now take that [gold]flag[/]!'),
    // --- Anywhere ---------------------------------------------------------------------------
    b(
      'scenic',
      'lifeStart, atSpawn:bt-start, had:captured:bt-a, !had:station',
      'Taking the [wave]scenic route[/], are we?!',
      {
        repeat: true,
        cooldownS: 15,
      },
    ),
    b('shotAt', 'shotAtSarge', '[big][shake]DID YOU JUST SHOOT AT ME?!', {
      repeat: true,
      cooldownS: 15,
      urgent: true,
    }),
    b(
      'nag',
      'alive, !room:r0, !room:r1, !room:r7, inRoom:40, quiet:40',
      [
        'What are you waiting for, [shake]Christmas?!',
        'MOVE IT, maggot!',
        'My grandmother moves faster than you!',
      ],
      { repeat: true },
    ),
    // --- The respawn view -------------------------------------------------------------------
    b(
      'rs.welcome.0',
      'respawnOpen, hint:deploy, !had:station',
      '[big][shake]WELCOME TO BASIC TRAINING!',
    ),
    b(
      'rs.welcome.1',
      'respawnOpen, hint:deploy, !had:station',
      "I'm your [gold]Drill Sergeant[/]. [p=300]Follow my orders and everything will be [gold]fine[/].",
    ),
    b(
      'rs.deploy',
      'respawnOpen, hint:deploy',
      "Now hit [gold]DEPLOY[/], soldier! [p=200]That's the big yellow button.",
    ),
    b(
      'rs.explain',
      'respawnOpen, afterDeath, !hint:deploy',
      "That's [gold]respawning[/], kid. Come back and [gold]fix it[/].",
    ),
    b(
      'rs.resume',
      'respawnOpen, hint:resume',
      "He's alive! Pick his O to take over where he left off",
    ),
    b(
      'rs.spawnA',
      'respawnOpen, hint:spawn, hintSpawn:bt-sp-a, !taught:spawnA',
      'Deploy at Alpha, the flag you took',
      { repeat: true, stop: true },
    ),
    b('rs.spawn', 'respawnOpen, hint:spawn', 'Deploy at {place}, your newest flag', {
      repeat: true,
    }),
    b('rs.role', 'respawnOpen, hint:spawn, hintRole', 'New class: {role}. Pick it here', {
      repeat: true,
    }),
    b(
      'rs.heckle',
      'respawn, quiet:10',
      [
        'Over here, [shake]numbnuts[/]!',
        'You deaf, Private?! [p=200]I said [gold]DEPLOY[/]!',
        "The enemy isn't going to [wave]wait[/], maggot!",
      ],
      { repeat: true },
    ),
  ],
};

/** The rooms, for the editor's reference list (matches `BT` in the map). */
export const SARGE_ROOMS = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5f', 'r5', 'r6f', 'r6', 'r7'] as const;
export const SARGE_ROLES: readonly RoleId[] = [
  'rifleman',
  'grenadier',
  'gunner',
  'sniper',
  'shield',
];
