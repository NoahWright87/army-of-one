/** Public API of the recording/echo/attempt machinery (PHASE03-a), for PHASE04 and tools. */
export {
  Attempt,
  startAttempt,
  type AttemptFrom,
  type AttemptParams,
  type AttemptResult,
  type HistoryShift,
  type LiveSpec,
  type TickResult,
} from './attempt';
export { MARKER_STRING_KEYS } from './observation';
export { outcomeHash } from './outcome-hash';
export { Resolve, startResolve, type ResolveParams, type ResolveProgress } from './resolve';
export {
  SnapshotStore,
  snapshotThinning,
  type SnapshotThinning,
  type SnapshotWindow,
  type WorldSnapshot,
} from './snapshots';
export {
  EchoController,
  type EchoControllerState,
  type EchoMode,
  type EchoState,
} from '../recording/echo-controller';
export { Recorder } from '../recording/recorder';
export { addSegment, nextSoldierId, ordinalOf, recordedTo } from '../recording/records';
export { buildSchedule, poseAt, validateRecord, type Schedule } from '../recording/schedule';
