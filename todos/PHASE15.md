# PHASE15: Sharing: weekly campaign, leaderboards, replays, async co-op (sketch)

**Goal:** social play without multiplayer ([D58]). A weekly seeded campaign everyone plays,
leaderboards and high scores, shared replays, and **asynchronous co-op**: play alongside
another player's lives as echoes that affect your run.

**Depends on:** PHASE13 (seeds), PHASE14 (scoring). Shares groundwork with PHASE08
(publishing recordings between players), which stays deferred.

## Direction
- A shared run = seed + content version ([E11]) + recordings. Recordings are already data and
  small (`docs/perf.md`), so a run can be exported as a file/link before any server exists.
- Watching a replay reuses the after-action replay (PHASE07-a).
- Async co-op: load another player's soldier records as echoes into your truth. They replay
  under [E1]/[E3] like your own echoes: the world can kill them, your soldiers can rescue them.
  Needs a lane owner (whose soldier is this) on the timeline, and rules on whether you can
  resume their O's.
- Leaderboards and the weekly seed need a small backend (or a static, signed weekly seed list
  to begin with). Anti-cheat is out of scope at first.

## ⛔ Decisions needed first
- Weekly challenge fairness: a fixed starting state ([Q33])?
- Money in async co-op ([Q34]): do their bounties/captures fund you, do their soldiers cost you?
- Can you resume another player's O and play on as their soldier?
- Hosting: what (if any) backend, and accounts/names for leaderboards.
