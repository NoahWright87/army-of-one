import type { LaneSpan, LaneSpanKind } from '../contracts/mission';
import type { Tick } from '../sim/core/time';

/**
 * Overwrites [from, to] (inclusive) with one span, splitting whatever was there, then merges
 * neighbours with the same kind and attempt. Returns a new array; ranges outside the existing
 * coverage are added as-is (callers keep coverage exact).
 */
export function paintSpan(
  spans: readonly LaneSpan[],
  from: Tick,
  to: Tick,
  kind: LaneSpanKind,
  observedInAttempt: number,
): LaneSpan[] {
  if (to < from) return spans.slice();
  const out: LaneSpan[] = [];
  for (const s of spans) {
    if (s.to < from || s.from > to) {
      out.push(s);
      continue;
    }
    if (s.from < from) out.push({ ...s, to: from - 1 });
    if (s.to > to) out.push({ ...s, from: to + 1 });
  }
  out.push({ from, to, kind, observedInAttempt });
  out.sort((a, b) => a.from - b.from);
  return mergeSpans(out);
}

export function mergeSpans(spans: readonly LaneSpan[]): LaneSpan[] {
  const out: LaneSpan[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (
      last &&
      last.kind === s.kind &&
      last.observedInAttempt === s.observedInAttempt &&
      last.to + 1 === s.from
    ) {
      out[out.length - 1] = { ...last, to: s.to };
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

/** True if spans are sorted, non-overlapping and exactly cover [from, to]. */
export function spansCover(spans: readonly LaneSpan[], from: Tick, to: Tick): boolean {
  let expected = from;
  for (const s of spans) {
    if (s.from !== expected || s.to < s.from) return false;
    expected = s.to + 1;
  }
  return expected === to + 1;
}
