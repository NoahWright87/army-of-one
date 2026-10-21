/**
 * Capture truth (PHASE05-a): when each capture point reached each stage in the latest truth.
 * Folded from observations with the same window rules as lanes ([D2] latest wins, [D3] only the
 * simulated window changes, [D9] a capture inside an observed window that isn't re-observed no
 * longer happens). Pure.
 */
import type {
  AttemptObservation,
  CaptureChange,
  CaptureTruth,
  SoldierId,
} from '../contracts/mission';
import type { Tick } from '../sim/core/time';

const byTick = (a: CaptureTruth, b: CaptureTruth) =>
  a.tick - b.tick || (a.pointId < b.pointId ? -1 : a.pointId > b.pointId ? 1 : 0);

/** Tick each point became ours in `truth` (absent = not ours). */
export function oursTicks(truth: readonly CaptureTruth[]): Map<string, Tick> {
  const out = new Map<string, Tick>();
  for (const c of truth) if (c.stage === 'ours') out.set(c.pointId, c.tick);
  return out;
}

export function captureOf(
  truth: readonly CaptureTruth[],
  pointId: string,
  stage: CaptureTruth['stage'] = 'ours',
): CaptureTruth | undefined {
  return truth.find((c) => c.pointId === pointId && c.stage === stage);
}

/**
 * Folds one observation's captures into the capture truth. Entries inside the observed window
 * are replaced by what the observation saw there; entries outside it are kept. A stage can be
 * reached only once (stages lock in, points never revert), so if both an old and a new entry
 * exist for the same point and stage, the earliest one wins (the later one can't still happen).
 */
export function applyCaptureObservation(
  truth: readonly CaptureTruth[],
  obs: AttemptObservation,
): { captures: CaptureTruth[]; changes: CaptureChange[] } {
  const inWindow = (t: Tick) => t >= obs.fromTick && t <= obs.toTick;
  const kept = truth.filter((c) => !inWindow(c.tick));
  const added: CaptureTruth[] = (obs.captures ?? [])
    .filter((c) => inWindow(c.tick))
    .map((c) => ({ ...c, by: [...c.by], observedInAttempt: obs.attempt }));
  const best = new Map<string, CaptureTruth>();
  for (const c of [...kept, ...added].sort(byTick)) {
    const k = `${c.pointId}\u0000${c.stage}`;
    if (!best.has(k)) best.set(k, c);
  }
  // A point can't be ours before it was neutral: drop an 'ours' that precedes its 'neutral'
  // once the neutral entry moved later (a stale ours outside the window).
  const captures = [...best.values()]
    .filter((c) => {
      if (c.stage !== 'ours') return true;
      const n = best.get(`${c.pointId}\u0000neutral`);
      return !n || n.tick <= c.tick;
    })
    .sort(byTick);
  return { captures, changes: captureChanges(truth, captures) };
}

/** Points whose 'ours' tick changed between two truths. */
export function captureChanges(
  before: readonly CaptureTruth[],
  after: readonly CaptureTruth[],
): CaptureChange[] {
  const a = oursTicks(before);
  const b = oursTicks(after);
  const ids = [...new Set([...a.keys(), ...b.keys()])].sort();
  const out: CaptureChange[] = [];
  for (const pointId of ids) {
    const x = a.get(pointId) ?? null;
    const y = b.get(pointId) ?? null;
    if (x !== y) out.push({ pointId, before: x, after: y });
  }
  return out;
}

/** The soldiers credited with capturing a point (its 'ours' entry), or []. */
export function captors(truth: readonly CaptureTruth[], pointId: string): SoldierId[] {
  return captureOf(truth, pointId)?.by ?? [];
}
