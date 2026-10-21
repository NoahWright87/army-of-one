# PHASE05-b: Army-scale stress harness & performance

**Goal:** prove (or disprove, with numbers) that 100+ echoes stay responsive on a typical desktop
browser, without anyone hand-playing 100 lives. The design doc: "Basic observability or
stress-testing proves that many echoes can be exercised without manually playing dozens of
lives." Find the real budgets by benchmarking, not guessing.

**Depends on:** PHASE04. **Parallel with:** PHASE05-a.
**Owns:** `tools/**` (bench + bots), `src/sim/bots/**`, perf-only changes in `src/sim/**` and
`src/render/**`, `docs/perf.md`.

## Tasks
- [x] **Bot lives** (`src/sim/bots/`): headless "players" that generate realistic recordings
  through the normal live-input path: route-walkers along nav paths between map points, turret
  hunters that shoot hazards in LOS, idlers, crowd-cluster walkers (to stress [D14] separation).
  Deterministic given a seed (the seeded PRNG is fine here: bots are tooling, not sim).
- [x] **Bench CLI:** `npm run bench -- --map mission-01 --echoes 25,50,100,200,400`. Builds a
  mission from N bot lives (chained attempts, so truth is real), then reports ms/tick (mean, p95),
  snapshot memory, and encoded save size. Commit results to `docs/perf.md` with machine notes.
- [x] **Browser stress mode:** `?stress=100` generates 100 bot lives, then drops you onto the
  respawn screen to play among them. The debug overlay (02-b) shows sim ms, render ms, sprite
  count, echo counts by role.
- [x] Optimize where the profiler points, likely: a spatial hash for separation/targeting/LOS
  candidates; on-schedule echoes skipping all pathfinding; path caching; turret target queries;
  render culling offscreen; cheaper static-figure effects; label culling at distance; snapshot
  thinning for old battle time.
- [x] Keep the readability risk in view (design doc §14 "Large armies obscure action"): with 100
  echoes, the live soldier and incoming fire must still be findable. Add a toggle to dim echoes.

## Acceptance
- `docs/perf.md` has a table of echo count vs ms/tick and frame time, for sim and render.
- The design doc's "Many echoes" scenario holds at the count we can honestly support. Report
  that number to the owner. Don't promise one in advance.

## Notes from implementation

Numbers, machine notes and the supported-army recommendation are in `docs/perf.md`.

### What's where
- `src/sim/bots/bot.ts`: `planBot` (seeded plan: goals, dwell, life length, engage range) and
  `createBotDriver` (one `SoldierInput` per tick from what it can see). Kinds: `route` (nav
  paths between random reachable points), `hunter` (heads for the turret, shoots turrets and
  mines its rifle would actually hit, never a mine within blast radius), `idler`, `crowd` (mills
  around a rally point shared by its spawn point: the [D14] stress). Bots wait for gaps in
  traffic and replan when stuck. Uses the seeded PRNG; reachability is a BFS over the nav grid,
  cached per map/tuning/spawn point.
- `src/sim/bots/army.ts`: `ArmyBuilder` plays one attempt per bot life at the spawn point's next
  [D7] slot, from the nearest snapshot before its lead-in, with every earlier life as an echo.
  `next()` is incremental (the browser yields between lives; the bench measures at checkpoints:
  the first N lives are identical whatever the final size). `observations` / `recordsAfter` let
  callers fold the truth with `applyObservation`.
- `tools/bench.ts` (`npm run bench`): see the header for flags. `--naive` runs with every
  optimization switched off. `--life lo,hi` sets bot life seconds (long lives = more echoes
  alive at once).
- `src/sim/perf.ts`: `simPerf` switches, all on. Tests flip them with `setSimPerf`.
- `src/app/stress.ts` + `main.ts`: `?stress=N[&stressSeed=s]`, then
  `GameController.adoptMission(state, snapshots)` (new, small) opens the respawn screen.
  Stress mode **replaces the saved mission** (it goes through `newMission`).

### Optimizations (all bit-exact; `src/sim/__tests__/perf-equivalence.test.ts`)
- `moveCircle` broadphase: only rects within `radius` of a box around the move are tested; if
  pushes carry the circle out of the box the move is redone against everything. The inner loop
  is `circleRectPush` inlined (same arithmetic, no allocations).
- Soldier spatial hash (`world/soldier-grid.ts`): separation pairs (above 24 soldiers), mine
  triggers and vehicle contact. Queries return ascending indices, so per-soldier push sums are
  accumulated in the same order as the O(n²) scan and damage happens in the same order.
- A*: per-grid reusable buffers with generation stamps and a typed-array heap with the same
  strict (f, h, cell) order, so the same cells are expanded in the same order.
- Turrets compute `dynamicBlockers` once per turret step (turret shots only hurt soldiers, which
  never block), instead of once per LOS ray.
- `getSoldier` / echo controller / observation use a cached id → soldier map (keyed by the
  soldiers array and its length; soldiers are only appended).
- Snapshot thinning (`tuning.attempt.snapshotDenseWindowTicks` 3600 /
  `snapshotSparseEveryTicks` 300): older than 60 s behind the newest snapshot, keep one per 5 s.
  Only the fast-forward length on a deep deploy changes (≤ 5 s of battle time).
- Render: off-screen soldiers aren't drawn (`debug.cullOffscreen`, default on, no visible
  change); `display.echoLabelRadius` (default 0 = all) hides far labels; `display.dimEchoes`
  (default off) + `display.dimEchoesLevel` fade echoes, statics, corpses and echo tracers and
  drop echo labels/HP bars so the live soldier and incoming fire stay findable.
- The equivalence test builds a 36-life army (crowd-heavy, > 24 alive) with the switches off
  and on and compares recordings, observations and a full replay's world hash every tick; plus
  a 40-soldier pile-up and A* path comparisons. A mutation check (dropping neighbour cells from
  the separation grid) makes it fail. Note: position quantization (1/256) makes the sim robust
  to last-bit float differences, so pure summation-order changes would usually not show up;
  the code keeps the order anyway.

### Deviations / for later phases
- Not done: render-side static-figure batching (with the static flicker setting off they're
  already cheap) and BitmapText labels; the frame time in headless Chromium is dominated by
  software GL fill rate, not by sprite count (see perf.md), so they weren't worth it yet.
- The debug overlay gained sim ms per frame, render ms (CPU side of `WorldRenderer.render`),
  drawn objects (and how many soldiers were culled) and a soldiers-by-role line.
- `tuning.attempt` gained the two snapshot-thinning fields (shared file, additive).
