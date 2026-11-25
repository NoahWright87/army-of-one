/**
 * (PHASE18) Basic training's drill sergeant, as a script ([D160]). Plain data: the Sarge editor
 * (`?scene=sarge`) changes anything here and plays it again. This file is the default; local
 * edits are layered on top and kept in localStorage.
 *
 * NOTE: unlike the rest of the game's text (strings.ts), Sarge's words live here, so that the
 * person writing them edits them in one place.
 *
 * The model, in Warcraft-editor terms:
 *  - ZONES are named rectangles on the map. The course's ten rooms (r0 … r7) are zones already;
 *    you add more. Only your current soldier counts.
 *  - FLAGS are named yes/no facts. The game sets some by itself (a flag captured, a gate opened…);
 *    your rules can set and clear their own.
 *  - A RULE says: WHEN (an event) and (conditions) → DO (steps, in order): say a line, wait, set or
 *    clear a flag. `when` is a comma-separated list of TOKENS, all of which must hold; `!` negates.
 *  - PREFS say where Sarge likes to stand: the first whose conditions hold wins.
 *
 *   EVENTS are true for the one moment something happens:
 *     lifeStart            a new soldier's life begins
 *     enter:<zone>         you walk into a zone or room        leave:<zone>   … out of it
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
 *     in:<zone>  room:<room>  alive  firstLife  role:<role>  deaths:<n>  deaths>n  diedIn:<room>
 *     flag:<name>          one of your flags is set
 *     had:<edge>           that event has happened (had:captured:bt-a, had:minesShot), or a rule
 *                          has run (had:r1.bags); had:station: started partway ("start here")
 *     gate:<gate>          the gate is open now
 *     nextTarget:<id>      that's the next range target to shoot
 *     targetsLeft  hurt  corridor  atSpawn:<spawnId>  cause:mine|shot
 *     inRoom:<seconds>     you've been in this room that long
 *     inFor:<zone>:<s>     you've been in that zone that long
 *     flagFor:<name>:<s>   that flag was set that long ago
 *     firedFor:<rule>:<s>  that rule last ran that long ago
 *     quiet:<seconds>      he hasn't said anything for that long
 *     waited:<seconds>     everything else in the `when` has held for that long
 *                          (heckles: with `repeat`, it runs again every that-long)
 *     respawn  afterDeath  hint:<deploy|spawn|resume>  hintSpawn:<spawnId>  hintRole
 *     taught:<key>         a respawn hint was already followed
 *
 * A rule runs when its whole condition turns true (or, with `waited`, when it has held long
 * enough). By default it runs once ever; `repeat` lets it run each time it turns true again.
 * A `say` step has a list of variants, used in turn. {place} and {role} fill in on respawn lines.
 * Markup: [shake] [big] [small] [gold] [red] [wave] [p=ms] [words] and [/] to end a style.
 */

