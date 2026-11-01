# PHASE07-b: Auto-aim + touch controls (phone-playable)

**Goal:** the owner can pick up a phone, open the PR preview, and play Breach comfortably. This
also covers players who'd rather think than aim (design doc §05).

**Depends on:** PHASE06 + the single-mission PR ([D31]). **Parallel with:** 07-a.
**Owns:** new `src/render/input/**` input sources (touch, auto-aim), `src/ui/touch/**`, mobile
layout tweaks in `src/ui/**`, the input/control settings group.

## Tasks
- [x] **Auto-aim** as an `InputSource` decorator (works with keyboard or touch):
  - Picks the best target in range with line of sight: closest threat first, prefer the one
    aiming at you (a turret in wind-up), stick with the current target until it dies or leaves
    range (no flicker).
  - Fires automatically, or on hold, as a setting.
  - Shows the range ring and the current target's marker clearly.
  - **Recording stays [E1]:** what's recorded is the actual shot (origin + angle), so echoes of
    auto-aimed lives replay deterministically like any other.
  - ⛔ Product question (design doc §05 calls it an experiment): should auto-aim *echoes* retarget
    currently valid enemies instead of replaying recorded shots? Build only the recorded
    behaviour, behind `echo.autoAimReplay: 'recorded'` (the only value for now), and add it to
    Open questions in `docs/DECISIONS.md`.
- [x] **Touch controls:**
  - A floating virtual stick for movement (left half of the screen).
  - Right side: an optional aim stick (when auto-aim is off), an interact button (shown only when
    near a lever), and fire.
  - Respawn-screen actions are thumb-reachable.
  - Quick redeploy gets a big tap target on the death beat.
  - Prevent page scroll, zoom and pull-to-refresh during play ([D20] still saves if it happens).
- [x] **Auto-detect:** touch devices default to touch + auto-aim; desktop to keyboard/mouse +
  manual aim. Both are switchable in settings. The settings panel (F2) needs a touch-reachable
  open button.
- [x] **Mobile layout pass:** HUD, countdown, minimap and respawn screen at phone sizes in
  portrait (Breach is a tall map, so portrait may be natural). Check landscape too.
- [ ] Performance on phones: default `display.renderScale` to auto-lower on small/high-DPR
  screens if needed.

## Tests
- The auto-aim target picker (pure): range, LOS, priority, stickiness.
- Touch stick math (dead zone, clamp).
- Recorded auto-aim shots replay exactly (determinism).

## Acceptance
- On a phone (Playwright mobile emulation plus a real device by the owner): play Breach end to end
  with touch + auto-aim, die, quick-redeploy, use the respawn screen, and finish.

## Notes from implementation

Built (2026-11, in the same branch as 07-c, owner request):
- Auto-aim: `src/render/input/auto-aim.ts` (pure picker + `AutoAimInput` decorator; target
  brackets and a reach ring in the renderer). Range follows the role (rifle, MG, grenade max
  range). The Grenadier auto-throws: wind up to full, release. Partial cover doesn't block the
  picker (shots roll against it); walls and closed gates do.
- Touch: `src/ui/touch/` (controls overlay + pure stick math) and `src/render/input/touch-input.ts`.
  The reticle sits along the aim at the aim distance, so the [D39] cone still shows.
- `InputSource` grew optional `observe(view)`, `aimTarget()`, `aimRange()`; the battle scene
  feeds every new view to the source.
- Settings: Controls group (`input.mode`, `input.autoAim`, `input.autoFire`). The quick-redeploy
  hint is tappable everywhere and big on touch; minimap moves to the top right in touch mode.
- Checked with Playwright iPhone 13 emulation (move stick, auto-aim kills a turret, death,
  respawn screen, results). A real-device pass by the owner is still to do.
- Not done: landscape-specific layout tweaks, auto-lowering renderScale on phones.
- Open: [Q22].
