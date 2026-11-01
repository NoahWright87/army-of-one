import { describe, expect, it } from 'vitest';
import {
  bindDisplaySettings,
  displaySettingDefs,
  readDisplaySettings,
  SETTING_IDS,
} from './display-settings';
import { MemoryStorage, SettingsStore } from './registry';

describe('display settings', () => {
  const make = () => {
    const s = new SettingsStore(new MemoryStorage(), 'k');
    s.register(displaySettingDefs());
    return s;
  };

  it('defines every typed field exactly once', () => {
    const ids = displaySettingDefs().map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(Object.values(SETTING_IDS)));
  });

  it('reads defaults as a typed object', () => {
    const d = readDisplaySettings(make());
    expect(d.echoLabels).toBe(true);
    expect(d.hpBars).toBe('damaged');
    expect(d.timeScale).toBe('1');
  });

  it('bound view follows changes', () => {
    const s = make();
    const live = bindDisplaySettings(s);
    s.set(SETTING_IDS.echoOpacity, 0.3);
    s.set(SETTING_IDS.muted, true);
    expect(live.echoOpacity).toBe(0.3);
    expect(live.muted).toBe(true);
  });
});
