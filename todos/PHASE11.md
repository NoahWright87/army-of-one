# PHASE11: Economy (money on the timeline)

**Goal:** soldiers cost money, and money is a function of battle time ([D51]–[D54]). Capturing
points and killing enemies pays. The respawn screen shows a money line under the lanes and what
each spawn option can afford. Free Riflemen keep "respawning is the game" ([D18]) intact.

**Depends on:** PHASE07. **Before:** PHASE12-b (vehicles need a price), PHASE13 (generators balance
against a budget), PHASE14 (progression raises income, [D57]).

**Owns:** `src/timeline/economy.ts` (new), economy parts of `src/contracts/mission.ts` (additive),
`tuning.economy`, map fields for income, the respawn screen's money display, role costs in
`src/content/roles.ts`.

## The model
```
balance(t) = start + baseRate·t + Σ capture income while ours + Σ bounties ≤ t − Σ costs of soldiers spawned ≤ t
available(t) = min over t' ≥ t of balance(t')      ([Q30], proposed)
```
- Everything is integer and tick-based (money in whole units or cents; no float accumulation).
- Income is pure battle time ([D52]). Capture income runs from the tick a point becomes ours
  to the tick it's lost (or the end), from the capture truth.
- Bounties: one per enemy death (soldier or structure) at its tick, whatever caused it ([D53]).
- Costs: charged at the spawn tick, only for soldiers that spawn in the current truth ([Q31]).
  Resumes are free (the soldier is already bought).
- Debt ([D54]): bought soldiers never vanish. Negative balance just blocks purchases.

## Tasks
- [x] **Enemy death truth.** Today observations only carry `kill` markers credited to our
  soldiers. Add a world-level `DeathObservation { refId, kind: 'soldier' | 'structure', tick }`
  for every enemy death in the window, whatever caused it, folded like `CaptureTruth` (latest
  attempt wins inside its window, [D2]/[D3]; background resolves fill in the rest, [D23]).
- [x] **Capture losses in the truth** (this also resolves [Q25]): a "point lost at t" entry, so
  capture income (and the forward spawn) ends when enemies retake a point ([D45]).
- [x] `src/timeline/economy.ts`: pure `balanceAt`, `availableAt`, a compact money curve
  (breakpoints) for drawing, from the truth + map + tuning + roles. Unit tests, including the
  owner's worked example in [D51], the forward-point case in [Q30], debt after a lost capture,
  and a refund from a never-spawned soldier.
- [x] Map data: `economy: { start, baseRate }` per map (defaults in `tuning.economy`, `// TUNE`),
  `income` per capture point, `bounty` per enemy role / structure kind (defaults by kind).
- [x] Role costs: Rifleman 0; Grenadier and Machine Gunner get real prices (`// TUNE`).
- [x] Respawn screen: a money line under the timeline (with capture and bounty steps marked),
  "$X available" per spawn option, role buttons greyed when unaffordable (with the price shown).
  Quick redeploy ([Q16]) falls back to a Rifleman when the last role isn't affordable.
- [x] HUD: the current balance during battle (a small counter, placeholder copy in `strings.ts`).
- [x] Persistence: nothing new beyond the truth fields (costs come from roles and maps). Old
  saves fold with no deaths/losses observed yet: they're re-learned on the next attempt/resolve.
- [x] Setting `economy.enabled` (default on): off = every role free, no money shown.
- [x] Dev: `npm run sim -- --scenario economy` prints the money curve for a scripted run.

## Acceptance
- The [D51] example reproduces exactly in a unit test.
- A run where a later attempt loses an early capture shows the balance dropping into debt, with
  purchases blocked until it recovers, and no soldier un-spawned.
- Same truth → same curve (pure function; determinism test).
- Lint, purity, tests and build pass; browser check of the money line and role pricing.

## Open questions
[Q30] (spendable = lowest future balance) and [Q31] (refunds) are proposed defaults; build them
as described unless the owner changes them. [Q32] (money in the score) waits.

## Notes from implementation

- **Truth.** Observations carry `enemyLosses` (every enemy soldier death, turret, traffic
  vehicle and map mine, whatever caused it) and `pointLosses` (a point of ours taken back to
  neutral). `src/timeline/losses.ts` folds them into `MissionState.lossTruth` with the capture
  window rules; an enemy is lost once (earliest wins). Bridges are terrain, not enemy
  structures: no bounty. The objective pays nothing (it ends the mission).
- **Money** (`src/timeline/economy.ts`): `buildLedger` (start, base income, capture income
  spans, bounties, purchases) → `balanceAt`, `availableAt` ([Q30]: the lowest balance from t
  on), `canAfford`, `rateAt`, `moneyCurve`. Pure, floating point but derived from integer ticks
  (not sim state, so no determinism concern). Purchases skip `neverSpawned` lanes ([Q31]).
- **Numbers** (`tuning.economy`, all `// TUNE`): $100 start, $1/s base, $2/s per point;
  bounties rifleman 5, grenadier 8, gunner 10, turret 20, vehicle 5, mine 2. Grenadier $30,
  Machine Gunner $50 (`roles.ts`). Maps may override `economy.startMoney/baseIncomePerSecond`
  and each point's `income`. `tuning.economy.enabled` (F2 → Sim tuning) turns it all off.
- **Flow.** `GameController.affordableRole` decides the role at deploy: the picked role if the
  money available at the entry tick covers it, else a free Rifleman. So quick redeploy never
  gets stuck. The live HUD folds the attempt's captures/losses so far into the truth
  (`Attempt.worldSoFar`) and adds the live soldier's purchase; the battle scene refreshes it
  every 15 ticks.
- **UI.** Option cards show "$X to spend" ("Already paid for" on resumes, red in debt); role
  buttons show prices, unaffordable ones are struck through with a one-line reason; a money
  strip under the lanes draws the balance on the timeline's scale (bounty dots, purchase dots,
  the selected entry's balance; hover for the balance at any time). HUD: balance + rate.
- **[Q25] partly done:** a forward spawn closes from the tick its point was lost. The capture
  truth still keeps one 'ours' entry per point (the earliest), so a point **retaken** after a
  loss doesn't reopen its spawn or its income yet. That needs the capture truth to hold
  intervals; do it when enemies retaking points matters in play.
- **Not done:** no money in the results screen/score ([Q32], owner: later). The autoplay
  stories don't pick roles, so `npm run sim -- --scenario economy` shows free soldiers;
  it prints captures, bounties and the balance table. With `--enemies` the old scripts stop
  early ([Q27]).
- Tests: `timeline/__tests__/economy.test.ts` (the owner's [D51] example exactly, [Q30],
  debt, refund, bounty folding, curve, [Q25]), `sim/__tests__/economy-observation.test.ts`,
  `persistence/__tests__/losses-store.test.ts`, `ui/respawn/__tests__/respawn-money.test.ts`,
  `app/economy-flow.test.ts`.
