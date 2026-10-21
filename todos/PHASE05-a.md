# PHASE05-a: Capture points & forward spawns

**Goal:** geographic and temporal strategy. Soldiers capture points Battlefield 2-style. Captured
points become spawn points that open **when and where** they were captured. Losing the captor in a
later attempt causally loses the spawn.

**Depends on:** PHASE04. **Parallel with:** PHASE05-b.
**Owns:** `src/sim/entities/capture-point.ts`, capture-related additions in `src/timeline/**`,
`src/ui/respawn/**`, `src/content/maps/**`. Contract additions go in `PHASE03-CONTRACT.md`
"Changes".

Relevant rulings: [D7]–[D12], [D17], [D23], [D25], [D26].

Forward-point deployments reuse PHASE04's 5s lead-in ([D25]) and its "History shifted" path.
Soldiers whose capture point is ours at their recorded `spawnTick` spawn. Otherwise they are
`neverSpawned` and their lane greys out ([D26]). Implement 03-a's `isSpawnPointOpen` hook
for capture points.

## Tasks
- [x] **Sim: capture point entity** ([D10]–[D12]): radius; stage `enemy → neutral → ours`;
  progress 0..1 within the current stage. Contributors are alive, `interactive` soldiers inside
  the radius, live or echo; statics don't count. The rate grows with contributor count (curve in
  tuning). With zero contributors, progress decays toward 0 at a rate that **accelerates with
  time spent empty** (e.g. `decay = base × (1 + k × emptySeconds²)`; tune it so a sub-second
  step-out costs very little and ~3s empty drains a 90% bar). Crossing a stage boundary locks
  that stage. Emits `captureProgress` and `captureStageChanged {point, stage, tick, contributors}`.
- [x] **WorldView + renderer:** circle, flag-pole with a lowering/raising flag, a progress ring, and
  contributor highlight. Placeholder assets via the manifest.
- [x] **Contract (additive):** world-level truth for captures. `AttemptObservation.captures:
  {pointId, stage, tick}[]` and `MissionState.captureTruth`, folded with the same window rules as
  lanes: a capture inside an observed window that isn't re-observed is removed ([D9]).
- [x] **Spawn options:** each point in `ours` stage in the truth becomes a `new` option with
  `openTick = capture tick` ([D8]) and its own slot counter ([D7]).
- [x] **Starting at a forward point:** nearest valid snapshot ≤ entry − 5s → headless fast-forward →
  lead-in → enter. If fast-forward reveals the capture no longer happens, reuse PHASE04's
  "History shifted" path.
- [x] **Scrubber:** a resolve pass that finds a capture no longer happens removes the spawn option
  live, and greys out lanes that spawned there ([D26]).
- [x] **Flag objective** ([D17]): the mission completes when a designated point reaches `ours`.
- [x] **Respawn UI:** capture markers on the captor lanes; forward points in the spawn panel with
  their open time; "Point lost" highlight in `changes`.
- [x] **Content:** `mission-02` (or a mission-01 revision) with at least one forward capture point
  that makes rushing it worthwhile, and a flag-capture objective variant.

## Acceptance
- Headless tests: capture rates by contributor count; accelerating decay; stage locking; echoes
  re-capture deterministically in replay; a capture lost when its captor is killed earlier, making soldiers who spawned there
  `neverSpawned`; re-capturing in time brings them back.
- Design doc scenario "Capture forward insertion": later respawns show the new geographic start
  point and its entry time.

## Notes from implementation

### What's where
- **Sim:** `src/sim/entities/capture-point.ts` (state, rates, decay, events, flag objective,
  `allObjectivesDone`). `MapDef.capturePoints` (`CapturePointDef`: id, nameKey, position,
  radius?, initialStage?, objective?) and `SpawnPointDef.kind: 'capture'` + `capturePointId`
  (a forward spawn). `WorldState.capturePoints` is parallel to the defs; `stepCapturePoints` runs
  as the last thing in `step` (one added line), after the push-out, so contributors are where the
  tick ends. `isSpawnPointOpen` now says: initial → open; capture → open while its point is
  ours. `damageObjective` uses `allObjectivesDone` (destroy targets AND flag points).
- **Progress is an integer** (`CAPTURE_FULL = 1_000_000` units per stage), so it's exact in
  snapshots and replays. Rate per tick = round(FULL × min(n, maxContributors)^exponent /
  stageSeconds / 60). Decay on the k-th empty tick = round(FULL × base × (1 + accel × (k/60)²) /
  60). Overflow at a stage boundary is dropped; the new stage locks in; 'ours' stays ours.
- **Events:** `captureStageChanged {id, stage, contributors}` and `captureProgress {id, stage,
  progress, contributors}`. The latter fires only when the contributor count changes (not every
  tick); the view carries the live progress.
- **View/renderer:** `CapturePointView` (stage, progress, contributors, objective,
  spawnPointIds). The renderer draws a pad, a stage-coloured circle, the progress ring, a pole
  with the enemy flag lowering / our flag raising, rings around contributors, the name, and the
  forward spawn marker only while ours (capture spawn markers are no longer drawn statically).
  `sfx_capture` plays on each stage change. New placeholder assets: `capture_base`, `flag_pole`,
  `flag_enemy`, `flag_ours`, `sfx_capture`. Gallery covers every stage, decay and the flag.
