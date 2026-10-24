# PHASE06-c: Snappy flow + frame-rate pass

**Goal:** no dead time ([D28]) and a smooth browser build ([D30]). The owner said it's "slow". Treat
that as both the *pace of the flow* and the *frame rate*, and fix both.

**Depends on:** PHASE05. **Parallel with:** 06-a, 06-b.
**Owns:** `src/app/flow.ts`, flow/transition parts of `src/app/game.ts`, `src/ui/flow/**`,
performance changes in `src/render/**` and `src/ui/**` (non-functional).

## Snappy flow
Measure first: write down the wall-clock time from "page load" to "first controllable tick", and
from "death" to "next controllable tick", before and after.
- [ ] **Fresh mission → straight into the countdown.** An empty respawn screen with zero lanes
  isn't a choice worth a click. On a brand-new mission, Deploy from the title goes straight to the
  lead-in at the default spawn. Setting: `flow.skipEmptyRespawn` (on).
- [ ] **Quick redeploy:** on the death beat or the respawn screen, a single key (R or Space)
  redeploys at the last-used spawn point's next slot, without needing the mouse. Enter still
  deploys the selected option. Show the hint on screen.
- [ ] **Shorter waits** (settings, with these defaults):
  - death beat ≈ 0.6 s;
  - scrubber sweep fast enough that a typical mission resolves in about 1 s;
  - no spinner unless work takes > 150 ms;
  - transitions with no fades longer than ~150 ms.
  The **5 s lead-in stays** ([D5]/[D25] are product rulings). Keep `spawn.leadInSeconds`
  adjustable and leave the default alone.
- [ ] Title screen: Continue / New is one click, with no extra confirmation unless a save would
  be lost.

## Frame-rate pass
- [ ] Profile the real browser build. Use the Chrome profiler via Playwright/CDP
  (`Profiler.start` / `Tracing`), on mission-01 and with `?stress=50`. Report the JS ms per frame
  split: sim, renderer, DOM HUD/overlays, GC.
- [ ] Fix what shows up. Likely suspects:
  - per-frame allocations in the renderer (arrays/objects/closures per entity);
  - Phaser `Graphics` objects cleared and redrawn every frame (rings, HP bars, overlays): cache
    or only redraw on change;
  - `Text` objects updated every frame;
  - DOM HUD writes every frame that cause layout: only write on change;
  - canvas resolution / `devicePixelRatio`: render at a sensible resolution, with a setting;
  - the resolve worker or postMessage traffic hurting the main thread during play;
  - the fixed-step catch-up running too many steps after a hitch.
- [ ] Add an **FPS / frame-time readout** to the debug overlay if missing, and a `display.renderScale`
  setting (auto / 1 / 0.75 / 0.5).
- [ ] Keep sim determinism untouched (render-side only, or sim changes covered by the equivalence
  test from 05-b).

## Acceptance
- **Time to first controllable tick:** fresh mission → controllable ≤ lead-in + ~0.5 s.
  Death → next controllable ≤ lead-in + ~1.5 s when using quick redeploy.
- **Frame cost:** JS frame time reduced measurably, with before/after numbers in
  `docs/perf.md`. No per-frame allocation hot spots left in the renderer profile.
- **No regressions:** all tests pass; autoplay still works.

## Notes from implementation
_(append here)_
