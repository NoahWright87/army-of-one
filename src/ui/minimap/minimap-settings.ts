/**
 * (06-b) In-game minimap settings ([D29]; "when unsure, make it a setting"). Registered in the
 * shared SettingsStore (F2 panel, Display group).
 */
import { str } from '../../content/strings';
import type { SettingDef, SettingsStore } from '../settings/registry';

export type MinimapSize = 'S' | 'M' | 'L';

export interface MinimapSettings {
  enabled: boolean;
  size: MinimapSize;
  opacity: number;
}

export const DEFAULT_MINIMAP_SETTINGS: MinimapSettings = {
  enabled: true,
  size: 'M',
  opacity: 0.85,
};

export const MINIMAP_SETTING_IDS: { [K in keyof MinimapSettings]: string } = {
  enabled: 'display.minimap',
  size: 'display.minimapSize',
  opacity: 'display.minimapOpacity',
};

export function minimapSettingDefs(): SettingDef[] {
  const G = 'settings.group.display';
  const id = MINIMAP_SETTING_IDS;
  const d = DEFAULT_MINIMAP_SETTINGS;
  return [
    {
      id: id.enabled,
      group: G,
      label: str('settings.minimap'),
      type: 'boolean',
      default: d.enabled,
    },
    {
      id: id.size,
      group: G,
      label: str('settings.minimapSize'),
      type: 'choice',
      default: d.size,
      options: [
        { value: 'S', label: str('settings.minimapSize.S') },
        { value: 'M', label: str('settings.minimapSize.M') },
        { value: 'L', label: str('settings.minimapSize.L') },
      ],
    },
    {
      id: id.opacity,
      group: G,
      label: str('settings.minimapOpacity'),
      type: 'number',
      default: d.opacity,
      min: 0.3,
      max: 1,
      step: 0.05,
    },
  ];
}

export function readMinimapSettings(store: SettingsStore): MinimapSettings {
  const id = MINIMAP_SETTING_IDS;
  const size = store.getString(id.size);
  return {
    enabled: store.getBool(id.enabled),
    size: size === 'S' || size === 'L' ? size : 'M',
    opacity: store.getNumber(id.opacity),
  };
}

export function isMinimapSetting(id: string): boolean {
  return id.startsWith('display.minimap');
}
