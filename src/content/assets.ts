/**
 * Asset manifest ([D21]). Every image and sound the game uses has exactly one entry here.
 * Code refers to assets by KEY only; URLs are resolved in `src/render/assets/`.
 *
 * To replace a placeholder: drop the real file into `assets/` (any sub-folder), point `file` at
 * it, set `status: 'final'`, and run `npm run gen:placeholders` to refresh `assets/ASSETS.md`.
 * The generator skips entries whose status is 'final'.
 *
 * Plain data only: this module is imported by Node tools and must stay DOM/Phaser-free.
 */

export type AssetStatus = 'placeholder' | 'final';

interface AssetCommon {
  /** Path relative to the repo's `assets/` folder. */
  file: string;
  /** What the asset depicts / signals in game. */
  represents: string;
  /** Prompt-like description of the real asset, for an artist or an image/audio model. */
  replacementBrief: string;
  status: AssetStatus;
}

export interface ImageAssetDef extends AssetCommon {
  kind: 'image';
  /** Pixel size of the file. */
  size: { w: number; h: number };
  /**
   * Pixel extent of the part of the image that maps onto the entity's logical size (e.g. the
   * soldier body diameter, which the renderer scales to 2 × spriteRadius). Defaults to `size.w`.
   * Replacement art may change this to match its own framing.
   */
  fitPx?: number;
}

export interface SoundAssetDef extends AssetCommon {
  kind: 'sound';
  durationMs: number;
  /** Seamless loop (vehicle engine, static hum). */
  loop?: boolean;
}

export type AssetDef = ImageAssetDef | SoundAssetDef;
export type AssetEntry = AssetDef & { key: AssetKey };

const ph = (key: string, ext: 'png' | 'wav') => `placeholder/PLACEHOLDER__${key}.${ext}`;

function img(
  key: string,
  w: number,
  h: number,
  represents: string,
  replacementBrief: string,
  fitPx?: number,
): ImageAssetDef {
  return {
    kind: 'image',
    file: ph(key, 'png'),
    size: { w, h },
    ...(fitPx !== undefined ? { fitPx } : {}),
    represents,
    replacementBrief,
    status: 'placeholder',
  };
}

function snd(
  key: string,
  durationMs: number,
  represents: string,
  replacementBrief: string,
  loop = false,
): SoundAssetDef {
  return {
    kind: 'sound',
    file: ph(key, 'wav'),
    durationMs,
    ...(loop ? { loop } : {}),
    represents,
    replacementBrief,
    status: 'placeholder',
  };
}

const TOPDOWN = 'Top-down orthographic view, transparent background';
const SOLDIER_FRAME =
  '64×64, facing right (+x), body circle about 44 px wide and centered so rotation works';

