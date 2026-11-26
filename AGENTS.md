# AGENTS.md

Guidance for AI coding agents (Claude, Codex, etc.) working in this repo. Humans are welcome too.

## What this is

**Army of One** is a top-down 2D browser shooter. You control one soldier per life. When you die,
your past lives replay as **echoes** alongside your next soldier. If a later soldier saves an
earlier one, that earlier soldier's lane ends in an **O**, and you can resume them at a later
respawn. Read these before doing anything substantial:

1. `army-of-one-product-design.html`: the product vision (authoritative for gameplay/UX intent).
2. `docs/DECISIONS.md`: the product owner's rulings on top of that doc. **Where they conflict,
   DECISIONS.md wins.**
3. `todos/README.md` and the phase doc you were assigned.

## Player experience comes first

The most important thing in this repo is how it feels to a real player. Design, build and test for
**the player coming in cold**: not a perfect user, and not you.

- **They won't read much.** A few words, at a glance, while something is shooting at them. If a
  feature needs a paragraph to be understood, it isn't done.
- **They want fun, fast.** Every app on their phone is competing for their attention. Get them to
  the good part quickly; never make them wait, wander or guess.
- **Hand them the winning move and let them play it out.** Teach with the game's own mechanics
  (a station that can only be passed one way beats any tooltip). Guided ("on rails") is fine as
  long as it feels like they're the one doing it.
- **Playtest as that player, honestly.** Don't teleport, script around problems, or play
  perfectly when judging a flow. Ask: how much did I have to steer vs. how much did the game lead
  me? Where would a newcomer hesitate, miss the point, or die "by accident"? Report what you saw,
  including what you didn't test.
- For guided content, back it with headless "naive player" tests that do only the obvious thing
  and assert the intended outcome (`src/sim/__tests__/basic-training.test.ts` is the pattern),
  plus a browser run of a bot that only follows what's on screen.

## Ground rules

- **Do not invent gameplay rules.** The product owner is opinionated. If a task needs a
  player-facing decision that isn't in DECISIONS.md or your phase doc, stop and ask. If you can't
  ask, implement the smallest reasonable version behind a clearly named tuning flag, then add the
  question to the "Open questions" section of `docs/DECISIONS.md` and mention it in your PR. Truly
  obvious things ("should bombs explode?") don't need asking.
- **Tuning numbers are not decisions.** Speeds, HP, radii, timings, etc. go in
  `src/content/tuning.ts` with a `// TUNE` comment. Pick something sensible and move on. No
  gameplay numbers hidden as constants in `src/sim/` (move strays into tuning when you touch
  them). Write distances in metres with `meters()` (`src/content/units.ts`: 1 m = 44 world
  units, a soldier is ~0.5 m across); the sim itself stays in world units.
- **Art, audio and copy are placeholders.** See "Placeholder content" below. Don't spend effort on polish.
- **Stay inside your phase's file ownership.** Parallel phases (`PHASE03-a`, `PHASE03-b`, …)
  list the directories they own. If you must touch a shared file, keep the change minimal and
  call it out in your PR description.

## Architecture rules (non-negotiable)

- `src/sim/`, `src/timeline/`, `src/persistence/`, `src/contracts/` and `src/content/` are **pure TypeScript**. No imports from
  `phaser`, no DOM/`window`/`document`, no `Date.now()`, no `performance.now()`. (Persistence
  receives a storage interface; the browser `localStorage` adapter lives in `src/app/`.) This is
  enforced by ESLint `no-restricted-imports`/`no-restricted-globals`. The sim must run headless
  under Node (Vitest and `tools/` CLIs) and must survive a future move to a 3D renderer.
- **Battle time is an integer tick count** (`Tick`, 60 ticks per second, see
  `src/sim/core/time.ts`). Never accumulate floating-point seconds in sim logic.
- **The sim is deterministic.** The same initial state plus the same live inputs and the same
  recordings must produce the same result, tick for tick. No `Math.random()` in the sim. We avoid
  randomness entirely by recording outcomes (e.g. "fired from (25.2, 54.8) at 43.7°") rather than
  re-deriving them. If randomness is ever truly needed, use the seeded PRNG in
  `src/sim/core/rng.ts`. Iterate entities in stable (id) order. Don't iterate `Set`/`Map` built from
  unordered sources when order affects outcomes.
- **The renderer only reads sim state.** `src/render/` draws a read-only view of the world and turns
  device input into a `SoldierInput` per tick. The UI never mutates the sim directly.

