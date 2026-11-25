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

import { miniatureFiles } from './miniatures';
import { EXPLOSION_SHEETS, type ExplosionSize } from './explosions';
import { IMPACT_SHEET, PROJECTILE_ART } from './combat-art';
import { MINIATURE_ATLAS } from './miniature-atlas';
import { BATTLEFIELD_FILES, type BattlefieldArtKey } from './battlefield-art';
import { FINISHED_ART } from './finished-art';

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
   * Replacement art may change this to match its own framing. Vehicle turret layers use the
   * hull's reference footprint, which can exceed their own smaller canvas width.
   */
  fitPx?: number;
  /** Sprite-sheet grid, loaded as native Phaser frames rather than one image. */
  sheet?: { frameWidth: number; frameHeight: number };
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
  const final = FINISHED_ART[key];
  if (final)
    return {
      kind: 'image',
      file: final.file,
      size: { w: final.w, h: final.h },
      ...(final.fitPx === undefined ? {} : { fitPx: final.fitPx }),
      represents,
      replacementBrief: final.brief,
      status: 'final',
    };
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

// Delivered infantry files only; missing vehicle art keeps its existing renderer.
const miniSpecs = miniatureFiles();
function deliveredMiniatureImage(key: string): ImageAssetDef {
  const spec = miniSpecs.find((s) => s.key === key);
  if (!spec) throw new Error(`Unknown miniature ${key}`);
  return {
    kind: 'image',
    file: `miniatures/${spec.file}`,
    size: spec.canvas,
    fitPx: spec.fitPx,
    represents: `Miniature: ${spec.subject}`,
    replacementBrief: spec.brief,
    // Delivered files must not be overwritten by the placeholder generator.
    status: 'final',
  };
}

function explosionSheet(size: ExplosionSize): ImageAssetDef {
  const s = EXPLOSION_SHEETS[size];
  return {
    kind: 'image',
    file: s.file,
    size: { w: s.frameWidth * s.columns, h: s.frameHeight * s.rows },
    fitPx: s.frameWidth,
    sheet: { frameWidth: s.frameWidth, frameHeight: s.frameHeight },
    status: 'final',
    represents: `${size} overhead explosion animation, ${s.rows} variations × ${s.columns} frames`,
    replacementBrief:
      'Strict orthographic overhead radial blast, fixed centered pivot; each row is a variation, columns progress ignition/fire/debris/smoke/fade. Transparent RGBA, empty frame borders.',
  };
}

function projectileImage(name: keyof typeof PROJECTILE_ART): ImageAssetDef {
  const p = PROJECTILE_ART[name];
  return {
    kind: 'image',
    file: p.file,
    size: { w: p.width, h: p.height },
    status: 'final',
    represents: `Overhead painted ${name} projectile, facing +x.`,
    replacementBrief:
      'Transparent centered miniature projectile with bold dark outline and even overhead lighting.',
  };
}

function terrainImage(name: string): ImageAssetDef {
  return {
    kind: 'image',
    file: `terrain/${name}.png`,
    size: { w: 128, h: 128 },
    status: 'final',
    represents: `Painted tabletop ${name} surface.`,
    replacementBrief:
      'Seamlessly repeating orthographic overhead material, low contrast, even lighting, no objects or baked shadows.',
  };
}

function battlefieldImage(key: BattlefieldArtKey): ImageAssetDef {
  const s = BATTLEFIELD_FILES[key];
  return {
    kind: 'image',
    file: `battlefield/${s.file}`,
    size: { w: s.width, h: s.height },
    represents: s.brief,
    replacementBrief: `${TOPDOWN}. Painted tabletop resin. ${s.brief} No baked shadows, text or insignia.`,
    status: 'final',
  };
}

