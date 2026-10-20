# PHASE08: Mission variety, scoring & content (sketch)

**Goal:** turn the proven loop into a game worth replaying (design doc §10, phase 5 of its
roadmap). Mostly content and design work, so it needs heavy owner input.

**Depends on:** PHASE05.

## Direction
- **Scoring** ([D18]): per-mission results such as battle time, soldiers used, rescues,
  disruption caused, insertion-point use. Possibly a **radar chart of play style** rather than a
  single score. Bragging works both ways ("captured it in one life" / "300 sacrifices, 3 hours").
- **Mission select** and more missions from the design doc's table: beachhead assault, crossroads
  seizure, fortified infiltration, multi-front objective, versus objective race.
- **Enemy soldiers** that move and fight back (and can retake capture points?). This needs owner
  rulings on how enemy AI interacts with replayed history.
- **Roles/loadouts** (sniper, grenadier, medic, engineer…), each a distinct "temporal
  contribution". Vehicles only if justified.
- **Art/audio/copy replacement pass** using `assets/ASSETS.md` and `src/content/strings.ts`.
- **3D feasibility spike** (design doc "Future option"): an isolated scene rendering the same
  `WorldView`, judged on readability first.
