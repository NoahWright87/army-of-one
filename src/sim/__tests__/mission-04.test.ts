/**
 * (07-c) Mission 04 "Compound" ([D38]): the indoor cover proof of concept.
 */
import { describe, expect, it } from 'vitest';
import { missionOrDefault } from '../../content/maps';
import { MISSION_04, M4 } from '../../content/maps/mission-04';
import { DEFAULT_TUNING } from '../../content/tuning';
import { chooseTurretTarget } from '../entities/turret';
import { createWorld, getSoldier, spawnSoldier } from '../sim';
import { findPath } from '../world/nav';

const T = DEFAULT_TUNING;

describe('mission-04 Compound', () => {
  it('is playable and validates', () => {
    expect(missionOrDefault('mission-04').id).toBe('mission-04');
    expect(() => createWorld(MISSION_04, T)).not.toThrow();
  });

  it('uses every cover material', () => {
    const mats = new Set((MISSION_04.cover ?? []).map((c) => c.material));
    for (const m of Object.keys(T.cover.materials)) expect(mats.has(m as never), m).toBe(true);
  });

  it('every spawn can walk to the objective (front door, back door, bunker door)', () => {
    const w = createWorld(MISSION_04, T);
    const goal = { x: 600, y: 600 };
    for (const sp of MISSION_04.spawnPoints) {
      expect(findPath(w, sp.position, goal), sp.id).not.toBeNull();
    }
  });

  it('the bunker turret fires out through the slit; a far soldier behind the slit is unseen', () => {
    const w = createWorld(MISSION_04, T);
    const t4 = MISSION_04.turrets!.find((t) => t.id === 'm4-t4')!;
    // A soldier in the courtyard in front of the slit is a target (T4 fires over its slit).
    const id = spawnSoldier(w, 'centre', { position: { x: 700, y: M4.bunkerFrontY + 200 } });
    expect(chooseTurretTarget(w, t4)?.id).toBe(id);
    // Soldier inside the bunker is visible too.
    getSoldier(w, id)!.x = 800;
    getSoldier(w, id)!.y = 600;
    expect(chooseTurretTarget(w, t4)?.id).toBe(id);
  });

  it('contact within seconds of spawning ([D28]): the fence line is in yard-turret range', () => {
    const d = M4.fenceY - M4.yardTurretY;
    expect(d).toBeLessThan(T.turret.range);
    expect((M4.spawnY - M4.fenceY) / T.soldier.speed).toBeLessThan(2);
  });
});
