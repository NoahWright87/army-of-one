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

## Ground rules

- **Do not invent gameplay rules.** The product owner is opinionated. If a task needs a
  player-facing decision that isn't in DECISIONS.md or your phase doc, stop and ask. If you can't
  ask, implement the smallest reasonable version behind a clearly named tuning flag, then add the
  question to the "Open questions" section of `docs/DECISIONS.md` and mention it in your PR. Truly
  obvious things ("should bombs explode?") don't need asking.
- **Tuning numbers are not decisions.** Speeds, HP, radii, timings, etc. go in
  `src/content/tuning.ts` with a `// TUNE` comment. Pick something sensible and move on.
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
npm run bench -- --echoes 25,50,100,200,400  # PHASE05-b army benchmark (mission-03)
                          # (--life lo,hi bot life seconds, --naive = optimizations off, --json f)
```

In the browser: `/` is the game (title → respawn screen → lead-in → battle → …, PHASE04).
`/?scene=gallery` renders every entity/soldier state from a fixture (visual test page),
`/?scene=sandbox` is the old free-play battle, `/?screen=respawn&fixture=<name>` the respawn
screen dev page. Hotkeys: `` ` `` debug overlay, `F2` settings panel (display/debug options,
game flow, sim tuning; saved in localStorage), `F4` play the countdown overlay, `R` / `Space`
quick redeploy on the death beat or respawn screen (PHASE06-c; a fresh mission skips the empty
respawn screen). Perf knobs: `display.renderScale`, `display.antialias`, `debug.maxCatchUpSteps`
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
- Cover and roles (PHASE07-c): partial cover is `map.cover` (materials in `tuning.cover`);
  roles are picked on the respawn screen (keys 1–9; PHASE12-a added Sniper, Shield,
  Shotgunner and Bazooka; PHASE12-b the Gun truck and Tank). The Grenadier holds fire to wind up and
  releases to throw at the cursor. Guns have spread + recoil (`src/sim/combat/guns.ts`); the
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
  auto-aim per role. Emulate a phone in Playwright with `devices['iPhone 13']`.
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
