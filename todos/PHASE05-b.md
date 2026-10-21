# PHASE05-b: Army-scale stress harness & performance

**Goal:** prove (or disprove, with numbers) that 100+ echoes stay responsive on a typical desktop
browser, without anyone hand-playing 100 lives. The design doc: "Basic observability or
stress-testing proves that many echoes can be exercised without manually playing dozens of
lives." Find the real budgets by benchmarking, not guessing.

**Depends on:** PHASE04. **Parallel with:** PHASE05-a.
**Owns:** `tools/**` (bench + bots), `src/sim/bots/**`, perf-only changes in `src/sim/**` and
`src/render/**`, `docs/perf.md`.

## Tasks
- [ ] **Bot lives** (`src/sim/bots/`): headless "players" that generate realistic recordings
  through the normal live-input path: route-walkers along nav paths between map points, turret
  hunters that shoot hazards in LOS, idlers, crowd-cluster walkers (to stress [D14] separation).
  Deterministic given a seed (the seeded PRNG is fine here: bots are tooling, not sim).
- [ ] **Bench CLI:** `npm run bench -- --map mission-01 --echoes 25,50,100,200,400`. Builds a
  mission from N bot lives (chained attempts, so truth is real), then reports ms/tick (mean, p95),
  snapshot memory, and encoded save size. Commit results to `docs/perf.md` with machine notes.
- [ ] **Browser stress mode:** `?stress=100` generates 100 bot lives, then drops you onto the
  respawn screen to play among them. The debug overlay (02-b) shows sim ms, render ms, sprite
  count, echo counts by role.
- [ ] Optimize where the profiler points, likely: a spatial hash for separation/targeting/LOS
  candidates; on-schedule echoes skipping all pathfinding; path caching; turret target queries;
  render culling offscreen; cheaper static-figure effects; label culling at distance; snapshot
  thinning for old battle time.
- [ ] Keep the readability risk in view (design doc §14 "Large armies obscure action"): with 100
  echoes, the live soldier and incoming fire must still be findable. Add a toggle to dim echoes.

## Acceptance
- `docs/perf.md` has a table of echo count vs ms/tick and frame time, for sim and render.
- The design doc's "Many echoes" scenario holds at the count we can honestly support. Report
  that number to the owner. Don't promise one in advance.

## Notes from implementation
_(append here)_
