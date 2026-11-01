# PHASE06-b: Revealed map (respawn-screen map + in-game minimap)

**Goal:** you always know where you're spawning and what's out there. Show what your soldiers have
seen so far ([D29]) on the respawn screen, where you choose a spawn, and in a small in-game
minimap.

**Depends on:** PHASE05. **Parallel with:** 06-a, 06-c.
**Owns:** new `src/timeline/reveal.ts` (+ tests; pure TS), a map panel in `src/ui/respawn/**`, new
`src/ui/minimap/**` (or a Phaser minimap in `src/render/phaser/minimap*.ts`, your call), and small
additive wiring in `src/app/game.ts`.

## Model (pure, deterministic, cheap)
- **Reveal grid** over the map (cell size in tuning, e.g. 64 units). A cell is *revealed* if any
  soldier, **in the current truth**, was alive within `reveal.radius` of it.
  - Use each lane's `alive` spans and its recording's waypoints (sample every N ticks; exactness
    isn't needed).
  - Optional wall occlusion (`reveal.occludeByWalls`, default off: a radius is fine for a basic
    map).
  - Because it follows the truth, history changes un-reveal areas too. That's honest and
    consistent with [D2].
- **Known things**, derived from the map and the truth:
  - spawn points, including captured forward points;
  - threats (turrets, mines, vehicles' lanes, gates/bridges) whose position is revealed, with
    destroyed status if the truth has a `hazardDestroyed` marker for them;
  - the objective (always shown, so you know which way is "forward");
  - **death positions** (X), and positions of resumable soldiers (O), from recordings.
- Incremental and cached: recompute only lanes that changed. Fine to run on every scrubber update.
- During a live attempt, also reveal what the live soldier sees, so the minimap updates while
  exploring.

## UI
- [x] **Respawn screen map panel** (DOM/SVG or canvas, independent of Phaser):
  - unrevealed = dark fog; revealed = map walls/water drawn simply;
  - spawn points as selectable markers (clicking one selects that spawn option);
  - threats as small icons; X and O markers.
  - The selected option is highlighted on both the map and the timeline.
  - Fits the existing layout: desktop gets a third column or sits above the spawn list; phone
    stacks it. The panel is tall-and-narrow friendly (06-a's mission is a vertical strip).
- [x] **In-game minimap:** a corner overlay with revealed fog, the live soldier (bright), echoes
  (dim dots), static figures, the objective, and the camera viewport rectangle. Cheap: redraw the
  fog only when reveal changes, and draw dots per frame.
- [x] Settings: `display.minimap` (on), `display.minimapSize` (S/M/L), `display.minimapOpacity`,
  `respawn.showMap` (on). Tuning: `reveal.radius`, `reveal.cellSize`, `reveal.occludeByWalls`.
- [x] Strings for all labels/tooltips in `strings.ts`.
- [x] Dev fixture: `?screen=respawn&fixture=...` shows the map with a realistic reveal (build it
  from real recordings).

## Tests
- [x] Reveal from simple recordings.
- [x] Un-reveal when truth changes (a soldier now dies earlier).
- [x] Incremental update equals a full recompute.
- [x] Threat visibility and destroyed status.
- [x] Death/O positions.
- [x] Perf: 100 soldiers × 2 min recompute in well under a frame budget (report the number).

## Acceptance
- On the respawn screen you can see where each spawn point is relative to where soldiers died and
  what threats are known, and pick a spawn from the map.
- The minimap shows the revealed area and everyone's position during play, at no noticeable frame
  cost.

## Notes from implementation

### What's where
- **Model (pure):** `src/timeline/reveal.ts`.
  - `revealOptions(tuning)` → `{ radius, cellSize, occludeByWalls, sampleTicks }` from the new
    `tuning.reveal` section (480 / 64 / false / 30, all `// TUNE`, so they also show in F2 → Sim
    tuning).
  - `new RevealGrid(map, opts)`; `grid.update(soldiers, lanes)` brings it up to date with the
    truth and returns how many lanes it re-sampled. `revealed: Uint8Array` (1 = seen),
    `version` (bumps on any change), `fraction`, `isRevealedAt`, `isRectRevealed`,
    `isSegmentRevealed`, `revealLive(x, y)` / `clearLive()` (the live soldier's layer for the
    minimap), `snapshot()`. `revealedRuns(grid)` merges cells into horizontal runs for drawing.
  - How: every cell a soldier was **alive** in (lane `alive` spans only; `lost`, `frozen` and
    `unresolved` reveal nothing) is a "visited centre", sampled from its recording every
    `sampleTicks` with straight-line gap filling (works for sparse recordings too). Revealed =
    visited centres dilated by the radius disc, computed with per-row prefix sums (cost depends
    on the grid, not on the army). Per-lane centre lists are cached under a signature of the
    lane's alive spans + recorded extent, and the grid keeps per-cell reference counts, so an
    update only re-samples changed lanes and always equals a full recompute (tested on random
    histories). With `occludeByWalls`, each centre reveals only disc cells with grid line of
    sight past static walls (wall-overlapped cells block; the wall cell itself is seen). Gates
    and bridges don't occlude.
  - `knownThings(map, grid, soldiers, lanes, captures)` → spawns (initial always; forward ones
    once ours or seen), threats in seen cells (turrets, mines, traffic lanes clipped to the map,
    gates, bridges) with `destroyed { tick, by }` from the truth's `kill` / `hazardDestroyed` /
    `objective` markers (`destroyedRefs`), objectives (always; flag objectives done when ours),
    other capture points (seen or ours), and lane ends X / O / ! at the recorded position of the
    end tick (`poseAtRecord`).
- **Respawn map panel:** `src/ui/respawn/map-panel.ts` (DOM/SVG) + `map-panel-model.ts` (pure:
  `mapMarkers`, `labelsThatFit`, `isTallMap`, `tallMapWidth`, `unitsPerPx`, `revealFor`, and a
  module-level `sharedRevealGrid` so every scrubber step and every re-open is incremental).
  The screen owns it (`RespawnScreen.renderMap`); nothing changed in its public API. Fog = a
  blurred SVG mask built from the revealed runs over ground / water / walls. Markers keep a
  fixed pixel size at any scale. Spawn points and O markers are selectable (click selects,
  double-click deploys; hit circles are 22 px radius, so ≥ 44 px), the selection is highlighted
  on the map, the timeline and the list. Everything has a tooltip (hover or tap).
  - **Layout.** Wide maps: desktop puts the map above the spawn list (360 px column); phone puts
    it in the timeline's area behind a **Map / Timeline** toggle (default timeline, remembered
    while the page is open), so the timeline keeps its height. Tall maps (`height > 1.2 ×
    width`, 06-a's strip): desktop gets a third column whose width follows the height
    (150–320 px); phone puts the strip next to the spawn list. On phones with a map the option
    thumbnails are hidden (the map shows where). The page never scrolls (checked at 1280×800
    and 390×844).
- **Minimap:** `src/ui/minimap/minimap.ts` (DOM, two canvases, bottom-right) +
  `minimap-model.ts` (pure: `minimapBox`, `dotKind`, `DOT_STYLE`) + `minimap-settings.ts`.
  Base canvas (fog, seen terrain, spawns, objective, mines/gates/traffic) is redrawn only when
  the reveal version changes; the top canvas (echo dots dim, statics grey, interrupted orange,
  live soldier bright yellow, turrets' live state if seen, camera viewport rectangle) only when
  the tick or the camera moved. Each frame the live soldier calls `revealLive`, so the fog lifts
  as you explore. It runs its own `requestAnimationFrame` loop while a life is on screen
  (headless `fast=1` lives don't start it). Wiring is in `main.ts` (`startMinimap(run)` in the
  Phaser host's `start`, `minimap.stop()` in `stop`); the camera rect is read from the battle
  scene's `cameras.main.worldView`. **No changes to `battle-scene.ts`.**
- **game.ts:** one additive line: `showRespawn` passes `reveal: revealOptions(this.tuning)` in
  the props (`RespawnProps.reveal?`, optional; defaults to `DEFAULT_TUNING`).

### Settings
- `respawn.showMap` (Respawn screen group, on): the map panel. Its legend follows
  `respawn.legend`.
- `display.minimap` (on), `display.minimapSize` (S / M / L = 140 / 190 / 250 px longest side;
  tall maps may be 1.5× taller), `display.minimapOpacity` (0.3–1, default 0.85). Registered in
  `main.ts` next to the display settings.
- Tuning: `reveal.radius`, `reveal.cellSize`, `reveal.occludeByWalls`, `reveal.sampleTicks`.

### Fixtures (`?screen=respawn&fixture=…`), from real recordings
`src/ui/respawn/__fixtures__/map-fixtures.ts` plays scripted lives through the real attempt
runner (echoes included), then a resolve pass, and folds the truth with the real
`applyObservation` / `applyCaptureObservation`:
- `map`: mission-01, S1 rescued by S2's snipe (O), S3 dead in the minefield, destroyed turret.
- `map-outpost`: mission-02, Outpost captured (forward spawn on the map), S2 dead on the road.
- `map-tall`: a 1400 × 6000 strip (`STRIP_MAP`, forward = up) with West / Centre / East spawns
  at the bottom, a turret line and an objective at the top. Stand-in for 06-a's mission-03.

### Perf (Node 22, this container; `src/timeline/__tests__/reveal-perf.test.ts`)
100 soldiers × 2 min of lossless (per-tick) recordings on mission-01 (100 × 69 cells), wandering
over the whole map: **full recompute ≈ 6.5–7 ms**, **incremental (one lane changed) ≈ 0.4 ms**,
`knownThings` ≈ 1.3 ms. The full recompute is bound by reading the recordings (memory), so it
happens once per page load; scrubber steps and re-opens are incremental. `occludeByWalls` costs
≈ 95 ms for that full recompute (opt-in only). In the browser, `?stress=40` opens with the map
at once, and the minimap's frame cost doesn't show in the debug overlay.

### Deviations / notes for later
- Echoes in the current attempt don't add to the minimap's reveal (they replay the truth, which
  is already revealed); only the live soldier does.
- X markers draw above spawn markers (a death at a spawn stays visible); O markers on top.
- On a narrow strip, spawn labels that would overlap are dropped (`labelsThatFit`); the list
  and tooltips still name them.
- The respawn dev bar (DEV, top right) overlaps the header on small screens; that's pre-existing.
- Open question added: [Q17] (phone layout for wide maps).
