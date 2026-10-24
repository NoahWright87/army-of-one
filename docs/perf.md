# Performance: army scale (PHASE05-b)

How many echoes can mission-01 carry? Measured, not guessed. Reproduce with:

```
npm run bench -- --map mission-01 --echoes 25,50,100,200,400            # bot lives 30–100 s
npm run bench -- --map mission-01 --echoes 50,100,200 --life 150,240    # long lives: crowded field
npm run bench -- ... --naive                                            # optimizations off
npm run build && npx vite preview   # then open /?stress=100 (add &dev=1 for the DEV bar)
```

## Machine notes

- Headless numbers: a 4-vCPU cloud container (Intel Xeon @ 2.8 GHz, 15 GB RAM), Node 22.22,
  `tsx`. Other jobs shared the box during some runs, so treat differences under ~15 % as noise.
- Browser numbers: headless Chromium (Playwright) with **SwiftShader software GL** in the same
  container, 1280×720. Software GL is far slower than any real GPU: it caps even an empty
  battlefield at ~17–19 fps here (PHASE04 saw 24–30 fps on a quieter box). Use it to compare
  echo counts against each other, not as an absolute frame rate. Real-hardware numbers are still
  owed (see "Open items").

## How the army is built

`src/sim/bots/` bots play every life through the normal live-input path, one attempt per life,
chained like a player would: each new soldier enters at its spawn point's next [D7] slot, from
the nearest snapshot before its 5 s lead-in, with every earlier life replaying as an echo. The
mix (seed 1) is about 40 % route walkers, 15 % turret hunters, 15 % idlers and 30 % crowd
walkers that mill around one rally point per spawn (the [D14] separation stress). Early
hunters destroy the turret, and traffic and mines still kill some, so the truth is realistic:
in the 100-life mission the last attempt saw 61 O's, 33 alive and 3 deaths.

Because [D7] staggers entries 2 s apart per spawn point, "N echoes" is not "N soldiers on the
field at once". With 30–100 s lives, at most about 70 echoes are alive at the same moment, however
large the army. The `--life 150,240` runs keep lives long enough to have **up to 184 echoes
alive at once**. That is the realistic worst case for a 200-soldier mission.

## Sim: ms per tick (60 ticks per second, so the frame budget is 16.7 ms)

"Live" = a new bot deployed among the army like a player (`Attempt.step` per tick during its
life, which includes the echo controller, combat, recording and observation). "Resolve" = the
background scrubber pass over the whole battle from 0:00 ([D23]). Optimized = this branch with
the snapshot thinning on.

### Bot lives 30–100 s (peak about 70 echoes alive)

| Army | Alive echoes (mean / peak) | Live ms/tick before¹ (mean / p95) | Live ms/tick, naive² | **Live ms/tick, optimized** | Resolve ticks/s before¹ → naive² → **optimized** |
|---:|---:|---:|---:|---:|---:|
| 25 | 20 / 25 | 0.065 / 0.106 | 0.056 / 0.087 | **0.036 / 0.066** | 17.8k → 20.7k → **27.6k** |
| 50 | 34 / 47 | 0.128 / 0.235 | 0.107 / 0.210 | **0.068 / 0.112** | 11.7k → 16.1k → **19.9k** |
| 100 | 53 / 67 | 0.217 / 0.319 | 0.195 / 0.308 | **0.138 / 0.211** | 6.9k → 9.4k → **12.6k** |
| 200 | 38 / 70 | – | 0.288 / 0.350 | **0.109 / 0.171** | – → 4.7k → **9.5k** |
| 400 | 49 / 69 | – | 0.815 / 1.306 | **0.204 / 0.296** | – → 2.1k → **5.8k** |

¹ "Before" is the PHASE04 code before any change (only run up to 100).
² `--naive` switches every optimization off in this build. Its collision loop is already the
allocation-free version, so it is a bit faster than "before".

Building the army (all chained attempts) took 47 s → 29 s for 100 lives, and 575 s (naive) →
204 s for 400 lives.

### Long lives 150–240 s (crowded field, optimized)

| Army | Alive echoes (mean / peak) | Live ms/tick (mean / p95 / max) | Resolve ticks/s (mean / p95 ms) |
|---:|---:|---:|---:|
| 50 | 47 / 49 | 0.082 / 0.118 / 2.97 | 14.7k (0.067 / 0.107) |
| 100 | 93 / 95 | 0.228 / 0.300 / 42 | 9.4k (0.105 / 0.186) |
| 200 | 160 / 184 | 0.337 / 0.546 / 7.9 | 4.9k (0.203 / 0.405) |

