# PHASE07-a: Results screen + full-mission "after-action" replay

**Goal:** finishing a mission feels like a payoff. The stats appear while the whole battle
replays with **every life you played at once**: your self-made army, moving together. The camera
directs itself. This should become shareable later, so design the replay as data.

**Depends on:** PHASE06 + the single-mission PR ([D31]). **Parallel with:** 07-b.
**Owns:** new `src/app/replay/**` / `src/render/phaser/replay-scene*.ts` (or similar),
`src/ui/results/**`, a pure camera-director module (e.g. `src/render/director.ts`), and additive
changes to the mission-complete flow in `src/app/game.ts` / `src/ui/flow/**`.

## The replay
- **Source of truth:** the final timeline truth plus all recordings. Re-simulate from tick 0 with
  **every soldier as an echo** and no live soldier, using the existing attempt runner / resolve
  machinery. It's deterministic, so it shows exactly the history that won. Dead soldiers die where
  the truth says. No new recording format is needed.
- **Camera director** (pure, unit-tested; input: a stream of soldier positions/events per tick):
  - Frame **all alive soldiers** (plus the objective near the end) with padding. Smooth pan and
    zoom with critically damped springs, no jitter. Clamp zoom between "a few soldiers" and the
    whole map width.
  - **Zoom in** as the group shrinks or bunches up, and on key moments: rescues, captures, the
    objective destroyed. Zoom out as soldiers spread. Look-ahead bias up (forward = up, [D27]).
  - Optional short "dwell" on dramatic events (a death right after a rescue, the final blow).
    Make it a setting.
- **Controls:** play/pause, speed (1×/2×/4×, auto-fast-forward through quiet stretches), scrub
  bar marked with deaths, rescues and captures, skip to end. Highlight the soldier who made the
  winning blow. Soldier number labels as in battle.
- **Performance:** must handle a long battle with 100+ lives smoothly. Reuse snapshots for
  scrubbing (seek = nearest snapshot + fast-forward).

## The results screen
- **Stats** over the replay: battle time, soldiers used, lives (attempts), deaths, rescues
  (X → O flips), captures, shots and hits/accuracy, hazards destroyed, longest single life,
  "your MVP" (the soldier with the most kills/rescues/objective damage).
- **Style radar chart** (from [D18]). Provisional axes, each normalized 0–1: Speed (battle time),
  Economy (few soldiers), Teamwork (rescues), Aggression (kills/shots per life), Survival
  (average life length), Tactics (captures/levers/forward spawns). Axes and formulas live in one
  pure module with a setting to toggle the chart. **The owner may redefine them.**
- **Personal bests** per mission in local storage: fastest time, fewest soldiers, most rescues.
  Highlight a new best.
- Buttons: Watch again, Play again (new mission), Continue editing history? (out of scope unless
  trivial).

## Shareable later (design for it, don't build it)
- Keep the replay input a pure value: `{ missionId, tuningHash, soldiers (encoded recordings),
  version }`. The 03-c codec already makes this compact (≈1 MB gzipped for 100 lives).
- Note in the implementation notes what sharing would need: a URL/file export and a viewer-only
  mode.

## Tests
- Director: frames all points; zooms in when the group shrinks; never jitters (bounded
  acceleration); handles 0/1/100 soldiers.
- The replay re-sim reproduces the final truth: every lane's end matches.
- Stats and radar normalization are pure and tested. Bests persist.

## Acceptance
- Win Breach: stats appear while the replay plays the whole battle with every life, and the
  camera keeps everyone in frame, zooming in and out sensibly. It works on desktop and phone sizes.

## Notes from implementation

Built (2026-11, in the same branch as 07-c, owner request):
- `src/app/replay/replay-player.ts`: the replay is an `Attempt` with every record as an echo and
  no live soldier (`kind: 'resolve'`). Snapshots every 2 s of battle time while playing; seek =
  nearest snapshot ≤ target + fast-forward (past the played part: fast-forward from the latest).
  `ReplayInput` is a plain value (`version`, `missionId`, records, `endTick`, `winnerId`).
- `src/render/director.ts` (pure, tested): framing of points (padding, clamp between whole-map
  width and `maxZoom`, slight upward lean, clamped to the map), critically damped spring
  (sub-stepped, no overshoot), key moments held in frame.
- `src/render/phaser/replay-scene.ts`: steps the player at 1×/2×/4× (×3 in quiet stretches when
  `results.skipQuiet` is on), draws with the battle renderer, gold ring on the winning soldier.
- `src/ui/results/`: `results-model.ts` (stats, radar, bests, scrub marks; pure, tested) and
  `results-screen.ts` (card + bar; collapsed by default on phones). Bests in localStorage
  (`aoo:bests:<missionId>`).
- `GameUi.showComplete` got an optional third argument (`CompleteResults`); headless/test UIs
  ignore it and keep the old card.
- Not built: accuracy (hits aren't recorded; the replay could count them while it plays),
  per-moment "dwell" slow-downs, sharing. Sharing needs: export `ReplayInput` with the 03-c
  segment codec (URL hash for small ones, a file otherwise) and a viewer-only mode that opens
  the results screen straight from it.
- Open: [Q23] radar axes, [Q24] framing rules.
