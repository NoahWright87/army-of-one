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

- [ ] Campaign state v3 (migrate or drop v2 cleanly): seed, blocks it was made from ([D126]),
  levels taken (in order), money to carry, base-income bonus, unlocked roles, reserves, battle
  ticks so far, per-level results (for the reports), real time played.
- [ ] **Freeze the blocks** ([D126]): store the block set (or official ids + copies of your blocks)
  when the campaign starts; `campaignWorld` builds from that, never from the live library.
- [ ] **Tags** ([D121]), deterministic from the seed: Elite enemies (budget × `campaign.eliteBudget`),
  Unlocks: \<role\>, Income+ ([Q59]). Pair big rewards with Elite; prefer dead ends (levels not
  on the shortest route from the start to the HQ). Every locked role ([D120]) is offered by at
  least one level. Tests: determinism, every role reachable, the HQ never needs a dead end.
- [ ] **Enemy funds** ([D119], [Q60]): a level's budget from campaign battle minutes, its own and
  full budget, and Elite. Remove `budgetGrowthPerLevel`. Tests: grows with time, capped at full.
- [ ] **Starting roster** ([D120]): Rifleman, Grenadier, Machine Gunner, Shield; others locked
  until a level that unlocks them is taken. The respawn screen hides or locks roles not unlocked
  (campaign battles only; other modes keep everything).
- [ ] **Money** ([D118]): a campaign battle starts with the carried money (debt → 0) and the
  default base income + the campaign's income bonus (via the level's `map.economy`).
- [ ] **Reserves** ([D117]): on a win, soldiers alive at the win + O's never resumed join the pool
  (role kept). On the respawn screen, a reserve is a free spawn of that role at full HP from any
  entry at any time; deploying one removes it from the pool **when the level is won** (a
  retreated level gives reserves back). A reserve who dies is gone. Decide and note how a
  reserve shows on the timeline (a normal lane with cost 0 is the simplest).
- [ ] **Win hook**: records the level's result (battle time, money in/out, spawned, lost,
  reserves gained/used, unlocks/income gained) and applies carry-over. **Retreat** ([D122])
  keeps the level's save and changes nothing in the campaign.
- [ ] `npm run sim -- --scenario campaign` (or a test): a seeded campaign played by autoplay
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
- [ ] Resume a retreated level: its panel says "In progress" and Attack continues it.

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
  and unlocks visibly carried over; retreat and resume a level; take the HQ → final report on
  one screen.
- Enemy budgets grow with battle time (test) and the map shows it as "+🔫" pills.
- A campaign survives a reload at every step (map, battle, report, animation).
- `npm run lint && npm run lint:purity && npm run test && npm run build` pass.

## Later (parked)

- The continuous campaign (shared clock across levels, live crossings, mid-battle switching).
- The end-of-campaign animation of soldiers moving across the map.
- A hand-made campaign ([D56]); campaign scoring for leaderboards (PHASE15, [Q32]).