At 184 alive echoes the sim uses about 0.35 ms of a 16.7 ms frame, or 2 %. The rare single-tick
maxima (8–40 ms, and one 195 ms in a resolve) are GC pauses and long A* replans by off-schedule
echoes in a crowd. They cost one late frame now and then, never a stall. Resolve passes run in
the Web Worker, so their spikes don't touch the frame at all.

### Where the time went (profiles, `node --cpu-prof` on the bench)

Before: `moveCircle` 26 % (every on-schedule echo's snap test and the end-of-tick push-out tested
every wall, allocating two objects per rect), GC 9 %, echo controller 7 % (a linear `getSoldier`
per echo: O(n²)), traffic contact and mine triggers (all soldiers × all vehicles/mines),
separation O(n²), A* allocating about 1.4 MB of grid arrays per call, and snapshot
`structuredClone` 4 %. After: the remaining cost is spread thin (echo controller, separation,
snapshot cloning, GC). Nothing dominates.

## Optimizations (all bit-exact)

Each one sits behind a switch in `src/sim/perf.ts`.
`src/sim/__tests__/perf-equivalence.test.ts` builds a 36-life crowd-heavy army with every switch
off and on and compares the recordings, the observations and a full replay's world hash **every
tick**. It also checks a 40-soldier pile-up and A* paths. If you drop neighbour cells from the
separation grid, the test fails. The existing determinism and exact-replay tests pass unchanged.

| Optimization | Why it's exact |
|---|---|
| `moveCircle` broadphase plus inlined push | A rect at least `radius` from every tested position pushes by exactly 0. If pushes leave the safe box, the move is redone against all rects. |
| Soldier spatial hash: separation (> 24 soldiers), mine triggers, vehicle contact | Queries return ascending indices, so each soldier's push sum is added in the same order as the O(n²) scan, and damage happens in the same order. |
| A* buffer reuse plus typed-array heap | Generation stamps replace refills. The heap pops in the same strict (f, h, cell) order. |
| Turret blocker list computed once per turret step | Turret shots only hurt soldiers, and soldiers never block. |
| Cached id → soldier index (`getSoldier`, echo controller, observations) | Soldiers are only appended and mutated in place. The cache is keyed by (array, length). |
| Snapshot thinning (`tuning.attempt.snapshotDenseWindowTicks` 60 s, `snapshotSparseEveryTicks` 5 s) | Any snapshot reproduces the same history. Only the deploy fast-forward gets longer (≤ 5 s of battle time, a few tens of ms). |

On-schedule echoes already skipped all pathfinding (PHASE03-a), so there was nothing to gain
there.

## Memory and save size (optimized)

| Army | Snapshot cache (before thinning → after) | Encoded save, raw (gzip) |
|---:|---:|---:|
| 25 | 709 KB → 591 KB | 435 KB (55 KB) |
| 50 | 1.6 MB → 1.1 MB | 871 KB (122 KB) |
| 100 | 2.8 MB → 1.8 MB | 1.7 MB (266 KB) |
| 200 | 11.4 MB → 5.3 MB | 3.5 MB (478 KB) |
| 400 | 31.5 MB → 11.2 MB | 7.0 MB (963 KB) |
| 200, long lives | 7.0 MB | 9.9 MB (1.6 MB) |

Snapshot bytes are V8 structured-clone sizes. A snapshot grows with the army (9 KB at 25, 86 KB at
400) because every soldier, including corpses and static figures, is in it.

Saves are 03-c's codec on the real recordings. They pass IndexedDB comfortably, but a 100+
army is past a safe localStorage budget (03-c already prefers IndexedDB). gzip shrinks them
about 7×, so turning on `CompressionStream` in the codec is a cheap win when that matters.

## Browser: frame time with `?stress=N` (SwiftShader, 1280×720)

The live soldier is deployed at Road among N bot echoes. Frame times come from `requestAnimationFrame` over 6 s.
"sim/frame" and "render" are the debug overlay's CPU numbers (sim steps per frame, and the
`WorldRenderer.render` call).

