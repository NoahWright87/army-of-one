# PHASE06-c: Snappy flow + frame-rate pass

**Goal:** no dead time ([D28]) and a smooth browser build ([D30]). The owner said it's "slow". Treat
that as both the *pace of the flow* and the *frame rate*, and fix both.

**Depends on:** PHASE05. **Parallel with:** 06-a, 06-b.
**Owns:** `src/app/flow.ts`, flow/transition parts of `src/app/game.ts`, `src/ui/flow/**`,
performance changes in `src/render/**` and `src/ui/**` (non-functional).

## Snappy flow
Measure first: write down the wall-clock time from "page load" to "first controllable tick", and
from "death" to "next controllable tick", before and after.
- [x] **Fresh mission → straight into the countdown.** An empty respawn screen with zero lanes
  isn't a choice worth a click. On a brand-new mission, Deploy from the title goes straight to the
  lead-in at the default spawn. Setting: `flow.skipEmptyRespawn` (on).
- [x] **Quick redeploy:** on the death beat or the respawn screen, a single key (R or Space)
  redeploys at the last-used spawn point's next slot, without needing the mouse. Enter still
  deploys the selected option. Show the hint on screen.
- [x] **Shorter waits** (settings, with these defaults):
  - death beat ≈ 0.6 s;
  - scrubber sweep fast enough that a typical mission resolves in about 1 s;
  - no spinner unless work takes > 150 ms;
  - transitions with no fades longer than ~150 ms.
  The **5 s lead-in stays** ([D5]/[D25] are product rulings). Keep `spawn.leadInSeconds`
  adjustable and leave the default alone.
- [x] Title screen: Continue / New is one click, with no extra confirmation unless a save would
  be lost.

## Frame-rate pass
- [x] Profile the real browser build. Use the Chrome profiler via Playwright/CDP
  (`Profiler.start` / `Tracing`), on mission-01 and with `?stress=50`. Report the JS ms per frame
  split: sim, renderer, DOM HUD/overlays, GC.
- [x] Fix what shows up. Likely suspects:
  - per-frame allocations in the renderer (arrays/objects/closures per entity);
  - Phaser `Graphics` objects cleared and redrawn every frame (rings, HP bars, overlays): cache
    or only redraw on change;
  - `Text` objects updated every frame;
  - DOM HUD writes every frame that cause layout: only write on change;
  - canvas resolution / `devicePixelRatio`: render at a sensible resolution, with a setting;
  - the resolve worker or postMessage traffic hurting the main thread during play;
  - the fixed-step catch-up running too many steps after a hitch.
- [x] Add an **FPS / frame-time readout** to the debug overlay if missing, and a `display.renderScale`
  setting (auto / 1 / 0.75 / 0.5).
- [x] Keep sim determinism untouched (render-side only, or sim changes covered by the equivalence
  test from 05-b).

## Acceptance
- **Time to first controllable tick:** fresh mission → controllable ≤ lead-in + ~0.5 s.
  Death → next controllable ≤ lead-in + ~1.5 s when using quick redeploy.
- **Frame cost:** JS frame time reduced measurably, with before/after numbers in
  `docs/perf.md`. No per-frame allocation hot spots left in the renderer profile.
- **No regressions:** all tests pass; autoplay still works.

## Notes from implementation
Numbers, method and the full list of changes are in `docs/perf.md` ("PHASE06-c").

### Before / after (mission-01, headless Chromium + SwiftShader, 1280×720)

| | Before | After |
|---|---|---|
| Title → controllable, fresh mission | 5.46–5.80 s, 2 inputs | 5.22–5.25 s, 1 input |
| Death → controllable | 6.12–6.18 s (1 s beat, respawn screen, Enter) | 5.56–5.62 s (R after 330 ms) |
| Death → respawn screen, no key | 1.0 s | 0.6 s |
| Page load → title | 530–760 ms | 430–590 ms |
| JS per frame, mission-01 (mean / p95) | 1.94 / 3.3 ms | 1.65 / 2.8 ms |
| JS per frame, `?stress=50` | 2.54 / 5.5 ms | 2.28 / 4.9 ms |
| Our renderer per frame (m1 / stress50) | 0.25 / 0.29 ms | 0.20 / 0.22 ms |
| Renderer allocation, mission-01 | 11.5 KB/frame | 8.2 KB/frame |
| fps at renderScale 1 / 0.75 / 0.5 (m1) | 19–21 | 21 / 30 / 52 |

