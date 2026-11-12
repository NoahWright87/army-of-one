# PHASE13: Seeded generation of levels and the world map (sketch)

**Goal:** generate missions, and the world map that connects them, from a seed,
deterministically ([D56]). Same seed, same campaign, for everyone, so players can share runs
and compete on a weekly seed ([D58]).

**Depends on:** PHASE11 (a budget to balance a level against) and ideally PHASE12-a/b (the full set
of building blocks), so the generator isn't rewritten for every new unit type.

## Direction
- Pure TS (`src/gen/`, lint-restricted like `src/content/`), seeded PRNG only
  (`src/sim/core/rng.ts`), output is plain map data (the same `MapDef` the hand-made maps use).
  A CLI (`npm run gen -- --seed N`) prints/renders a level for review.
- Levels follow the Breach template as hard rules ([D27], [D28], [D31]): forward is up, one
  direction, contact within seconds of spawning. Breach and Compound are the reference.
- Building blocks: chunks/rooms stitched along a vertical spine (cover clusters, turret nests,
  enemy squads, traffic, gates/bridges, capture points, mines), with a difficulty and money
  budget per level.
- Validation: every generated level must be solvable (a path from spawn to objective; a headless
  bot run reaches it), within size and enemy-count limits.
- World map: a graph of levels (branching routes, harder/safer choices), generated from the
  same seed. What a node offers depends on PHASE14.
- Versioning ([E11]): every seed is stored with the generator + content version; old versions
  stay runnable for old recordings.

## ⛔ Decisions needed first
- World map shape: a branching path (pick the next node, like a roguelite) or an open map?
- How long is a generated campaign? Does it end (a boss level), or go on forever?
- Mission types to generate first (design doc table: beachhead, crossroads seizure, fortified
  infiltration, multi-front).
- The hand-made campaign (tutorial to final boss): before generation, after, or in parallel?
