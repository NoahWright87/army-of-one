# PHASE03-b: Timeline truth model & respawn screen

**Goal:** the game's signature UI. A pure model folds attempt observations into the "latest
attempt is truth" timeline ([D2], [D3]) and derives spawn options ([D7]). A DOM/SVG respawn screen
([E5]) makes that truth instantly readable and lets the player choose the next life.

**Depends on:** the 03 contract. **Parallel with:** 03-a, 03-c. Build against hand-written
fixtures, not the real attempt runner.
**Owns:** `src/timeline/**`, `src/ui/respawn/**`, timeline-related entries in
`src/content/strings.ts` and `src/content/assets.ts` (add, don't reorganize),
`src/contracts/mission.ts` (create verbatim from `PHASE03-CONTRACT.md` if missing).

## Part 1: Truth model (`src/timeline/`, pure TS)

- [x] Done: `applyObservation`, `deriveSpawnOptions`, `leadInStart` in `src/timeline/`, tested in
  `src/timeline/__tests__/truth.test.ts` (table, slot counting, idempotence, invariants).

### `applyObservation(lanes, soldiers, obs) → { lanes, changes: LaneChange[] }`
For each lane in `obs.lanes`, let `W = [max(obs.fromTick, recordedFrom), min(obs.toTick, recordedTo)]`.
Only `W` (and consequences of a death/interruption inside it) may change ([D3]):

| Fate in W | Spans | End |
|---|---|---|
| `died @ t` | `alive` up to t, `lost` (dashed) from t+1 to `recordedTo` | `death @ t` (X) |
| `static @ t` | `alive` to t (= recordedTo) | `open @ t` (O) |
| `interrupted @ t` | `alive` up to t, `frozen` from t+1 to `recordedTo` | `interrupted @ t` |
| `neverSpawned` | `lost` over the whole lane ([D26]) | `neverSpawned` |
| `alive` | `alive` over W. After W, keep prior spans **unless** prior truth had this soldier dead/interrupted at or before `obs.toTick`. That's now contradicted, so mark after W as `unresolved` | keep prior end, or `unresolved` in the contradicted case |

- New lanes (a soldier's first life) are created from its `SoldierRecord` and then the observation
  is applied. Resumed soldiers' lanes extend to their new `recordedTo`.
- `resolve` observations ([D23]) fold exactly like attempts (no live lane). They may arrive
  progressively: applying a partial resolve covering `[from, k]` and then one covering
  `[from, k']` must give the same result as applying `[from, k']` once.
- Markers inside `W` are replaced by the observation's markers. Markers outside `W` are kept.
- `changes` lists every lane whose `end` changed (O→X, X→O, …), for "history changed" highlights.
- Property-style tests: spans always exactly cover `[recordedFrom, recordedTo]` with no overlap.
  Applying the same observation twice is idempotent. Lanes outside the window are untouched.

### `deriveSpawnOptions(map, soldiers, lanes) → SpawnOption[]`
- `new` for each initial spawn point: `entryTick = openTick + count(soldiers who spawned there) ×
  tuning.spawnInterval` ([D7]). Every soldier ever spawned there uses up a slot, dead or alive.
- `resume` for each lane with `end.kind === 'open'`: `resumeTick = end.tick`,
  `leadInFromTick = max(recordedFrom, end.tick − 5s)` ([D5]).
- Interrupted lanes are **not** offered ([D24]). Lanes still `unresolved` are not offered either.
  Once the scrubber resolves them they become O or X. O options the scrubber hasn't reached yet
  **are** offered ([D23]: the deploy's fast-forward validates them).
- Capture-point spawns are added in PHASE05-a. Keep the function easy to extend.

## Part 2: Respawn screen (`src/ui/respawn/`, DOM/SVG overlay)

Design doc §04 and §11 are the spec. Make it **fast to read and fast to decide**.

- [x] One **row per soldier** ("Soldier 3"), aligned on a shared **battle-time** x-axis (not
  wall-clock). Rows are ordered by ordinal. Long missions need horizontal zoom/pan: wheel or pinch
  zooms, drag pans, and a "fit all" button.
- [x] Span rendering: `alive` solid; `lost` dashed + greyed ("you made it worse"); `frozen`
  dashed with interruption styling; `unresolved` hatched/shimmering.
- [x] End markers: **X** (death), **O** (open, glowing, clearly clickable), **!** (interrupted),
  ✓ (mission complete).
- [x] Event markers along lanes (kills, hazard destroyed, levers, damage taken), with hover/tap
  tooltips from `strings.ts`. Keep them subtle so X/O dominate.
- [x] **Scrubber ([D23]):** a vertical line labeled "Resolving history…" that sweeps right from
  the last attempt's `toTick` as resolve progress arrives. Time to its right is dimmed as
  "unconfirmed". As it passes, lanes update with a quick animation: things that no longer happen
  grey out, X↔O flips pulse, and spawn options appear or disappear (a lost capture point fades
  out of the spawn panel). The screen is fully usable while it runs. The scrubber disappears when
  done. The component just consumes a stream of truth updates. PHASE04 wires the real worker,
  and here a fixture fakes the stream.
- [x] **History-changed highlight:** lanes in `changes` pulse once, with a short caption ("Soldier 1
  survived!" / "Soldier 1 now dies at 1:12").
- [x] **Spawn panel:** each `new` option shows spawn-point name, a small map thumbnail with the
  point marked, and its **entry time** ("Road: enters at 0:06"). Each `resume` option is the O
  itself, plus a list entry ("Resume Soldier 1 at 0:48").
- [x] Selecting an option highlights it (and its lane/point). A **Deploy** button confirms.
  Keyboard: arrows/tab cycle options, Enter deploys. Never imply a static figure can be possessed
  mid-life. Only O endpoints are selectable.
- [x] Header: attempt number, soldiers used, battle time reached, objective status.
- [x] Emits `onDeploy(option: SpawnOption)`. No knowledge of the sim.
- [x] Mobile-friendly layout (it'll be used on phones later): tap targets ≥ 44px; the timeline
  scrolls horizontally inside its panel and the page never does.
- [x] Dev page: `?screen=respawn&fixture=<name>` renders fixtures. Write fixtures for: first
  death; rescue achieved (X→O); O ignored (static); history made worse (dashed); interruption;
  12 soldiers across 2 spawn points; a 40-soldier dense case; a **scrubber sweep** fixture that
  streams progressive updates, including an O that flips to X and a lane that becomes
  `neverSpawned`.

## Acceptance
- Model unit tests pass (table above, spawn-slot counting, idempotence, invariants).
- Every fixture renders legibly. Someone unfamiliar can tell which soldiers died, which can be
  resumed, and where/when each spawn option enters.
- Deploying from the UI yields the right `SpawnOption` object (unit-test the selection logic).

## Notes from implementation
- **Part 1** (truth model) shipped first; see `src/timeline/` and its tests.
- **API for PHASE04** (`src/ui/respawn/respawn-screen.ts`, props types in `respawn-model.ts`):
  `const screen = RespawnScreen.mount(root, props, { onDeploy, settings })`. `props` is
  `{ map, soldiers, lanes, options, changes?, attemptsPlayed, reachedTick, objectiveComplete?,
  resolvedUntil? }`. The header shows "Attempt {attemptsPlayed + 1}". Each scrubber step calls
  `screen.update({ lanes, changes, options, resolvedUntil })`. Omitted fields keep their values,
  and `resolvedUntil: null` hides the scrubber. `setResolving(tick | null)` is shorthand for that
  last part. Also available: `onDeploy(cb)` (returns an unsubscribe), `select(key)`,
  `selectedOption()`, `deploy()`, `fitAll()`, `zoomBy(f)`, `setSettings(s)` and `destroy()`.
  The screen appends a `position: absolute; inset: 0` element to `root`, listens for keys on
  `window` while mounted (ignoring inputs and the F2 panel) and knows nothing about the sim.
- **Selection.** The first option (a new soldier at the first spawn point) is selected on open.
  If the scrubber removes the selected option, the selection is **cleared** rather than moved,
  so Enter can never deploy something the player didn't pick. Arrows and Tab cycle with
  wrap-around, Enter deploys, and double-clicking an option deploys it. Clicking or tapping an O
  selects its resume. X, !, labels and spans are not selectable. Resume options the scrubber
  hasn't reached are still offered, tagged "Not confirmed yet" ([D23]).
- **Readability.** The selected option draws a dashed yellow guide at its entry or resume tick,
  labeled on the axis (e.g. "Road 0:06"). There is a legend, X/O/!/✓ glyphs, hatched
  `unresolved` spans with a "?", and a "Never spawned" label on greyed rows. Event markers are
  small diamonds with tooltips (`marker.*` strings, falling back to `marker.<kind>` when a
  marker's `stringKey` is empty). Adjacent same-kind spans from different attempts are drawn as
  one span (`displaySpans`).
- **Animations.** Lanes in `changes` pulse once and add a caption (newest highlighted, at most 3
  plus "+N more"; captions stay up while the screen is open). Span ranges whose kind changed
  flash. New options slide in and removed ones fade out. Everything is re-rendered as SVG
  strings and the animations survive re-renders through negative `animation-delay`.
- **Settings** (group "Respawn screen", also registered in `main.ts` so they appear in the game's
  F2 panel): `respawn.eventMarkers`, `respawn.rowHeight` (28–72, default 44),
  `respawn.autoFit` (off keeps the last zoom/pan across opens), `respawn.wheel`
  (`zoom`: wheel zooms and Shift scrolls rows; `scroll`: wheel scrolls and Ctrl zooms),
  `respawn.animations` and `respawn.legend`.
- **Dev page.** `?screen=respawn&fixture=<name>` goes through the new entry `src/app/boot.ts`
  (index.html now loads it), which imports `respawn-dev.ts` without Phaser, or `main.ts` as
  before. `&still=1&step=N` jumps the scrubber stream to step N for screenshots. The dev bar
  has a fixture picker, a stream replay button and a settings button. Fixtures
  (`src/ui/respawn/__fixtures__/respawn-fixtures.ts`) are built by a small `Story` helper that
  runs the real `applyObservation`/`deriveSpawnOptions` on mission-01: `empty`, `first-death`,
  `rescue`, `o-ignored`, `worse`, `interruption`, `twelve`, `dense-40` (seeded), `scrubber`
  (S2 X→O, S1 O→X, S4 → neverSpawned, options update live) and `complete` (✓).
- **Deviations.** There is no spawn interval or lead-in in `tuning.ts` yet, so fixtures use a
  local `FIXTURE_RULES` (2 s / 5 s). PHASE04 should add those to tuning and pass them to
  `deriveSpawnOptions`. The scrubber's neverSpawned soldier uses a fake `outpost` spawn point
  (no capture points until 05-a), labeled via `spawn.fixture.outpost`. I added
  `spawn.mission01.road`/`beach` strings, which mission-01's `nameKey`s referenced but which
  were missing. jsdom isn't installed, so the DOM layer was verified in Chromium (Playwright:
  click O → resume selected, Tab/Enter deploy, wheel zoom, drag pan, fit, tooltips) and only the
  pure logic has Vitest tests (`src/ui/respawn/__tests__/`).
