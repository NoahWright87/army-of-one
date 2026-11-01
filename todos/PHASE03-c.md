# PHASE03-c: Persistence & autosave

**Goal:** a mission survives a page reload. That includes the accidental mobile pull-to-refresh
mid-life ([D6], [D20]). Recordings must be encoded compactly enough to hold a big army.

**Depends on:** the 03 contract. **Parallel with:** 03-a, 03-b.
**Owns:** `src/persistence/**` (pure TS), `src/app/storage/**` (browser adapters),
`src/contracts/mission.ts` (create verbatim from `PHASE03-CONTRACT.md` if missing).

## Tasks

### Storage abstraction
- [x] `persistence/storage.ts`: async `KeyValueStore` interface (`get`, `set`, `remove`, `keys`)
  plus an in-memory implementation for tests.
- [x] `app/storage/local-storage-store.ts`: localStorage adapter. Catches quota errors and
  reports them as typed failures (never throws into gameplay).
- [x] Measure: if a realistic large mission (see tests) exceeds ~4 MB in localStorage, add
  `app/storage/indexeddb-store.ts` behind the same interface and prefer it. Keep a tiny
  localStorage index either way. *(Engineering call; still satisfies [D20]'s intent.)*

### Recording codec (`persistence/codec/`)
- [x] Encode `RecordingSegment` compactly and **losslessly**. 03-a quantizes positions/facings to
  fixed steps, so a segment becomes integers: start position, then per-tick zigzag-varint
  deltas (x, y, facing); actions as a small separate list. Pack into bytes → base64. Optional:
  `CompressionStream('gzip')` if available in both browser and Node (verify; feature-detect).
- [x] Every stored blob carries a codec version. Decoding an unknown version fails cleanly.
- [x] Round-trip tests: decode(encode(x)) deep-equals x for random and real segments.

### Mission save layout
- [x] Keys (namespaced, versioned): `aoo:v1:<missionId>:meta` (attemptCount, completed,
  soldier ids), `…:lanes` (LaneTruth[]), `…:soldier:<id>` (one record each, written only when
  it changes), `…:inprogress` (the current life's partial segment).
- [x] `saveMission(store, state, dirty)`: incremental. Only write what changed since last save.
- [x] `saveInProgress(store, life)`: small and frequent.
- [x] `loadMission(store, missionId) → MissionState | { error }`. Validate shape (hand-rolled
  guards or a light schema lib) and never crash on garbage. Keep the previous good `meta`/`lanes`
  as a `…:backup` and fall back to it if the latest is corrupt.
- [x] `clearMission(store, missionId)`.
- [x] Schema migrations scaffold: `migrations[fromVersion] → state`. Empty for now, tested with a
  fake v0.

### Autosave policy (`persistence/autosave.ts`, pure: decides *when*, the app does the writing)
- [x] Full save at every attempt end (before the respawn screen shows).
- [x] In-progress save every `tuning.autosaveIntervalTicks` (start ≈ 5s battle time) and on
  `visibilitychange → hidden` / `pagehide` (the app wires these events).
- [x] Clear `inprogress` when an attempt ends normally.

### Tests
- [x] A synthetic "big army" mission: 100 soldiers × 2 min average life, plus lanes. Report the
  encoded size in a test log line, and assert it fits the chosen store's budget.
- [x] Save → load round trip equals the original `MissionState`.
- [x] Corrupt `lanes` → falls back to backup. Corrupt everything → `{ error }`, no throw.
- [x] Incremental save writes only dirty soldier keys (spy on the store).

## Acceptance
- Round-trip and corruption tests pass. The big-army size is reported and within budget.
- API ready for PHASE04 to call: `loadMission`, `saveMission`, `saveInProgress`, `clearMission`.
  (Reload *recovery*, i.e. re-simulating the interrupted attempt and offering the lead-in resume,
  is wired in PHASE04.)

## Notes from implementation
- **Store choice:** the synthetic big army (100 soldiers × 2 min) encodes to **≈4.95 MB**. That's
  over a safe localStorage budget, so `openBestStore()` (`src/app/storage/indexeddb-store.ts`)
  prefers **IndexedDB**, then falls back to localStorage, then to memory. I skipped the "tiny
  localStorage index": IndexedDB alone is simpler, and nothing needs synchronous access.
- **Codec:** mode `q` stores second-order deltas (change in velocity) of quantized x/y/facing
  as zigzag varints. Δt is implicit when there's one waypoint per tick (the normal case). That's
  ≈6 base64 chars (≈4.7 bytes) per recorded tick on the synthetic data. Mode `f` is an exact float
  fallback for anything not quantized, so the codec is lossless no matter what. **gzip
  (`CompressionStream`) is not used yet.** Revisit with real recordings in PHASE05-b.
- **Quantization lives in `src/contracts/quantize.ts`** (`POSITION_QUANTUM = 1/256`,
  `FACING_QUANTUM = 1/4096`, both powers of two so `n × q` is exact). PHASE03-a must snap soldier
  state with `quantizePosition` / `quantizeFacing`. They also normalize `-0` to `0`, which the
  codec would otherwise not round-trip bit-exactly.
- **API:** `new MissionSaver(store, missionId)` with `.save(state)` (incremental: per-key write
  cache, soldier encodings cached by segment count/end tick), `.saveInProgress(life)`, and
  `.clearInProgress()`. Also `loadMission(store, id) → { ok, state } | { ok: false, error:
  'notFound' | 'corrupt' }` and `clearMission(store, id)`. Meta and lanes keep `:backup` copies.
  A corrupt in-progress life is dropped silently, never blocking the load.
- **Autosave interval:** `createAutosavePolicy(intervalTicks)` takes the interval as an
  argument. PHASE04 should add `autosaveIntervalTicks` (≈ 5 s) to `src/content/tuning.ts`, which
  was owned by PHASE02-a while this ran.
- Browser adapter tests live in `src/app/storage/` (they use `fake-indexeddb`), because the
  purity lint forbids pure modules from importing app code.
