# PHASE01: Scaffold, conventions, sim skeleton

**Goal:** a repo that any agent can clone, run, test and extend, with the architectural seams
(pure sim ↔ renderer) in place from day one. At the end, a placeholder soldier walks around a
walled map in the browser. The movement is computed by the headless sim and drawn by Phaser.

**Depends on:** nothing. **Parallel with:** nothing (everything else builds on this).
**Owns:** everything (it's the first phase), but keep it lean. Later phases fill in the folders.

## Tasks

### Tooling
- [x] `npm` project with Vite + TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`).
- [x] Phaser 4 (latest stable; if only an RC exists, pin it exactly and note it in Notes).
- [x] Vitest (node environment by default; jsdom available for `src/ui` tests later).
- [x] ESLint (flat config) + Prettier. Add restriction rules for the pure modules
  (`src/sim/**`, `src/timeline/**`, `src/persistence/**`, `src/contracts/**`):
  - `no-restricted-imports`: `phaser`, anything under `src/render`, `src/ui`, `src/app`.
  - `no-restricted-globals` / `no-restricted-properties`: `window`, `document`, `localStorage`,
    `Math.random`, `Date.now`, `performance`.
  - Add a tiny lint-fixture test or CI step that proves the rule fires (e.g. a deliberately bad
    file under a test fixture dir, linted with `--no-ignore` and expected to fail).
- [x] Scripts: `dev`, `build` (runs `tsc --noEmit` then `vite build`), `preview`, `test`,
  `test:watch`, `lint`, `format`, `gen:placeholders` (stub that prints "nothing yet" is fine;
  PHASE02-b fills it), `sim` (runs a `tools/` CLI via `tsx`).
- [x] GitHub Actions workflow: on push/PR → `npm ci`, `lint`, `test`, `build`.
- [x] `netlify.toml`: build command `npm run build`, publish `dist`, Node version pinned to
  match `.nvmrc`. The owner connects Netlify in its UI. Don't add Netlify secrets or CLI deploys.
- [x] `.nvmrc` (current Node LTS), `.editorconfig`, `.gitignore`.
- [x] Update `README.md`: one-paragraph pitch, link to the design doc, quick-start commands.
  Keep `AGENTS.md`'s "Commands" section accurate.

### Sim skeleton (`src/sim/`, pure TS)
- [x] `core/time.ts`: `type Tick = number`, `TICKS_PER_SECOND = 60`, `ticksToSeconds`,
  `secondsToTicks` (rounding rule documented), `formatBattleTime(tick) → "m:ss"`.
- [x] `core/vec.ts`: small immutable-ish 2D vector helpers (add, sub, scale, len, normalize,
  angle, fromAngle, distance). Angles in **radians** internally. Document the convention:
  0 = +x, counter-clockwise positive, y-down screen space. Pick one and write it down.
- [x] `core/rng.ts`: tiny seeded PRNG (mulberry32 or similar) for emergencies. Not used yet.
- [x] `core/ids.ts`: deterministic id allocation (`S1`, `S2`… for soldiers, `E1`… for entities).
- [x] `core/hash.ts`: stable hash of a plain-data world state, for determinism tests.
- [x] `world/map.ts`: map definition types: bounds, static walls (axis-aligned rects to start),
  spawn points (`id`, position, facing, `kind: 'initial'`). Placeholder for hazard definitions
  (filled by 02-a).
- [x] `world/collision.ts`: circle-vs-AABB resolve (slide along walls), circle-vs-circle tests.
- [x] `entities/soldier.ts`: soldier state (`id`, pos, facing, hp, alive) and
  `stepSoldier(state, input, map, dt)` for movement only.
- [x] `sim.ts`: the World and its step function:
  ```ts
  interface SoldierInput { move: Vec2 /* -1..1 each axis */; aim: number /* radians */;
                           fire: boolean; interact: boolean }
  createWorld(map: MapDef): World
  step(world: World, inputs: ReadonlyMap<SoldierId, SoldierInput>): void   // advances one tick
  getView(world: World): WorldView   // read-only, plain-data snapshot for renderers
  ```
  `WorldView` is the **renderer contract**. Define it in `src/sim/view.ts` with the soldier
  view now, plus *stub* view types for the entities 02-a will add (turret, mine, vehicle,
  gate/bridge, objective, shot tracer events) so 02-b can render against them in parallel.
  Each view carries a stable `id` and a `kind` discriminator.
- [x] `src/content/tuning.ts`: soldier speed, radii per [D14] (sprite / hitbox / blocker radius),
  all marked `// TUNE`.
- [x] `src/content/maps/test-range.ts`: a small walled test map with 2 initial spawn points.
- [x] Tests: vector math, time formatting, collision sliding, determinism (same input
  script twice → identical hash after N ticks).

### Minimal presentation (`src/render/phaser/`, `src/app/`)
- [x] `app/main.ts`: boots Phaser, owns a fixed-timestep accumulator (60 Hz sim, render at display
  rate, cap catch-up steps to avoid spiral of death).
- [x] A `BattleScene` that draws walls and the soldier as simple Phaser shapes for now (02-b
  switches to placeholder PNGs), and reads WASD + mouse into a `SoldierInput`.
- [x] Camera follows the soldier.

### Headless CLI
- [x] `tools/sim-cli.ts`: runs the test map headless for N ticks with a scripted input (e.g.
  walk in a square) and prints final state hash + ticks/sec. This is the seed of the stress
  harness in 05-b.

## Acceptance
- `npm ci && npm run lint && npm run test && npm run build` passes locally and in CI.
- `npm run dev` shows a soldier moving with WASD, facing the mouse, sliding along walls.
- Importing `phaser` (or using `Math.random`) inside `src/sim/` fails lint.
- `npm run sim` prints a deterministic hash (same on repeated runs).

## Notes for later phases
- 02-a and 02-b run in parallel next. **The `WorldView` stubs and `SoldierInput` are their
  shared contract.** Make the stubs concrete enough (fields for position, facing, hp, state
  enums) that 02-b can render them without waiting.

## Notes from implementation
- **Versions:** Phaser 4.2.1 (stable, pinned exactly), TypeScript 6, Vite 8, Vitest 5, ESLint 10
  (flat config with typescript-eslint).
- **Purity lint** also covers `src/content/**` (maps/tuning/strings are imported by the headless
  sim). `npm run lint:purity` lints `tools/fixtures/purity/impure.ts` *as if* it lived in
  `src/sim/`, and fails unless every restriction rule fires. CI runs it.
- **Tuning is passed in, never imported as a global, by sim code:** `createWorld(map, tuning)`.
  `withTuning(DEFAULT_TUNING, overrides)` deep-merges overrides. That gives tests, tools and a
  future in-game settings panel different values without touching sim code.
- **Angle convention:** radians, 0 = +x, y-down, so positive = clockwise on screen. Equal to
  `Math.atan2(dy, dx)` and Phaser rotation.
- **Soldier vs. walls** uses a separate `wallRadius` (10). [D14]'s tiny `blockerRadius` is only for
  soldier-vs-soldier, so soldiers don't visually clip into walls.
- **World shape:** `World = { map, tuning, solids, state }`. Only `state` changes, and it's plain
  data, so a snapshot is `structuredClone(world.state)` (tested).
- **`view.ts`** defines concrete stub views for every PHASE02 entity, plus the `SimEvent` union in
  `events.ts`. 02-a and 02-b should treat both as the contract.
- Prettier ignores `*.md` so agents don't churn the planning docs.
- The camera currently centers on the soldier each frame (simple; 02-b can add smoothing).
