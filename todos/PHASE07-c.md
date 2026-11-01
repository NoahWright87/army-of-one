# PHASE07-c: Variety: soldier roles, enemy types, vehicles

**Goal:** more interesting levels and more interesting "temporal contributions". Different lives
do different jobs, and enemies demand different answers.

**Depends on:** PHASE06 + the single-mission PR. **Parallel with:** 07-a/07-b (after the decision
step).

## ⛔ Step 1: decision session with the owner (do this first, don't build yet)
These are player-facing design choices. Present this menu, with recommendations, and record the
picks in `docs/DECISIONS.md`:

**Soldier roles** (chosen per life on the respawn screen, as a loadout picker next to the spawn
choice). Recommendation: start with **2 or 3**:
- *Rifleman* (today's soldier).
- *Sniper*: long range, slow fire, great for clearing turrets from far away.
- *Grenadier*: lobbed area damage over cover, a great mine and turret-nest clearer.
- *Medic*: heals nearby soldiers, including echoes. Note: healing an echo changes history, which
  is a rescue mechanic.
- *Engineer*: builds a sandbag/cover piece, or defuses mines.
- *Shield/heavy*: slow, tanky, draws fire. A "meat shield" made explicit.

Open questions:
- Are roles unlimited, or limited per mission?
- Does a resumed soldier keep their role? (Obviously yes.)

**Enemy types.** Recommendation: add **2** first:
- *MG nest*: fast fire, low damage, wide arc. Punishes crowds.
- *Mortar/artillery*: a telegraphed area strike on a timer. Readable patterns, perfect for "my
  echo stood there, so I'll stand elsewhere".
- *Sniper tower*: long range, slow, one-shot, with a laser telegraph.
- *Rotating searchlight + alarm*: wakes other defenses.
- *Enemy infantry patrols*: move on fixed routes, fight back. This is the big one. They're fully
  simulated (deterministic, like turrets) and react to history. Needs rulings: do they retake
  capture points? Do they chase?
- *Armored vehicle*: a moving turret on a fixed patrol route.

**Vehicles for your soldiers:**
- Can a soldier enter a vehicle (jeep, APC, tank)? One soldier per life still holds: the soldier
  drives, and the vehicle's actions are part of that soldier's recording, so it replays as an echo
  like everything else.
- Open questions: passengers (other soldiers, i.e. echoes, riding along)? Vehicles destroyed with
  the soldier inside? Recommendation: defer player vehicles until roles and enemies land, since
  they're the biggest change to the recording model (vehicle state as part of the recording).

## Step 2: build the picked slice
- Each new role or enemy: sim (pure, deterministic, tuning in `tuning.ts`), view, renderer,
  placeholder assets via the manifest, strings, gallery entries, scenario tests including
  echo-replay determinism, and a placement on Breach (or a Breach variant) where it matters.
- Roles: the loadout picker on the respawn screen, quick redeploy reuses the last role, and the
  role is stored in `SoldierRecord` (contract change, additive, persisted).
- Enemies: add at least one new layer to Breach that showcases them, keeping [D27]/[D28]/[D31].

## Notes from implementation
_(append here)_
