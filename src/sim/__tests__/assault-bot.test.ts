/** (PHASE16) The pacing benchmark's assault bot ([D135]). */
import { describe, expect, it } from 'vitest';
import { planBot } from '../bots/bot';
import { arena, CLASSIC_TUNING } from './helpers';

describe('assault bot', () => {
  const map = arena({
    capturePoints: [
      {
        id: 'flag',
        nameKey: 'capture.gallery.name',
        position: { x: 800, y: 500 },
        objective: true,
      },
      { id: 'fwd', nameKey: 'capture.gallery.name', position: { x: 400, y: 500 } },
    ],
  });

  it('heads for an objective flag, holds it long enough to take it, and shoots enemies', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const plan = planBot({
        map,
        tuning: CLASSIC_TUNING,
        kind: 'assault',
        seed,
        spawnPointId: map.spawnPoints[0]!.id,
      });
      expect(plan.goals[plan.goals.length - 1]).toEqual({ x: 800, y: 500 });
      expect(plan.dwell[plan.dwell.length - 1]).toBeGreaterThanOrEqual(
        2 * CLASSIC_TUNING.capture.stageSeconds * 60,
      );
      expect(plan.shootEnemies).toBe(true);
    }
  });
});
