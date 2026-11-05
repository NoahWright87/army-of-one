# PHASE11: Economy (money on the timeline)

**Goal:** soldiers cost money, and money is a function of battle time ([D51]–[D54]). Capturing
points and killing enemies pays. The respawn screen shows a money line under the lanes and what
each spawn option can afford. Free Riflemen keep "respawning is the game" ([D18]) intact.

**Depends on:** PHASE07. **Before:** PHASE12 (vehicles need a price), PHASE13 (generators balance
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
- [ ] **Enemy death truth.** Today observations only carry `kill` markers credited to our
  soldiers. Add a world-level `DeathObservation { refId, kind: 'soldier' | 'structure', tick }`
  for every enemy death in the window, whatever caused it, folded like `CaptureTruth` (latest
  attempt wins inside its window, [D2]/[D3]; background resolves fill in the rest, [D23]).
- [ ] **Capture losses in the truth** (this also resolves [Q25]): a "point lost at t" entry, so
  capture income (and the forward spawn) ends when enemies retake a point ([D45]).
- [ ] `src/timeline/economy.ts`: pure `balanceAt`, `availableAt`, a compact money curve
  (breakpoints) for drawing, from the truth + map + tuning + roles. Unit tests, including the
  owner's worked example in [D51], the forward-point case in [Q30], debt after a lost capture,
  and a refund from a never-spawned soldier.
- [ ] Map data: `economy: { start, baseRate }` per map (defaults in `tuning.economy`, `// TUNE`),
  `income` per capture point, `bounty` per enemy role / structure kind (defaults by kind).
- [ ] Role costs: Rifleman 0; Grenadier and Machine Gunner get real prices (`// TUNE`).
- [ ] Respawn screen: a money line under the timeline (with capture and bounty steps marked),
  "$X available" per spawn option, role buttons greyed when unaffordable (with the price shown).
  Quick redeploy ([Q16]) falls back to a Rifleman when the last role isn't affordable.
- [ ] HUD: the current balance during battle (a small counter, placeholder copy in `strings.ts`).
- [ ] Persistence: nothing new beyond the truth fields (costs come from roles and maps). Old
  saves fold with no deaths/losses observed yet: they're re-learned on the next attempt/resolve.
- [ ] Setting `economy.enabled` (default on): off = every role free, no money shown.
- [ ] Dev: `npm run sim -- --scenario economy` prints the money curve for a scripted run.

## Acceptance
- The [D51] example reproduces exactly in a unit test.
- A run where a later attempt loses an early capture shows the balance dropping into debt, with
  purchases blocked until it recovers, and no soldier un-spawned.
- Same truth → same curve (pure function; determinism test).
- Lint, purity, tests and build pass; browser check of the money line and role pricing.

## Open questions
[Q30] (spendable = lowest future balance) and [Q31] (refunds) are proposed defaults; build them
as described unless the owner changes them. [Q32] (money in the score) waits.
