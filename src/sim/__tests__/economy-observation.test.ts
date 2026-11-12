import { describe, expect, it } from 'vitest';
import { MISSION_03 } from '../../content/maps/mission-03';
import { DEFAULT_TUNING } from '../../content/tuning';
import { ObservationBuilder } from '../attempt/observation';
import { createWorld } from '../sim';

/** (PHASE11) Observations carry every enemy loss ([D53]) and every lost point ([Q25]). */
describe('loss observations', () => {
  it('records enemy deaths whatever caused them, structures, mines and lost points', () => {
    const world = createWorld(MISSION_03, DEFAULT_TUNING);
    const enemy = world.state.soldiers.find((s) => s.team === 'enemy')!;
    const turret = MISSION_03.turrets![0]!.id;
    const mine = MISSION_03.mines![0]!.id;
    const b = new ObservationBuilder({ kind: 'attempt', attempt: 1, fromTick: 0 }, world);
    b.ingest(world, [
      // Killed by its own side's mine: still a loss.
      { kind: 'soldierDied', tick: 10, id: enemy.id, cause: 'mine', by: mine },
      { kind: 'hazardDestroyed', tick: 11, id: turret, by: 'S1' },
      { kind: 'mineDetonated', tick: 12, id: mine, x: 0, y: 0, radius: 10, by: mine },
      // Bridges are terrain: no loss.
      { kind: 'hazardDestroyed', tick: 13, id: 'm3-drawbridge', by: 'S1' },
      {
        kind: 'captureStageChanged',
        tick: 14,
        id: 'cp-forward',
        stage: 'neutral',
        contributors: [],
        lost: true,
      },
    ]);
    const so = b.worldSoFar(20);
    expect(so.enemyLosses).toEqual([
      { refId: enemy.id, kind: 'soldier', roleId: enemy.roleId ?? 'rifleman', tick: 10 },
      { refId: turret, kind: 'turret', tick: 11 },
      { refId: mine, kind: 'mine', tick: 12 },
    ]);
    expect(so.pointLosses).toEqual([{ pointId: 'cp-forward', tick: 14 }]);
    expect(so.captures).toEqual([]); // a loss is not a capture
  });
});
