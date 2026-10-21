import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../content/tuning';
import { getView } from '../sim/sim';
import { hotkeyAction } from './hotkeys';
import { BATTLE_MAP, createDefaultSession } from './battle-setup';

describe('hotkeys', () => {
  it('maps keys to actions', () => {
    expect(hotkeyAction('`', 'Backquote')).toBe('toggleDebug');
    expect(hotkeyAction('F2', 'F2')).toBe('toggleSettings');
    expect(hotkeyAction('w', 'KeyW')).toBeNull();
  });
});

describe('default battle session', () => {
  it('spawns one live soldier at the first spawn point', () => {
    const s = createDefaultSession(DEFAULT_TUNING, () => {
      throw new Error('not needed');
    });
    const v = getView(s.world);
    expect(s.world.map).toBe(BATTLE_MAP);
    expect(v.soldiers).toHaveLength(1);
    expect(v.soldiers[0]).toMatchObject({ id: s.liveId, role: 'live' });
    expect(v.soldiers[0]!.x).toBe(BATTLE_MAP.spawnPoints[0]!.position.x);
  });
});
