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

  // Game flow (PHASE04)
  'title.name': 'Army of One',
  'title.tagline': 'One soldier at a time. Every life you lose fights beside you.',
  'title.new': 'New mission',
  'title.newConfirm': 'Start over? Your saved mission will be lost',
  'title.continue': 'Continue',
  'title.mission': 'Mission: {name}',
  'caption.kia': 'KIA',
  'caption.complete': 'Mission complete',
  'notice.historyShifted': 'History shifted: that choice no longer happens. Pick again.',
  'busy.preparing': 'Preparing…',
  'complete.title': 'Mission complete',
  'complete.battleTime': 'Battle time',
  'complete.soldiers': 'Soldiers used',
  'complete.rescues': 'Rescues',
  'complete.attempts': 'Attempts',
  'complete.playAgain': 'Play again',
  'leadIn.hint': 'Get ready: hold your moves now, they apply at GO',

  // Dev tools (dev builds or ?dev=1)
  'dev.reset': 'Reset mission',
  'dev.kill': 'Kill (K)',
  'dev.speed': 'Speed {x}× ([ / ])',
  'dev.autoplay': 'Autoplay: {left} lives left',
  'dev.timeline': 'Timeline JSON',

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
  'spawn.mission01.road': 'Road',
  'spawn.mission01.beach': 'Beach',
  'spawn.fixture.outpost': 'Outpost (captured)',
  'map.mission02.name': 'Mission 2: Outpost',
  'spawn.mission02.outpost': 'Outpost',
  'capture.mission02.outpost': 'Outpost',
  'capture.mission02.hq': 'HQ',
  'capture.gallery.name': 'Point',
  'objective.capture': 'Capture {name}',
  'objective.mixed': 'Complete the objectives ({done}/{total})',
  'title.pickMission': 'Mission',
  'respawn.header.objectiveCaptured': 'Captured',
  'respawn.header.objectiveNotCaptured': 'Not captured',
  'respawn.spawn.forwardDetail': 'Forward point · opens {open} · Soldier {n}',
  'respawn.spawn.forwardOpen': 'Captured at {time} by Soldier {by}',
  'respawn.change.pointLost': '{point} lost: soldiers who entered there never spawn',
  'respawn.change.pointCaptured': '{point} captured at {time}: new forward spawn',
  'respawn.change.pointMoved': '{point} now captured at {time}',
  'respawn.capture.tip': '{point} captured at {time}',
  'respawn.legend.capture': 'Point captured',
  'marker.captureNeutral': 'Lowered the enemy flag',

  // Respawn screen (PHASE03-b). Header.
  'respawn.title': 'Respawn',
  'respawn.header.attempt': 'Attempt {n}',
  'respawn.header.soldiers': 'Soldiers used',
  'respawn.header.reached': 'Battle time reached',
  'respawn.header.reachedNone': 'Not started',
  'respawn.header.objective': 'Objective',
  'respawn.header.objectiveIntact': 'Not destroyed',
  'respawn.header.objectiveDone': 'Destroyed',
  // Timeline
  'respawn.timeline.title': 'Timeline',
  'respawn.timeline.empty': 'No soldiers yet. Pick an entry point and deploy your first soldier.',
  'respawn.timeline.fit': 'Fit all',
  'respawn.timeline.zoomIn': 'Zoom in',
  'respawn.timeline.zoomOut': 'Zoom out',
  'respawn.timeline.soldier': 'Soldier {n}',
  'respawn.timeline.neverSpawned': 'Never spawned',
  'respawn.timeline.hint': 'Drag to pan · wheel or pinch to zoom',
  'respawn.scrubber.label': 'Resolving history…',
  'respawn.scrubber.unconfirmed': 'Unconfirmed',
  'respawn.entry.marker': '{point} {time}',
  // Legend
  'respawn.legend.alive': 'Alive',
  'respawn.legend.death': 'Died',
  'respawn.legend.open': 'Can resume',
  'respawn.legend.interrupted': 'Interrupted',
  'respawn.legend.lost': 'No longer happens',
  'respawn.legend.unresolved': 'Unknown yet',
  // Lane end tooltips
  'respawn.end.death': 'Soldier {n} died at {time}',
  'respawn.end.open': 'Soldier {n} is alive at {time}: select to resume',
  'respawn.end.interrupted': 'Soldier {n} was blocked at {time} and froze (cannot resume)',
  'respawn.end.neverSpawned': 'Soldier {n} never spawned: the entry point was lost',
  'respawn.end.unresolved': 'Soldier {n}: outcome not known yet',
  'respawn.end.complete': 'Soldier {n} completed the mission at {time}',
  // History changed captions
  'respawn.change.title': 'History changed',
  'respawn.change.survived': 'Soldier {n} survived!',
  'respawn.change.diesAt': 'Soldier {n} now dies at {time}',
  'respawn.change.interrupted': 'Soldier {n} is now blocked at {time}',
  'respawn.change.neverSpawned': 'Soldier {n} never spawns now',
  'respawn.change.unresolved': 'Soldier {n}: outcome unknown again',
  'respawn.change.complete': 'Soldier {n} now completes the mission',
  'respawn.change.more': '+{n} more',
  // Spawn panel
  'respawn.spawn.title': 'Choose your next soldier',
  'respawn.spawn.newTitle': '{point}: enters at {time}',
  'respawn.spawn.newDetail': 'New soldier (Soldier {n})',
  'respawn.spawn.resumeTitle': 'Resume Soldier {n} at {time}',
  'respawn.spawn.resumeDetail': 'Replays from {from}, then you take over',
  'respawn.spawn.unconfirmed': 'Not confirmed yet',
  'respawn.spawn.none': 'No options available',
  'respawn.deploy': 'Deploy',
  'respawn.deploy.new': 'Deploy at {point} ({time})',
  'respawn.deploy.resume': 'Deploy as Soldier {n} ({time})',
  'respawn.deploy.pick': 'Pick an option',
  'respawn.keys': '↑↓ / Tab choose · Enter deploy',
  // Timeline event markers (tooltips)
  'marker.spawn': 'Entered the battle',
  'marker.kill': 'Killed an enemy',
  'marker.hazardDestroyed': 'Destroyed a hazard',
  'marker.interact': 'Used a switch',
  'marker.damaged': 'Took damage',
  'marker.capture': 'Captured a point (our flag raised)',
  'marker.objective': 'Hit the objective',
  'marker.interrupted': 'Path blocked',
  'marker.death': 'Killed',
  'marker.open': 'Recording ends alive',
  'marker.tip': '{what} · Soldier {n} · {time}',
  // Dev page
  'respawn.dev.fixture': 'Fixture',
  'respawn.dev.replay': 'Replay stream',
  'respawn.dev.deployed': 'Deployed: {option}',

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
  'settings.group.respawn': 'Respawn screen',
  'settings.group.game': 'Game flow',
  'settings.game.resolveSpeed': 'Scrubber sweep speed',
  'settings.game.resolveSpeed.max': 'Instant',
  'settings.game.resolveSpeed.x': '{x}× battle time',
  'settings.game.resumeOnReload': 'Reload mid-life resumes at once',
  'settings.game.ghostArrow': 'Lead-in: preview held movement',
  'settings.respawn.eventMarkers': 'Timeline event markers',
  'settings.respawn.rowHeight': 'Timeline row height',
  'settings.respawn.autoFit': 'Fit whole timeline on open',
  'settings.respawn.wheel': 'Mouse wheel on timeline',
  'settings.respawn.wheel.zoom': 'Zoom (Shift scrolls)',
  'settings.respawn.wheel.scroll': 'Scroll (Ctrl zooms)',
  'settings.respawn.animations': 'Animate history changes',
  'settings.respawn.legend': 'Timeline legend',
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
  'debug.renderMs': 'render ms',
  'debug.sprites': 'Sprites',
  'debug.echoes': 'Echoes',

  // PHASE05-b: army readability + stress mode
  'settings.dimEchoes': 'Dim echoes (find yourself in a big army)',
  'settings.dimEchoesLevel': 'Dimmed echo opacity',
  'settings.echoLabelRadius': 'Echo labels only within (0 = everywhere)',
  'settings.cullOffscreen': 'Skip drawing off-screen soldiers',
  'busy.stress': 'Generating bot lives {done}/{total}…',
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
