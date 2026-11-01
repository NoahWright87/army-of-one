/**
 * Display / camera / audio / debug settings. "When unsure about an option, make it a setting"
 * (product owner). Defaults are our best guess; the F2 panel changes and persists them.
 */
import { str } from '../../content/strings';
import type { SettingDef, SettingsStore } from './registry';

export type ShowMode = 'off' | 'active' | 'always';
export type HpBarMode = 'off' | 'damaged' | 'always';

export interface DisplaySettings {
  echoLabels: boolean;
  echoOpacity: number;
  staticFlicker: boolean;
  hpBars: HpBarMode;
  turretRanges: ShowMode;
  mineRadii: ShowMode;
  leverLinks: boolean;
  incomingFire: boolean;
  tracers: boolean;
  cameraSmoothing: number;
  cameraZoom: number;
  screenShake: boolean;
  volume: number;
  muted: boolean;
  debugOverlay: boolean;
  interpolation: boolean;
  timeScale: string;
}

export const SETTING_IDS: { [K in keyof DisplaySettings]: string } = {
  echoLabels: 'display.echoLabels',
  echoOpacity: 'display.echoOpacity',
  staticFlicker: 'display.staticFlicker',
  hpBars: 'display.hpBars',
  turretRanges: 'display.turretRanges',
  mineRadii: 'display.mineRadii',
  leverLinks: 'display.leverLinks',
  incomingFire: 'display.incomingFire',
  tracers: 'display.tracers',
  cameraSmoothing: 'camera.smoothing',
  cameraZoom: 'camera.zoom',
  screenShake: 'camera.shake',
  volume: 'audio.volume',
  muted: 'audio.muted',
  debugOverlay: 'debug.overlay',
  interpolation: 'debug.interpolation',
  timeScale: 'debug.timeScale',
};

const showOptions = [
  { value: 'off', label: str('settings.show.off') },
  { value: 'active', label: str('settings.show.active') },
  { value: 'always', label: str('settings.show.always') },
];

export function displaySettingDefs(): SettingDef[] {
  const D = 'settings.group.display';
  const C = 'settings.group.camera';
  const A = 'settings.group.audio';
  const G = 'settings.group.debug';
  const id = SETTING_IDS;
  return [
    {
      id: id.echoLabels,
      group: D,
      label: str('settings.echoLabels'),
      type: 'boolean',
      default: true,
    },
    {
      id: id.echoOpacity,
      group: D,
      label: str('settings.echoOpacity'),
      type: 'number',
      default: 0.6,
      min: 0.15,
      max: 1,
      step: 0.05,
    },
    {
      id: id.staticFlicker,
      group: D,
      label: str('settings.staticFlicker'),
      type: 'boolean',
      default: true,
    },
    {
      id: id.hpBars,
      group: D,
      label: str('settings.hpBars'),
      type: 'choice',
      default: 'damaged',
      options: [
        { value: 'off', label: str('settings.hpBars.off') },
        { value: 'damaged', label: str('settings.hpBars.damaged') },
        { value: 'always', label: str('settings.hpBars.always') },
      ],
    },
    {
      id: id.turretRanges,
      group: D,
      label: str('settings.turretRanges'),
      type: 'choice',
      default: 'active',
      options: showOptions,
    },
    {
      id: id.mineRadii,
      group: D,
      label: str('settings.mineRadii'),
      type: 'choice',
      default: 'active',
      options: showOptions,
    },
    {
      id: id.leverLinks,
      group: D,
      label: str('settings.leverLinks'),
      type: 'boolean',
      default: true,
    },
    {
      id: id.incomingFire,
      group: D,
      label: str('settings.incomingFire'),
      type: 'boolean',
      default: true,
    },
    { id: id.tracers, group: D, label: str('settings.tracers'), type: 'boolean', default: true },
    {
      id: id.cameraSmoothing,
      group: C,
      label: str('settings.cameraSmoothing'),
      type: 'number',
      default: 0.85,
      min: 0,
      max: 0.98,
      step: 0.01,
    },
    {
      id: id.cameraZoom,
      group: C,
      label: str('settings.cameraZoom'),
      type: 'number',
      default: 1,
      min: 0.4,
      max: 2.5,
      step: 0.05,
    },
    {
      id: id.screenShake,
      group: C,
      label: str('settings.screenShake'),
      type: 'boolean',
      default: true,
    },
    {
      id: id.volume,
      group: A,
      label: str('settings.volume'),
      type: 'number',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.05,
    },
    { id: id.muted, group: A, label: str('settings.muted'), type: 'boolean', default: false },
    {
      id: id.debugOverlay,
      group: G,
      label: str('settings.debugOverlay'),
      type: 'boolean',
      default: false,
    },
    {
      id: id.interpolation,
      group: G,
      label: str('settings.interpolation'),
      type: 'boolean',
      default: true,
    },
    {
      id: id.timeScale,
      group: G,
      label: str('settings.timeScale'),
      type: 'choice',
      default: '1',
      options: ['0.25', '0.5', '1', '2', '4'].map((v) => ({ value: v, label: `${v}×` })),
    },
  ];
}

/** Snapshot of the display settings as a typed object. */
export function readDisplaySettings(store: SettingsStore): DisplaySettings {
  const out: Record<string, unknown> = {};
  for (const [k, id] of Object.entries(SETTING_IDS)) out[k] = store.get(id);
  return out as unknown as DisplaySettings;
}

/** A live typed view that stays current as the store changes. */
export function bindDisplaySettings(store: SettingsStore): DisplaySettings {
  const live = readDisplaySettings(store);
  const byId = new Map(Object.entries(SETTING_IDS).map(([k, id]) => [id, k]));
  store.subscribe((id, value) => {
    const k = byId.get(id);
    if (k) (live as unknown as Record<string, unknown>)[k] = value;
  });
  return live;
}
