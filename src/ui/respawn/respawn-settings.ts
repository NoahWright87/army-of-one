/**
 * Respawn-screen options ("when unsure, make it a setting"). Registered in the shared
 * SettingsStore, so they show up in the F2 panel and persist with everything else.
 */
import { str } from '../../content/strings';
import type { SettingDef, SettingsStore } from '../settings/registry';

export interface RespawnViewSettings {
  /** Show kill/lever/damage dots along lanes. */
  eventMarkers: boolean;
  /** Height of one soldier row, px. */
  rowHeight: number;
  /** Fit the whole timeline when the screen opens (else keep the last zoom/pan). */
  autoFit: boolean;
  /** Plain mouse wheel zooms (Shift scrolls rows), or scrolls rows (Ctrl zooms). */
  wheel: 'zoom' | 'scroll';
  /** Pulses, flashes and fades when history changes. */
  animations: boolean;
  /** Show the X/O/!/dashed legend under the timeline. */
  legend: boolean;
}

export const DEFAULT_RESPAWN_SETTINGS: RespawnViewSettings = {
  eventMarkers: true,
  rowHeight: 44,
  autoFit: true,
  wheel: 'zoom',
  animations: true,
  legend: true,
};

export const RESPAWN_SETTING_IDS: { [K in keyof RespawnViewSettings]: string } = {
  eventMarkers: 'respawn.eventMarkers',
  rowHeight: 'respawn.rowHeight',
  autoFit: 'respawn.autoFit',
  wheel: 'respawn.wheel',
  animations: 'respawn.animations',
  legend: 'respawn.legend',
};

export function respawnSettingDefs(): SettingDef[] {
  const G = 'settings.group.respawn';
  const id = RESPAWN_SETTING_IDS;
  const d = DEFAULT_RESPAWN_SETTINGS;
  return [
    {
      id: id.eventMarkers,
      group: G,
      label: str('settings.respawn.eventMarkers'),
      type: 'boolean',
      default: d.eventMarkers,
    },
    {
      id: id.rowHeight,
      group: G,
      label: str('settings.respawn.rowHeight'),
      type: 'number',
      default: d.rowHeight,
      min: 28,
      max: 72,
      step: 2,
    },
    {
      id: id.autoFit,
      group: G,
      label: str('settings.respawn.autoFit'),
      type: 'boolean',
      default: d.autoFit,
    },
    {
      id: id.wheel,
      group: G,
      label: str('settings.respawn.wheel'),
      type: 'choice',
      default: d.wheel,
      options: [
        { value: 'zoom', label: str('settings.respawn.wheel.zoom') },
        { value: 'scroll', label: str('settings.respawn.wheel.scroll') },
      ],
    },
    {
      id: id.animations,
      group: G,
      label: str('settings.respawn.animations'),
      type: 'boolean',
      default: d.animations,
    },
    {
      id: id.legend,
      group: G,
      label: str('settings.respawn.legend'),
      type: 'boolean',
      default: d.legend,
    },
  ];
}

export function readRespawnSettings(store: SettingsStore): RespawnViewSettings {
  const id = RESPAWN_SETTING_IDS;
  return {
    eventMarkers: store.getBool(id.eventMarkers),
    rowHeight: store.getNumber(id.rowHeight),
    autoFit: store.getBool(id.autoFit),
    wheel: store.getString(id.wheel) === 'scroll' ? 'scroll' : 'zoom',
    animations: store.getBool(id.animations),
    legend: store.getBool(id.legend),
  };
}

/** True if a settings change id belongs to the respawn screen. */
export function isRespawnSetting(id: string): boolean {
  return id.startsWith('respawn.');
}
