# POC: In-world respawn

**Superseded by `todos/PHASE19-tape.md`** (the battle scene's respawn mode on the battle tape).

The owner's idea (2026-11-21): drop the respawn screen and pick spawns **inside the battle
replay**. The timeline becomes something like a minimap of what you've done. You watch history play out
(and see how soldiers died) instead of reading lanes, then tap a circle on the battlefield to
deploy. Not Braid rewind: no undo, no "try again from 5 seconds ago". It's the respawn screen moved
in-world, looking like the end-of-game replay. The look and feel will be iterated with the owner.

## What the POC does

- [x] F2 → Game → **In-world respawn (POC)** (`flow.inWorldRespawn`, on by default) swaps the
      respawn screen for `src/ui/inworld/inworld-respawn.ts` over the replay scene. Basic
      training keeps the old screen (its coach points at it).
- [x] Opens paused at the death (or at 0:00 on a fresh mission) with the camera on the soldier
      who just died (or on the suggested spawn). Drag pans, the wheel zooms.
- [x] Money at the scrub time, big at the top (`availableAt`).
- [x] Bottom bar: `|◀` previous stop, `◀◀` back 5 s, `▶ / ❚❚`, `▶▶` 4×, `▶|` next stop, and a
      scrub bar marked with new spawns (blue dots), resumes (green rings) and deaths (red). Arrow
      keys step stops; Esc closes the card.
- [x] A death stop plays the death from 3 s before, then pauses. A spawn stop snaps to its time
      and opens its card.
- [x] Circles in the world: every new-soldier spawn point (dim when not at its slot; tapping
      snaps to it), and resumable soldiers within 3 s of their O. The card is a role picker +
      DEPLOY, or RESUME.
- [x] R / Space quick redeploy still works.

## Not done / next iterations

- [ ] **Lazy truth.** The background resolve ([D23]) still runs (fast) and feeds the options;
      the replay re-simulates the same truth for show. The owner's goal is that watching *is*
      resolving: only offer what the replay has reached, and drop "History shifted".
      `ReplayPlayer` is deterministic and keeps snapshots, so it can become the resolver.
- [ ] Jumping forward past a long stretch runs synchronously (a hitch on long missions).
      Fast-forward visibly instead.
- [ ] Reverse playback (◀◀ jumps 5 s now).
- [ ] Phone pass: card placement, circle size, pinch zoom.
- [ ] Captures and objectives on the scrub bar; the old screen's lane changes ("Soldier 3 now
      survives") have no in-world equivalent yet.
- [ ] Basic training's respawn station, if this becomes the default.
- [ ] **Fog of war / sightlines (deferred by the owner).** While picking a spawn, should you see
      everything on the map, or only what your soldiers could see? `src/timeline/reveal*.ts`
      (06-b) already has a revealed-map model that could drive it.
