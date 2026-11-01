# Phase Plan

Each `PHASEnn.md` is a self-contained brief for one agent. Phases with the same number and a
letter suffix (`PHASE03-a`, `PHASE03-b`, …) **can run in parallel**. They own disjoint
directories and share only what earlier phases (or a contract doc) already defined.

Read `AGENTS.md` and `docs/DECISIONS.md` before starting any phase.

## Start here (for a fresh session)

**Status (2026-10-31):** phases 01–06 are built, plus the single-mission change ([D31]). They sit
in a stack of PRs on GitHub, each based on the previous one and each with a GitHub Pages preview
(`.github/workflows/pr-preview.yml`):

#1 docs → #9 preview workflow (to `main`) → #2 01 → #3 02-a → #4 02-b → #5 03-c → #6 03-a →
#7 03-b → #8 04 → #10 05-a → #11 05-b → #12 06 plan → #13 06-a → #14 06-b → #15 06-c →
#16 single mission → #17 this plan.

**Next:** PHASE07 ([overview](PHASE07.md)). Run 07-a and 07-b in parallel. Hold the 07-c decision
session with the owner before building any of it. Base new work on the top of the stack (or on
`main` once the stack is merged).

How work has gone so far: parallel agents per letter part, each verified (lint, purity check,
tests, build, plus a Playwright browser check against a Pages-style sub-path build), then
stacked as PRs for the owner to review in batches. The owner's working rules: when unsure about an
option, make it a setting; don't invent gameplay rules (ask, or flag them in Open questions);
minimal dependencies.

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
| [04](PHASE04.md) | **The loop**: die → echo → rescue → O → resume | 03-* | — | Full |
| [05-a](PHASE05-a.md) | Capture points & forward spawns | 04 | 05-b | Full |
| [05-b](PHASE05-b.md) | Army-scale stress harness & performance | 04 | 05-a | Full |
| [06 plan](PHASE06.md) | **Streamline** (playtest feedback): overview + shared rules | 05 | — | Full |
| [06-a](PHASE06-a.md) | Linear "straight shot" mission + fast pacing | 05 | 06-b, 06-c | Full |
| [06-b](PHASE06-b.md) | Revealed map: respawn-screen map + in-game minimap | 05 | 06-a, 06-c | Full |
| [06-c](PHASE06-c.md) | Snappy flow + frame-rate pass | 05 | 06-a, 06-b | Full |
| [06 single mission](../docs/DECISIONS.md) | Breach is the only mission ([D31]) | 06 | — | Done (PR #16) |
| [07 plan](PHASE07.md) | **Replayable & playable anywhere**: overview | 06 | — | Full |
| [07-a](PHASE07-a.md) | Results screen + full-mission after-action replay | 06 | 07-b | Full |
| [07-b](PHASE07-b.md) | Auto-aim + touch controls (phone-playable) | 06 | 07-a | Full |
| [07-c](PHASE07-c.md) | Variety: soldier roles, enemy types, vehicles (⛔ owner picks first) | 06 | 07-a, 07-b | Full |
| [08](PHASE08.md) | Multiplayer snapshot experiment | 07, 09 | — | **Deferred** |
| [09](PHASE09.md) | More missions, art pass, 3D spike | 07 | — | Sketch |
| [10](PHASE10.md) | Lazy outcome-tested recording simplification | 07 | — | **Deferred** |

Later phases are intentionally thin. Flesh out phase N+1 when phase N lands, using its
"Notes from implementation".

## Conventions for phase docs

- **Owns:** the directories the phase may create/modify freely. Touching anything else should be
  minimal and called out in the PR.
- **Tasks:** checkboxes. Check them off as you go.
- **Acceptance:** what must be demonstrably true for the phase to be done (tests + manual checks).
- **⛔ DECISION GATE:** parts that wait for the product owner. See `docs/DECISIONS.md` → Open questions.
- **Notes from implementation:** appended by the implementing agent at the end.