export const IMAGE_ASSETS = {
  soldier_live: img(
    'soldier_live',
    64,
    64,
    'The soldier the player is controlling right now.',
    `${TOPDOWN}. Soldier with rifle, ${SOLDIER_FRAME}. The MOST saturated, highest-contrast ` +
      'figure on screen (warm yellow/orange accents, thick dark outline); must be findable in a ' +
      'crowd of 50 similar soldiers at 32 px.',
    44,
  ),
  soldier_echo: img(
    'soldier_echo',
    64,
    64,
    'A past life replaying its recording (an echo).',
    `${TOPDOWN}. Same soldier silhouette as soldier_live, ${SOLDIER_FRAME}, but desaturated ` +
      'cool blue-grey and slightly ghostly. Drawn translucent in game, so keep it simple.',
    44,
  ),
  soldier_static: img(
    'soldier_static',
    64,
    64,
    'A static remnant: an echo whose recording ran out (noninteractive, flickering).',
    `${TOPDOWN}. Soldier silhouette, ${SOLDIER_FRAME}, washed-out grey-white with horizontal ` +
      'scanlines, like a paused VHS frame.',
    44,
  ),
  soldier_corpse: img(
    'soldier_corpse',
    64,
    64,
    'A dead soldier lying on the ground.',
    `${TOPDOWN}. Fallen soldier, ${SOLDIER_FRAME}, dark and low-contrast so it reads as ` +
      'background, not as an active unit.',
    44,
  ),
  soldier_shield_ring: img(
    'soldier_shield_ring',
    96,
    96,
    'Lead-in invulnerability ([D5]): the soldier cannot die during the countdown.',
    'Glowing cyan energy ring, 96×96, transparent center, ring about 64 px across. Overlaid on a ' +
      'soldier; rotates slowly.',
    64,
  ),
  soldier_live_marker: img(
    'soldier_live_marker',
    96,
    96,
    'Ground ring under the live soldier so it pops in a crowd.',
    'Soft warm-yellow ground ring/halo, 96×96, ring about 72 px across, mostly transparent.',
    72,
  ),
  static_overlay: img(
    'static_overlay',
    64,
    64,
    'TV-static noise drawn over static remnants.',
    'Circular patch of black/white TV noise, 64×64, soft transparent edge.',
    44,
  ),
  icon_interrupted: img(
    'icon_interrupted',
    32,
    32,
    'An echo that was interrupted (its route is blocked; frozen for this attempt).',
    'Warning icon: bold "!" in an amber triangle, 32×32, readable at 16 px.',
  ),
  icon_x: img(
    'icon_x',
    32,
    32,
    'Lane ends in death (timeline X).',
    'Bold red X mark, 32×32, readable at 16 px.',
  ),
  icon_o: img(
    'icon_o',
    32,
    32,
    'Lane ends alive / resumable (timeline O).',
    'Bold green O ring, 32×32, readable at 16 px.',
  ),
  turret_base: img(
    'turret_base',
    64,
    64,
    'Fixed enemy turret mount (does not rotate).',
    `${TOPDOWN}. Armored octagonal turret mount, 64×64, hostile red accents.`,
  ),
  turret_gun: img(
    'turret_gun',
    64,
    64,
    'Turret barrel; rotates to aim. Pivot is the image center.',
    `${TOPDOWN}. Turret barrel/head, 64×64, pointing right (+x) from the center pivot.`,
  ),
  turret_wreck: img(
    'turret_wreck',
    64,
    64,
    'A destroyed turret.',
    `${TOPDOWN}. Charred, broken turret mount with smoke stains, 64×64.`,
  ),
  mine: img('mine', 32, 32, 'A landmine, idle.', `${TOPDOWN}. Small dark landmine, 32×32.`),
  mine_armed: img(
    'mine_armed',
    32,
    32,
    'A triggered landmine counting down its fuse.',
    `${TOPDOWN}. Same mine with a bright red glowing light, 32×32. Blinks in game.`,
  ),
  mine_scorch: img(
    'mine_scorch',
    64,
    64,
    'Scorch mark left where a mine detonated.',
    `${TOPDOWN}. Dark blast scorch decal, 64×64, soft edges.`,
  ),
  vehicle: img(
    'vehicle',
    96,
    48,
    'Traffic vehicle (frogger lane). Kills soldiers on contact.',
    `${TOPDOWN}. Military truck, 96×48, driving right (+x), hostile, clearly dangerous.`,
  ),
  vehicle_wreck: img(
    'vehicle_wreck',
    96,
    48,
    'A destroyed vehicle; blocks movement.',
    `${TOPDOWN}. Burnt-out truck wreck, 96×48, facing right.`,
  ),
  gate_closed: img(
    'gate_closed',
    64,
    64,
    'A closed gate: blocks movement and shots.',
    `${TOPDOWN}. Heavy metal gate segment, 64×64, stretched to the gate's rectangle.`,
  ),
  gate_open: img(
    'gate_open',
    64,
    64,
    'An open gate: passable.',
    `${TOPDOWN}. Open gate frame / rails in the ground, 64×64, mostly transparent.`,
  ),
  lever_a: img(
    'lever_a',
    32,
    32,
    'A lever in its "off" position.',
    `${TOPDOWN}. Wall lever, handle thrown left, grey/red, 32×32.`,
  ),
  lever_b: img(
    'lever_b',
    32,
    32,
    'A lever in its "on" position.',
    `${TOPDOWN}. Wall lever, handle thrown right, green, 32×32.`,
  ),
  bridge_down: img(
    'bridge_down',
    64,
    64,
    'A lowered drawbridge: walkable. Tiled across the bridge rectangle.',
    `${TOPDOWN}. Wooden plank bridge tile, 64×64, seamlessly tileable.`,
  ),
  bridge_up: img(
    'bridge_up',
    64,
    64,
    'A raised drawbridge: impassable.',
    `${TOPDOWN}. Raised drawbridge seen edge-on with hazard stripes, 64×64, tileable.`,
  ),
  bridge_destroyed: img(
    'bridge_destroyed',
    64,
    64,
    'A blown-up bridge: permanently impassable.',
    `${TOPDOWN}. Broken, charred planks over a gap, 64×64, tileable.`,
  ),
  water_tile: img(
    'water_tile',
    64,
    64,
    'Water: impassable to movement, transparent to shots.',
    `${TOPDOWN}. Seamless dark-blue water tile, 64×64.`,
  ),
  ground_tile: img(
    'ground_tile',
    64,
    64,
    'Walkable ground.',
    `${TOPDOWN}. Seamless muted green-brown dirt/grass tile, 64×64, low contrast so units pop.`,
  ),
  wall_tile: img(
    'wall_tile',
    64,
    64,
    'Solid wall: blocks movement and shots.',
    `${TOPDOWN}. Seamless concrete/sandbag wall tile, 64×64.`,
  ),
  objective: img(
    'objective',
    96,
    96,
    'The mission objective to destroy ([D17]).',
    `${TOPDOWN}. Enemy bunker / fuel depot, 96×96, with an unmistakable target marking.`,
    80,
  ),
  objective_destroyed: img(
    'objective_destroyed',
    96,
    96,
    'The destroyed objective.',
    `${TOPDOWN}. Rubble and fire where the bunker stood, 96×96.`,
    80,
  ),
  spawn_marker: img(
    'spawn_marker',
    64,
    64,
    'A spawn (insertion) point; the arrow shows the initial facing.',
    `${TOPDOWN}. Friendly insertion marker painted on the ground with an arrow pointing right, 64×64.`,
  ),
  muzzle_flash: img(
    'muzzle_flash',
    32,
    32,
    'Muzzle flash when a gun fires.',
    'Bright yellow-white muzzle flash pointing right (+x), 32×32, additive-friendly.',
  ),
  impact: img(
    'impact',
    32,
    32,
    'Bullet impact where a shot stops.',
    'Small spark/dust burst, 32×32.',
  ),
  explosion: img(
    'explosion',
    128,
    128,
    'An explosion (mine, destroyed hazard, objective).',
    'Single-frame top-down explosion fireball, 128×128, orange/yellow core, smoke edge.',
  ),
  reticle: img(
    'reticle',
    32,
    32,
    'The aim cursor at the mouse position.',
    'Thin crosshair reticle, 32×32, white with dark outline, readable on any ground.',
  ),
} as const satisfies Record<string, ImageAssetDef>;

