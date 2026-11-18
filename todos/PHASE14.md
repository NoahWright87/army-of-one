# PHASE14: The campaign (carry-over, world map story, reports)

**Goal:** a campaign worth playing through: start from the title screen, choose where to attack
on a generated world map, fight a level, read an After Action Report, watch the map react, and
keep going until the enemy HQ falls. Money, income, enemy strength and surviving soldiers carry
over between levels. Decisions: [D116]–[D126] (owner session 2026-11). Proposals still to confirm:
[Q59] (Income+), [Q60] (enemy funds curve).

**Depends on:** PHASE11 (money), PHASE13-d (the random campaign, carving, crossings, run-in).

**Not in this phase (parked by the owner):** one continuous campaign with a shared clock,
soldiers crossing between live levels, leaving a level mid-battle to take a neighbour and coming
back with a new spawn. Levels are still fought one at a time ([D91]). The final "soldiers moving
across the map" animation comes later ([D123]).

## What exists (PHASE13-d)

- `src/gen/campaign.ts`: `{seed, includeMine, taken[]}`, `attackable`, `campaignBudget` (+12% per
  level taken), `takeLevel`, `campaignWon`. One campaign in localStorage
  (`src/app/campaign-storage.ts`).
- `?scene=campaign` (`src/app/campaign-main.ts`, `src/ui/campaign/campaign-view.ts`): the world
  map, a level panel with raw numbers (blocks, budget, enemies), Attack, New campaign.
- A win in a `from=campaign` battle marks the level taken (`src/app/main.ts`).
- Every level starts with the default money; all roles are open; no reserves.

## Parts

Built in order; each ends with something to click on. One agent can do all three in one branch.

### 14-a: campaign state and carry-over (pure)

**Owns:** `src/gen/campaign.ts` (+ tests), `src/gen/campaign-tags.ts` (new), `src/content/tuning.ts`
(`campaign` section), campaign wiring in `src/app/` (`campaign-storage.ts`, the win hook in
`main.ts`). Touches the respawn screen and economy only to add reserves, unlocks and start money.

- [x] Campaign state v3 (migrate or drop v2 cleanly): seed, blocks it was made from ([D126]),
  levels taken (in order), the **active level** (one at a time, [D122]) with the settings it
  was started with (budget, held neighbours: its mission id), money to carry, base-income
  bonus, unlocked roles, reserves, battle ticks so far, per-level results (for the reports),
  real time played.
- [x] **Freeze the blocks** ([D126]): store the block set (or official ids + copies of your blocks)
  when the campaign starts; `campaignWorld` builds from that, never from the live library.
- [x] **Tags** ([D121]), deterministic from the seed: Elite enemies (budget × `campaign.eliteBudget`),
  Unlocks: \<role\>, Income+ ([Q59]). Pair big rewards with Elite; prefer dead ends (levels not
  on the shortest route from the start to the HQ). Every locked role ([D120]) is offered by at
  least one level. Tests: determinism, every role reachable, the HQ never needs a dead end.
- [x] **Enemy funds** ([D119], [Q60]): a level's budget from campaign battle minutes, its own and
  full budget, and Elite. Remove `budgetGrowthPerLevel`. Tests: grows with time, capped at full.
- [x] **Starting roster** ([D120]): Rifleman, Grenadier, Machine Gunner, Shield; others locked
  until a level that unlocks them is taken. The respawn screen hides or locks roles not unlocked
  (campaign battles only; other modes keep everything).
- [x] **Money** ([D118]): a campaign battle starts with the carried money (debt → 0) and the
  default base income + the campaign's income bonus (via the level's `map.economy`).
- [x] **Reserves** ([D117]): on a win, soldiers alive at the win + O's never resumed join the pool
  (role kept). On the respawn screen, a reserve is a free spawn of that role at full HP from any
  entry at any time; deploying one removes it from the pool **when the level is won** (only
  one level is ever open, so nothing needs reserving). A reserve who dies is gone. Decide and note how a
  reserve shows on the timeline (a normal lane with cost 0 is the simplest).
- [x] **Win hook**: records the level's result (battle time, money in/out, spawned, lost,
  reserves gained/used, unlocks/income gained), applies carry-over and clears the active
  level. **Retreat** ([D122]) returns to the map; the level stays active with its save, and
  nothing in the campaign changes.
- [x] `npm run sim -- --scenario campaign` (or a test): a seeded campaign played by autoplay
  lives through 2–3 levels shows money, reserves and budgets carrying over.

### 14-b: the world map

**Owns:** `src/ui/campaign/`, `src/app/campaign-main.ts`, `src/content/strings.ts` (campaign keys).

- [ ] The level panel shows what matters ([D121]): name/HQ, tags as pills (Elite enemies,
  Unlocks: Sniper, Income+), size in words (small/large), status. No block counts or budgets.
- [ ] Taken levels get a clear "taken" outline; attackable ones a highlight.
- [ ] **Arrows** ([D123]): WW2-style red arrows, one per crossing from held ground (or the
  off-map start edge) into a level you can attack.
