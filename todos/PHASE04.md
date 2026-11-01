# PHASE04: The loop: die → echo → rescue → O → resume

**Goal:** the first milestone from the design doc. The player watches a soldier die, saves them
with the next life, sees an **O** on the timeline, and resumes them under direct control. Wire
03-a (attempts), 03-b (timeline + respawn screen) and 03-c (persistence) into one game flow.

**Depends on:** 03-a, 03-b, 03-c. **Parallel with:** nothing. This is integration, and the owner
will want to playtest it.
**Owns:** `src/app/**` (game flow), plus glue changes anywhere, kept small and called out in the PR.

Relevant rulings: [D2]–[D6], [D7], [D23]–[D25].

## Background resolve: the scrubber ([D23])
- [x] `src/app/resolve-worker.ts`: a Web Worker hosting 03-a's `startResolve`. Started as soon as
  an attempt ends, from that attempt's last valid snapshot. It streams progressive `resolve`
  observations to the main thread. Each update is folded with `applyObservation` and pushed to
  the respawn screen's scrubber. Spawn options are re-derived on every update.
- [x] Deploying cancels the worker. Snapshots it produced so far are kept as valid.
- [x] Persist the resolved truth when the pass finishes (and on deploy, with whatever was
  resolved so far).
- [x] **Choice invalidated during the deploy's own fast-forward** (it reached time the scrubber
  hadn't): the soldier dies before control, or (05-a) the capture never happens. End the attempt
  at once, apply its observation, and return to the respawn screen with a short "History
  shifted" notice.

## Game flow (`src/app/flow.ts`, a small explicit state machine, unit-tested)
```
Boot ─▶ Title (New mission / Continue)
          │
          ▼
       Respawn screen ◀────────────────────────────────┐
          │ deploy(option)                                 │
          ▼                                                │
       Preparing (choose snapshot, headless fast-forward)  │
          │                                                │
          ▼                                                │
       Lead-in (resume: 5s countdown, see below) ──┐       │
          │                                        ▼       │
          └──────────────────────────────▶ Live play       │
                                               │ live dies │
                                               ▼           │
                                        Death beat (~1s) ──┘  (apply observation, save)
                                               │ objective destroyed
                                               ▼
                                        Mission complete (stats, restart)
```
- The **first** respawn screen has no lanes, only spawn options. It doubles as the deploy screen.
- **Death beat:** brief slow-mo/freeze plus a "KIA" caption so the death reads. Then the respawn
  screen, with `changes` highlighted. Keep it short ("death should not feel like punishment").
- On attempt end: `finish()` → append/extend the `SoldierRecord` → `applyObservation` →
  `saveMission` → clear in-progress → respawn screen.

## Starting an attempt
- **New soldier ([D25]):** same 5s lead-in as a resume. Start from the nearest valid snapshot ≤
  `entryTick − 5s` (or tick 0), fast-forward headlessly, then play the countdown with the camera
  on the spawn point. The soldier appears and takes control at zero. If `entryTick < 5s`, the
  part of the countdown before tick 0 is a **frozen pre-battle hold**: the world is shown at
  tick 0, not advancing. The first soldier of a mission sees a still battlefield and a 5s
  countdown.
- **Resume O ([D5]):** start from the nearest valid snapshot ≤ `leadInFromTick`, fast-forward
  headlessly (it should feel instant; show a spinner only if it takes >150 ms), then render the
  **lead-in**. The soldier plays its recording, the camera is on them, a big **5…4…3…2…1**
  countdown runs with a tick sound, and they're shown with the shield ring (unkillable, HP
  floored at 1). Player input is read during the countdown and visibly previewed (aim reticle
  follows the mouse, a ghost arrow shows held movement). At zero, control switches with the
  currently held inputs applied that very tick ("GO" cue). The lane extends from there.
- **Ignored O:** nothing special. The soldier plays out and turns static ([D4]).

