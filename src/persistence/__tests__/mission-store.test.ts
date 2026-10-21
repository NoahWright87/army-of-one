import { describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../storage';
import { clearMission, loadMission, missionKeys, MissionSaver } from '../mission-store';
import { migrate } from '../migrations';
import { createAutosavePolicy, markSaved, resetForLife, shouldSaveInProgress } from '../autosave';
import { syntheticMission, syntheticSegment, syntheticSoldier, laneFor } from './fixtures';

const keys = missionKeys('mission-01');

describe('mission save/load', () => {
  it('round-trips a mission exactly', async () => {
    const store = new MemoryStore();
    const state = syntheticMission(12, 900);
    state.completed = { attempt: 12, tick: 5000, bySoldierId: 'S3' };
    expect((await new MissionSaver(store, 'mission-01').save(state)).ok).toBe(true);
    const loaded = await loadMission(store, 'mission-01');
    expect(loaded).toEqual({ ok: true, state });
  });

  it('round-trips the in-progress life and clears it at attempt end', async () => {
    const store = new MemoryStore();
    const saver = new MissionSaver(store, 'mission-01');
    const state = syntheticMission(2, 300);
    const life = {
      soldierId: 'S3',
      mode: 'new' as const,
      attempt: 3,
      attemptFromTick: 0,
      segmentSoFar: { ...syntheticSegment(77, 0, 240), endReason: 'suspended' as const },
    };
    await saver.save(state);
    await saver.saveInProgress(life);
    let loaded = await loadMission(store, 'mission-01');
    expect(loaded.ok && loaded.state.inProgress).toEqual(life);

    await saver.save(state); // attempt ended normally: no inProgress
    loaded = await loadMission(store, 'mission-01');
    expect(loaded.ok && loaded.state.inProgress).toBeUndefined();
  });

  it('a fresh saver (after reload) still clears a stale in-progress life', async () => {
    const store = new MemoryStore();
    const state = syntheticMission(1, 100);
    const first = new MissionSaver(store, 'mission-01');
    await first.save(state);
    await first.saveInProgress({
      soldierId: 'S2',
      mode: 'new',
      attempt: 2,
      attemptFromTick: 0,
      segmentSoFar: syntheticSegment(5, 0, 30),
    });
    await new MissionSaver(store, 'mission-01').save(state);
    expect(store.data.has(keys.inProgress)).toBe(false);
  });

  it('writes incrementally: only changed soldiers are rewritten', async () => {
    const store = new MemoryStore();
    const saver = new MissionSaver(store, 'mission-01');
    const state = syntheticMission(10, 300);
    await saver.save(state);
    const spy = vi.spyOn(store, 'set');
    const s11 = syntheticSoldier(11, 300);
    state.soldiers.push(s11);
    state.lanes.push(laneFor(s11));
    state.attemptCount += 1;
    await saver.save(state);
    const written = spy.mock.calls.map(([k]) => k);
    expect(written.filter((k) => k.includes(':soldier:'))).toEqual([keys.soldier('S11')]);
    expect(written).toContain(keys.lanes);
    expect(written).toContain(keys.meta);
  });

  it('falls back to the backup when the latest lanes are corrupt', async () => {
    const store = new MemoryStore();
    const saver = new MissionSaver(store, 'mission-01');
    const state = syntheticMission(3, 200);
    await saver.save(state);
    const before = structuredClone(state.lanes);
    state.lanes[0]!.end = { kind: 'open', tick: 199 };
    await saver.save(state);
    store.data.set(keys.lanes, '{"broken":');
    const loaded = await loadMission(store, 'mission-01');
    expect(loaded.ok && loaded.state.lanes).toEqual(before);
  });

  it('returns an error (never throws) for garbage or missing saves', async () => {
    const store = new MemoryStore();
    expect(await loadMission(store, 'mission-01')).toMatchObject({ ok: false, error: 'notFound' });
    for (const k of [keys.meta, keys.metaBackup, keys.lanes, keys.lanesBackup])
      store.data.set(k, '💥');
    expect(await loadMission(store, 'mission-01')).toMatchObject({ ok: false, error: 'corrupt' });

    const ok = new MemoryStore();
    await new MissionSaver(ok, 'mission-01').save(syntheticMission(2, 50));
    ok.data.set(
      keys.soldier('S2'),
      JSON.stringify({ id: 'S2', ordinal: 2, spawnPointId: 'x', spawnTick: 0, segments: ['{}'] }),
    );
    expect(await loadMission(ok, 'mission-01')).toMatchObject({ ok: false, error: 'corrupt' });
  });

  it('a corrupt in-progress life is dropped without blocking the load', async () => {
    const store = new MemoryStore();
    await new MissionSaver(store, 'mission-01').save(syntheticMission(2, 50));
    store.data.set(keys.inProgress, '{"soldierId":"S3"}');
    const loaded = await loadMission(store, 'mission-01');
    expect(loaded.ok && loaded.state.inProgress).toBeUndefined();
  });

  it('clears every key of a mission, and only that mission', async () => {
    const store = new MemoryStore();
    await new MissionSaver(store, 'mission-01').save(syntheticMission(3, 50));
    await new MissionSaver(store, 'mission-02').save({
      ...syntheticMission(1, 50),
      missionId: 'mission-02',
    });
    await clearMission(store, 'mission-01');
    expect(await store.keys(keys.prefix)).toEqual([]);
    expect((await store.keys('aoo:v1:mission-02:')).length).toBeGreaterThan(0);
  });

  it('stays within budget for a big army (100 soldiers × 2 min)', async () => {
    const store = new MemoryStore();
    await new MissionSaver(store, 'mission-01').save(syntheticMission(100, 7200));
    const total = [...store.data.values()].reduce((n, v) => n + v.length, 0);
    console.log(`big-army save size: ${(total / 1e6).toFixed(2)} MB (100 soldiers × 2 min)`);
    // IndexedDB (preferred) has a far larger quota; this guards against codec regressions.
    expect(total).toBeLessThan(25e6);
  });
});

describe('migrations', () => {
  it('upgrades through each step and fails on gaps', () => {
    const table = { 0: (r: Record<string, unknown>) => ({ ...r, attemptCount: r.attempts }) };
    expect(migrate({ attempts: 4 }, table, 1)).toEqual({
      attempts: 4,
      attemptCount: 4,
      schemaVersion: 1,
    });
    expect(() => migrate({ schemaVersion: 0 }, {}, 1)).toThrow(/No migration/);
    expect(migrate({ schemaVersion: 1, x: 1 })).toEqual({ schemaVersion: 1, x: 1 });
  });
});

describe('autosave policy', () => {
  it('saves every interval and immediately when hidden', () => {
    const p = createAutosavePolicy(300);
    resetForLife(p, 100);
    expect(shouldSaveInProgress(p, 200, 'tick')).toBe(false);
    expect(shouldSaveInProgress(p, 400, 'tick')).toBe(true);
    markSaved(p, 400);
    expect(shouldSaveInProgress(p, 450, 'tick')).toBe(false);
    expect(shouldSaveInProgress(p, 450, 'hidden')).toBe(true);
  });
});