| View | Echoes | Drawn objects | fps (mean frame / p95) | sim ms/frame | render CPU ms |
|---|---:|---:|---:|---:|---:|
| zoom 1, near spawn | 1 | 38 | 17.4 (57 / 67 ms) | 0.47 | 0.20 |
| zoom 1 | 25 | 38 | 16.6 (60 / 83 ms) | 0.55 | 0.30 |
| zoom 1 | 50 | 45 | 16.8 (59 / 83 ms) | 0.59 | 0.20 |
| zoom 1 | 100 | 44 (97 soldiers culled) | 16.2 (62 / 83 ms) | 0.83 | 0.25 |
| zoom 0.4, no culling | 25 | 88 | 18.2 (55 / 67 ms) | 0.42 | 0.25 |
| zoom 0.4, no culling | 50 | 138 | 15.6 (64 / 83 ms) | 0.71 | 0.36 |
| zoom 0.4, no culling | 100 | 274 | 12.7 (79 / 100 ms) | 0.80 | 0.53 |
| zoom 0.4, no culling, labels off | 100 | 179 | 14.6 (68 / 83 ms) | 0.82 | 0.45 |
| zoom 0.6, dim echoes on | 100 | 77 | 17.9 (56 / 67 ms) | 0.70 | 0.28 |

What this shows: the CPU side is small. At 100 echoes the sim plus the renderer's CPU work is
about 1.3 ms per frame. Frame time in this environment is set by software GL fill rate and draw
batches. With everything on screen (zoom 0.4, 274 objects) it costs about 25 % more frame time
than 25 echoes. About a third of that is the echo number labels: each Phaser `Text` is its own
texture and breaks the sprite batch. Off-screen culling (on by default, no visible change) keeps
a normal-zoom view at the empty-field frame rate whatever the army size.

Screenshots were taken with Playwright (respawn screen with 100 lanes, battle, zoomed-out
army, dimmed view) and are attached to the PHASE05-b report rather than committed.

## Readability with a big army (design doc §14)

- **Dim echoes** (`display.dimEchoes`, off by default; level `display.dimEchoesLevel` 0.25).
  Echoes, static figures, corpses and echo tracers fade back. Echo labels and HP bars go. The
  live soldier, its marker, incoming-fire tracers and turret lasers stay at full strength.
- **Echo labels only nearby** (`display.echoLabelRadius`, 0 = everywhere). This is the
  readability control and also the biggest render saving in a big crowd.
- Existing: echo opacity, static flicker on/off, HP bar mode.

## Recommendation: supported army size

- **Sim and truth: 400 soldiers per mission, and 200 alive at once, are supported** on this
  class of CPU. A live tick among 184 alive echoes averages 0.34 ms (p95 0.55 ms), which is
  about 2 % of the frame. The background resolve of a 400-soldier, 8-minute battle takes about
  5 s in a Worker, so the scrubber still sweeps quickly. Memory is about 11 MB of snapshots and a
  7 MB save, both fine with IndexedDB.
- **Rendering: 100 echoes on screen together is the honest supported number today.** It costs
  about 25 % more frame time than 25 on software GL. On a real GPU the same scene should be far
  from the limit, but **that is not yet verified on real hardware**. Past about 150 echoes on
  screen at once, plan on BitmapText labels and sprite batching first.
- So: **"the Many echoes scenario holds at 100+ echoes"**. It's proven headless up to 400 in
  the mission and 184 alive at once, and in the browser at 100. Reaching 200+ on screen at once
  needs the render items below and a real-hardware check.

## Open items

- Measure `?stress=100` / `?stress=200` on real desktop hardware (Chrome, a mid-range laptop
  GPU) and add a row to the browser table.
- Echo labels as BitmapText (one batch), or draw them only when zoomed in.
- Turn on the gzip `CompressionStream` in the codec if saves need to shrink (about 7×).
- `npm run bench` builds 400 lives in about 3.5 min. If it's used in CI, cache the army or cap
  it at 100.

# PHASE06-c: snappy flow and frame rate

The owner's "it's slow" ([D28], [D30]) covers both the pace of the flow and the frame rate.
Both were measured before changing anything, in the same container as above (4 vCPU, headless
Chromium with SwiftShader software GL, 1280×720, `vite preview` of the production build).
Other agents shared the box, so frame numbers are the **median of three interleaved runs**
(before, after, before, after, …). The scripts drive the real game with Playwright: flow timings
come from polling `__aoo.controller.flow` every animation frame, and frame costs come from timing
Phaser's loop callback plus a Chrome DevTools Protocol CPU profile (`Profiler.start/stop`, 200 µs
sampling) split by source module. The split uses an unminified build, whose `//#region` markers
map each sample to its module.

