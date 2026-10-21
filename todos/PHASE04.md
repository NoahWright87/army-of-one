# PHASE04: The loop: die → echo → rescue → O → resume

**Goal:** the first milestone from the design doc. The player watches a soldier die, saves them
with the next life, sees an **O** on the timeline, and resumes them under direct control. Wire
03-a (attempts), 03-b (timeline + respawn screen) and 03-c (persistence) into one game flow.

**Depends on:** 03-a, 03-b, 03-c. **Parallel with:** nothing. This is integration, and the owner
will want to playtest it.
**Owns:** `src/app/**` (game flow), plus glue changes anywhere, kept small and called out in the PR.

Relevant rulings: [D2]–[D6], [D7], [D23]–[D25].

## Background resolve: the scrubber ([D23])
- [ ] `src/app/resolve-worker.ts`: a Web Worker hosting 03-a's `startResolve`. Started as soon as
  an attempt ends, from that attempt's last valid snapshot. It streams progressive `resolve`
  observations to the main thread. Each update is folded with `applyObservation` and pushed to
  the respawn screen's scrubber. Spawn options are re-derived on every update.
- [ ] Deploying cancels the worker. Snapshots it produced so far are kept as valid.
- [ ] Persist the resolved truth when the pass finishes (and on deploy, with whatever was
  resolved so far).
- [ ] **Choice invalidated during the deploy's own fast-forward** (it reached time the scrubber
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
- [ ] On boot with a saved mission → Title shows **Continue**.
- [ ] If `inProgress` exists: re-simulate that attempt headlessly from tick 0 (snapshots aren't
  persisted) with the partial segment as that soldier's tail. Finish it as `suspended`, apply the
  observation, then jump **straight into a resume lead-in** for that soldier at the segment end.
  No respawn screen in between.
- [ ] Wire autosave triggers: interval, `visibilitychange`, `pagehide` (03-c's policy).

## Also in this phase
- [ ] **Mission complete screen:** battle time, soldiers used, rescues (count of X→O changes),
  attempts. Placeholder copy. "Play again" clears the mission save.
- [ ] **Dev tools** (dev builds only, documented in AGENTS.md): `K` = kill live soldier,
  `[`/`]` = sim speed ×0.25…×4, `?debugTimeline=1` = show raw lane/observation JSON panel,
  "Reset mission" button.
- [ ] Battlefield readability pass now that all roles exist together: live vs echo vs static vs
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
_(append here, and capture playtest feedback for the owner)_
