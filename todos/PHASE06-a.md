# PHASE06-a: Lazy, outcome-tested recording simplification (sketch)

**Goal:** shrink recordings and per-echo work as the army grows, *without changing outcomes the
player cares about* (design doc §06, [E1]). Flesh this out after PHASE05-b's numbers show where
the cost actually is.

**Depends on:** PHASE05-b. **Parallel with:** PHASE06-b.

## Direction
- Thin per-tick waypoints into sparse timed waypoints. Preserve every action tick, plus waypoints
  around shots, interacts, captures, damage and deaths. The echo controller already follows a
  timed schedule with "never early" throttling, so sparse waypoints just work.
- **Lazy:** only simplify when worthwhile (size/perf thresholds). Prefer old, dense, low-impact
  stretches.
- **Outcome-tested:** simplify a candidate span → re-simulate the affected window headlessly →
  compare significant outcomes (every lane's fate/tick, captures, hazard destructions, objective;
  not just the simplified soldier's own death) → keep the change or roll it back. A background
  worker is a natural fit.
- Acceptance scenario from the design doc: "Simplified recording changes a fatal result →
  candidate simplification is rejected or reversed instead of silently accepted."

## Open items to raise with the owner when this is fleshed out
- How much harmless drift is acceptable ("timey-wimey license") vs. must-match outcomes.