export const SOUND_ASSETS = {
  sfx_rifle_shot: snd(
    'sfx_rifle_shot',
    180,
    'A soldier fires their rifle.',
    'Short punchy rifle shot, dry, under 200 ms; must not fatigue when 20 echoes fire.',
  ),
  sfx_turret_shot: snd(
    'sfx_turret_shot',
    220,
    'A turret fires.',
    'Heavier, lower mechanical gunshot, clearly different from the rifle.',
  ),
  sfx_turret_windup: snd(
    'sfx_turret_windup',
    500,
    'A turret is about to fire (telegraph).',
    'Rising electronic whine, about 0.5 s, unmistakable warning.',
  ),
  sfx_hit: snd('sfx_hit', 90, 'A soldier takes damage.', 'Short meaty hit/thud.'),
  sfx_death: snd('sfx_death', 600, 'A soldier dies.', 'Short falling tone or grunt, 0.6 s.'),
  sfx_explosion: snd(
    'sfx_explosion',
    900,
    'An explosion.',
    'Boomy explosion with rumble tail, under 1 s.',
  ),
  sfx_lever: snd('sfx_lever', 120, 'A lever is pulled.', 'Metal lever clunk-click.'),
  sfx_gate: snd(
    'sfx_gate',
    450,
    'A gate or bridge moves.',
    'Heavy metal grinding/clank, about 0.5 s.',
  ),
  sfx_vehicle_loop: snd(
    'sfx_vehicle_loop',
    1000,
    'Engine of passing traffic.',
    'Seamless 1 s truck engine loop.',
    true,
  ),
  sfx_static_hum: snd(
    'sfx_static_hum',
    1000,
    'Hum near static remnants.',
    'Seamless 1 s eerie electrical static hum.',
    true,
  ),
  sfx_countdown_tick: snd(
    'sfx_countdown_tick',
    90,
    'Each second of the lead-in countdown.',
    'Crisp UI tick/beep.',
  ),
  sfx_resume_go: snd(
    'sfx_resume_go',
    320,
    'Countdown reached zero: you have control.',
    'Bright rising "go" chime.',
  ),
  sfx_mine_armed: snd('sfx_mine_armed', 60, 'A mine was triggered.', 'Tiny high-pitched beep.'),
  sfx_mission_complete: snd(
    'sfx_mission_complete',
    900,
    'Mission complete.',
    'Short triumphant three-note sting.',
  ),
} as const satisfies Record<string, SoundAssetDef>;

export type ImageKey = keyof typeof IMAGE_ASSETS;
export type SoundKey = keyof typeof SOUND_ASSETS;
export type AssetKey = ImageKey | SoundKey;

/** Every asset, images first, in declaration order. */
export const ASSET_MANIFEST: readonly AssetEntry[] = [
  ...Object.entries(IMAGE_ASSETS).map(([key, def]) => ({ ...def, key: key as AssetKey })),
  ...Object.entries(SOUND_ASSETS).map(([key, def]) => ({ ...def, key: key as AssetKey })),
];

export function imageAsset(key: ImageKey): ImageAssetDef {
  return IMAGE_ASSETS[key];
}

/** Pixels of the image that correspond to the entity's logical size. */
export function fitPx(key: ImageKey): number {
  const a: ImageAssetDef = IMAGE_ASSETS[key];
  return a.fitPx ?? a.size.w;
}
