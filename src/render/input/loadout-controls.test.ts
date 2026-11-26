import { describe, expect, it } from 'vitest';
import { LoadoutControls, type LoadoutStore } from './loadout-controls';

const memory = (
  init: Record<string, string> = {},
): LoadoutStore & { data: Record<string, string> } => {
  const data = { ...init };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
};

describe('loadout controls (PHASE20)', () => {
  it('is manual by default, and a press reads true for exactly one tick', () => {
    const c = new LoadoutControls(memory());
    expect(c.read()).toEqual({ stance: false, swap: false, autoStance: false, autoWeapon: false });
    c.pressStance();
    expect(c.read().stance).toBe(true);
    expect(c.read().stance).toBe(false);
    c.pressSwap();
    c.pressSwap();
    expect(c.read().swap).toBe(true);
    expect(c.read().swap).toBe(false);
  });

  it('auto toggles per button and is remembered', () => {
    const store = memory();
    const c = new LoadoutControls(store);
    c.toggleAuto('stance');
    expect(c.read()).toMatchObject({ autoStance: true, autoWeapon: false });
    const again = new LoadoutControls(store);
    expect(again.autoStance).toBe(true);
    again.toggleAuto('stance');
    expect(new LoadoutControls(store).autoStance).toBe(false);
  });

  it('works without storage, or with storage that throws', () => {
    const broken: LoadoutStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const c = new LoadoutControls(broken);
    c.toggleAuto('weapon');
    expect(c.autoWeapon).toBe(true);
    expect(new LoadoutControls().autoWeapon).toBe(false);
  });
});
