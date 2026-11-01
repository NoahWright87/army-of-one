import type { Tick } from '../sim/core/time';

export type SoldierId = string; // "S1", "S2", ... allocated in spawn order
export type SpawnPointId = string;
export type MissionId = string;

// ---------- Recording (produced by 03-a, stored by 03-c, read by 03-b for extents) ----------

/** Position + facing the soldier must be at, at tick t. Sorted by t. */
export interface Waypoint {
  t: Tick;
  x: number;
  y: number;
  facing: number;
}

/** Discrete recorded actions. Outcomes (hits, damage, deaths) are NOT recorded: they're re-simulated [E3]. */
export type RecordedAction =
  | { kind: 'shot'; t: Tick; x: number; y: number; angle: number }
  | {
      kind: 'interact';
      t: Tick;
      x: number;
      y: number;
      targetId: string;
      /** (03-a, additive) The lever's state right after the original press (true = open/lowered). */
      on?: boolean;
    };

export type SegmentEndReason = 'death' | 'missionComplete' | 'suspended';

export interface RecordingSegment {
  startTick: Tick; // first tick under direct control
  endTick: Tick; // last tick under direct control (inclusive)
  waypoints: Waypoint[]; // first.t === startTick, last.t === endTick
  actions: RecordedAction[]; // sorted by t
  endReason: SegmentEndReason;
}

export interface SoldierRecord {
  id: SoldierId;
  ordinal: number; // 1-based, for "Soldier 3"
  spawnPointId: SpawnPointId;
  spawnTick: Tick; // === segments[0].startTick
  segments: RecordingSegment[]; // contiguous: segments[i+1].startTick === segments[i].endTick + 1
}

// ---------- Observation (produced by 03-a's attempt runner, consumed by 03-b) ----------

export type LaneFate =
  | { kind: 'alive' } // alive at obs.toTick; recording continues past it
  | { kind: 'died'; tick: Tick; cause: string }
  | { kind: 'static'; tick: Tick } // reached end of recording alive → O
  | { kind: 'interrupted'; tick: Tick; reason: string } // could not follow its schedule; froze [D24]
  | { kind: 'neverSpawned'; reason: string }; // spawn point not ours at spawnTick [D26]

export type MarkerKind =
  | 'spawn'
  | 'kill'
  | 'hazardDestroyed'
  | 'interact'
  | 'damaged'
  | 'capture'
  | 'objective'
  | 'interrupted'
  | 'death'
  | 'open';

export interface TimelineMarker {
  soldierId: SoldierId;
  tick: Tick;
  kind: MarkerKind;
  stringKey: string; // key into src/content/strings.ts, for tooltips
  refId?: string; // entity involved, if any
}

export interface AttemptObservation {
  kind: 'attempt' | 'resolve'; // 'resolve' = background scrubber pass, no live soldier [D23]
  attempt: number; // 1-based attempt index (a resolve pass uses the attempt it follows)
  fromTick: Tick; // first simulated tick (0 or a snapshot tick)
  toTick: Tick; // last simulated tick (a resolve pass may report progressively)
  live?: { soldierId: SoldierId; mode: 'new' | 'resume'; controlFromTick: Tick }; // absent for 'resolve'
  /** Every lane that existed (spawned and not already dead) at some point in [fromTick, toTick]. */
  lanes: Record<SoldierId, LaneFate>;
  markers: TimelineMarker[]; // all markers inside the window
  missionComplete?: { tick: Tick; bySoldierId: SoldierId };
  endReason: SegmentEndReason | 'resolved';
}

// ---------- Truth (owned by 03-b, stored by 03-c) ----------

export type LaneSpanKind = 'alive' | 'lost' | 'frozen' | 'unresolved';

export interface LaneSpan {
  from: Tick;
  to: Tick; // inclusive
  kind: LaneSpanKind;
  observedInAttempt: number; // which attempt established this span
}

export type LaneEnd =
  | { kind: 'death'; tick: Tick } // X
  | { kind: 'open'; tick: Tick } // O: alive at end of recording, resumable
  | { kind: 'interrupted'; tick: Tick } // !  not resumable [D24]
  | { kind: 'neverSpawned' } // whole lane greyed [D26]
  | { kind: 'unresolved' } // scrubber hasn't caught up [D23]
  | { kind: 'complete'; tick: Tick }; // mission completed during this soldier's life

export interface LaneTruth {
  soldierId: SoldierId;
  recordedFrom: Tick;
  recordedTo: Tick;
  spans: LaneSpan[]; // sorted, non-overlapping, exactly covering [recordedFrom, recordedTo]
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
  /** (PHASE04, additive) Spawn point of a 'new' life: its record doesn't exist yet. */
  spawnPointId?: SpawnPointId;
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