## Directory map (target layout; grows phase by phase)

```
src/
  sim/            pure TS simulation (core/, world/, entities/, combat/, recording/, attempt/)
  timeline/       pure TS truth model: lanes, X/O, spawn options
  persistence/    pure TS save/load (versioned schema)
  contracts/      shared types used across modules (see todos/PHASE03-CONTRACT.md)
  content/        maps, tuning.ts, strings.ts, asset manifest
  render/phaser/  Phaser scenes, renderer, input adapter
  ui/             DOM/SVG overlays (respawn timeline screen, HUD overlays)
  app/            bootstrap + game-flow state machine wiring everything together
tools/            Node CLIs (placeholder generators, headless sim / benchmark)
assets/placeholder/  generated placeholder PNG/WAV files
docs/             decisions and design notes
todos/            phase plans
```

## Placeholder content

The real art direction is **collectible miniatures on gold/silver bases, seen from straight above**
([D116]–[D121]). If you are drawing or generating that art, start at `docs/art/README.md`; the spec
is data in `src/content/miniatures.ts` and `npm run check:art` verifies it. Hooking it into the renderer
is `todos/PHASE16-miniatures.md`.

Everything a human or image/audio model will later replace must be easy to find:

- Placeholder files are named `PLACEHOLDER__<key>.<ext>` (e.g. `PLACEHOLDER__soldier_live.png`,
  `PLACEHOLDER__sfx_rifle_shot.wav`) and live in `assets/placeholder/`.
- Every asset has an entry in `src/content/assets.ts` (the manifest): key, file, kind, size,
  what it represents, a short **replacement brief** (a prompt-like description of the real
  asset), and `status: 'placeholder' | 'final'`. Code references assets **by key only**, never by path.
- Placeholders are produced by `npm run gen:placeholders` (scripts in `tools/`) so they can be
  regenerated. Generated files are committed.
- All player-facing text lives in `src/content/strings.ts`. No string literals shown to players
  anywhere else. Entries are marked placeholder until a human finalizes copy.

## Commands

(Created in PHASE01; keep this list current.)

```
npm install
npm run dev               # Vite dev server
npm run build             # typecheck + production build to dist/
npm run test              # Vitest (headless)
npm run lint              # ESLint + Prettier check (Markdown is not Prettier-formatted)
npm run lint:purity       # proves the pure-module lint rules still fire
npm run format            # Prettier write
npm run gen:placeholders  # regenerate placeholder PNG/WAV + assets/ASSETS.md from the manifest
npm run sim -- --ticks N  # headless sim CLI (tools/sim-cli.ts)
npm run sim -- --script breach-naive  # scripted scenario on mission-03, prints events (--list)
npm run sim -- --scenario rescue   # PHASE03-a: X → rescue → O → resume chain (also: chain, bench)
npm run sim -- --scenario economy  # PHASE11: plays autoplay lives, prints the money (--lives a,b --enemies)
npm run sim -- --scenario pacing  # PHASE16: bots brute-force campaign levels, print lives/time to win
                          # (--seeds 11,42 --levels 3 --difficulty easy,normal,hard --cap 120 --json)
npm run gen -- --seed N  # PHASE13-b: print a generated level (--budget B, --ground; --coverage N sweeps seeds)
npm run check:art                  # checks the miniature art in assets/miniatures/ (docs/art/; --sheets, --priority N, --require)
npm run bench -- --echoes 25,50,100,200,400  # PHASE05-b army benchmark (mission-03; --hitscan: bullets off)
                          # (--life lo,hi bot life seconds, --naive = optimizations off, --json f)
```