export const IMAGE_ASSETS = {
  ui_title_background: img(
    'ui_title_background',
    1536,
    1024,
    'Title-screen tabletop artwork.',
    'Quiet overhead miniature battlefield backdrop with no text.',
  ),
  ui_panel: img(
    'ui_panel',
    256,
    256,
    'Reusable illustrated interface panel.',
    'Dark metal and felt panel with restrained brass corner details.',
  ),
  ui_campaign_background: img(
    'ui_campaign_background',
    1536,
    1024,
    'Campaign-map war-room table surround.',
    'Quiet overhead campaign tabletop surround with no text.',
  ),
  arrival_truck: img(
    'arrival_truck',
    224,
    128,
    'Troop truck used for road reinforcements.',
    'Directly overhead painted olive cargo truck with an open troop bed.',
  ),
  arrival_boat: img(
    'arrival_boat',
    224,
    128,
    'Landing craft used for beach reinforcements.',
    'Directly overhead painted landing craft with an open well and a bow ramp.',
  ),
  parachute_open: img(
    'parachute_open',
    192,
    192,
    'Inflated overhead canopy concealing descending infantry.',
    'Directly overhead, inflated khaki parachute canopy with stitched radial panels.',
  ),
  parachute_folded: img(
    'parachute_folded',
    192,
    192,
    'Crumpled overhead canopy as infantry touch down.',
    'Directly overhead, the same khaki parachute canopy crumpled on the ground.',
  ),
  cover_sandbags: battlefieldImage('cover_sandbags'),
  cover_crate: battlefieldImage('cover_crate'),
  cover_fence: battlefieldImage('cover_fence'),
  cover_halfWall: battlefieldImage('cover_halfWall'),
  cover_window: battlefieldImage('cover_window'),
  cover_bunkerWindow: battlefieldImage('cover_bunkerWindow'),
  rubble_sandbags: battlefieldImage('rubble_sandbags'),
  rubble_wood: battlefieldImage('rubble_wood'),
  rubble_concrete: battlefieldImage('rubble_concrete'),
  rubble_metal: battlefieldImage('rubble_metal'),
  mini_atlas: {
    kind: 'image',
    file: 'atlases/miniatures.png',
    size: { w: MINIATURE_ATLAS.width, h: MINIATURE_ATLAS.height },
    status: 'final',
    represents: 'Packed source for all miniature layers; individual keys alias its frames.',
    replacementBrief:
      'Generated losslessly from delivered miniature PNGs, with transparent gutters.',
  } satisfies ImageAssetDef,
  mini_base_truck_gold: deliveredMiniatureImage('mini_base_truck_gold'),
  mini_base_truck_silver: deliveredMiniatureImage('mini_base_truck_silver'),
  mini_base_truck_gold_tarnished: deliveredMiniatureImage('mini_base_truck_gold_tarnished'),
  mini_base_truck_silver_tarnished: deliveredMiniatureImage('mini_base_truck_silver_tarnished'),
  mini_base_tank_gold: deliveredMiniatureImage('mini_base_tank_gold'),
  mini_base_tank_silver: deliveredMiniatureImage('mini_base_tank_silver'),
  mini_base_tank_gold_tarnished: deliveredMiniatureImage('mini_base_tank_gold_tarnished'),
  mini_base_tank_silver_tarnished: deliveredMiniatureImage('mini_base_tank_silver_tarnished'),
  mini_hull_truck_ally: deliveredMiniatureImage('mini_hull_truck_ally'),
  mini_hull_truck_enemy: deliveredMiniatureImage('mini_hull_truck_enemy'),
  mini_turret_truck_ally: deliveredMiniatureImage('mini_turret_truck_ally'),
  mini_turret_truck_enemy: deliveredMiniatureImage('mini_turret_truck_enemy'),
  mini_wreck_truck: deliveredMiniatureImage('mini_wreck_truck'),
  mini_shadow_truck: deliveredMiniatureImage('mini_shadow_truck'),
  mini_hull_tank_ally: deliveredMiniatureImage('mini_hull_tank_ally'),
  mini_hull_tank_enemy: deliveredMiniatureImage('mini_hull_tank_enemy'),
  mini_turret_tank_ally: deliveredMiniatureImage('mini_turret_tank_ally'),
  mini_turret_tank_enemy: deliveredMiniatureImage('mini_turret_tank_enemy'),
  mini_wreck_tank: deliveredMiniatureImage('mini_wreck_tank'),
  mini_shadow_tank: deliveredMiniatureImage('mini_shadow_tank'),
  terrain_grass: terrainImage('grass'),
  terrain_dirt: terrainImage('dirt'),
  terrain_road: terrainImage('road'),
  terrain_sand: terrainImage('sand'),
  terrain_concrete: terrainImage('concrete'),
  terrain_water: terrainImage('water'),
  terrain_rocks: terrainImage('rocks'),
  terrain_wall: terrainImage('wall'),
  terrain_bridge: terrainImage('bridge'),
  projectile_pellet: projectileImage('pellet'),
  projectile_pistol: projectileImage('pistol'),
  projectile_rifle: projectileImage('rifle'),
  projectile_rocket: projectileImage('rocket'),
  projectile_grenade: projectileImage('grenade'),
  fx_impact: {
    kind: 'image',
    file: IMPACT_SHEET.file,
    size: {
      w: IMPACT_SHEET.frameWidth * IMPACT_SHEET.columns,
      h: IMPACT_SHEET.frameHeight * IMPACT_SHEET.rows,
    },
    sheet: { frameWidth: IMPACT_SHEET.frameWidth, frameHeight: IMPACT_SHEET.frameHeight },
    represents:
      'Four overhead bullet impact animations: dust, steel sparks, stone chips, ricochet.',
    replacementBrief:
      'Transparent fixed-center overhead impacts; 6 sequential frames per row; 4 rows; clean transparent frame borders.',
    status: 'final',
  } satisfies ImageAssetDef,
  fx_explosion_small: explosionSheet('small'),
  fx_explosion_large: explosionSheet('large'),
  mini_base_square_gold: deliveredMiniatureImage('mini_base_square_gold'),
  mini_base_square_silver: deliveredMiniatureImage('mini_base_square_silver'),
  mini_base_square_gold_tarnished: deliveredMiniatureImage('mini_base_square_gold_tarnished'),
  mini_base_square_silver_tarnished: deliveredMiniatureImage('mini_base_square_silver_tarnished'),
  mini_figure_grenadier_ally: deliveredMiniatureImage('mini_figure_grenadier_ally'),
  mini_figure_grenadier_enemy: deliveredMiniatureImage('mini_figure_grenadier_enemy'),
  mini_figure_gunner_ally: deliveredMiniatureImage('mini_figure_gunner_ally'),
  mini_figure_gunner_enemy: deliveredMiniatureImage('mini_figure_gunner_enemy'),
  mini_figure_shotgun_ally: deliveredMiniatureImage('mini_figure_shotgun_ally'),
  mini_figure_shotgun_enemy: deliveredMiniatureImage('mini_figure_shotgun_enemy'),
  mini_figure_bazooka_ally: deliveredMiniatureImage('mini_figure_bazooka_ally'),
  mini_figure_bazooka_enemy: deliveredMiniatureImage('mini_figure_bazooka_enemy'),

  mini_base_round_gold: deliveredMiniatureImage('mini_base_round_gold'),
  mini_base_round_silver: deliveredMiniatureImage('mini_base_round_silver'),
  mini_base_round_gold_tarnished: deliveredMiniatureImage('mini_base_round_gold_tarnished'),
  mini_base_round_silver_tarnished: deliveredMiniatureImage('mini_base_round_silver_tarnished'),
  mini_base_octagon_gold: deliveredMiniatureImage('mini_base_octagon_gold'),
  mini_base_octagon_silver: deliveredMiniatureImage('mini_base_octagon_silver'),
  mini_base_octagon_gold_tarnished: deliveredMiniatureImage('mini_base_octagon_gold_tarnished'),
  mini_base_octagon_silver_tarnished: deliveredMiniatureImage('mini_base_octagon_silver_tarnished'),
  mini_figure_rifleman_ally: deliveredMiniatureImage('mini_figure_rifleman_ally'),
  mini_figure_rifleman_enemy: deliveredMiniatureImage('mini_figure_rifleman_enemy'),
  mini_figure_sniper_ally: deliveredMiniatureImage('mini_figure_sniper_ally'),
  mini_figure_sniper_enemy: deliveredMiniatureImage('mini_figure_sniper_enemy'),
  mini_figure_shield_ally: deliveredMiniatureImage('mini_figure_shield_ally'),
  mini_figure_shield_enemy: deliveredMiniatureImage('mini_figure_shield_enemy'),
  mini_figure_fallen_ally: deliveredMiniatureImage('mini_figure_fallen_ally'),
  mini_figure_fallen_enemy: deliveredMiniatureImage('mini_figure_fallen_enemy'),
  mini_shadow_infantry: deliveredMiniatureImage('mini_shadow_infantry'),

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
  soldier_enemy: img(
    'soldier_enemy',
    64,
    64,
    '(07-d) An enemy soldier: the same soldier, on the other team, driven by AI ([D44]).',
    `${TOPDOWN}. Same soldier silhouette as soldier_live, ${SOLDIER_FRAME}, in hostile red/maroon ` +
      'uniform with a dark helmet; must read as "enemy" instantly next to blue-grey echoes.',
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
  turret_base: battlefieldImage('turret_base'),
  turret_gun: battlefieldImage('turret_gun'),
  turret_wreck: battlefieldImage('turret_wreck'),
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
  capture_base: img(
    'capture_base',
    128,
    128,
    'A capture point on the ground (05-a); the game draws the radius and progress ring on top.',
    `${TOPDOWN}. Round concrete pad with painted chevrons and a socket for a flag pole, 128×128, transparent outside the pad.`,
  ),
  flag_pole: img(
    'flag_pole',
    12,
    96,
    'Flag pole of a capture point; flags slide up and down it.',
    'Thin steel flag pole seen slightly from the side, 12×96, transparent background, foot at the bottom.',
  ),
  flag_enemy: img(
    'flag_enemy',
    48,
    32,
    'Enemy flag (lowered while a capture point goes from enemy to neutral).',
    'Waving enemy flag, red with a dark emblem, 48×32, attaches on its left edge, transparent background.',
  ),
  flag_ours: img(
    'flag_ours',
    48,
    32,
    'Our flag (raised while a capture point goes from neutral to ours).',
    'Waving friendly flag, green with a white star, 48×32, attaches on its left edge, transparent background.',
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
  // Signposts: the object in the world, and the frame its text opens in (9-slice, 24 px corners).
  sign_post_plain: img(
    'sign_post_plain',
    64,
    64,
    'A plain signpost in the world (readable: stand by it).',
    `${TOPDOWN}. A small grey metal sign on a post, 64×64, transparent background.`,
  ),
  sign_post_wood: img(
    'sign_post_wood',
    64,
    64,
    'A wooden signpost in the world.',
    `${TOPDOWN}. A rough wooden plank sign nailed to a post, 64×64, transparent background.`,
  ),
  sign_clipboard: img(
    'sign_clipboard',
    64,
    64,
    'A clipboard of orders hung on a wall or crate.',
    `${TOPDOWN}. A brown clipboard with a cream sheet of paper and a metal clip, slightly ` +
      'askew, 64×64, transparent background.',
  ),
  sign_plate: img(
    'sign_plate',
    64,
    64,
    'A stencilled military warning plate on a post.',
    `${TOPDOWN}. An olive-drab riveted metal plate on a post, 64×64, transparent background.`,
  ),
  // (PHASE18) Basic training.
  target_dummy: img(
    'target_dummy',
    64,
    64,
    'A practice target on the training range (shoot it down; not a real objective).',
    `${TOPDOWN}. A round wooden shooting target on a stand: red and white rings, 64×64, ` +
      'transparent background.',
  ),
  target_down: img(
    'target_down',
    64,
    64,
    'A practice target that has been shot down.',
    `${TOPDOWN}. The same wooden target knocked flat, splintered, 64×64, transparent background.`,
  ),
  npc_sarge: img(
    'npc_sarge',
    64,
    64,
    'The drill sergeant who yells at you through basic training (not part of the fight).',
    `${TOPDOWN}. A burly drill sergeant seen from above: campaign hat (wide brim), olive ` +
      'uniform, 64×64, transparent background, readable at 30 px.',
  ),
  // (PHASE18) HQ signposts: things you walk up to in the hub.
  sign_map_table: img(
    'sign_map_table',
    256,
    160,
    "The HQ's campaign table: a big map spread on a table (read it to start the campaign).",
    `${TOPDOWN}. A large wooden planning table seen from above with a military campaign map ` +
      'spread on it, pins and markers, 256×160, transparent background.',
  ),
  sign_tv: img(
    'sign_tv',
    64,
    64,
    'A TV / projector in the HQ: read it to watch replays.',
    `${TOPDOWN}. An old field TV or slide projector on a stand, 64×64, transparent background.`,
  ),
  sign_trophy: img(
    'sign_trophy',
    64,
    64,
    'A trophy case in the HQ: read it to see your records.',
    `${TOPDOWN}. A glass trophy case with medals and cups, 64×64, transparent background.`,
  ),
  sign_gun_table: img(
    'sign_gun_table',
    96,
    48,
    'The shooting range gun table: read it to pick a class.',
    `${TOPDOWN}. A long table with rifles, a machine gun, a bazooka and grenades laid out, ` +
      '96×48, transparent background.',
  ),
  hub_banner: img(
    'hub_banner',
    512,
    128,
    'The HQ lobby banner (the title, in the world). The game draws the words on it.',
    'A wide olive-drab military banner/poster hanging on a wall, plain middle for a title, ' +
      'stitched edges, 512×128, transparent background. No text.',
  ),
  frame_plain: img(
    'frame_plain',
    96,
    96,
    'The default frame a sign opens in.',
    '9-slice frame, 96×96 with 24 px corners: dark translucent panel, thin light border, ' +
      'rounded corners. The centre stretches.',
  ),
  frame_wood: img(
    'frame_wood',
    96,
    96,
    "A wooden sign's frame when read.",
    '9-slice frame, 96×96 with 24 px corners: wooden planks with a darker wooden border and ' +
      'nails in the corners. The centre stretches.',
  ),
  frame_clipboard: img(
    'frame_clipboard',
    96,
    96,
    "A clipboard's frame when read: paper on a clipboard.",
    '9-slice frame, 96×96 with 24 px corners: cream paper with a brown clipboard border. The ' +
      'centre stretches.',
  ),
  frame_plate: img(
    'frame_plate',
    96,
    96,
    "A metal plate's frame when read.",
    '9-slice frame, 96×96 with 24 px corners: olive-drab painted metal with rivets in the ' +
      'corners and a worn edge. The centre stretches.',
  ),
} as const satisfies Record<string, ImageAssetDef>;

export const SOUND_ASSETS = {
  sfx_caption_voices: {
    kind: 'sound',
    file: 'audio/soldier-voices.wav',
    durationMs: 10000,
    loop: false,
    represents: 'Two synthesized speech banks for soldiers’ caption voices.',
    replacementBrief: 'Two contrasting voices with one 125 ms clip per entry in caption-voices.ts.',
    status: 'final',
  } satisfies SoundAssetDef,
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
  sfx_capture: snd(
    'sfx_capture',
    500,
    'A capture point reached a stage (enemy flag down, or our flag up).',
    'Short rising two-note bugle/radio chirp.',
  ),
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
