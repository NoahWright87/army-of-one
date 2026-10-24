# PHASE07-b: Auto-aim & touch controls (sketch)

**Goal:** make the game playable on phones and by players who prefer tactics over aim (design doc
§05). Flesh this out after the core loop has been playtested.

**Depends on:** PHASE06. **Parallel with:** PHASE07-a.

## Direction
- New `InputSource`s: touch (virtual stick + fire/interact buttons), gamepad (later), and an
  **auto-aim** mode that picks a target and fires automatically, with visible range and target
  indication. Clear manual/auto switch.
- Mobile layout pass for HUD and respawn screen; mobile performance pass using the 05-b
  bench/stress tooling.

## ⛔ Questions for the owner before building
- Target-selection priorities for auto-aim (nearest? most threatening? last-damaged-by?).
- **How auto-aim lives replay as echoes:** replay the recorded shots exactly (consistent with
  [E1]), or let auto-aim echoes re-target currently valid enemies (more helpful, less
  predictable)? The design doc calls this an experiment, not a requirement.