In the browser: `/` is the HQ (PHASE18, [D153]: a hub you walk around; signs with buttons start
the campaign or a skirmish). `?scene=title` is the old title menu and the game flow (title →
respawn screen → lead-in → battle → …, PHASE04); `?mission=<id>` also goes to the game
(`&go=1`: straight in, with a "← HQ" button).
`/?scene=gallery` renders every entity/soldier state from a fixture (visual test page),
`/?scene=sandbox` is the old free-play battle, `/?screen=respawn&fixture=<name>` the respawn
screen dev page. Hotkeys: `` ` `` debug overlay, `F2` settings panel (display/debug options,
game flow, sim tuning; saved in localStorage), `F4` play the countdown overlay, `R` / `Space`
quick redeploy on the death beat or respawn screen (PHASE06-c; a fresh mission skips the empty
respawn screen). `Esc` / `P` (or the ⏸ button) pauses a live battle: no battle time passes, then a 3-2-1
resume; it also auto-pauses when the tab is hidden, the phone locks or the window loses focus
(`src/render/pause-model.ts`, `src/ui/hud/pause-overlay.ts`). Perf knobs: `display.renderScale`, `display.antialias`, `debug.maxCatchUpSteps`
(see `docs/perf.md`, PHASE06-c).

Dev tools (dev builds, or add `?dev=1` to any build, e.g. `vite preview`):

- `K` kills the live soldier; `[` / `]` sim speed ×0.25…×4; a DEV bar (top right) with Kill,
  Reset mission and Timeline JSON; `?debugTimeline=1` opens the raw lanes/observation panel.
- Autoplay plays scripted lives (`src/app/autoplay-lives.ts`) through the real flow:
  `?dev=1&autoplay=breach-slow,breach-snipe-die,breach-resume-win`. `name*N` repeats; `&fast=1` plays them
  headless (not drawn); `&autowait=1` waits for the scrubber before each deploy;
  `&continue=1` continues the save instead of starting over; `&autodelay=ms`. In the console:
  `__aoo.autoplay('breach-naive*3')`, `__aoo.lives` (list), `__aoo.kill()`, `__aoo.controller`.
- `&resolveWorker=0` runs the background resolve on the main thread instead of a Web Worker.
- Stress mode (PHASE05-b): `?stress=100` plays 100 seeded bot lives (`src/sim/bots/`) through
  chained attempts, then opens the respawn screen so you can play among them (`&stressSeed=n`
  for another army). It replaces the saved mission. The debug overlay shows sim/render ms,
  sprite count and soldiers by role; `__aoo.services.perf` has the same numbers. See
  `docs/perf.md`.
- Missions: mission-03 "Breach" (PHASE06-a) is the default mission ([D31]) and the template
  for new ones: mostly vertical, one direction, contact within seconds. mission-04 "Compound"
  (PHASE07-c, `?mission=mission-04`) is the indoor cover proof of concept ([D38]).
  mission-01/02 were removed; `?mission=` with any other id (or an old remembered pick) falls
  back to Breach, and old saves for removed missions are ignored. The title-screen picker only
  shows with more than one mission.
- Battle tape + one continuous view (PHASE19, `todos/PHASE19-tape.md`): every run records the
  whole world (`src/sim/tape/`); replays play the tape; runs are glued to it until the player
  takes control (`sim/tape/align.ts`). F2 → Game → `flow.inWorldRespawn` (on): dying turns the
  battle scene into the respawn view (`BattleScene.enterRespawn`, `src/render/time-clock.ts`,
  `src/ui/inworld/`): lettered chevrons on the timeline, circles on spawns and saved soldiers,
  time glides, deploying continues in the same scene (`adopt`). `__aoo.checkDrift()` re-simulates
  and reports the first difference with the tape. Share links are hidden (`?share=1`). Basic
  training uses it too (its coach points at the chevrons, the card's classes and DEPLOY).
- Cover and roles (PHASE07-c): partial cover is `map.cover` (materials in `tuning.cover`);
  roles are picked on the respawn screen (keys 1–9; PHASE12-a added Sniper, Shield,
  Shotgunner and Bazooka; PHASE12-b the Gun truck and Tank). The Grenadier throws at the cursor;
  grenades, rockets and shells fire at once, then reload ([D159]). Guns have spread + recoil (`src/sim/combat/guns.ts`); the
  reticle grows with the current cone. The Machine Gunner mounts by standing still at cover.
- Enemies (PHASE07-d): maps' `squads` spawn AI soldiers (`src/sim/ai/brain.ts`, role
  personalities in `roles.ts`, `tuning.ai`). Dev autoplay runs without them unless `&enemies=1`;
  `&enemies=0` turns them off anywhere. Scripted tests use `CLASSIC_TUNING` (no enemies).
  Shift sprints (touch: RUN); no firing while sprinting ([D49]).
- Vehicles (PHASE12-b): roles 8/9 are the Gun truck and the Tank (`tuning.drive`, `tuning.shell`):
  compass controls, the vehicle turns first. One armor rule for everything
  (`src/sim/combat/armor.ts`, `tuning.armor`); cover breaks (`tuning.cover.materials` hp/armor).
  Mission 5 "Armored Push" (`?mission=mission-05`) is the long vehicle mission. No map uses
  traffic lanes any more ([D75]): enemy gun trucks patrol the roads. Role icons (placeholders)
  live in `src/content/role-icons.ts` and show on soldiers and the respawn screen.
- Economy (PHASE11): money is a function of battle time (`src/timeline/economy.ts`,
  `tuning.economy`, role `cost` in `roles.ts`). The respawn screen shows a money strip and what
  each spawn can spend; the HUD shows the balance. F2 → Sim tuning → `economy.enabled` turns it
  off.
- Controls (PHASE07-b): touch devices get on-screen controls + auto-aim by default; F2 → Controls
  switches scheme/auto-aim/auto-fire, touch aiming (tap-to-aim or stick, PHASE12-d) and
  auto-aim per role. Emulate a phone in Playwright with `devices['iPhone 13']`. PHASE18 [D158]:
  in tap mode, touching the reticle drags the aim, elsewhere is the move stick; while moving, a
  second finger aims there and fires while held (no fire button); `__aoo.touch` is the controls. Look reach / scope zoom per class:
  `src/content/camera.ts`.
- Sharing (PHASE12-e, [D79]): `src/app/share.ts` packs a run into `#replay=…` links (the save
  format, deflated); `src/app/replay-library.ts` keeps the last 3 wins per mission for the
  title screen's list. Open any `/#replay=…` link to watch it.
