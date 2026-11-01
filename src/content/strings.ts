/**
 * All player-facing text ([D21]). PLACEHOLDER COPY: every entry is a first draft until a human
 * finalizes it. Move a key into `FINAL_KEYS` once its copy is approved.
 *
 * Use `{name}` for interpolation: `str('hud.soldier', { n: 3 })` → "Soldier 3".
 * Map content refers to names by key (`nameKey`); unknown keys fall back to the key itself so a
 * missing entry is visible but never crashes.
 *
 * Plain data only (imported by Node tools and tests).
 */
export const STRINGS = {
  // HUD
  'hud.hp': 'HP',
  'hud.soldier': 'Soldier {n}',
  'hud.kia': 'KIA',
  'hud.leadIn': 'Shielded',
  'hud.clockLabel': 'Battle time',

  // Objectives / mission
  'objective.destroy': 'Destroy the objective',
  'objective.destroyMany': 'Destroy the objectives ({done}/{total})',
  'objective.none': 'Free roam: no objective on this map',
  'mission.complete': 'Mission complete',

  // Countdown (PHASE04 lead-in)
  'countdown.go': 'GO',
  'countdown.hint': 'Get ready',

  // World prompts
  'prompt.interact': '[E] Use',

  // Maps and spawn points
  'map.testRange.name': 'Test Range',
  'map.gallery.name': 'Gallery',
  'map.mission01.name': 'Mission 1',
  'spawn.west': 'West',
  'spawn.south': 'South',
  'spawn.road': 'Road',
  'spawn.beach': 'Beach',

  // Dev settings panel (F2). Developer-facing today; may become the real options menu.
  'settings.title': 'Settings',
  'settings.hint': 'F2 to close · changes save automatically',
  'settings.reset': 'Reset',
  'settings.resetAll': 'Reset all',
  'settings.group.display': 'Display',
  'settings.group.camera': 'Camera',
  'settings.group.audio': 'Audio',
  'settings.group.debug': 'Debug',
  'settings.group.tuning': 'Sim tuning (applies on restart)',
  'settings.action.restart': 'Restart battle',
  'settings.action.countdown': 'Play countdown',
  'settings.echoLabels': 'Echo number labels',
  'settings.echoOpacity': 'Echo opacity',
  'settings.staticFlicker': 'Static figures flicker',
  'settings.hpBars': 'HP bars',
  'settings.hpBars.off': 'Off',
  'settings.hpBars.damaged': 'When damaged',
  'settings.hpBars.always': 'Always',
  'settings.turretRanges': 'Turret ranges',
  'settings.mineRadii': 'Mine trigger radius',
  'settings.show.off': 'Off',
  'settings.show.active': 'When active',
  'settings.show.always': 'Always',
  'settings.leverLinks': 'Lever → target lines',
  'settings.incomingFire': 'Highlight incoming fire',
  'settings.tracers': 'Bullet tracers',
  'settings.cameraSmoothing': 'Camera smoothing',
  'settings.cameraZoom': 'Camera zoom',
  'settings.screenShake': 'Screen shake',
  'settings.volume': 'Volume',
  'settings.muted': 'Mute',
  'settings.debugOverlay': 'Debug overlay (`)',
  'settings.interpolation': 'Interpolate between ticks',
  'settings.timeScale': 'Sim speed',

  // Debug overlay (`)
  'debug.fps': 'FPS',
  'debug.tick': 'Tick',
  'debug.entities': 'Entities',
  'debug.hash': 'Hash',
  'debug.stepMs': 'ms/step',
} as const;

export type StringKey = keyof typeof STRINGS;

/** Keys whose copy a human has approved. Everything else is placeholder. */
export const FINAL_KEYS: ReadonlySet<StringKey> = new Set<StringKey>();

export type StringParams = Readonly<Record<string, string | number>>;

/** Looks up a known key and fills `{param}` slots. */
export function str(key: StringKey, params?: StringParams): string {
  return fill(STRINGS[key], params);
}

/** Looks up a key that came from data (e.g. a map's `nameKey`); falls back to the key itself. */
export function strDynamic(key: string, params?: StringParams): string {
  const s = (STRINGS as Record<string, string>)[key];
  return fill(s ?? key, params);
}

export function hasString(key: string): key is StringKey {
  return Object.prototype.hasOwnProperty.call(STRINGS, key);
}

function fill(template: string, params?: StringParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    params[name] !== undefined ? String(params[name]) : m,
  );
}
