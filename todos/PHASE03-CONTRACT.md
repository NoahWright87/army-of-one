# PHASE03 contract: shared types for 03-a / 03-b / 03-c

PHASE03-a (recording/playback), 03-b (timeline/respawn UI) and 03-c (persistence) run in
parallel. They meet at the types below.

**Rule:** whichever 03 track starts first creates `src/contracts/mission.ts` with **exactly** the
code below (copy verbatim; identical additions merge cleanly). Changes after that must be
additive and called out in the PR. Mention them in this doc's "Changes" section too.

## Concepts in plain words

- A **SoldierRecord** is a soldier identity plus everything it has ever been recorded doing:
  one or more contiguous **RecordingSegments** (the original life, plus extensions from O
  resumes).
- An **attempt** simulates battle time `[fromTick, toTick]`. It starts from tick 0, or from a
  world snapshot, and ends when the live soldier dies, the mission completes, or the page is
  suspended. It produces an **AttemptObservation**: what happened to every lane inside that
  window ([D3]: only simulated time counts).
- The **timeline truth** (`LaneTruth[]`) is folded from observations, latest wins ([D2]). Each lane
  is a series of spans over its recorded extent: `alive` (solid), `lost` (dashed/greyed: it was
  recorded but didn't happen this way in the latest truth), `frozen` (interrupted, alive but
  stuck), or `unresolved` (latest truth contradicts what was known, and the background scrubber
  hasn't reached this time yet; see [D23]).
- A **resolve pass** ([D23]) is an observation with no live soldier. The background scrubber
  produces it after each attempt, to bring the rest of the battle up to date.
- **SpawnOptions** are derived from the truth plus map spawn points.

## Code (`src/contracts/mission.ts`)

```ts
import type { Tick } from '../sim/core/time';

export type SoldierId = string;    // "S1", "S2", ... allocated in spawn order
export type SpawnPointId = string;
export type MissionId = string;

// ---------- Recording (produced by 03-a, stored by 03-c, read by 03-b for extents) ----------

/** Position + facing the soldier must be at, at tick t. Sorted by t. */
export interface Waypoint { t: Tick; x: number; y: number; facing: number }

/** Discrete recorded actions. Outcomes (hits, damage, deaths) are NOT recorded: they're re-simulated [E3]. */
export type RecordedAction =
  | { kind: 'shot'; t: Tick; x: number; y: number; angle: number }
  | { kind: 'interact'; t: Tick; x: number; y: number; targetId: string };

export type SegmentEndReason = 'death' | 'missionComplete' | 'suspended';

export interface RecordingSegment {
  startTick: Tick;            // first tick under direct control
  endTick: Tick;              // last tick under direct control (inclusive)
  waypoints: Waypoint[];      // first.t === startTick, last.t === endTick
  actions: RecordedAction[];  // sorted by t
  endReason: SegmentEndReason;
}

export interface SoldierRecord {
  id: SoldierId;
  ordinal: number;            // 1-based, for "Soldier 3"
  spawnPointId: SpawnPointId;
  spawnTick: Tick;            // === segments[0].startTick
  segments: RecordingSegment[]; // contiguous: segments[i+1].startTick === segments[i].endTick + 1
}

// ---------- Observation (produced by 03-a's attempt runner, consumed by 03-b) ----------

export type LaneFate =
  | { kind: 'alive' }                                   // alive at obs.toTick; recording continues past it
  | { kind: 'died'; tick: Tick; cause: string }
  | { kind: 'static'; tick: Tick }                      // reached end of recording alive → O
  | { kind: 'interrupted'; tick: Tick; reason: string } // could not follow its schedule; froze [D24]
  | { kind: 'neverSpawned'; reason: string }            // spawn point not ours at spawnTick [D26]

export type MarkerKind =
  | 'spawn' | 'kill' | 'hazardDestroyed' | 'interact' | 'damaged'
  | 'capture' | 'objective' | 'interrupted' | 'death' | 'open';

export interface TimelineMarker {
  soldierId: SoldierId;
  tick: Tick;
  kind: MarkerKind;
  stringKey: string;          // key into src/content/strings.ts, for tooltips
  refId?: string;             // entity involved, if any
}

export interface AttemptObservation {
  kind: 'attempt' | 'resolve'; // 'resolve' = background scrubber pass, no live soldier [D23]
  attempt: number;            // 1-based attempt index (a resolve pass uses the attempt it follows)
  fromTick: Tick;             // first simulated tick (0 or a snapshot tick)
  toTick: Tick;               // last simulated tick (a resolve pass may report progressively)
  live?: { soldierId: SoldierId; mode: 'new' | 'resume'; controlFromTick: Tick }; // absent for 'resolve'
  /** Every lane that existed (spawned and not already dead) at some point in [fromTick, toTick]. */
  lanes: Record<SoldierId, LaneFate>;
  markers: TimelineMarker[];  // all markers inside the window
  missionComplete?: { tick: Tick; bySoldierId: SoldierId };
  endReason: SegmentEndReason | 'resolved';
}

// ---------- Truth (owned by 03-b, stored by 03-c) ----------

export type LaneSpanKind = 'alive' | 'lost' | 'frozen' | 'unresolved';

export interface LaneSpan {
  from: Tick;
  to: Tick;                   // inclusive
  kind: LaneSpanKind;
  observedInAttempt: number;  // which attempt established this span
}

export type LaneEnd =
  | { kind: 'death'; tick: Tick }        // X
  | { kind: 'open'; tick: Tick }         // O: alive at end of recording, resumable
  | { kind: 'interrupted'; tick: Tick }  // !  not resumable [D24]
  | { kind: 'neverSpawned' }             // whole lane greyed [D26]
  | { kind: 'unresolved' }               // scrubber hasn't caught up [D23]
  | { kind: 'complete'; tick: Tick };    // mission completed during this soldier's life

export interface LaneTruth {
  soldierId: SoldierId;
  recordedFrom: Tick;
  recordedTo: Tick;
  spans: LaneSpan[];          // sorted, non-overlapping, exactly covering [recordedFrom, recordedTo]
  end: LaneEnd;
  markers: TimelineMarker[];
}

export interface LaneChange {
  soldierId: SoldierId;
  before: LaneEnd;
  after: LaneEnd;
}

// ---------- Spawn options (derived by 03-b) ----------

export type SpawnOption =
  | { kind: 'new'; spawnPointId: SpawnPointId; entryTick: Tick }
  | { kind: 'resume'; soldierId: SoldierId; resumeTick: Tick; leadInFromTick: Tick };

// ---------- Persisted mission (owned by 03-c) ----------

export interface InProgressLife {
  soldierId: SoldierId;
  mode: 'new' | 'resume';
  attempt: number;
  attemptFromTick: Tick;
  segmentSoFar: RecordingSegment; // endReason 'suspended'
}

export interface MissionState {
  schemaVersion: 1;
  missionId: MissionId;
  attemptCount: number;
  soldiers: SoldierRecord[];
  lanes: LaneTruth[];
  completed?: { attempt: number; tick: Tick; bySoldierId: SoldierId };
  inProgress?: InProgressLife;
}
```

## Notes

- **Snapshots are not part of the persisted contract.** They're in-memory caches. Because the sim
  is deterministic, any world state can be rebuilt by re-simulating from tick 0 with the
  recordings ([E2], [E4]).
- **Reload mid-life ([D6])** needs no saved observation. Re-simulate the interrupted attempt from
  `attemptFromTick` to `segmentSoFar.endTick`, with the partial segment as an echo. That
  deterministically reproduces what happened, and then offers the lead-in resume.

## Changes
_(append additive changes here, with the PR that made them)_