- Block editor (PHASE13-a, [D80]–[D88]): the title screen's "Block editor" link, or
  `?scene=editor` (no Phaser; "← Main menu" returns). Paint ground, set edge tags, place things
  with priority 0–5, squads (rally points + a roster of units, [D92]; they roam between their
  points, [D93]), Download/Copy/Open JSON, **Play this block** (opens
  `?mission=editor-preview` in the real game at the budget slider's budget; "← Editor" goes
  back). "My blocks…" is the library (yours in localStorage; official ones in
  `src/content/blocks/`, copied to edit). Format: `src/gen/block.ts`; budget: `src/gen/budget.ts`.
- Generated levels (PHASE13-b): `?mission=gen-<seed>` (or `gen-<seed>-<budget>`) stitches official
  + your valid blocks (`src/gen/level.ts`); the title screen's "Random mission" link and the
  editor's "Play a random level" pick a seed. `starter-*` blocks are placeholders.
- Campaign (PHASE13-d, [D106]–[D110]): the title screen's main button. `?scene=campaign` is the
  campaign map (`src/app/campaign-main.ts`, `src/ui/campaign/`); state is `src/gen/campaign.ts`
  (one campaign in localStorage). Levels are carved by terrain (`src/gen/carve.ts`); crossings
  between them are spawns (from held ground) and objectives (into the rest), see
  `src/gen/region.ts`. Attack opens
  `?mission=world-<seed>-<level>-<budget>-h<held…>&from=campaign` (`h`: neighbours held).
  The camera moves from the board to the battle's spawn view without rotating ([D107]).
  "Back to the campaign" ends the replay and zooms out. Old active missions can still have
  an `r` suffix for their saved orientation. Your saved blocks are only used with `pool=mine`.
  PHASE14 ([D116]–[D126]): one level at a time (the active level, Resume only); money,
  income, reserves (survivors as free spawns) and unlocked roles carry over
  (`src/gen/campaign-result.ts`, `applyLevelSettings` in `src/app/campaign-storage.ts`); level
  tags (Elite enemies, Unlocks, Income+) and enemy funds that grow with battle time.
  PHASE16 ([D127]–[D135]): shorter levels (`carve.levelBlocks`), a level is won by a majority of
  its exits (`map.objectiveGroups`), regeneration (`soldier.regen`), and Easy/Normal/Hard per
  campaign (`src/content/difficulty.ts`, picked on the campaign map before the first attack).
  [D136]: only exits are capture points (`carve.extraCapturePoints`; ingress points in
  `src/gen/ingress.ts` are off), many weaker enemies (`ai.enemyHpScale`/`enemyDamageScale`),
  exits guarded (`carve.exitGuardWeight`, `exitHoldRadius`).
  PHASE17 ([D137]–[D145]): enemies rush when they outnumber you and flee when outnumbered,
  heal and regroup (`tuning.ai`); a level is won by every exit + a key position (entries you
  hold start green) or by killing every enemy (`map.winByKillAll`); flag/helmet icons on the
  HUD; walled bases are breached into play (`breachPockets`); tech points buy roles
  (`buyRole`, the map's role bar); soldiers' bullets fly (`tuning.bullets`, `stepBullets`), slow
  and weaken past their range and land ([D146]); near misses alert the AI, who lay down covering
  fire (`ai.suppress*`).
- Basic training (PHASE18, [D155], [D156]): only the very first visit to `/` goes to
  `?mission=basic-training&go=1` (localStorage `aoo:bt:sent`; clear it to be sent again). After
  that `/` is the HQ; "← HQ" leaves; the HQ lobby's sign runs it again. `?scene=hub` opens the HQ.
  It uses the real game's stats ([D157]): fix a station by level design or a real stat tweak,
  never tutorial-only tuning.
- Map revisions: bump `MapDef.rev` when a layout change would break old recordings; saves from
  another revision are dropped on boot instead of replayed.
- Words in the world (PHASE18, [D147]–[D152]): `?scene=textlab` (also linked from the arena) to
  try signposts, speech markup and soldiers' chatter, and tune the look. Code in
  `src/render/worldtext/`, tuning in `src/content/world-text.ts`, names in
  `src/content/soldier-names.ts`, lines in strings.ts (`bark.*`, `sign.*`). Chatter runs in every
  battle (F2 → Display turns it off); it is not recorded.
- Dev arena (PHASE17, [D142]): the title screen's "Dev" link, or `?scene=arena`: soldiers per
  side by role, HUMAN / CPU presets, barrier buttons (each kind off / left / right / both halves,
  at fixed mirrored spots), GO, 🔁 auto-repeat with a running tally, and 20 headless fights for
  win rates
  (`src/gen/arena.ts`). The AI can drive either side (`SquadDef.team`, `SquadDef.skill`).
  Spawn points carry an `approach` path: new soldiers and echoes run in along it during the
  lead-in (`src/render/run-in.ts`, drawn by the battle scene; for show only, [D112]).
- World map generator (PHASE13-c): `?scene=world[&seed=N]` (title-screen link). The whole board
  (`src/gen/world.ts`), regenerate at will (R, ◀ ▶), click a block or level for details, a budget
  slider, a sketch and **Playtest** (`?mission=world-<seed>-<level>[-<budget>]`). Overlays are
  checkboxes; "Block connections…" opens the graph ([D104]).
- Tile matching ([D101]–[D103]): blocks join where their edge tiles match (exact types, ±1
  place; `src/gen/edges.ts`); boards grow from the HQ and the start in turns, and a path is cut
  where needed (`src/gen/grow.ts`). Rocks and Concrete Wall tiles are solid.
- Results (PHASE07-a): winning shows the results card over a full-mission replay (scene
  `replay`). Quickest way there: `?dev=1&autoplay=breach-slow,breach-rescue,breach-resume,breach-win&fast=1`. Breach autoplay: `?dev=1&autoplay=breach-slow,breach-rescue,breach-resume,breach-win`
  (rescue → O → resume → forward capture → win from the Forward Post), or `breach-solo` (one
  life); `breach-capture&fast=1` captures the Forward Post, then deploy at it yourself. More
  stories (gate interruption, mines, make it worse) are listed in `src/app/autoplay-lives.ts`.

Before pushing: `npm run lint && npm run lint:purity && npm run test && npm run build` must pass.

`src/content/` is also lint-restricted as pure. It holds data (maps, tuning, strings, the asset
manifest) that the headless sim and tools import.

## Working with phase docs

- Phase docs in `todos/` are your brief. Check off tasks (`- [x]`) as you complete them and add
  short implementation notes under a `## Notes from implementation` heading at the bottom: what
  you changed from the plan and why, plus anything the next phase must know.
- If a phase has a **⛔ DECISION GATE**, don't implement the gated part until the gate is
  resolved in `docs/DECISIONS.md`.
- Keep commits focused; write descriptive messages. Never include model names in commits or code.

## Testing expectations

- Sim, timeline and persistence code gets unit tests (Vitest). Determinism gets explicit tests
  (run the same scenario twice and compare world-state hashes).
- Prefer scenario tests that script a live soldier's inputs headlessly and assert on outcomes,
  e.g. "S1 dies at the turret; S2 destroys the turret; replay; S1 survives → lane ends in O".
- Rendering/UI code: keep logic in testable pure functions; manual verification in the browser is
  fine for visuals.
