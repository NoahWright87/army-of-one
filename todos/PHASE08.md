# PHASE08: Multiplayer snapshot experiment (sketch)

**Goal:** prove the design doc's §08 model. Players in the same synchronized instance affect each
other live. A player who respawns starts a new independent instance built from the history
**snapshot** available at that moment, and does not stream other players' later actions.

**Depends on:** PHASE07 (or at least 06). **Parallel with:** — (split once designed).

## Direction
- The architecture so far helps: pure deterministic sim, recordings as data, truth folded from
  observations. Multiplayer is mostly about **publishing** observations/recordings between
  players and **merging** truth.
- Start with the smallest experiment: two browser tabs, local relay (BroadcastChannel), asymmetric
  lives (the design doc's "careful player and meat grinder").
- Then a minimal relay server, only if needed. "Large server infrastructure" is out of scope.

## ⛔ Open product rules (design doc §08 table; all must be decided first)
- What's included from an in-progress life in a snapshot? Can a partial life yield an O?
- How is a cross-instance rescue published, without modifying a player's active session?
- How do conflicting parallel histories resolve? (Note how [D2] "latest attempt is truth"
  generalizes, or doesn't, with two players' latest attempts.)
- When can live players rejoin a synchronized instance (optional O-based sync delay)?
- Versus win conditions, tie-breaking, and when a match ends for everyone.
- Whether captures ([D9]) become contested between teams.
