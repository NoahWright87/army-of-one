import type {
  AttemptObservation,
  LaneChange,
  LaneEnd,
  LaneFate,
  LaneTruth,
  SoldierId,
  SoldierRecord,
  TimelineMarker,
} from '../contracts/mission';
import { compareIds } from '../sim/core/ids';
import type { Tick } from '../sim/core/time';
import { paintSpan } from './spans';

/**
 * Folds one observation into the timeline truth ([D2] latest attempt wins, [D3] only simulated
 * time changes). Pure: returns new lanes plus the lanes whose endpoint changed.
 *
 * `soldiers` must include every recorded soldier (with the latest live segment already appended),
 * so new lanes can be created and resumed lanes extended to their new recorded end.
 */
export function applyObservation(
  lanes: readonly LaneTruth[],
  soldiers: readonly SoldierRecord[],
  obs: AttemptObservation,
): { lanes: LaneTruth[]; changes: LaneChange[] } {
  const byId = new Map<SoldierId, LaneTruth>(lanes.map((l) => [l.soldierId, l]));
  const existedBefore = new Set(byId.keys());

  for (const s of soldiers) {
    const lane = byId.get(s.id);
    const recordedTo = recordedEnd(s);
    if (!lane) byId.set(s.id, newLane(s, recordedTo, obs.attempt));
    else if (recordedTo > lane.recordedTo)
      byId.set(s.id, extendLane(lane, recordedTo, obs.attempt));
  }

  const changes: LaneChange[] = [];
  for (const [id, fate] of Object.entries(obs.lanes).sort(([a], [b]) => compareIds(a, b))) {
    const before = byId.get(id);
    if (!before) continue; // observation about a soldier we have no record of: ignore
    const markers = obs.markers.filter((m) => m.soldierId === id);
    const after = applyFate(before, fate, obs, markers);
    byId.set(id, after);
    if (existedBefore.has(id) && id !== obs.live?.soldierId && !sameEnd(before.end, after.end)) {
      changes.push({ soldierId: id, before: before.end, after: after.end });
    }
  }

  const out = [...byId.values()].sort((a, b) => compareIds(a.soldierId, b.soldierId));
  return { lanes: out, changes };
}

function recordedEnd(s: SoldierRecord): Tick {
  const last = s.segments[s.segments.length - 1];
  return last ? last.endTick : s.spawnTick;
}

function newLane(s: SoldierRecord, recordedTo: Tick, attempt: number): LaneTruth {
  return {
    soldierId: s.id,
    recordedFrom: s.spawnTick,
    recordedTo,
    spans: [{ from: s.spawnTick, to: recordedTo, kind: 'unresolved', observedInAttempt: attempt }],
    end: { kind: 'unresolved' },
    markers: [],
  };
}

function extendLane(lane: LaneTruth, recordedTo: Tick, attempt: number): LaneTruth {
  return {
    ...lane,
    recordedTo,
    spans: paintSpan(lane.spans, lane.recordedTo + 1, recordedTo, 'unresolved', attempt),
    end: { kind: 'unresolved' },
  };
}

function applyFate(
  lane: LaneTruth,
  fate: LaneFate,
  obs: AttemptObservation,
  obsMarkers: TimelineMarker[],
): LaneTruth {
  const { recordedFrom: from, recordedTo: to } = lane;
  const wFrom = Math.max(obs.fromTick, from);
  const wTo = Math.min(obs.toTick, to);
  const a = obs.attempt;
  let spans = lane.spans;
  let end: LaneEnd;
  /** Markers at or after this tick are dropped (they no longer happen). */
  let cutoff: Tick = Infinity;

  switch (fate.kind) {
    case 'died':
    case 'interrupted': {
      const t = clamp(fate.tick, from, to);
      spans = paintSpan(spans, wFrom, t, 'alive', a);
      spans = paintSpan(spans, t + 1, to, fate.kind === 'died' ? 'lost' : 'frozen', a);
      end = fate.kind === 'died' ? { kind: 'death', tick: t } : { kind: 'interrupted', tick: t };
      cutoff = t + 1;
      break;
    }
    case 'static': {
      const t = clamp(fate.tick, from, to);
      spans = paintSpan(spans, wFrom, t, 'alive', a);
      spans = paintSpan(spans, t + 1, to, 'lost', a);
      end = { kind: 'open', tick: t };
      cutoff = t + 1;
      break;
    }
    case 'neverSpawned':
      spans = paintSpan(spans, from, to, 'lost', a);
      end = { kind: 'neverSpawned' };
      cutoff = -Infinity;
      break;
    case 'alive': {
      spans = paintSpan(spans, wFrom, wTo, 'alive', a);
      if (wTo >= to) {
        // Observed alive through the end of the recording (e.g. a suspended life): resumable.
        end = obs.missionComplete ? { kind: 'complete', tick: to } : { kind: 'open', tick: to };
      } else if (contradicts(lane.end, obs.toTick)) {
        // Prior truth said this soldier was gone by now; what happens next is unknown ([D23]).
        spans = paintSpan(spans, wTo + 1, to, 'unresolved', a);
        end = { kind: 'unresolved' };
      } else {
        end = lane.end;
      }
      break;
    }
  }

  if (obs.missionComplete && fate.kind !== 'neverSpawned' && end.kind !== 'death') {
    if (
      obs.missionComplete.bySoldierId === lane.soldierId ||
      lane.soldierId === obs.live?.soldierId
    ) {
      end = { kind: 'complete', tick: Math.min(obs.missionComplete.tick, to) };
    }
  }

  const kept = lane.markers.filter((m) => (m.tick < wFrom || m.tick > wTo) && m.tick < cutoff);
  const added = obsMarkers.filter((m) => m.tick >= wFrom && m.tick <= wTo && m.tick < cutoff);
  const markers = [...kept, ...added].sort((x, y) => x.tick - y.tick);
  return { ...lane, spans, end, markers };
}

function contradicts(end: LaneEnd, observedUntil: Tick): boolean {
  switch (end.kind) {
    case 'death':
    case 'interrupted':
      return end.tick <= observedUntil;
    case 'neverSpawned':
      return true;
    default:
      return false;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function sameEnd(a: LaneEnd, b: LaneEnd): boolean {
  if (a.kind !== b.kind) return false;
  return ('tick' in a ? a.tick : null) === ('tick' in b ? b.tick : null);
}
