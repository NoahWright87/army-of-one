# PHASE07: Replayable & playable anywhere

Owner direction after playing PHASE06 (2026-10):
1. A score screen and the other "phase 9" bits. **While the stats show, replay the entire mission**
   with all your lives together. The camera scrolls smoothly, zooming out to fit every soldier
   alive at that moment and back in as they die or bunch up. It might be **shareable** later.
2. **Auto-aim and touch controls**, so it can be tested on a phone.
3. Multiplayer is deferred until "way later" (PHASE08).
4. Recordings are small enough, so optimizations are deferred (PHASE10).
5. **More variety:** soldier types, vehicles, and more kinds of enemies.

| Part | What | Notes |
|---|---|---|
| [07-a](PHASE07-a.md) | Results screen + full-mission "after-action" replay | No decision gates for the core; scoring axes are provisional, behind a setting |
| [07-b](PHASE07-b.md) | Auto-aim + touch controls (phone-playable) | One product question, built behind a setting |
| [07-c](PHASE07-c.md) | Variety: soldier roles, enemy types, vehicles | ⛔ Starts with a decision step: the owner picks from the menu |

07-a and 07-b can run in parallel. 07-c's decision step can happen alongside them; its build
follows once the owner has picked.

Context for a fresh session: start with `todos/README.md` ("Start here"), then `AGENTS.md`,
`docs/DECISIONS.md`, and this file.