## Flow: wall clock to a controllable soldier (mission-01)

Inputs are automated with no think time, so a human adds reaction time to every step that needs
an input. That makes the input count as important as the milliseconds.

| | Before | After |
|---|---|---|
| Page load → title interactive | 760 / 530 ms | 590 / 430 ms |
| Title → controllable (fresh mission) | 5.80 / 5.46 s, **2 inputs** (title, then Enter on an empty respawn screen) | 5.22 / 5.25 s, **1 input** (Deploy) |
| Death → controllable | 6.12 / 6.18 s: 1 s beat, respawn screen, Enter, lead-in | 5.62 / 5.56 s: R pressed 330 ms after the death (just past the guard), lead-in |
| Death → respawn screen (no key pressed) | 1.0 s | 0.6 s |
| Deploy → countdown starts | ≈150 ms | ≈100–150 ms |

Acceptance: a fresh mission → controllable is lead-in + 0.25 s (target: + 0.5 s). Death →
controllable with quick redeploy is lead-in + 0.6 s (target: + 1.5 s). The 5 s lead-in stays
([D5], [D25]).

The lead-in itself measures 5.1–5.4 s of wall clock, because the battle scene's first frames are
slow in software GL (shader compile, texture upload). The first frame's delta (scene creation)
no longer turns into a burst of catch-up steps.

## Frames: JS ms per frame (median of 3 runs, live play: walking and strafing)

"Loop" is Phaser's whole loop callback (sim steps, our renderer, Phaser's update and render
submission, HUD). The split is CPU-profile self time per frame.

| Scenario | Loop mean / p95 | Phaser | Sim | Our renderer | WebGL calls | DOM HUD | GC | fps |
|---|---|---|---|---|---|---|---|---|
| mission-01, before | 1.94 / 3.3 ms | 0.79 | 0.29 | 0.246 | 0.27 | 0.071 | 0.03 | 19.1 |
| mission-01, after | **1.65 / 2.8 ms** | 0.74 | 0.24 | **0.201** | 0.23 | **0.052** | 0.04 | 20.8 |
| `?stress=50`, before | 2.54 / 5.5 ms | 0.79 | 0.61 | 0.290 | 0.49 | 0.064 | 0.03 | 17.9 |
| `?stress=50`, after | **2.28 / 4.9 ms** | 0.80 | 0.57 | **0.216** | 0.48 | 0.060 | 0.02 | 18.5 |

The sim didn't change (it's within run-to-run noise). The renderer's share fell by 20–25 %, and
the frame's JS by 10–15 %.

Allocation (CDP sampling heap profiler, KB per frame, mission-01): 265 → 212 in total, and our
renderer's share went from 11.5 to 8.2. With `?stress=50` the renderer stays at about 16 KB per frame:
moving sprites get new position, rotation and alpha numbers, and V8 boxes each double stored on
a Phaser object. The per-frame hot spots that are gone: id maps rebuilt every step, the
`Map`-iterator walk in every pool, an interpolated-position object and a visual object per
soldier, and a re-tessellated dashed Graphics path for every lever link.

**What the frame actually costs here:** about 42–47 ms of every frame is `(program)`, which is
`GLES2::ReadPixels` in the compositor commit. Headless Chromium reads the software-rendered canvas
back every frame. That cost scales with the canvas' pixel count, and it's why this box runs at
about 20 fps whatever the JS does. A real GPU doesn't do this readback, but the same lever (fewer
pixels) helps a weak laptop GPU's fill rate:

| `display.renderScale` | mission-01 fps (loop JS) | `?stress=50` fps (loop JS) |
|---|---|---|
| 1 (default on ≤ 1080p windows) | 20.8 (1.65 ms) | 18.5 (2.28 ms) |
| 0.75 | 29.7 (1.62 ms) | 28.1 (2.08 ms) |
| 0.5 | 51.5 (1.37 ms) | 47.5 (1.80 ms) |

## What changed

Flow ([D28]):
- **Fresh mission skips the empty respawn screen** (`flow.skipEmptyRespawn`, on). The title's
  button reads **Deploy** and goes straight into the lead-in at the default spawn. Autoplay and
  stress mode still get the respawn screen.
