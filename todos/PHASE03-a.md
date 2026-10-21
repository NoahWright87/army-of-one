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
- [x] Create `src/contracts/mission.ts` if missing (verbatim from the contract doc).
- [x] **Quantize soldier position/facing in sim state every tick** (e.g. position to 1/256 world
  unit, facing to 1/4096 rad; tune). Recordings then hold exact integers, so 03-c can encode them
  losslessly as compact deltas, and a replay after a page reload stays exact.
- [x] `recording/recorder.ts` + tests.
- [x] `recording/echo-controller.ts`: schedule interpolation, on-schedule kinematic snap,
  off-schedule pathfinding with "never early" throttling, interruption detection, action replay.
- [x] Soldier separation update: kinematic on-schedule echoes per the design above.
- [x] `attempt/attempt.ts`, `attempt/observation.ts`, `attempt/snapshots.ts`.
- [x] `attempt/resolve.ts`: resolve pass with progress callback + cancellation.
- [x] Tuning: `catchUpFactor`, `lateTolerance`, `lateGrace`, `actionTolerance`,
  `snapshotIntervalTicks`, `resolveProgressIntervalTicks`. All `// TUNE`.
- [x] Extend `WorldView` with soldier `role: 'live' | 'echo' | 'static' | 'interrupted'` and
  `leadIn: boolean` (02-b's renderer already has sprites for these).
- [x] Extend `tools/sim-cli.ts` with a scenario runner that chains attempts:
  `npm run sim -- --scenario rescue` prints each attempt's observation.

## Scenario tests (the heart of this phase; all headless, on `mission-01`)
- [x] **Exact replay:** attempt 1, S1 scripted along the road and dies at the turret at tick
  `d`. Attempt 2 has S1 as an echo and a live S2 idle far away, out of everyone's LOS (or a test
  hook for "no live soldier"). S1 dies at exactly `d`, and the world hash matches attempt 1 tick
  for tick (excluding S2).
- [x] **Rescue → O:** attempt 2, S2 destroys the turret before S1 reaches it, and S2 stays alive
  past S1's recording end. S1's fate is `static` at its last recorded tick.
- [x] **Resume O:** attempt 3 with `resume S1`. Before `controlFromTick` S1 follows its recording
  with HP floored at 1. After it, S1 obeys scripted input. The new segment is contiguous with the old.
- [x] **Ignore O:** attempt 3 with new S3. S1 replays and turns static at its O. Static S1 can't
  be shot and isn't targeted by turrets.
- [x] **History made worse:** S3 does something that gets S1 killed earlier. S1's fate is `died`
  earlier than its recording end.
- [x] **Interruption:** S1's recording walks through the gate. S2 closes the gate first. S1
  detours if another route reaches its schedule in time, otherwise it freezes with `interrupted`.
- [x] **Never early:** with the obstacle S1 originally sidestepped removed, S1 still arrives at its
  later waypoints on time (not early).
- [x] **Crowd:** live soldier pushes through 10 on-schedule echoes without stopping them. Echoes
  pushed off schedule rejoin it.
- [x] **Resolve pass:** S2 dies at 0:30 after destroying the turret. A resolve from 0:30 shows S1
  (recorded to 0:50) turning static at 0:50. Progress callbacks are monotonic. Cancelling stops
  it promptly.
- [x] **Interrupted stays frozen:** after S1 freezes at a closed gate, reopening the gate doesn't
  revive its schedule. S1 can still be killed.
- [x] **Snapshot equivalence:** running from a snapshot at tick s gives the same hash at tick
  s+k as running from tick 0.
- [x] **Chain of 20 attempts** with scripted bot lives completes headless in well under a second.
  Report ticks/sec in the CLI.

## Acceptance
- All scenario tests pass, including determinism and snapshot equivalence.
- `npm run sim -- --scenario rescue` demonstrates the full X → rescue → O → resume chain headless.

## Notes from implementation

### Layout
- `src/sim/recording/`: `schedule.ts` (a record's segments flattened into one waypoint list,
  O(1) per-tick lookup, interpolation for future sparse waypoints, `validateRecord`),
  `recorder.ts` (`Recorder`), `echo-controller.ts` (`EchoController`, plain-data
  `EchoControllerState`), `records.ts` (`addSegment`, `recordedTo`, `nextSoldierId`).
- `src/sim/attempt/`: `attempt.ts` (`Attempt` / `startAttempt`), `observation.ts`
  (`ObservationBuilder`, `MARKER_STRING_KEYS`), `snapshots.ts` (`SnapshotStore`, `WorldSnapshot`),
  `resolve.ts` (`Resolve` / `startResolve`), `outcome-hash.ts` (`outcomeHash`, hashes what
  happened and ignores live/echo flags), `index.ts` (the public API).
