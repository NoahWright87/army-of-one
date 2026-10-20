# PHASE05-a: Capture points & forward spawns

**Goal:** geographic and temporal strategy. Soldiers capture points Battlefield 2-style. Captured
points become spawn points that open **when and where** they were captured. Losing the captor in a
later attempt causally loses the spawn.

**Depends on:** PHASE04. **Parallel with:** PHASE05-b.
**Owns:** `src/sim/entities/capture-point.ts`, capture-related additions in `src/timeline/**`,
`src/ui/respawn/**`, `src/content/maps/**`. Contract additions go in `PHASE03-CONTRACT.md`
"Changes".

Relevant rulings: [D7]–[D12], [D17].

## ⛔ Decision gates
- **[Q3]** Presentation of mid-battle entries (lead-in for new soldiers at forward points / late
  stagger slots). Build the spawn itself first. Gate only the lead-in presentation.
- **[Q4]** What happens to lanes of soldiers who spawned at a point that's later lost. Until it's
  answered, don't build the reconciliation; just hide the lost point from spawn options.

## Tasks
- [ ] **Sim: capture point entity** ([D10]–[D12]): radius; stage `enemy → neutral → ours`;
  progress 0..1 within the current stage. Contributors are alive, `interactive` soldiers inside
  the radius, live or echo; statics don't count. The rate grows with contributor count (curve in
  tuning). With zero contributors, progress decays toward 0 at a rate that **accelerates with
  time spent empty** (e.g. `decay = base × (1 + k × emptySeconds²)`; tune it so a sub-second
  step-out costs very little and ~3s empty drains a 90% bar). Crossing a stage boundary locks
  that stage. Emits `captureProgress` and `captureStageChanged {point, stage, tick, contributors}`.
- [ ] **WorldView + renderer:** circle, flag-pole with a lowering/raising flag, a progress ring, and
  contributor highlight. Placeholder assets via the manifest.
- [ ] **Contract (additive):** world-level truth for captures. `AttemptObservation.captures:
  {pointId, stage, tick}[]` and `MissionState.captureTruth`, folded with the same window rules as
  lanes: a capture inside an observed window that isn't re-observed is removed ([D9]).
- [ ] **Spawn options:** each point in `ours` stage in the truth becomes a `new` option with
  `openTick = capture tick` ([D8]) and its own slot counter ([D7]).
- [ ] **Starting at a forward point:** nearest valid snapshot ≤ entry → headless fast-forward →
  enter. If fast-forward reveals the capture no longer happens, reuse PHASE04's "History shifted"
  path.
- [ ] **Flag objective** ([D17]): the mission completes when a designated point reaches `ours`.
- [ ] **Respawn UI:** capture markers on the captor lanes; forward points in the spawn panel with
  their open time; "Point lost" highlight in `changes`.
- [ ] **Content:** `mission-02` (or a mission-01 revision) with at least one forward capture point
  that makes rushing it worthwhile, and a flag-capture objective variant.

## Acceptance
- Headless tests: capture rates by contributor count; accelerating decay; stage locking; echoes
  re-capture deterministically in replay; a capture lost when its captor is killed earlier.
- Design doc scenario "Capture forward insertion": later respawns show the new geographic start
  point and its entry time.

## Notes from implementation
_(append here)_