- **Quick redeploy: R or Space** (`flow.quickRedeploy`, on) on the death beat (cutting it short,
  with no respawn screen) or the respawn screen. It deploys a new soldier at the last-used spawn
  point's next slot. A hint shows the option ("R / Space: redeploy at Road (0:04)"): at the bottom
  on the death beat, and under the Deploy button on the respawn screen. Held keys repeat and are
  ignored (Space is also fire). So is a press within `flow.quickRedeployGuardMs` (300 ms) of the
  death.
- **Death beat 1 s → 0.6 s** (`tuning.deathBeatSeconds`).
- **Scrubber default "About 1 s"** (`game.resolveSpeed` = `fit`): it paces the pass to sweep
  the remaining battle in about a second, never slower than 20× battle time. The old multiples
  and "Instant" are still there.
- **Spinner only for work over 150 ms** (`flow.spinnerThresholdMs`). The controller measures
  fast-forward cost per tick and shows "Preparing…" only when the estimate is over the
  threshold. The spinner also fades in after the same delay as a compositor animation, so short
  work never flashes it.
- **Transitions ≤ 150 ms** (`flow.transitionMs`, the KIA caption pop-in; it was 250 ms).
- **Title starts at once:** the game flow (save loading, title) no longer waits for Phaser to
  boot and load assets. A battle that starts before the assets are in waits for them.
- Unchanged: the 5 s lead-in (`spawn.leadInSeconds`), the one-click Continue, and the one
  confirmation before New mission when a save would be lost.

Frame rate ([D30]):
- Renderer: no-op `setTexture` and `setDepth` calls are skipped on pooled objects. Phaser
  re-resolved the texture frame on every call, and every `setDepth` queued a sort of the whole
  display list, every frame. Soldiers only set position, rotation, scale and alpha when they
  change. Previous-view lookups go by index (`nearById`) instead of id maps rebuilt every step.
  Pools recycle without iterating a `Map`. `soldierVisual` fills a reused object. Lever links
  are one tiling dash sprite each, not dashed Graphics re-tessellated every frame. Capture-point
  labels only `setText`/`setColor` on change: each call re-rendered the label's texture. Tints
  are only cleared when tinted. The lead-in ghost arrow is only cleared once.
- HUD and DOM: the HUD updates when the sim steps (not on extra frames at 120/144 Hz). The
  countdown writes its class and transform only on change (quantized). The debug overlay
  refreshes every 6th frame. The perf readout is built every 15th frame. The countdown digits,
  damage vignette, KIA caption and spinner get `will-change`, so they composite instead of
  repainting blurred shadows.
- **`display.renderScale`** (auto / 1 / 0.75 / 0.5): the canvas host is sized `scale` × the
  window, and the canvas is stretched back with a CSS transform. The camera zoom is multiplied by
  `scale` so the framing doesn't change. Phaser maps the pointer through the canvas' on-screen
  rectangle, so aiming stays exact. 'auto' is 1 up to about 1080p and scales larger windows down
  to that pixel count (2560×1440 → 0.75).
- **`display.antialias`** (on; applies on reload) and `powerPreference: 'high-performance'`
  (dual-GPU laptops).
- **Phaser's loop sleeps** while no battle is on screen (title, respawn screen), so no frames are
  drawn behind the DOM screens. It wakes when a battle starts.
- **Fixed-step catch-up:** at most `debug.maxCatchUpSteps` (4, × sim speed) steps per frame. The
  backlog of up to 200 ms carries over and is caught up a few steps per frame. Beyond that it is
  dropped. Before, the cap was 8 and the backlog was dropped at once. Jitter on a slow machine no
  longer loses battle time, and a hitch no longer runs 8 steps in one frame. The first frame after
  a scene starts never steps.
- **Debug overlay:** FPS, mean frame ms with the worst frame of the last second, the battle
  scene's update ms, and the render scale.
- Worker traffic: no resolve runs during play (a deploy cancels it), so the main thread receives
  nothing from the worker while a soldier is controlled.

## Open items (06-c)

- Real-hardware numbers are still owed (a mid-range laptop, `?stress=50`, renderScale 1 vs 0.75),
  as for 05-b.
- What's left per frame is mostly Phaser itself (its update, sort and batch: about 0.75 ms) and
  WebGL call overhead. Echo labels are still one `Text` texture each (BitmapText is still open
  from 05-b).