Frame time in this environment is dominated by software-GL readback (`GLES2::ReadPixels`, about
45 ms per frame, proportional to canvas pixels), not by JS. On a real GPU that's gone, and
`display.renderScale` is the lever for weak GPUs and large windows.

### What's where
- `src/app/flow.ts`: `deathBeat --deploy--> preparing` (quick redeploy skips the respawn
  screen), and three pure helpers: `canQuickRedeploy`, `quickRedeployOption` (the last spawn
  point's next slot, else the first new soldier, else anything) and `freshMissionOption`.
  Tests: `src/app/snappy-flow.test.ts` (pure rules, fixed-step catch-up, and headless controller
  runs: fresh mission straight to the lead-in, quick redeploy from the beat and from the respawn
  screen, the hint, stress mode not auto-deploying, the spinner threshold).
- `src/app/game.ts` (flow parts only): `newMission({deploy})` (skips the empty screen;
  `adoptMission` passes `deploy: false`), `quickRedeploy()`, `quickRedeployOption()`,
  `lastSpawnPointId`, `GameUi.showQuickRedeploy?` (kept in step in `go()` and on scrubber
  progress), and the spinner estimate (`Clock.nowMs?`, `GameOptions.spinnerThresholdMs`). The
  resolve pace now gets the span to sweep (`GameOptions.resolvePace(spanTicks)`). The reload
  re-derive (Continue) runs flat out as before.
- `src/app/game-settings.ts`: `flow.skipEmptyRespawn`, `flow.quickRedeploy`,
  `flow.quickRedeployGuardMs`, `flow.spinnerThresholdMs`, `flow.transitionMs`, and the
  `game.resolveSpeed` choice `fit` (new default, "About 1 s"; `paceFor` is pure).
- `src/app/fixed-step.ts`: a per-frame cap (`catchUpCap`: setting × sim speed), a carried backlog
  of up to 200 ms, and drop beyond that.
- `src/app/main.ts`: the R/Space handler (capture phase; ignores repeats, typing, and presses
  within the guard after a death), the hint docking under the respawn screen's Deploy button,
  render scale, Phaser loop sleep/wake, and the flow starting before Phaser's preload (battles
  wait for `assetsReady`).
- `src/render/render-scale.ts` (pure, tested), `src/render/interp.ts` `nearById`,
  `src/render/soldier-style.ts` (optional `out` object), `src/render/phaser/pool.ts` (no Map
  iteration), `world-renderer.ts` and `battle-scene.ts` (see perf.md for the list),
  `src/ui/hud/*` and `src/ui/flow/flow-screens.ts` (change detection, `will-change`, `Busy`
  delay, `QuickRedeployHint`).

### Deviations / for the other parts
- **Shared files touched:** `tuning.ts` (one line: `deathBeatSeconds` 1 → 0.6), `strings.ts`
  (a PHASE06-c block at the end), `display-settings.ts` (`renderScale`, `antialias`,
  `maxCatchUpSteps`), `game.ts` (flow parts only), and `battle-scene.ts`: the camera **zoom** is
  multiplied by the render scale. The follow logic is untouched. 06-a: keep `* renderScale`
  when you change the camera code.
- **06-b:** `main.ts` appends the quick-redeploy hint into `.rs-deploy-bar`. If that class
  goes away, the hint floats at the bottom of the screen instead (it still works). The respawn
  screen's own animations (`rs-opt.appear` .7 s, flashes) were left alone. They don't block
  input, and the file is yours.
- Skip-empty-respawn also applies to **Play again** and the dev **Reset mission** (both start a
  brand-new mission). Autoplay and `?stress=N` always show the respawn screen. Quick redeploy
  never picks a resume option unless nothing else is offered (see [Q16]).
- The title's start button reads **Deploy** when there is no save. With a save, Continue is
  one click and New mission keeps its single "you'll lose your save" confirmation (as before).
- `KeyedPool` objects get per-instance `setTexture`/`setDepth` wrappers that skip no-op calls
  (`skipNoOpSetters` in `world-renderer.ts`). If you add a pool, create it through the `img`/`tile`
  factories to keep that.
- The sim is untouched (no file under `src/sim/` changed), so the determinism and 05-b
  equivalence tests apply unchanged.
