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

**Decision session (2026-11):** the owner picked cover first ([D32]–[D35]), roles with spawn
costs and no Medic ([D36]), the Grenadier with frag grenades ([D37]) and an indoor mission
([D38]). MG nests/MG role, mortars, enemy infantry and vehicles wait until cover has been played.

Built (first slice):
- [x] **Cover** (`src/sim/world/cover.ts`, `map.cover`): two numbers per piece (bullet, lobbed),
  materials in `tuning.cover.materials`. Bullet rolls in `castRay` (only when a `coverKey` is
  given, so plain LOS rays see through partial cover). Fire over cover from close up. Turret
  sight cut past cover (`seesThroughCover`, in `canEngage`). Cover is a movement solid and a
  nav blocker.
- [x] **Moving spread** for live shots (`movingAimOffset`, `soldier.moveFrac`).
- [x] **Roles** (`src/content/roles.ts`, `RoleId` in contracts): `SoldierRecord.roleId` and
  `InProgressLife.roleId` (additive, persisted; absent = rifleman), `LiveSpec.roleId`, echo
  schedules carry it. Respawn-screen picker (buttons + keys 1/2); `Game.roleId` is reused by quick
  redeploy. A resume shows the soldier's own role, disabled.
- [x] **Grenadier** (`src/sim/combat/weapons.ts`, `src/sim/entities/grenade.ts`): hold/release
  wind-up, `SoldierInput.aimDistance` (optional; touch/auto-aim inputs that don't set it get a
  mid-range throw), `throw` recorded action + `grenadeThrown` event, echoes replay throws.
  2.5D flight (height, gravity, ground bounce, rolling friction, wall/cover bounce with a hashed
  lobbed roll per contact), fuse, blast + fragment ring (`team: 'neutral'` rays that hit
  everyone and roll against cover). Friendly fire.
- [x] **View/renderer**: `WorldView.grenades`, `coverArcs` (live soldier only),
  `SoldierView.roleId/windup/windupAim`. Cover drawn per material, arcs, wind-up ring at the
  landing point, grenades with shadow + height, frag tracers (always drawn), a role badge.
  Gallery has all of it. Minimap and respawn maps draw cover.
- [x] **Breach**: sandbags are 50 % cover.
- [x] **mission-04 "Compound"**: the indoor POC, a second playable mission (title picker shows).
- [x] Tests: `cover.test.ts`, `grenade.test.ts` (incl. echo replay of a throw and a grenade
  killing an echo), `mission-04.test.ts`.

Second slice (owner follow-up):
- [x] **Spread + recoil for every gun** ([D39], `src/sim/combat/guns.ts`): `GunSpread` on
  `tuning.rifle`, `tuning.mg`, `tuning.turret` (replaces the old `tuning.accuracy`). Soldier
  `recoil` state; turret `recoil` (optional field). Live fire rolls within the cone with a hash;
  echoes fire the recorded angle with their own gun (`fireGun`). At the default timings turret
  recoil recovers fully between shots, so turrets are still exact unless tuned.
- [x] **Reticle = cone** ([D39]): `SoldierView.aimSpread` (live soldier only); the renderer draws a
  circle at the cursor sized `distance × tan(spread)`.
- [x] **Machine Gunner** ([D40]): role `gunner`, `tuning.mg`, mount (`mountTicks`, `braceId` on the
  soldier; `SoldierView.mount/mounted`), ring around the reticle while mounting, cyan reticle when
  the bonus applies (mounted + aiming across the braced cover, `mg.braceReach`).
- [x] Removed the wind-up "landing now" dot; [D33] settled with the owner's example.
- [x] Tests: `guns.test.ts` (tap vs hold, recovery, moving, MG vs rifle, determinism, mount
  progress/bonus/unmount, MG echo replay).

Not done / next:
- Cover and grenade looks are Graphics placeholders in `world-renderer.ts` (`COVER_STYLE`), not
  manifest assets yet; the role badge too. They should move to `assets.ts` entries when art is made.
- No autoplay lives or headless scenario scripts for the Grenadier/Compound yet (the script
  driver has a `throw` step for them).
- Open questions [Q18], [Q20], [Q21] in DECISIONS.md ([Q19] became part of [D33]).
- Then: MG nest and mortar enemies; ammo and reloading for every gun (owner: later).
