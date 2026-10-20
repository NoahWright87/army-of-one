# Phase Plan

Each `PHASEnn.md` is a self-contained brief for one agent. Phases with the same number and a
letter suffix (`PHASE03-a`, `PHASE03-b`, …) **can run in parallel**. They own disjoint
directories and share only what earlier phases (or a contract doc) already defined.

Read `AGENTS.md` and `docs/DECISIONS.md` before starting any phase.

## The goal of phases 01–04

The design doc's first milestone, verbatim:

> The moment the player sees a soldier they previously watched die now survive, become an O on
> the timeline, and later continue under direct control.

The hard, novel problem is **recording lives and replaying them faithfully, for as many deaths as
the player wants**. Combat is deliberately simple. Polish waits.

## Phases

| Phase | Title | Depends on | Parallel with | Detail |
|---|---|---|---|---|
| [01](PHASE01.md) | Scaffold, conventions, sim skeleton | — | — | Full |
| [02-a](PHASE02-a.md) | Headless world & combat sim | 01 | 02-b | Full |
| [02-b](PHASE02-b.md) | Presentation: renderer, input, HUD, placeholders | 01 | 02-a | Full |
| [03 contract](PHASE03-CONTRACT.md) | Shared types for 03-a/b/c | 02 | — | Full |
| [03-a](PHASE03-a.md) | Recording, echo playback, snapshots | 02-a | 03-b, 03-c | Full |
| [03-b](PHASE03-b.md) | Timeline truth model & respawn screen | 03 contract | 03-a, 03-c | Full |
| [03-c](PHASE03-c.md) | Persistence & autosave | 03 contract | 03-a, 03-b | Full |
| [04](PHASE04.md) | **The loop**: die → echo → rescue → O → resume | 03-* | — | Full (⛔ Q1, Q2) |
| [05-a](PHASE05-a.md) | Capture points & forward spawns | 04 | 05-b | Medium (⛔ Q3, Q4) |
| [05-b](PHASE05-b.md) | Army-scale stress harness & performance | 04 | 05-a | Medium |
| [06-a](PHASE06-a.md) | Lazy outcome-tested recording simplification | 05-b | 06-b | Sketch |
| [06-b](PHASE06-b.md) | Auto-aim & touch controls | 04 | 06-a | Sketch |
| [07](PHASE07.md) | Multiplayer snapshot experiment | 06 | — | Sketch |
| [08](PHASE08.md) | Mission variety, scoring, content | 05 | — | Sketch |

Later phases are intentionally thin. Flesh out phase N+1 when phase N lands, using its
"Notes from implementation".

## Conventions for phase docs

- **Owns:** the directories the phase may create/modify freely. Touching anything else should be
  minimal and called out in the PR.
- **Tasks:** checkboxes. Check them off as you go.
- **Acceptance:** what must be demonstrably true for the phase to be done (tests + manual checks).
- **⛔ DECISION GATE:** parts that wait for the product owner. See `docs/DECISIONS.md` → Open questions.
- **Notes from implementation:** appended by the implementing agent at the end.
