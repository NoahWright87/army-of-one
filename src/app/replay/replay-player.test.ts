import { describe, expect, it } from 'vitest';
import { MISSION_03, M3 } from '../../content/maps/mission-03';
import { DEFAULT_TUNING } from '../../content/tuning';
import { hashState } from '../../sim/core/hash';
import { playLife } from '../../sim/scenarios/lives';
import { getSoldier } from '../../sim/sim';
import { REPLAY_VERSION, ReplayPlayer } from './replay-player';

const T = DEFAULT_TUNING;

/** Two lives on Breach: S1 walks into the turret line and dies; S2 stays back. */
function twoLives() {
  const first = playLife({
    map: MISSION_03,
    tuning: T,
    records: [],
    attempt: 1,
    live: { mode: 'new', soldierId: 'S1', spawnPointId: 'centre', entryTick: 0 },
    steps: [
      { kind: 'moveTo', to: { x: 800, y: M3.turretLineY + 60 } },
      { kind: 'wait', ticks: 600 },
    ],
    maxTick: 900,
  });
  const second = playLife({
    map: MISSION_03,
    tuning: T,
    records: first.records,
    attempt: 2,
    live: { mode: 'new', soldierId: 'S2', spawnPointId: 'west', entryTick: 0 },
    steps: [{ kind: 'wait', ticks: 300 }],
    maxTick: 900,
  });
  return second;
}

describe('after-action replay ([D42])', () => {
  it('reproduces the final history: every soldier lives or dies as it did', () => {
    const last = twoLives();
    const endTick = last.attempt.tick;
    const p = new ReplayPlayer(MISSION_03, T, {
      version: REPLAY_VERSION,
      missionId: MISSION_03.id,
      soldiers: last.records,
      endTick,
    });
    while (p.step());
    expect(p.tick).toBe(endTick);
    for (const r of last.records) {
      const a = getSoldier(last.attempt.world, r.id);
      const b = getSoldier(p.world, r.id);
      expect(b?.alive, r.id).toBe(a?.alive);
      expect(b?.deathTick, r.id).toBe(a?.deathTick);
    }
  });

  it('seeking back and forth lands on the same state as playing straight through', () => {
    const last = twoLives();
    const input = {
      version: REPLAY_VERSION,
      missionId: MISSION_03.id,
      soldiers: last.records,
      endTick: last.attempt.tick,
    } as const;
    const straight = new ReplayPlayer(MISSION_03, T, input);
    while (straight.tick < 250 && straight.step());
    const h250 = hashState(straight.world.state);
    const p = new ReplayPlayer(MISSION_03, T, input);
    p.seek(290);
    p.seek(130);
    p.seek(250);
    expect(p.tick).toBe(250);
    expect(hashState(p.world.state)).toBe(h250);
    p.seek(1e9);
    expect(p.tick).toBe(input.endTick);
    expect(p.step()).toBe(false);
  });
});