## Reload recovery ([D6])
- [x] On boot with a saved mission → Title shows **Continue**.
- [x] If `inProgress` exists: re-simulate that attempt headlessly from tick 0 (snapshots aren't
  persisted) with the partial segment as that soldier's tail. Finish it as `suspended`, apply the
  observation, then jump **straight into a resume lead-in** for that soldier at the segment end.
  No respawn screen in between.
- [x] Wire autosave triggers: interval, `visibilitychange`, `pagehide` (03-c's policy).

## Also in this phase
- [x] **Mission complete screen:** battle time, soldiers used, rescues (count of X→O changes),
  attempts. Placeholder copy. "Play again" clears the mission save.
- [x] **Dev tools** (dev builds only, documented in AGENTS.md): `K` = kill live soldier,
  `[`/`]` = sim speed ×0.25…×4, `?debugTimeline=1` = show raw lane/observation JSON panel,
  "Reset mission" button.
- [x] Battlefield readability pass now that all roles exist together: live vs echo vs static vs
  interrupted in the same frame, plus per-soldier number labels.

## Acceptance (the design doc's demonstration scenarios, played by hand)
| Scenario | Expected |
|---|---|
| First death | One lane ending in X. Spawn options show both spawn points with entry times (Road 0:02 if S1 used Road). |
| Second life rescues first | S1's lane now ends in O at its recorded end, with a highlight. S2's lane ends wherever S2 died. |
| Resume O | Lead-in from ~5s before the O; countdown; control of **Soldier 1** (not a new identity); lane extends. |
| Ignore O | New S3; S1 replays and becomes a flickering static figure at its O. |
| Make it worse | Get a previously saved soldier killed earlier → X at the new time, dashed remainder. |
| Block echo route | Close the gate on an echo's route → it detours or freezes with `!` and a timeline marker. |
| Reload mid-life | Refresh during a life → straight back into a lead-in as that soldier at ≈ the last autosave. |
| Spawn stagger | Repeated Road spawns enter 2s apart; Beach's first soldier still enters at 0:00. Every deploy gets a 5s countdown, including the very first. |
| Scrubber | After S2 kills the turret and then dies early, the respawn screen's scrubber sweeps right and S1's X flips to O as it passes. Deploying mid-sweep works. |
| History shifted | Deploy onto an O the scrubber hasn't confirmed, which turns out to die during fast-forward → back to respawn with the notice. |
| 10+ lives | Ten-plus echoes replay meaningfully without noticeable slowdown. |

Also: flow state-machine unit tests. One headless end-to-end test drives the flow with scripted
inputs through first death → rescue → resume.

## Notes from implementation

### What's where (`src/app/` unless noted)
- `flow.ts`: the pure state machine (`transition(state, event)`, throws `FlowError` on nonsense).
  States: boot, title, respawn (with an optional `historyShifted` notice), preparing, leadIn,
  live, deathBeat (next: respawn | complete), complete. `recover` goes boot → preparing directly
  ([D6]); `reset` (New mission / dev Reset) works from anywhere.
- `game.ts`: `GameController`, the whole loop with injected adapters (`GameUi`, `BattleHost`,
  `Clock`, `KeyValueStore`, `ResolveRunner`). No DOM or Phaser, so it runs headless in tests.
- `live-run.ts`: `LiveRun`, one deployed life: the attempt plus the lead-in countdown and the
  frozen pre-battle hold. The battle scene calls `step(input)` once per fixed step.
  Countdown = `hold + attempt.leadInTicksLeft()`; it reaches 0 exactly when the next step
  applies input, so held inputs act on that tick. During the hold a new soldier is hidden from
  the view (it appears at GO, [D25]).
- `resolve-runner.ts` + `resolve-worker.ts`: the background resolve. **Web Worker** by default
  (one worker per pass, `terminate()` on cancel). Snapshots are small (~3 KB of plain data on
  mission-01), so the worker simply posts them with each progress message; the controller
  stages them and commits the window it actually received (`[fromTick, resolvedUntil]`) when the
  pass finishes or is cancelled by a deploy. The same driver runs time-sliced on the main thread
  (`createInlineResolveRunner`) for tests, `?resolveWorker=0`, and browsers without Workers.
- `autoplay-lives.ts`, `autoplay.ts`, `scripted-input.ts`: named scripted lives (mission-01
  scripts from `src/sim/scenarios/`) deployed through the real respawn flow. `headless.ts`:
  headless battle host, manual clock and recording UI. `test-harness.ts` builds a controller
  on them. `game-settings.ts`: the "Game flow" settings group.
- `src/ui/flow/flow-screens.ts` (new): title, mission complete, KIA caption, Preparing spinner,
  History shifted toast, lead-in hint, DEV bar, timeline JSON panel.
- `main.ts`: browser wiring (adapters, autosave listeners, hotkeys, `__aoo` helpers).

### Attempt lifecycle as built
- **Deploy:** cancel the scrubber (keep its snapshots + truth, save) → lead-in start
  `leadInStart(option)` (may be negative) → nearest valid snapshot ≤ `max(0, start)` → headless
  fast-forward to it (spinner if > 1500 ticks) → `LiveRun` with `hold = max(0, -start)`. If the
  fast-forward ends the attempt (`historyShifted`), it's finished and folded at once and the
  respawn screen comes back with the notice.
- **End:** `finish()` → `addSegment` → `applyObservation` → `MissionSaver.save` (clears
  in-progress) → resolve starts from `endSnapshot` immediately → KIA caption on the frozen frame
  for `deathBeatSeconds` → respawn screen with the attempt's and the scrubber's `changes`.
  Every attempt bumps `attemptCount`, including history-shifted ones (snapshot validity is keyed
  by attempt number).
- **Autosave:** `saveInProgress` every `autosaveIntervalSeconds` of battle time while in
  control, plus `visibilitychange → hidden` and `pagehide`. In-progress lives carry the new
  optional `spawnPointId` (contract change, see PHASE03-CONTRACT.md). A mission save is also
  written at each deploy so an in-progress life always has a `meta` to load against.
- **Reload ([D6]):** boot → `loadMission` → if `inProgress`: re-simulate from tick 0 with the
  partial segment appended (live: null), `finish('suspended')`, fold, save, then straight into the
  resume lead-in of that soldier at the segment end. **Continue** (no life in progress) re-runs a
  full resolve from tick 0 in the background: snapshots aren't persisted, and it also finishes a
  scrubber the previous session didn't.
- **Rescues** = number of lane changes from X to O (or ✓) over the mission, counted in every
  fold (attempts and scrubber). Persisted in `aoo:v1:<mission>:stats` (cleared with the mission).

### Deviations / choices
- Tuning: `spawn.intervalSeconds` 2, `spawn.leadInSeconds` 5, `deathBeatSeconds` 1,
  `autosaveIntervalSeconds` 5 (`// TUNE`). `spawnRules(tuning)` was added to
  `src/timeline/spawn-options.ts`; the respawn fixtures' `FIXTURE_RULES` now derives from it.
  The controller reads tuning when the mission starts (New mission / page load), so slider
  changes apply from the next New mission or reload. Changing sim tuning mid-mission makes
  echoes replay under different rules (they may diverge); that's a dev-panel caveat.
- Death beat is a freeze, not slow-mo ([Q11]). Mission complete plays the same beat with the
  HUD's "Mission complete" banner, then the stats screen.
- A resolve that reaches the objective's destruction doesn't end the mission ([Q10]).
- A history shift during the visible lead-in (e.g. the resumed soldier gets interrupted during
  its countdown) bounces back the same way.
- Countdown overlay got a `setPlacement('upper')` (small additive change in
  `src/ui/hud/countdown-overlay.ts`): centred numbers covered the soldier and its shield ring.
- `BattleSession` gained an optional `driver` (`SessionDriver` in `services.ts`); the battle scene
  steps it instead of the world, skips cues while the world is frozen, previews held movement
  with a ghost arrow during the countdown, and shows the frozen last frame when the run has
  ended. `PreloadScene` takes `next: null` + `onReady`. `Attempt.liveSegmentSoFar()` was added
  (03-a) for autosaves. The "Restart battle" panel action only exists in gallery/sandbox mode.
- Readability pass: live / echo (numbered) / static (flickering TV static) / interrupted (`!`)
  checked in-game (screenshots in the PR notes). No renderer changes were needed beyond moving the
  countdown; the live soldier stays unlabelled (the HUD names it).

### Tests
`src/app/flow.test.ts` (state machine, autoplay parsing) and `src/app/game.test.ts` (headless
end to end: first death → rescue found by the scrubber → resume S1 with a 5 s lead-in → mission
complete → play again; rescue seen by the attempt itself; ignore O; history shifted; reload
recovery straight into the lead-in; Continue re-derives history; dev kill; make it worse; gate
interruption; 11 lives with the 2 s road stagger).

### Playtest guide (product owner)
Run `npm run dev` (dev tools on) or `npm run build && npx vite preview` and add `?dev=1`.
- **First death:** New mission → Enter (Road) → 5 s countdown over a still field → play → die
  (or press `K`). One lane ending in X; Road now enters at 0:02, Beach still at 0:00.
- **Rescue → O (with the scrubber):** `/?dev=1&autoplay=road-slow,road-snipe-die`. S1 walks into
  the turret; S2 snipes the turret and is killed early, so the respawn screen opens with S1 still
  X and the scrubber sweeps right until S1's X flips to O ("Soldier 1 survived!"). Settings →
  Game flow → "Scrubber sweep speed" (default 20× battle time; 5× makes it easy to watch).
- **Resume O:** click S1's O (or its option) → Deploy. Lead-in from 5 s before the O with the
  shield ring, then control of Soldier 1. Or append `,resume` to the autoplay list (it walks
  into the compound and finishes the mission → stats screen → Play again).
- **Ignore O:** after the rescue deploy a new soldier and watch S1 turn into a flickering static
  figure at 0:56 (`autoplay=road-slow,road-snipe,road-snipe` has S3 standing next to it).
- **Make it worse:** `autoplay=road-slow,road-snipe,bridge-under-s1` blows the road bridge under
  S1 → X at 0:48 with a dashed remainder.
- **Block an echo route:** `autoplay=gate-walker,gate-closer` → S1 freezes at the shut gate with
  `!`; its lane ends in the interrupted marker and it isn't resumable.
- **History shifted:** `autoplay=road-slow,road-snipe,road-blow-bridge`, then quickly deploy S1's
  (unconfirmed) O while the scrubber is still sweeping → bounce back with the notice. Set the
  scrubber to 5× to have time.
- **Reload mid-life:** refresh during any life → straight back into that soldier's lead-in at
  the last autosave (≤ 5 s of battle time lost).
- **Spawn stagger / 10+ lives:** `autoplay=road-naive*6,beach-naive*5&fast=1` plays eleven lives
  headless in ~13 s, then play the twelfth yourself among eleven echoes.
- Settings (F2): "Game flow" (scrubber speed, reload resumes at once, ghost arrow), "Respawn
  screen", and every tuning value including `spawn.*`, `deathBeatSeconds`,
  `autosaveIntervalSeconds`.

### Known issues
- `pagehide`/`visibilitychange` saves go to IndexedDB asynchronously; a hard close may lose the
  last few seconds (the battle-time interval save still bounds it at 5 s).
- During the frozen pre-battle hold the HUD has no soldier label/HP yet (the soldier doesn't
  exist until GO).
- Dev-killed soldiers (`K`, autoplay `end: 'kill'`) aren't killed again on replay ([E3]: deaths
  are simulated), so their lanes usually flip to O later. Expected, but surprising in playtests.
- In headless Chromium (software GL) the game runs ~24 fps with eleven echoes vs ~30 fps with
  one soldier; the sim itself is far from the bottleneck. Check on real hardware (05-b).
- Only one save slot; "New mission" on the title asks once, then wipes it.