- [ ] A campaign HUD strip: money, income, reserves by role (icons), unlocked roles, battle time.
- [ ] **Return animation** after a win ([D123]), skippable (click/key): level outline flips to
  taken; "+🔫"/"+🛡️" pills float up and fade over enemy levels (how many by how much their
  budget grew); soldier icons pour into the level, the dead turn ☠️, survivors gather at its
  edge; income/money tick up. Driven by the level's stored result, so it can replay on reload.
- [ ] **One level at a time** ([D122]): while a level is active, the map shows it "In progress"
  with **Resume**; other levels' panels show their tags but no Attack (and say why). Arrows only
  point into the active level while one is open.

### 14-c: reports and the title screen

**Owns:** `src/ui/results/`, the title screen, `src/content/strings.ts` (report keys).

- [ ] **After Action Report** ([D124]): the existing results screen (stats, radar, replay) with a
  campaign section: reserves gained (by role), money carried, income gained, unlocks, battle
  time. Continue → the map with the return animation.
- [ ] **Final report** after the HQ ([D124]): money earned and spent, battle time and real time,
  soldiers spawned and lost, levels taken / total, rescues; fits one screen without scrolling
  at phone and desktop sizes (Playwright check at `iPhone 13` and 1280×720).
- [ ] **Title screen** ([D125]): Start Campaign, Resume Campaign when one is saved (Start then
  asks first), "More…" for the editor, random levels, hand-made missions, world viewer.
- [ ] Real time played: time the page is visible in a campaign battle or its respawn screen
  (app layer only).

## Acceptance

- Start → attack → win → report → map animation → attack again, with money, income, reserves
  and unlocks visibly carried over; retreat to the map, see only Resume, resume the level; take
  the HQ → final report on one screen.
- Enemy budgets grow with battle time (test) and the map shows it as "+🔫" pills.
- A campaign survives a reload at every step (map, battle, report, animation).
- `npm run lint && npm run lint:purity && npm run test && npm run build` pass.

## Later (parked)

- The continuous campaign (shared clock across levels, live crossings, mid-battle switching).
- The end-of-campaign animation of soldiers moving across the map.
- A hand-made campaign ([D56]); campaign scoring for leaderboards (PHASE15, [Q32]).

## Notes from implementation (14-a)

- **State** (`src/gen/campaign.ts`, v3): seed, `includeMine` + `blocks` (copies of *your* blocks
  only; official blocks come from the build), `taken`, `money`, `incomeBonus`, `unlocked`,
  `reserves`, `battleTicks`, `active` (the level's settings: mission id, budget, start money,
  income, reserves, roles), `results` (each with the settings it was fought with, so a reload of
  a won level's results/replay keeps its money), `realMs` (filled by 14-c). PHASE13-d's v2
  campaigns are **dropped**, not migrated (they kept no blocks, so the world could have changed);
  the storage key is unchanged.
- **The active level's mission id is stored**, not recomputed: the id holds the screen turn
  ([D107]), so resuming on a rotated phone keeps the same save slot.
- **Battles** (`src/app/main.ts`): a `from=campaign` battle whose mission id is the active level
  (or a won level's) is built from the campaign's own world and gets its settings through
  `applyLevelSettings` (`map.economy.startMoney/baseIncomePerSecond/reserves`, `map.roles`). On
  the win, `levelResult` (`src/gen/campaign-result.ts`) reads the final truth and `finishLevel`
  applies it. Only the active level's win counts; the respawn screen's back button is the retreat.
- **Reserves in the ledger** (`src/timeline/economy.ts`): `map.economy.reserves` makes the first
  spawns of a role, in tick order, free (`Purchase.reserve`). A new spawn of a role is free while
  `reservesLeft > 0`; an earlier deploy can take a later soldier's reserve, which then pays (may
  be debt, [D54]). The respawn screen prices them "Reserve ×n".
- **Survivors**: every soldier who spawned by the win and isn't dead by then (O's, frozen ones and
  anyone alive) becomes a reserve of their role.
- **Locked roles** ([D120]) show 🔒 in the role menu and can't be picked (keys too); deploy falls
  back to the Rifleman. Other modes have no `map.roles`, so everything stays open there.
- **Tags** (`levelTags`): unlocks spread over off-route levels, cheapest role nearest and the Tank
  furthest out; Income+ on the most remote remaining ones (`campaign.incomeLevels`); Elite on the
  two dearest unlocks, every Income+ level, and `campaign.eliteShare` of the rest past the first
  band. **Income+ is a reward for taking the level** (its objectives are captured to win), adding
  `campaign.incomeBonus`/s; whether it should instead come from specific held points is [Q59].
- **Enemy funds**: [Q60] as proposed (`campaign.minutesToFull` = 30). The map shows it as "Enemy
  reinforcements n%"; the old per-level-taken growth is gone.
- **Map** (`src/ui/campaign/`): minimal changes only: money, income, reserves and roles in the
  side panel, tags as an "Intel" row, "In progress"/Resume, and other levels say "Finish level n
  first". It still shows the raw budget and enemy count; 14-b replaces the panel.
- Not browser-tested end to end: winning a generated level by hand. The win path is covered by
  `campaign.test.ts`/`campaign-result.test.ts`; Playwright checked attack → respawn screen (money,
  locks, reserves) → back → Resume only.

