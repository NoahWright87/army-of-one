# PHASE06-a: Linear "straight shot" mission + fast pacing

**Goal:** a mission that *is* the game within seconds. You spawn at the bottom of the map and the
turrets are right there, up ahead. You die, respawn, stack echoes, push upward. Rulings: [D27]
(one direction, forward = up), [D28] (contact within seconds), plus everything earlier.

**Depends on:** PHASE05. **Parallel with:** 06-b, 06-c.
**Owns:** `src/content/maps/**`, `src/sim/scenarios/**`, `src/app/autoplay-lives.ts`, pacing values
in `src/content/tuning.ts`, camera follow code in `src/render/phaser/**` (camera only).

## Tasks
- [ ] **`mission-03` "Breach"** (new default mission; keep mission-01/02 selectable):
  - Tall, narrow battlefield. Spawns at the **bottom**, objective at the **top**; forward = up.
    Nothing sends you back down or far sideways.
  - **2–3 initial spawn points** across the bottom (e.g. West / Centre / East lanes), so spawn
    choice matters ([D7] staggers apply per point).
  - **First contact in ≈3–5 s** of walking: a turret line with line of sight on the approach, plus
    some cover (wall stubs, sandbags as walls) so a careful player can make progress and a
    careless one dies fast. This is the "watch S1 die → save S1" setup, immediately.
  - Then a few short **layers** going up, each a new problem that past echoes can help with: a
    gate/lever or drawbridge choke, a mine strip or traffic lane, a **forward capture point**
    (forward spawn, [D8]), a final turret nest, then the objective (destroy and/or flag).
  - Total unopposed sprint bottom → top ≈ 30–40 s at the tuned speed. Keep every layer within a
    screen or two.
- [ ] **Pacing tuning** (all `// TUNE`, visible in F2): bump soldier speed if it feels sluggish,
  make turrets and the objective lethal/destructible on a quick cadence, and shorten anything that
  makes the first life slow.
- [ ] **Camera look-ahead:** bias the camera so you see more of what's ahead (up, and toward where
  you aim), with smoothing. It's a setting (`display.cameraLookAhead`: off / up / aim).
- [ ] Spawn soldiers **facing up** on this map.
- [ ] **Scripts + autoplay lives** for the new map:
  - `breach-naive`: dies to the first turrets within a few seconds.
  - `breach-snipe`: kills a turret from cover.
  - `breach-rescue`: a story that ends with a resumable O.
  - `breach-capture`: takes the forward point.
  - `breach-win`: a winning life (with echoes' help, if needed).
- [ ] **Scenario tests** on mission-03:
  - S1 dies to the turret line within ~5 s.
  - The rescue → O → resume chain works.
  - Forward capture → forward spawn works.
  - Determinism (run twice, compare hashes).
  - Bots (`src/sim/bots/`) can build an army on it (stress mode, `?stress=50`).
- [ ] Title screen and `?mission=` default to mission-03. The old missions stay in the picker.

## Acceptance
- Fresh game: from clicking Deploy to the first turret shots at you takes **under ~8 s**,
  including the 5 s countdown.
- Playing it reads as "straight up the map". The respawn screen's map (06-b) will show a tall
  strip with spawns at the bottom.
- All existing tests still pass.

## Notes from implementation
_(append here)_