- **Observation/truth:** `ObservationBuilder` turns `captureStageChanged` into
  `observation.captures` plus a `capture` marker per contributor. `src/timeline/captures.ts`
  folds them (`applyCaptureObservation`) and diffs them (`captureChanges`).
  `deriveSpawnOptions(..., captures)` adds a `new` option per capture spawn whose point is ours,
  opening at the capture tick with its own slot clock (`nextEntryTick`, see [Q14]).
- **Game:** `GameController.fold` also folds captures; options, respawn props/updates and the
  scrubber carry `captures` + `captureChanges`. Forward deploys reuse PHASE04's prepare path
  (snapshot ≤ entry − 5 s, headless fast-forward, lead-in). **Addition:** for a capture spawn,
  after the fast-forward a throwaway probe attempt (from a snapshot of the real one) runs on to
  the entry tick; if the point won't be ours, the real attempt runs there too, so "History
  shifted" shows at once (and the truth learns the capture is gone) instead of after a full
  countdown. ~300 extra ticks, a few ms.
- **Persistence:** `aoo:v1:<mission>:captures` (+ `:backup`), validated by `isCaptureTruth`;
  missing in old saves → `captureTruth` stays undefined (= none); corrupt → backup → dropped
  (never fatal: Continue re-resolves from tick 0 anyway).
- **Respawn UI:** forward options get a ⚑, "Forward point · opens m:ss" and "Captured at m:ss by
  Soldier n" (tagged "Not confirmed yet" while the scrubber hasn't reached the capture). Capture
  flags on the time axis with a dotted guide down the rows; capture markers on captor lanes are
  little flags; captions "Outpost captured at …" and a red, pulsing "Outpost lost: soldiers who
  entered there never spawn"; legend entry. Header says "Captured / Not captured" on flag-only
  maps. HUD objective reads "Capture HQ".
- **Content:** `src/content/maps/mission-02.ts` ("Outpost"): mission-01's battlefield with a
  forward Outpost just past the road bridge, out of turret range (spawning there skips the
  switchback, the highway and the bridge), and an HQ flag objective in the compound instead of
  the depot. `src/content/maps/index.ts` is the map registry (`MISSIONS`, `findMap`,
  `missionOrDefault`), also used by the resolve worker. Mission pick: `?mission=mission-02` or
  the title-screen dropdown (remembered in localStorage; each mission has its own save).
  mission-01 is unchanged.
- **Scripts:** `src/sim/scenarios/mission-02.ts` (`ROAD_CAPTURE_OUTPOST`, `_SLOW`,
  `OUTPOST_TO_HQ`); autoplay lives `outpost-capture`, `outpost-capture-slow`, `outpost-hold`,
  `outpost-hq` (plus the existing `bridge-under-s1`, which works on mission-02 too).

### Settings (F2 → sim tuning, all `// TUNE`)
`capture.radius` 110, `stageSeconds` 5 (one soldier: 10 s for both stages),
`contributorExponent` 0.6, `maxContributors` 6, `decayBasePerSecond` 0.05, `decayAccel` 1.667
(0.5 s out ≈ 3 % lost, 1 s ≈ 8 %, 2 s ≈ 32 %, 3 s ≈ 90 %). No boolean flags: "can echoes
capture" is decided by [D10] (yes), and "do points revert" has no meaning without enemies
([Q15]). Open questions added: [Q13] mixed objectives, [Q14] slot rule after a capture moves,
[Q15] reverting.

### Tests (26 new)
`src/sim/__tests__/capture.test.ts` (rates by contributor count and the cap, stages + events,
accelerating decay maths and in-world, stage locking, statics/dead don't count, flag objective,
echo re-capture determinism, forward deploy to HQ completion, captor killed earlier →
`neverSpawned` → re-capture restores), `src/timeline/__tests__/captures.test.ts` (fold window
rules, point lost, earliest-wins, spawn options and slot clocks),
`src/persistence/__tests__/captures-store.test.ts` (round trip, old save, corrupt → backup →
none), `src/app/capture-flow.test.ts` (headless end to end incl. the early "History shifted"
bounce), and the gallery coverage test.

### How to playtest
`npm run build && npx vite preview`, then:
- **Forward spawn:** `/?mission=mission-02&dev=1&autoplay=outpost-capture&fast=1`. Soldier 1
  rushes the Outpost (captured ≈ 0:49) and is killed. The respawn screen shows "Outpost
  captured", a flag on the axis, and **Outpost: enters at 0:49**. Deploy it: the camera sits on
  the Outpost while Soldier 1's echo raises our flag during the countdown; then snipe the turret
  from (4000, 1300), enter the compound and stand on HQ for 10 s (or append `,outpost-hq`).
- **Point lost:** `/?mission=mission-02&dev=1&autoplay=outpost-capture-slow,outpost-hold,bridge-under-s1&fast=1`
  → S3 blows the bridge under S1: "Outpost lost" (red), Soldier 2 "Never spawned", the Outpost
  option is gone. Then play `__aoo.autoplay('outpost-capture')`: S4 rushes it before the bridge
  blows, the Outpost returns and Soldier 2 spawns again.
- **Early bounce:** with the scrubber slowed (F2 → Game flow → scrubber speed 5×), after
  `outpost-capture-slow,bridge-under-s1` deploy the still-offered Outpost quickly → "History
  shifted" with no countdown.

### Not done / for later
- No `sim-cli` scenario for mission-02 (the tests and autoplay cover it).
- No respawn-screen dev fixture with captures (`?screen=respawn`); the real flow shows it.
- The probe costs a second fast-forward of ≤ 5 s battle time per forward deploy; negligible now.
