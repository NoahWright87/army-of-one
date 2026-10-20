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

- `src/sim/`, `src/timeline/` and `src/persistence/` are **pure TypeScript**. No imports from
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
npm run lint              # ESLint + Prettier check
npm run gen:placeholders  # regenerate placeholder assets
```

Before pushing: `npm run lint && npm run test && npm run build` must pass.

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
