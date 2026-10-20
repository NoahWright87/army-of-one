# PHASE04: The loop: die → echo → rescue → O → resume

**Goal:** the first milestone from the design doc. The player watches a soldier die, saves them
with the next life, sees an **O** on the timeline, and resumes them under direct control. Wire
03-a (attempts), 03-b (timeline + respawn screen) and 03-c (persistence) into one game flow.

**Depends on:** 03-a, 03-b, 03-c. **Parallel with:** nothing. This is integration, and the owner
will want to playtest it.
**Owns:** `src/app/**` (game flow), plus glue changes anywhere, kept small and called out in the PR.

## ⛔ Decision gates
- **[Q1] Unobserved history.** When starting at a resume lead-in, the attempt fast-forwards
  headlessly from the nearest *valid* snapshot. That fast-forward is part of the attempt's
  observation window, so its results become truth automatically. That much is true under every
  option, so build it. **Until Q1 is answered**, if the fast-forward kills the chosen soldier
  before control (or otherwise invalidates the choice), end the attempt at once, apply the
  observation, and return to the respawn screen with a short "History shifted" notice (option
  (a)). Do **not** build background resolution until Q1 is decided.
- **[Q2] Interrupted echoes.** Leave the 03-a flags at their defaults and don't offer interrupted
  lanes as spawn options until Q2 is decided.

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
- **New soldier** at `entryTick`: start from the nearest valid snapshot ≤ `entryTick` (or tick 0),
  fast-forward headlessly, and give control when the soldier enters. If there's a short wait (<
  snapshot interval), show the battle with the camera on the spawn point. Anything fancier for
  late entries is [Q3] (PHASE05-a).
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
| Spawn stagger | Repeated Road spawns enter 2s apart; Beach's first soldier still enters at 0:00. |
| 10+ lives | Ten-plus echoes replay meaningfully without noticeable slowdown. |

Also: flow state-machine unit tests. One headless end-to-end test drives the flow with scripted
inputs through first death → rescue → resume.

## Notes from implementation
_(append here, and capture playtest feedback for the owner)_