export interface SargeZone {
  id: string;
  /** What it's called in the editor. */
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SargeStep =
  | { k: 'say'; say: string[] }
  | { k: 'wait'; s: number }
  | { k: 'set'; flag: string }
  | { k: 'clear'; flag: string };

export interface SargeRule {
  id: string;
  when: string;
  steps: SargeStep[];
  /** Can run again each time its condition turns true again (default: once ever). */
  repeat?: boolean;
  /** Least seconds between two runs. */
  cooldownS?: number;
  /** Its lines cut him off mid-sentence and drop what he hadn't said yet. */
  urgent?: boolean;
  /** Later rules don't start in the same moment. */
  stop?: boolean;
  /** Switched off (kept for later). */
  off?: boolean;
  /** For you; he doesn't say it. */
  note?: string;
}

/** Where he stands. */
export type SargeAt =
  | { kind: 'point'; x: number; y: number }
  /** The middle of a zone. */
  | { kind: 'zone'; zone: string }
  /** The sandbags opposite the next range target, `x` west-east. */
  | { kind: 'nextTarget'; x: number }
  /** Near you (an offset from where you stand). */
  | { kind: 'player'; dx: number; dy: number };

/** Sarge's preferred position: the first pref whose `when` holds. */
export interface SargePref {
  id: string;
  when: string;
  at: SargeAt;
  /** Degrees: 0 east, 90 south, 180 west, -90 north. null: toward you. */
  face: number | null;
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
  version: 2;
  timing: SargeTiming;
  zones: SargeZone[];
  /** Your own flags (the names the editor offers). */
  flags: string[];
  /** Seconds a gate waits after its mission rule is met, by gate id (applied when the level loads). */
  gateDelays: Record<string, number>;
  prefs: SargePref[];
  rules: SargeRule[];
}

/** The ten rooms are zones already (the map's own rectangles are in `maps/basic-training.ts`). */
export const SARGE_ROOMS = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5f', 'r5', 'r6f', 'r6', 'r7'] as const;

/** What the editor calls each room. */
export const SARGE_ROOM_NAMES: Record<(typeof SARGE_ROOMS)[number], string> = {
  r0: 'Start room',
  r1: 'Range room',
  r2: 'Flag room',
  r3: 'The chute',
  r4: 'Bravo room',
  r5f: 'Charlie room',
  r5: 'Ambush room',
  r6f: 'Delta room',
  r6: 'Parapet room',
  r7: 'Sniper range',
};

const say = (...variants: string[]): SargeStep => ({ k: 'say', say: variants });
const rule = (
  id: string,
  when: string,
  steps: SargeStep[] | string,
  more: Partial<SargeRule> = {},
): SargeRule => ({
  id,
  when,
  steps: typeof steps === 'string' ? [say(steps)] : steps,
  ...more,
});

export const DEFAULT_SARGE_SCRIPT: SargeScript = {
  version: 2,
  timing: {
    holdMs: 900,
    holdPerCharMs: 45,
    wordMs: 110,
    wordPerCharMs: 18,
    lineGapMs: 250,
    staleMs: 3500,
    speed: 400,
  },
  zones: [{ id: 'bags', name: 'By the sandbags', x: 840, y: 3340, w: 104, h: 580 }],
  flags: [],
  gateDelays: { 'bt-g2': 6 },
  prefs: [
    { id: 'door', when: 'in:r0, alive', at: { kind: 'point', x: 600, y: 3940 }, face: -90 },
    {
      id: 'bags',
      when: 'in:r1, alive, targetsLeft',
      at: { kind: 'nextTarget', x: 850 },
      face: 0,
    },
    {
      id: 'flag-a',
      when: 'in:r2, alive, !had:captured:bt-a',
      at: { kind: 'point', x: 930, y: 3030 },
      face: 180,
    },
    {
      id: 'gate-wait',
      when: 'in:r2, alive, had:captured:bt-a, !gate:bt-g2',
      at: { kind: 'point', x: 860, y: 2910 },
      face: -90,
    },
    {
      id: 'gate-lead',
      when: 'in:r2, alive, gate:bt-g2',
      at: { kind: 'point', x: 860, y: 2740 },
      face: -90,
    },
    {
      id: 'chute-lead',
      when: 'in:r3, alive, !had:minesShot',
      at: { kind: 'point', x: 860, y: 2090 },
      face: -90,
    },
    { id: 'beside-you', when: '', at: { kind: 'player', dx: -90, dy: 70 }, face: null },
  ],
  rules: [
    // --- The start --------------------------------------------------------------------------
    rule(
      'intro',
      'lifeStart, firstLife, in:r0',
      [
        say('[big][shake]EYES FRONT, MAGGOT!'),
        say('That door. [p=200][gold]WASD[/] to move.'),
        say('Move it! [shake]NORTH!'),
        say('[gold]SHIFT[/] to sprint!'),
      ],
      { note: 'The first life, at the very start.' },
    ),
    rule(
      'r0.heckle',
      'in:r0, alive, waited:11',
      [
        say(
          'Through the door, Private! [shake]NORTH![/] WASD!',
          "That door won't walk itself! [shake]MOVE!",
        ),
      ],
      { repeat: true },
    ),
    // --- Dying (before the rooms' own death lines, so he laughs first) -----------------------
    rule('death.first', 'died, deaths:1', '[shake]HA![/] [p=200]Happens to the best of us, kid.', {
      urgent: true,
    }),
    rule(
      'death',
      'died, deaths>1',
      [
        say(
          '[shake]HA![/] [p=200]Face first!',
          "Dead again! [p=200]I've seen sandbags with better reflexes.",
          'Down you go! [p=200]Happens to the best of us.',
        ),
      ],
      { repeat: true, cooldownS: 15, urgent: true },
    ),
    // --- R1: the range ----------------------------------------------------------------------
    rule('r1.enter', 'enter:r1', "Targets! [shake]Light 'em up!"),
    rule(
      'r1.bags',
      'in:r1, alive, targetsLeft, !in:bags, waited:1',
      'Over here, Private! [gold]Get right up to the sandbags[/]. You shoot [shake]OVER[/] them!',
    ),
    rule(
      'r1.heckle',
      'in:r1, alive, targetsLeft, !in:bags, had:r1.bags, waited:7',
      [
        say(
          'You got dirt in your ears, Private?!? [shake]I said GET OVER HERE!!!',
          'Over here, [shake]numbnuts[/]! The sandbags! [p=200]THE SANDBAGS!',
          "Walking round them won't help, maggot! [shake]Get up close!",
        ),
      ],
      { repeat: true },
    ),
    rule(
      'r1.near',
      'in:r1, alive, targetsLeft, in:bags',
      "That's it! [gold]Close enough to the bags[/], and your shots clear them.",
    ),
    rule('r1.t1', 'in:bags, nextTarget:bt-t1', 'Nothing in the way of that one. [shake]Fire!'),
    rule('r1.t2', 'in:bags, nextTarget:bt-t2', 'Chain link! [gold]Bullets go right through[/] it.'),
    rule(
      'r1.t3',
      'in:bags, nextTarget:bt-t3',
      'A crate [gold]soaks up shots[/]. Keep the trigger down!',
    ),
    rule(
      'r1.t4',
      'in:bags, nextTarget:bt-t4',
      'A half wall soaks up more. [gold]Keep firing[/], it still gives.',
    ),
    rule('r1.done', 'targetsDown', 'Not bad. [p=200][shake]MOVE!'),
    // --- R2: the flag, then the sprint ------------------------------------------------------
    rule('r2.enter', 'enter:r2', "See that flag? [p=200]Stand on it till it's [gold]ours[/]!"),
    rule('r2.done', 'captured:bt-a', "Flag's ours! [p=200]Die, you come back [gold]here[/]."),
    rule(
      'r2.sprint',
      'in:r2, alive, had:captured:bt-a, !gate:bt-g2',
      "That gate's about to [gold]OPEN[/]! [p=200]When it does, hold [gold]SHIFT[/] and [shake]RUN like your life depends on it!",
      { urgent: true, note: 'The gate opens 6 s after the flag (Gates tab).' },
    ),
    rule('r2.go', 'in:r2, alive, had:captured:bt-a, gate:bt-g2', '[big][shake]GO GO GO!', {
      urgent: true,
    }),
    rule(
      'r2.heckle',
      'in:r2, alive, had:captured:bt-a, gate:bt-g2, waited:7',
      [
        say(
          "It's OPEN, maggot! [shake]SHIFT and RUN!",
          'You planning to [wave]stroll[/] through?! [shake]SPRINT!',
        ),
      ],
      { repeat: true },
    ),
    // --- R3: the chute ----------------------------------------------------------------------
    rule('r3.enter', 'enter:r3, !had:minesShot', '[big][shake]SPRINT!!'),
    rule(
      'r3.mine',
      'died:r3, !had:minesShot, cause:mine',
      'Watch your [red]step[/]! [p=200][shake]MINES!',
      {
        repeat: true,
        cooldownS: 15,
      },
    ),
    rule('r3.shot', 'died:r3, !had:minesShot, cause:shot', 'You call that [shake]sprinting[/]?!', {
      repeat: true,
      cooldownS: 15,
    }),
    rule('r3.back', 'lifeStart, atSpawn:bt-sp-a, !had:minesShot, diedIn:r3', [
      say('Dead? [p=200]Not here. [p=200]You come back.'),
      say('Shoot the [red]mines[/] when the gate opens!'),
    ]),
    rule(
      'r3.minesEarly',
      'minesShot, !had:minesShot, deaths:0',
      '[shake]Shooting the mines?! [p][words]Somebody give this maggot a [gold]medal[/]!',
    ),
    rule(
      'r3.minesDone',
      'minesShot, !had:minesShot, deaths>0',
      "That's it! [p=200][shake]NOW RUN!",
    ),
    // --- R4 and after -----------------------------------------------------------------------
    rule('r4.enter', 'enter:r4', 'Another flag! [p=200]Take it!'),
    rule(
      'r4.done',
      'captured:bt-b',
      '[gold]Shield[/] unlocked! [p=200]That gate goes round [gold]behind[/] the gun!',
    ),
    rule(
      'r4.surprise',
      'died:r4, corridor',
      "[shake]SURPRISE![/] [p]Should've checked that corner.",
    ),
    rule('r4.shield', 'lifeStart, role:shield', 'Shield up front! [p=200]Push!'),
    rule('r4.cleared', 'nestCleared', 'Clear! [p=200]Flip that [gold]switch[/]!'),
    rule('r4.open', 'gateOpened:bt-g5', "Gate's open! [p=200][shake]NORTH!"),
    rule('flag.c', 'enter:r5f', 'Flag! [p=200]Take it first!'),
    rule('r5.enter', 'enter:r5', "Six of 'em! [p=200][shake]GO GET 'EM!"),
    rule(
      'r5.mg',
      'lifeStart, role:gunner',
      'Sandbags. [p=200]Stand [gold]still[/]. [p=200]Aim it [gold]yourself[/]!',
    ),
    rule('r5.done', 'gateOpened:bt-g6', 'Outstanding!'),
    rule(
      'r5.walk',
      'gateOpened:bt-g6, hurt',
      'Hurt? [shake]Walk it off![/] [p]You heal out of the fire.',
    ),
    rule('flag.d', 'enter:r6f', 'Flag first!'),
    rule('r6.enter', 'enter:r6', "Bullets won't touch him."),
    rule('r6.nade', 'lifeStart, role:grenadier', 'Aim at him. [p=200][gold]Throw[/]!'),
    rule('r6.done', 'gateOpened:bt-g8', "Now THAT's a [gold]grenade[/]!"),
    rule('r7.enter', 'enter:r7', 'Take that flag and you [gold]graduate[/]!'),
    rule(
      'r7.sniper',
      'lifeStart, role:sniper',
      'Sandbags by the door. [p=200]Stand [gold]still[/]. [p=200]Aim [gold]far[/]!',
    ),
    rule('r7.clear', 'rangeCleared', 'Clear! [p=200]Now take that [gold]flag[/]!'),
    // --- Anywhere ---------------------------------------------------------------------------
    rule(
      'scenic',
      'lifeStart, atSpawn:bt-start, had:captured:bt-a, !had:station',
      'Taking the [wave]scenic route[/], are we?!',
      { repeat: true, cooldownS: 15 },
    ),
    rule('shotAt', 'shotAtSarge', '[big][shake]DID YOU JUST SHOOT AT ME?!', {
      repeat: true,
      cooldownS: 15,
      urgent: true,
    }),
    rule(
      'nag',
      'alive, !in:r0, !in:r1, !in:r7, inRoom:40, quiet:40',
      [
        say(
          'What are you waiting for, [shake]Christmas?!',
          'MOVE IT, maggot!',
          'My grandmother moves faster than you!',
        ),
      ],
      { repeat: true },
    ),
    // --- The respawn view -------------------------------------------------------------------
    rule('rs.welcome', 'respawnOpen, hint:deploy, !had:station', [
      say('[big][shake]WELCOME TO BASIC TRAINING!'),
      say(
        "I'm your [gold]Drill Sergeant[/]. [p=300]Follow my orders and everything will be [gold]fine[/].",
      ),
      say("Now hit [gold]DEPLOY[/], soldier! [p=200]That's the big yellow button."),
    ]),
    rule(
      'rs.deploy',
      'respawnOpen, hint:deploy, had:station',
      "Now hit [gold]DEPLOY[/], soldier! [p=200]That's the big yellow button.",
    ),
    rule(
      'rs.explain',
      'respawnOpen, afterDeath, !hint:deploy',
      "That's [gold]respawning[/], kid. Come back and [gold]fix it[/].",
    ),
    rule(
      'rs.resume',
      'respawnOpen, hint:resume',
      "He's alive! Pick his O to take over where he left off",
    ),
    rule(
      'rs.spawnA',
      'respawnOpen, hint:spawn, hintSpawn:bt-sp-a, !taught:spawnA',
      'Deploy at Alpha, the flag you took',
      { repeat: true, stop: true },
    ),
    rule('rs.spawn', 'respawnOpen, hint:spawn', 'Deploy at {place}, your newest flag', {
      repeat: true,
    }),
    rule('rs.role', 'respawnOpen, hint:spawn, hintRole', 'New class: {role}. Pick it here', {
      repeat: true,
    }),
    rule(
      'rs.heckle',
      'respawn, quiet:10',
      [
        say(
          'Over here, [shake]numbnuts[/]!',
          'You deaf, Private?! [p=200]I said [gold]DEPLOY[/]!',
          "The enemy isn't going to [wave]wait[/], maggot!",
        ),
      ],
      { repeat: true },
    ),
  ],
};
