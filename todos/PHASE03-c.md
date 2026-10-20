# PHASE03-c: Persistence & autosave

**Goal:** a mission survives a page reload. That includes the accidental mobile pull-to-refresh
mid-life ([D6], [D20]). Recordings must be encoded compactly enough to hold a big army.

**Depends on:** the 03 contract. **Parallel with:** 03-a, 03-b.
**Owns:** `src/persistence/**` (pure TS), `src/app/storage/**` (browser adapters),
`src/contracts/mission.ts` (create verbatim from `PHASE03-CONTRACT.md` if missing).

## Tasks

### Storage abstraction
- [ ] `persistence/storage.ts`: async `KeyValueStore` interface (`get`, `set`, `remove`, `keys`)
  plus an in-memory implementation for tests.
- [ ] `app/storage/local-storage-store.ts`: localStorage adapter. Catches quota errors and
  reports them as typed failures (never throws into gameplay).
- [ ] Measure: if a realistic large mission (see tests) exceeds ~4 MB in localStorage, add
  `app/storage/indexeddb-store.ts` behind the same interface and prefer it. Keep a tiny
  localStorage index either way. *(Engineering call; still satisfies [D20]'s intent.)*

### Recording codec (`persistence/codec/`)
- [ ] Encode `RecordingSegment` compactly and **losslessly**. 03-a quantizes positions/facings to
  fixed steps, so a segment becomes integers: start position, then per-tick zigzag-varint
  deltas (x, y, facing); actions as a small separate list. Pack into bytes → base64. Optional:
  `CompressionStream('gzip')` if available in both browser and Node (verify; feature-detect).
- [ ] Every stored blob carries a codec version. Decoding an unknown version fails cleanly.
- [ ] Round-trip tests: decode(encode(x)) deep-equals x for random and real segments.

### Mission save layout
- [ ] Keys (namespaced, versioned): `aoo:v1:<missionId>:meta` (attemptCount, completed,
  soldier ids), `…:lanes` (LaneTruth[]), `…:soldier:<id>` (one record each, written only when
  it changes), `…:inprogress` (the current life's partial segment).
- [ ] `saveMission(store, state, dirty)`: incremental. Only write what changed since last save.
- [ ] `saveInProgress(store, life)`: small and frequent.
- [ ] `loadMission(store, missionId) → MissionState | { error }`. Validate shape (hand-rolled
  guards or a light schema lib) and never crash on garbage. Keep the previous good `meta`/`lanes`
  as a `…:backup` and fall back to it if the latest is corrupt.
- [ ] `clearMission(store, missionId)`.
- [ ] Schema migrations scaffold: `migrations[fromVersion] → state`. Empty for now, tested with a
  fake v0.

### Autosave policy (`persistence/autosave.ts`, pure: decides *when*, the app does the writing)
- [ ] Full save at every attempt end (before the respawn screen shows).
- [ ] In-progress save every `tuning.autosaveIntervalTicks` (start ≈ 5s battle time) and on
  `visibilitychange → hidden` / `pagehide` (the app wires these events).
- [ ] Clear `inprogress` when an attempt ends normally.

### Tests
- [ ] A synthetic "big army" mission: 100 soldiers × 2 min average life, plus lanes. Report the
  encoded size in a test log line, and assert it fits the chosen store's budget.
- [ ] Save → load round trip equals the original `MissionState`.
- [ ] Corrupt `lanes` → falls back to backup. Corrupt everything → `{ error }`, no throw.
- [ ] Incremental save writes only dirty soldier keys (spy on the store).

## Acceptance
- Round-trip and corruption tests pass. The big-army size is reported and within budget.
- API ready for PHASE04 to call: `loadMission`, `saveMission`, `saveInProgress`, `clearMission`.
  (Reload *recovery*, i.e. re-simulating the interrupted attempt and offering the lead-in resume,
  is wired in PHASE04.)

## Notes from implementation
_(append here)_
