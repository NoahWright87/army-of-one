# PHASE20: stances and the weapon swap ([D160])

Owner request (2026-11-25): Snipers and Machine Gunners are hampered by a lack of cover, and the
automatic mount / scope transitions confuse and frustrate. Give every soldier manual stance and
weapon controls, with the old behaviour kept as an auto option.

- [x] Sim: `stepStance` (braced / prone / deployed, no firing while settling or swapping, snap to
  cover, prone crawl, dodge), the Sniper's pistol ↔ rifle swap, stance-aware range, auto mode.
- [x] Recording: a `stance` action so echoes take the stance up on the same tick.
- [x] Weapon icon (silhouettes, readiness wipe, cyan bonus, blue swap) and stance icon (ring while
  settling), auto toggle by right-click / long-press, Z and Q keys.
- [x] Camera: scope zoom and extra reach only while settled; lean across cover when braced.
- [x] Touch: braced or deployed makes the first finger the reticle (fires while held), no walking.
- [x] Tests: `src/sim/__tests__/stance.test.ts`, loadout controls and camera tests.
- [ ] Not done: enemy AI choosing stances (Issue; [Q67]); rewriting basic training for stances
  ([Q69]); a prone / deployed sprite ([Q70]); a playtest on a real phone.

## Notes from implementation

- `mountTicks` now counts any stance's settling time (`mountTicksNeeded(tuning, role, stance)`);
  `settled` is the stance that counts. `gunRange(…, shooter)` follows the shooter's stance, so
  callers that don't pass a shooter get the plain range.
- `sniper.baseSpread` is now the standing rifle's (0.02) and `movingSpread` 0.15: the rifle can
  fire on the move now, badly. Prone is a 70 % share of `coverSpreadMultiplier` (0.12).
- Removed: the MG's shuffle along its cover and the Sniper's slow scoped walk (static stances).
- Auto mode: the very first look at an auto Sniper picks its gun without a swap delay.
- The readiness meter (owner's second pass): white outline, black fill; a shot turns the fill
  yellow and it fades out over the reload (`loadout-hud.ts`).
