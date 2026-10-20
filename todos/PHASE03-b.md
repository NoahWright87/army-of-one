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

### `applyObservation(lanes, soldiers, obs) → { lanes, changes: LaneChange[] }`
For each lane in `obs.lanes`, let `W = [max(obs.fromTick, recordedFrom), min(obs.toTick, recordedTo)]`.
Only `W` (and consequences of a death/interruption inside it) may change ([D3]):

| Fate in W | Spans | End |
|---|---|---|
| `died @ t` | `alive` up to t, `lost` (dashed) from t+1 to `recordedTo` | `death @ t` (X) |
| `static @ t` | `alive` to t (= recordedTo) | `open @ t` (O) |
| `interrupted @ t` | `alive` up to t, `frozen` from t+1 to `recordedTo` | `interrupted @ t` |
| `alive` | `alive` over W. After W, keep prior spans **unless** prior truth had this soldier dead/interrupted at or before `obs.toTick`. That's now contradicted, so mark after W as `unresolved` | keep prior end, or `unresolved` in the contradicted case |

- New lanes (a soldier's first life) are created from its `SoldierRecord` and then the observation
  is applied. Resumed soldiers' lanes extend to their new `recordedTo`.
- Markers inside `W` are replaced by the observation's markers. Markers outside `W` are kept.
- `changes` lists every lane whose `end` changed (O→X, X→O, …), for "history changed" highlights.
- Property-style tests: spans always exactly cover `[recordedFrom, recordedTo]` with no overlap.
  Applying the same observation twice is idempotent. Lanes outside the window are untouched.

### `deriveSpawnOptions(map, soldiers, lanes) → SpawnOption[]`
- `new` for each initial spawn point: `entryTick = openTick + count(soldiers who spawned there) ×
  tuning.spawnInterval` ([D7]). Every soldier ever spawned there uses up a slot, dead or alive.
- `resume` for each lane with `end.kind === 'open'`: `resumeTick = end.tick`,
  `leadInFromTick = max(recordedFrom, end.tick − 5s)` ([D5]).
- ⛔ Interrupted lanes and `unresolved` lanes are **not** offered. Make each a single
  flag-guarded branch, pending [Q2] and [Q1].
- Capture-point spawns are added in PHASE05-a. Keep the function easy to extend.

## Part 2: Respawn screen (`src/ui/respawn/`, DOM/SVG overlay)

Design doc §04 and §11 are the spec. Make it **fast to read and fast to decide**.

- [ ] One **row per soldier** ("Soldier 3"), aligned on a shared **battle-time** x-axis (not
  wall-clock). Rows are ordered by ordinal. Long missions need horizontal zoom/pan: wheel or pinch
  zooms, drag pans, and a "fit all" button.
- [ ] Span rendering: `alive` solid; `lost` dashed + greyed ("you made it worse"); `frozen`
  dashed with interruption styling; `unresolved` hatched/shimmering.
- [ ] End markers: **X** (death), **O** (open, glowing, clearly clickable), **!** (interrupted),
  ✓ (mission complete).
- [ ] Event markers along lanes (kills, hazard destroyed, levers, damage taken), with hover/tap
  tooltips from `strings.ts`. Keep them subtle so X/O dominate.
- [ ] **History-changed highlight:** lanes in `changes` pulse once, with a short caption ("Soldier 1
  survived!" / "Soldier 1 now dies at 1:12").
- [ ] **Spawn panel:** each `new` option shows spawn-point name, a small map thumbnail with the
  point marked, and its **entry time** ("Road: enters at 0:06"). Each `resume` option is the O
  itself, plus a list entry ("Resume Soldier 1 at 0:48").
- [ ] Selecting an option highlights it (and its lane/point). A **Deploy** button confirms.
  Keyboard: arrows/tab cycle options, Enter deploys. Never imply a static figure can be possessed
  mid-life. Only O endpoints are selectable.
- [ ] Header: attempt number, soldiers used, battle time reached, objective status.
- [ ] Emits `onDeploy(option: SpawnOption)`. No knowledge of the sim.
- [ ] Mobile-friendly layout (it'll be used on phones later): tap targets ≥ 44px; the timeline
  scrolls horizontally inside its panel and the page never does.
- [ ] Dev page: `?screen=respawn&fixture=<name>` renders fixtures. Write fixtures for: first
  death; rescue achieved (X→O); O ignored (static); history made worse (dashed); interruption;
  12 soldiers across 2 spawn points; a 40-soldier dense case.

## Acceptance
- Model unit tests pass (table above, spawn-slot counting, idempotence, invariants).
- Every fixture renders legibly. Someone unfamiliar can tell which soldiers died, which can be
  resumed, and where/when each spawn option enters.
- Deploying from the UI yields the right `SpawnOption` object (unit-test the selection logic).

## Notes from implementation
_(append here)_