- `src/sim/scenarios/lives.ts`: `playLife()` runs one scripted attempt through the runner.
  `rescue.ts` has the X → rescue → O → resume chain, and `chain.ts` has the 20-attempt bot chain
  and `recordMarchers` (benchmark).

### Additive sim changes
- **Quantization:** `step` snaps every alive soldier's x/y/facing (`quantizeSoldier`) after
  movement + separation, and again after the end-of-tick push-out. `spawnSoldier` quantizes the
  spawn pose. So live soldiers and echoes see identical numbers. One PHASE02 test tolerance moved
  by one quantum.
- **`step(world, inputs, hooks?)`** with `StepHooks`: `moveUncontrolled` (right after live
  movement, before separation), `afterMovement` (after separation and quantization, before
  actions; the recorder reads the live pose here), and `actUncontrolled` (called for each
  non-controllable soldier inside the id-ordered action loop). Echoes therefore move and act at
  exactly the points where live soldiers do, which is what makes unchanged history replay
  bit-exactly.
- `SpawnOptions.id` / `ordinal`: explicit `S<n>` ids. The allocator is bumped past the id, so ids
  never collide.
- `SoldierState.viewRole?: 'live' | 'interrupted'`. `getView` uses it for `role`, so the lead-in
  shows as live with `leadIn: true` and frozen echoes show as `interrupted`.
- `world/spawn-points.ts`: `isSpawnPointOpen(world, pointId, tick)` ([D26] hook; true for any
  known point; PHASE05-a fills it in).
- `findPath(world, from, to, { maxLength })`: a bounded A* (prunes at f > budget), so "can I get
  there in time?" queries stay cheap.
- Events: `echoDivergence {id, action, distance}` (debug) and `mineDetonated.by?`.
- `scenarios/driver.ts`: `createScriptDriver(steps)` was extracted (`runScenario` uses it and is
  unchanged in behaviour). The mission-01 script fragments are now exported.

### Tick conventions (important for PHASE04)
- **New soldier, entry E:** spawned between steps when the world is at tick E. Its first
  waypoint (t = E) is the spawn pose. Input acts from the step that produces E+1, so
  `controlFromTick = E+1`.
