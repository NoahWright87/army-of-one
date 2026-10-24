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
- [ ] **Respawn screen map panel** (DOM/SVG or canvas, independent of Phaser):
  - unrevealed = dark fog; revealed = map walls/water drawn simply;
  - spawn points as selectable markers (clicking one selects that spawn option);
  - threats as small icons; X and O markers.
  - The selected option is highlighted on both the map and the timeline.
  - Fits the existing layout: desktop gets a third column or sits above the spawn list; phone
    stacks it. The panel is tall-and-narrow friendly (06-a's mission is a vertical strip).
- [ ] **In-game minimap:** a corner overlay with revealed fog, the live soldier (bright), echoes
  (dim dots), static figures, the objective, and the camera viewport rectangle. Cheap: redraw the
  fog only when reveal changes, and draw dots per frame.
- [ ] Settings: `display.minimap` (on), `display.minimapSize` (S/M/L), `display.minimapOpacity`,
  `respawn.showMap` (on). Tuning: `reveal.radius`, `reveal.cellSize`, `reveal.occludeByWalls`.
- [ ] Strings for all labels/tooltips in `strings.ts`.
- [ ] Dev fixture: `?screen=respawn&fixture=...` shows the map with a realistic reveal (build it
  from real recordings).

## Tests
- [ ] Reveal from simple recordings.
- [ ] Un-reveal when truth changes (a soldier now dies earlier).
- [ ] Incremental update equals a full recompute.
- [ ] Threat visibility and destroyed status.
- [ ] Death/O positions.
- [ ] Perf: 100 soldiers × 2 min recompute in well under a frame budget (report the number).

## Acceptance
- On the respawn screen you can see where each spawn point is relative to where soldiers died and
  what threats are known, and pick a spawn from the map.
- The minimap shows the revealed area and everyone's position during play, at no noticeable frame
  cost.

## Notes from implementation
_(append here)_
