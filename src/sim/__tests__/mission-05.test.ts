/** (PHASE12-b) Mission 05 "Armored Push" ([D69]): the long vehicle mission. */
import { describe, expect, it } from 'vitest';
import { missionOrDefault } from '../../content/maps';
import { M5, M5_H, MISSION_05 } from '../../content/maps/mission-05';
import { MISSION_03 } from '../../content/maps/mission-03';
import { DEFAULT_TUNING } from '../../content/tuning';
import { hashState } from '../core/hash';
import { createWorld, spawnSoldier, step } from '../sim';
import { findPath } from '../world/nav';

const T = DEFAULT_TUNING;

describe('mission-05 Armored Push', () => {
  it('is playable, validates, and is much longer than Breach', () => {
    expect(missionOrDefault('mission-05').id).toBe('mission-05');
    expect(() => createWorld(MISSION_05, T)).not.toThrow();
    expect(M5_H).toBeGreaterThan(MISSION_03.height * 2);
    expect(MISSION_05.capturePoints!.length).toBeGreaterThanOrEqual(4);
  });

  it('has every kind of enemy, trucks and tanks too', () => {
    const roles = new Set(
      (MISSION_05.squads ?? []).flatMap((q) => q.members.map((m) => m.role ?? 'rifleman')),
    );
    for (const r of [
      'rifleman',
      'grenadier',
      'gunner',
      'sniper',
      'shield',
      'shotgun',
      'bazooka',
      'truck',
      'tank',
    ]) {
      expect(roles.has(r as never), r).toBe(true);
    }
  });

  it('contact within seconds of spawning ([D28])', () => {
    const d = M5.spawnY - M5.outerLineY - T.turret.range;
    expect(d / T.soldier.speed).toBeLessThan(3);
  });

  it('with the gates open, every spawn can reach the HQ', () => {
    const w = createWorld(MISSION_05, T);
    for (const g of w.state.gates) g.open = true;
    const goal = { x: MISSION_05.width / 2, y: M5.hqY + 120 };
    for (const sp of MISSION_05.spawnPoints) {
      expect(findPath(w, sp.position, goal), sp.id).not.toBeNull();
    }
  });

  it('ten seconds with every enemy awake (and fighting one of ours) run the same twice', () => {
    const play = () => {
      const w = createWorld(MISSION_05, {
        ...T,
        ai: { ...T.ai, wakeRadius: 1e6, sleepRadius: 1e6 },
      });
      spawnSoldier(w, 'centre', { position: { x: MISSION_05.width / 2, y: M5.crossroadsY + 400 } });
      for (let i = 0; i < 600; i++) step(w, new Map());
      return hashState(w.state);
    };
    expect(play()).toBe(play());
  });
});
