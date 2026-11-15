# PHASE14: Campaign, metagame and progression (sketch)

**Goal:** a reason to keep playing across missions: a campaign through the world map, with
progress that carries between levels ([D57]: income goes up between levels).

**Depends on:** PHASE11 (money), PHASE13 (generated levels and world map). PHASE12-a/b give it
something to unlock.

## Direction
- A campaign is a run through a world map (generated from a seed, [D56], or hand-made; built
  like Carcassonne, [D89]). Levels are self-contained ([D91]): the campaign only passes in
  numbers and unlocks. Enemy funds (the block budget, [D85]/[D86]) grow as the campaign goes on;
  captured bonus blocks pay out (a fuel depot raises income or starting cash, a factory may
  unlock units); which levels you hold decides where you can attack next and from which side.
  Each cleared level improves what you start the next one with: income, starting money, maybe
  unlocked roles and vehicles.
- Campaign state is persisted (versioned schema, `src/persistence/`), separate from a mission's
  timeline save.
- Scoring per mission and per campaign ([D18], [Q23], [Q32]) feeds the results screen and,
  later, leaderboards (PHASE15).

## ⛔ Decisions needed first
- What progresses: only income/starting money, or also unlocks (roles, vehicles, upgrades)?
- Is progress per campaign only (a roguelite run), or is there also something permanent
  across campaigns?
- Can a campaign be lost (running out of something), or only scored?
- How scoring works, including money ([Q32]).
