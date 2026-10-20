# PHASE03-a: Recording, echo playback, attempts & snapshots

**Goal:** the core technical problem of the game. Record a live soldier's life. Replay it as an
echo in later attempts, for as many lives as the player wants. React correctly when the world has
changed (rescues, interruptions). Everything runs headless and is proven by scenario tests, so
PHASE04 only has to wire it to the screen.

**Depends on:** PHASE02-a (world, combat, nav). **Parallel with:** 03-b, 03-c.
**Owns:** `src/sim/recording/**`, `src/sim/attempt/**`, `src/contracts/mission.ts` (create it
verbatim from `PHASE03-CONTRACT.md` if it doesn't exist yet), additive changes to `src/sim/**`
needed to host echoes.

Relevant rulings: [D2]–[D5], [D14], [D23]–[D26], [E1]–[E4], [E7], [E8].

## Design

### Recording ([E1])
- **Record every tick at first** (lossless position + facing for each controlled tick), plus
  `RecordedAction`s (shots with origin + angle, interacts). The design doc says don't optimize
  early. Lossless per-tick waypoints make an unchanged replay *exact*. Thinning comes in PHASE06-a
  as an outcome-tested optimization. Compact *encoding* is 03-c's job.
- The recorder is fed by the attempt runner after each tick's movement + actions are resolved, so
  recorded positions are exactly what the world saw.

### Echo playback
An echo is a soldier driven by an `EchoController` instead of input:
1. **Before `spawnTick`:** not present. **After its last recorded tick, alive:** becomes **static**
   (`interactive = false`, frozen in place, flickers), and its fate is `static`, i.e. an O ([D4]).
2. **On schedule** (it's where the recording says it should be): it's moved **exactly** to the
   recorded waypoint each tick. On-schedule echoes are **kinematic**: they push the live soldier
   and off-schedule echoes apart ([D14] soft separation), but are not pushed themselves. This
   keeps unchanged history exact. The live soldier "squirms" around them via the soft push.
3. **Off schedule** (pushed, detoured, or blocked: the straight move to the next waypoint is
   obstructed): pathfind via `world/nav.ts` toward the scheduled position at a short lookahead.
   Speed is chosen to **arrive on time, never early**: `min(remainingPathLen / ticksLeft,
   maxSpeed × catchUpFactor)`. Rejoin the schedule (snap) once within a small epsilon.
4. **Interruption:** if the echo can't reach its schedule (no path, or lag beyond
   `lateTolerance` for longer than `lateGrace`), it freezes in place and its fate is
   `interrupted` with a reason. Per [D24], it **stays killable** and the freeze is **permanent for
   that attempt**: no recovery if the blocker clears.
5. **Actions:** at each recorded action tick, if the echo is within `actionTolerance` of the
   recorded origin, perform it: shots fire **from the echo's current position at the recorded
   angle**; interacts trigger if the target is in reach. Otherwise skip it and emit a
   `divergence` debug event. (The design doc: "shots from the wrong location feel like bugs".)
6. **Damage and death are simulated, never replayed** ([E3]). An echo dies only if the world kills
   it again. Recorded `death` segment ends are just the end of the recording.
7. A soldier's multiple segments (original life + O extensions) are one continuous schedule.

### Attempt runner (`src/sim/attempt/`)
```ts
startAttempt(params: {
  map: MapDef;
  soldiers: SoldierRecord[];          // all recorded soldiers (echoes)
  attempt: number;
  from: { kind: 'start' } | { kind: 'snapshot'; snapshot: WorldSnapshot };
  live:
    | { mode: 'new'; soldierId; spawnPointId; entryTick }
    | { mode: 'resume'; soldierId; controlFromTick };  // soldier follows its recording until then
}): Attempt

attempt.step(input: SoldierInput): TickResult   // one tick; input ignored until control begins
attempt.runHeadless(untilTick | predicate)      // fast-forward, no input
attempt.isOver(): boolean                        // live died / mission complete
attempt.finish(endReason): { observation: AttemptObservation; liveSegment: RecordingSegment }
attempt.snapshots: SnapshotStore                // taken every `tuning.snapshotIntervalTicks`
```
- **Lead-in support ([D5]):** for `resume`, the live soldier is driven by its EchoController until
  `controlFromTick`, with `minHp = 1` (unkillable, still damageable). At `controlFromTick` it
  switches to input. Input received earlier is *not* applied retroactively. The runner just
  starts honoring input at that tick (PHASE04's UI lets the player "pre-hold" keys).
- **New soldier entry** at `entryTick`: not present before it. Every deployment gets a 5s lead-in
  ([D25]), so support `from` earlier than `entryTick`. (The pre-tick-0 "frozen hold" for early
  entries is pure presentation in PHASE04; the sim just starts at tick 0.)
- **Spawn eligibility hook ([D26]):** an echo spawns at its recorded `spawnTick` only if
  `isSpawnPointOpen(pointId, tick)` holds in the current world. Otherwise its fate is
  `neverSpawned`. Initial points are always open. PHASE05-a implements the check for capture
  points; here, make it a world query that returns `true`.
- **Resolve passes ([D23]):** `startResolve({ map, soldiers, attempt, from })` is the same machinery
  with no live soldier. It runs headless to the latest `recordedTo` of any soldier, and can report
  partial observations every N ticks (`onProgress(observationSoFar)`) so the respawn screen's
  scrubber can sweep. It must be **cancellable** (the player may deploy before it finishes) and
  must run inside a Web Worker. It's pure TS, so it does: no DOM, no Phaser. Snapshots it takes
  become valid snapshots for later deployments.
- The observation lists every lane's `LaneFate` in `[fromTick, toTick]` and all
  `TimelineMarker`s (deaths, kills, hazard destroyed, interacts, interruptions, objective).
- **Snapshots ([E4]):** plain-data, structured-clone-able world state including echo controller
  state, taken every N ticks. `SnapshotStore.validUntil(tick)`: after an attempt, snapshots
  from that attempt are valid within its window. Snapshots from earlier attempts are valid only
  for ticks `< fromTick` of the latest attempt. Anything later is stale and must be
  re-simulated. Expose `nearestValidSnapshot(atOrBefore: Tick)`.

## Tasks
- [ ] Create `src/contracts/mission.ts` if missing (verbatim from the contract doc).
- [ ] **Quantize soldier position/facing in sim state every tick** (e.g. position to 1/256 world
  unit, facing to 1/4096 rad; tune). Recordings then hold exact integers, so 03-c can encode them
  losslessly as compact deltas, and a replay after a page reload stays exact.
- [ ] `recording/recorder.ts` + tests.
- [ ] `recording/echo-controller.ts`: schedule interpolation, on-schedule kinematic snap,
  off-schedule pathfinding with "never early" throttling, interruption detection, action replay.
- [ ] Soldier separation update: kinematic on-schedule echoes per the design above.
- [ ] `attempt/attempt.ts`, `attempt/observation.ts`, `attempt/snapshots.ts`.
- [ ] `attempt/resolve.ts`: resolve pass with progress callback + cancellation.
- [ ] Tuning: `catchUpFactor`, `lateTolerance`, `lateGrace`, `actionTolerance`,
  `snapshotIntervalTicks`, `resolveProgressIntervalTicks`. All `// TUNE`.
- [ ] Extend `WorldView` with soldier `role: 'live' | 'echo' | 'static' | 'interrupted'` and
  `leadIn: boolean` (02-b's renderer already has sprites for these).
- [ ] Extend `tools/sim-cli.ts` with a scenario runner that chains attempts:
  `npm run sim -- --scenario rescue` prints each attempt's observation.

## Scenario tests (the heart of this phase; all headless, on `mission-01`)
- [ ] **Exact replay:** attempt 1, S1 scripted along the road and dies at the turret at tick
  `d`. Attempt 2 has S1 as an echo and a live S2 idle far away, out of everyone's LOS (or a test
  hook for "no live soldier"). S1 dies at exactly `d`, and the world hash matches attempt 1 tick
  for tick (excluding S2).
- [ ] **Rescue → O:** attempt 2, S2 destroys the turret before S1 reaches it, and S2 stays alive
  past S1's recording end. S1's fate is `static` at its last recorded tick.
- [ ] **Resume O:** attempt 3 with `resume S1`. Before `controlFromTick` S1 follows its recording
  with HP floored at 1. After it, S1 obeys scripted input. The new segment is contiguous with the old.
- [ ] **Ignore O:** attempt 3 with new S3. S1 replays and turns static at its O. Static S1 can't
  be shot and isn't targeted by turrets.
- [ ] **History made worse:** S3 does something that gets S1 killed earlier. S1's fate is `died`
  earlier than its recording end.
- [ ] **Interruption:** S1's recording walks through the gate. S2 closes the gate first. S1
  detours if another route reaches its schedule in time, otherwise it freezes with `interrupted`.
- [ ] **Never early:** with the obstacle S1 originally sidestepped removed, S1 still arrives at its
  later waypoints on time (not early).
- [ ] **Crowd:** live soldier pushes through 10 on-schedule echoes without stopping them. Echoes
  pushed off schedule rejoin it.
- [ ] **Resolve pass:** S2 dies at 0:30 after destroying the turret. A resolve from 0:30 shows S1
  (recorded to 0:50) turning static at 0:50. Progress callbacks are monotonic. Cancelling stops
  it promptly.
- [ ] **Interrupted stays frozen:** after S1 freezes at a closed gate, reopening the gate doesn't
  revive its schedule. S1 can still be killed.
- [ ] **Snapshot equivalence:** running from a snapshot at tick s gives the same hash at tick
  s+k as running from tick 0.
- [ ] **Chain of 20 attempts** with scripted bot lives completes headless in well under a second.
  Report ticks/sec in the CLI.

## Acceptance
- All scenario tests pass, including determinism and snapshot equivalence.
- `npm run sim -- --scenario rescue` demonstrates the full X → rescue → O → resume chain headless.

## Notes from implementation
_(append here)_
