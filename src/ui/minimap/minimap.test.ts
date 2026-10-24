import { describe, expect, it } from 'vitest';
import type { SoldierView } from '../../sim/view';
import { SettingsStore } from '../settings/registry';
import { dotKind, MINIMAP_PX, minimapBox } from './minimap-model';
import {
  DEFAULT_MINIMAP_SETTINGS,
  isMinimapSetting,
  minimapSettingDefs,
  readMinimapSettings,
} from './minimap-settings';

const soldier = (o: Partial<SoldierView>): SoldierView => ({
  kind: 'soldier',
  id: 'S1',
  ordinal: 1,
  x: 0,
  y: 0,
  facing: 0,
  hp: 100,
  maxHp: 100,
  alive: true,
  role: 'echo',
  leadIn: false,
  ...o,
});

describe('minimap model', () => {
  it('fits a wide map into the preset size', () => {
    const b = minimapBox({ width: 6400, height: 4400 }, 'M', 1000, 1000);
    expect(b.w).toBe(MINIMAP_PX.M);
    expect(b.h).toBe(Math.round(4400 * (MINIMAP_PX.M / 6400)));
  });

  it('lets a tall strip be taller than the preset, within the viewport limits', () => {
    const tall = minimapBox({ width: 1400, height: 6000 }, 'M', 1000, 1000);
    expect(tall.h).toBe(Math.round(MINIMAP_PX.M * 1.5));
    const capped = minimapBox({ width: 1400, height: 6000 }, 'L', 1000, 200);
    expect(capped.h).toBeLessThanOrEqual(200);
  });

  it('classifies soldiers: live, echo, static, interrupted; dead are not drawn', () => {
    expect(dotKind(soldier({ id: 'S3' }), 'S3')).toBe('live');
    expect(dotKind(soldier({}), 'S3')).toBe('echo');
    expect(dotKind(soldier({ role: 'static' }), 'S3')).toBe('static');
    expect(dotKind(soldier({ role: 'interrupted' }), 'S3')).toBe('interrupted');
    expect(dotKind(soldier({ alive: false }), 'S3')).toBeNull();
  });

  it('settings: registered with defaults, read back, recognised by id', () => {
    const store = new SettingsStore(null, 'k');
    store.register(minimapSettingDefs());
    expect(readMinimapSettings(store)).toEqual(DEFAULT_MINIMAP_SETTINGS);
    store.set('display.minimapSize', 'L');
    expect(readMinimapSettings(store).size).toBe('L');
    expect(isMinimapSetting('display.minimapOpacity')).toBe(true);
    expect(isMinimapSetting('display.echoLabels')).toBe(false);
  });
});