- **Resume, O tick e** (= `recordedTo`): it follows its recording through e. Input acts from e+1,
  and the new segment starts at e+1, contiguous with the old one. `controlFromTick` may be passed
  as e (03-b's `resumeTick`) or as e+1; both mean the same.
- An echo whose last recorded tick is e turns static between steps right after tick e; its fate
  is `static @ e`.

### API for PHASE04
```ts
import { startAttempt, startResolve, SnapshotStore, addSegment } from 'src/sim/attempt';
const store = new SnapshotStore();                         // one per mission, in memory
const snap = store.nearestValidSnapshot(leadInFromTick);   // null → { kind: 'start' }
const a = startAttempt({ map, tuning, soldiers, attempt, snapshots: store,
  from: snap ? { kind: 'snapshot', snapshot: snap } : { kind: 'start' },
  live: { mode: 'new', soldierId, spawnPointId, entryTick }    // or
     // { mode: 'resume', soldierId, controlFromTick }
});
a.step(input)          // → { tick, events, controlled, leadInTicksLeft, over }
a.leadInTicksLeft()    // countdown; 0 ⇒ the next step honors input. a.inLeadIn(), a.inControl
a.runHeadless(untilTick | pred, inputFn?)  // fast-forward (e.g. snapshot → lead-in start)
a.view()               // WorldView;  a.world is readable;  a.historyShifted → bounce ([D23])
a.isOver() / a.overReason()   // 'death' | 'missionComplete' | 'historyShifted' | null
const { observation, liveSegment, historyShifted, endSnapshot } = a.finish(endReason?);
soldiers = addSegment(soldiers, { soldierId, spawnPointId }, liveSegment);
const r = startResolve({ map, tuning, soldiers, attempt, snapshots: store,
  from: { kind: 'snapshot', snapshot: endSnapshot }, onProgress });
while (!r.done) r.advance(600);   // per frame / worker message; r.cancel() on deploy
```
- `finish()` commits the attempt's snapshots (every `snapshotIntervalTicks`, plus start and end)
  to the store. The store's validity rules are in `snapshots.ts`. `abandon()` discards them.
- `historyShifted` is `{ tick, reason: 'leadInInterrupted' | 'leadInLost' | 'spawnPointLost' }`.
  It means the chosen deployment became impossible during the fast-forward or lead-in.
  `liveSegment` is null if control never began.
- For autosave ([D6]), use `Recorder.segment('suspended')` (via the attempt's recorder; expose
  it if needed) or just `finish('suspended')`.
- Marker string keys: `marker.spawn|death|damaged|kill|hazardDestroyed|interact|objective|
  interrupted|open` (`MARKER_STRING_KEYS`). `strings.ts` doesn't exist on this branch, so 02-b
  adds the copy. `kill` = a turret destroyed by a soldier. `hazardDestroyed` = a vehicle, a bridge
  charge or a mine shot by a soldier. `damaged` = one per soldier per tick. Interrupt reasons:
  `'late' | 'noPath'`. Never-spawned reasons: `'spawnPointLost' | 'notSpawned'`.

### Echo behaviour (as designed; see the header of `echo-controller.ts`)
- **Snap test** (every tick, cheap): if the scheduled pose is within `snapDistance` and a
  `moveCircle` toward it ends within `blockEpsilon`, the echo snaps there and is kinematic. On
  schedule there is no pathfinding at all.
- **Off schedule:** a bounded `findPath` to the pose `lookaheadSeconds` ahead, replanned every
  `replanSeconds`. Speed is `min(remaining / ticksLeft, speed × catchUpFactor)`. Lag is
  `ceil(remaining / maxStep) - ticksLeft`. Being more than `lateToleranceSeconds` late, or having
  no path within budget, for `lateGraceSeconds` → interrupted.
  **Deviation:** "no path" uses the same grace as lateness rather than interrupting instantly,
  so a momentary blockage (e.g. a wreck being pushed) doesn't freeze an echo.
- A knocked-off echo walks back at a pace set by the lookahead target, so it takes about
  `lookaheadSeconds` to rejoin, even when it's standing still.
- Interrupted echoes are kinematic, interactive and killable, with `viewRole: 'interrupted'`.
- Static echoes have `interactive = false` and kinematic.
- The lead-in sets `minHp = 1` and `viewRole: 'live'`. At hand-over the soldier becomes
  controllable, with `minHp` 0 and `interactHeld` false. HP lost in the lead-in carries over (it
  can start at 1 HP).
- The constructor rebuilds controller state from snapshots: restored states are used as they
  are; a soldier present without state (the snapshot attempt's live soldier) is set to
  `following`; absent and due in the future → `pending`; absent and past due → `neverSpawned`.

### Tuning added (`tuning.echo.*`, `tuning.attempt.*`, all `// TUNE`)
`catchUpFactor 1.25`, `snapDistance 4`, `blockEpsilon 0.05`, `lookaheadSeconds 0.5`,
`replanSeconds 0.25`, `lateToleranceSeconds 0.75`, `lateGraceSeconds 1`, `actionTolerance 12`,
`replayInteract 'toggle'` (design option, [Q8]), `snapshotIntervalTicks 60`,
`resolveProgressIntervalTicks 60`.

### Contract
- Additive: `RecordedAction` interact gained `on?: boolean` (the lever state after the original
  press; used by `replayInteract: 'restoreState'`). `quantize.ts` is unchanged.

### Tests (34 new, 114 total)
`recording.test.ts` (recorder, schedules, records, SnapshotStore, explicit ids),
`echoes-mission01.test.ts` (exact replay tick for tick, with an idle far-away live soldier and
with no live soldier; exact echo shots; X → rescue → O; resume with the lead-in HP floor and
ignored early input; ignore O; history made worse via a bridge collapse; gate interruption,
frozen for good and still killable; resolve with monotonic progress and cancel; snapshot
equivalence including an off-schedule echo with a planned path), and `echoes-arena.test.ts`
(detour in time vs interruption, never early with and without a shove, a crowd of 10, static vs
turret, action tolerance, replayInteract modes, and the 20-attempt chain with a 1.5 s timeout).

### Perf (this container, Node)
- `npm run sim -- --scenario rescue`: 3 attempts, 8.4k ticks in ~620 ms including JIT warm-up
  (~13.6k ticks/s).
- `--scenario chain`: 20 attempts from snapshots, 8.7k ticks in ~520 ms (~16.8k ticks/s).
- `--scenario bench`: 20 echoes marching across mission-01 from 0:00: **~19.5k ticks/s**
  (~325× real time).
- The remaining cost is PHASE02's turret LOS rays and per-call `dynamicBlockers`.
  `findCellPath` still allocates its full-grid arrays per call (only off-schedule echoes call
  it); reusing those buffers is a 05-b item.
