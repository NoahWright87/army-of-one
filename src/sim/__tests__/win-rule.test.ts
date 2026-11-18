/** (PHASE17) Take every objective, or kill every enemy soldier ([D139]). */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../content/tuning';
import { damageSoldier } from '../combat/damage';
import { allObjectivesDone } from '../entities/capture-point';
import { createWorld, getSoldier } from '../sim';
import type { MapDef } from '../world/map';
import { arena } from './helpers';

const map = (extra: Partial<MapDef> = {}): MapDef =>
  arena({
    capturePoints: [
      {
        id: 'entry',
        nameKey: 'capture.gallery.name',
        position: { x: 100, y: 100 },
        objective: true,
        initialStage: 'ours',
      },
      {
        id: 'exit',
        nameKey: 'capture.gallery.name',
        position: { x: 900, y: 900 },
        objective: true,
      },
    ],
    squads: [
      {
        id: 'sq',
        members: [{ position: { x: 800, y: 200 } }, { position: { x: 800, y: 300 } }],
        order: { kind: 'guard' },
      },
    ],
    ...extra,
  });

describe('win rule ([D139])', () => {
  it('an entry you hold starts ours; the exit is still needed', () => {
    const w = createWorld(map(), DEFAULT_TUNING);
    expect(w.state.capturePoints.find((c) => c.id === 'entry')!.stage).toBe('ours');
    expect(allObjectivesDone(w)).toBe(false);
    w.state.capturePoints.find((c) => c.id === 'exit')!.stage = 'ours';
    expect(allObjectivesDone(w)).toBe(true);
  });

  it('killing every enemy soldier wins when the map allows it', () => {
    const kill = (winByKillAll: boolean) => {
      const w = createWorld(map({ winByKillAll }), DEFAULT_TUNING);
      for (const id of ['E1', 'E2']) damageSoldier(w, getSoldier(w, id)!, 9999, undefined, 'test');
      return w.state.missionComplete;
    };
    expect(kill(true)).not.toBeNull();
    expect(kill(false)).toBeNull();
  });
});
