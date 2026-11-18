/** Remaining painted props, native status symbols, presentation art and compatibility textures. */
export interface FinishedArtSpec {
  file: string;
  w: number;
  h: number;
  brief: string;
  fitPx?: number;
}
const world = (
  key: string,
  w: number,
  h: number,
  brief: string,
  fitPx?: number,
): FinishedArtSpec => ({
  file: `finished/${key}.png`,
  w,
  h,
  brief,
  ...(fitPx === undefined ? {} : { fitPx }),
});
const symbol = (
  key: string,
  w: number,
  h: number,
  brief: string,
  fitPx?: number,
): FinishedArtSpec => ({ ...world(key, w, h, brief, fitPx), file: `ui/symbols/${key}.png` });
const legacy = (
  key: string,
  w: number,
  h: number,
  brief: string,
  fitPx?: number,
): FinishedArtSpec => ({ ...world(key, w, h, brief, fitPx), file: `finished/legacy/${key}.png` });

export const FINISHED_ART: Readonly<Record<string, FinishedArtSpec>> = {
  mine_scorch: world(
    'mine_scorch',
    128,
    128,
    'Soft irregular charcoal blast stain, transparent background and center.',
  ),
  objective: world(
    'objective',
    128,
    128,
    'Square slate-grey command bunker roof, red corner plates and chunky roof hatch.',
    108,
  ),
  objective_destroyed: world(
    'objective_destroyed',
    128,
    128,
    'The command bunker torn open into charred concrete and roof ribs.',
    108,
  ),
  gate_closed: world(
    'gate_closed',
    256,
    64,
    'Heavy gunmetal sliding gate crossbar, central latch, subdued ochre accents.',
  ),
  gate_open: world(
    'gate_open',
    256,
    64,
    'Retracted gate clamps and narrow rails around an empty transparent passage.',
  ),
  lever_a: world('lever_a', 64, 64, 'Control box with left-thrown lever and red indicator.', 64),
  lever_b: world('lever_b', 64, 64, 'Control box with right-thrown lever and green indicator.', 64),
  bridge_down: world(
    'bridge_down',
    128,
    128,
    'Repeating square wooden bridge deck, broad planks and steel reinforcement.',
  ),
  bridge_up: world(
    'bridge_up',
    128,
    128,
    'Raised plank panels and steel hinges at opposite ends, with an empty center gap.',
  ),
  bridge_destroyed: world(
    'bridge_destroyed',
    128,
    128,
    'Broken plank stubs and bent rails surrounding a transparent gap.',
  ),
  capture_base: world(
    'capture_base',
    128,
    128,
    'Neutral circular concrete capture pad with a central pole socket.',
  ),
  muzzle_flash: world(
    'muzzle_flash',
    32,
    32,
    'Brief ivory-yellow directional muzzle flare facing +x, transparent flame edge.',
  ),
  flag_pole: symbol('flag_pole', 12, 96, 'Steel flagpole status annotation, foot at the bottom.'),
  flag_enemy: symbol(
    'flag_enemy',
    48,
    32,
    'Coral cloth flag with a dark abstract chevron, attached at the left.',
  ),
  flag_ours: symbol(
    'flag_ours',
    48,
    32,
    'Green cloth flag with an ivory abstract chevron, attached at the left.',
  ),
  spawn_marker: symbol(
    'spawn_marker',
    64,
    64,
    'Green stencil insertion ring with a right-facing arrow.',
  ),
  soldier_shield_ring: symbol(
    'soldier_shield_ring',
    96,
    96,
    'Cyan lead-in protection ring with a clear center and restrained edge glow.',
    64,
  ),
  soldier_live_marker: symbol(
    'soldier_live_marker',
    96,
    96,
    'Warm gold player marker ring with a transparent center.',
    72,
  ),
  static_overlay: symbol(
    'static_overlay',
    64,
    64,
    'Fine deterministic horizontal static/glitch strips, transparent around the figure.',
    44,
  ),
  icon_interrupted: symbol(
    'icon_interrupted',
    32,
    32,
    'High-contrast amber interrupted-route warning triangle.',
  ),
  icon_x: symbol('icon_x', 32, 32, 'Coral death X with a dark outline.'),
  icon_o: symbol('icon_o', 32, 32, 'Green resumable-life O with a dark outline.'),
  reticle: symbol(
    'reticle',
    32,
    32,
    'White tactical crosshair with dark outlines, clear center and four short brackets.',
  ),
  soldier_live: legacy(
    'soldier_live',
    64,
    64,
    'Compatibility miniature rifleman; normal play uses separate miniature layers.',
    44,
  ),
  soldier_echo: legacy(
    'soldier_echo',
    64,
    64,
    'Compatibility miniature rifleman; echo opacity is controlled by the renderer.',
    44,
  ),
  soldier_enemy: legacy(
    'soldier_enemy',
    64,
    64,
    'Compatibility field-grey miniature rifleman.',
    44,
  ),
  soldier_static: legacy(
    'soldier_static',
    64,
    64,
    'Compatibility miniature rifleman; the static overlay is a separate texture.',
    44,
  ),
  soldier_corpse: legacy('soldier_corpse', 64, 64, 'Compatibility unarmed fallen miniature.', 44),
  vehicle: legacy('vehicle', 96, 48, 'Compatibility field-grey truck hull, facing +x.'),
  vehicle_wreck: legacy('vehicle_wreck', 96, 48, 'Compatibility charred truck wreck, facing +x.'),
  ground_tile: legacy('ground_tile', 64, 64, 'Compatibility copy of the delivered grass material.'),
  water_tile: legacy('water_tile', 64, 64, 'Compatibility copy of the delivered water material.'),
  wall_tile: legacy(
    'wall_tile',
    64,
    64,
    'Compatibility copy of the delivered concrete wall material.',
  ),
  impact: legacy(
    'impact',
    32,
    32,
    'Compatibility still taken from the delivered dust impact animation.',
  ),
  explosion: legacy(
    'explosion',
    128,
    128,
    'Compatibility still taken from the delivered explosion animation.',
  ),
  ui_title_background: {
    file: 'ui/title-background.png',
    w: 1536,
    h: 1024,
    brief:
      'Overhead miniature battlefield on a dark war-room table; quiet center for the existing title controls.',
  },
  ui_panel: {
    file: 'ui/panel-frame.png',
    w: 256,
    h: 256,
    brief:
      'Dark painted steel and felt interface panel, restrained brass corners, quiet text area, reusable nine-slice border.',
  },
  ui_campaign_background: {
    file: 'ui/campaign-table.png',
    w: 1536,
    h: 1024,
    brief:
      'Overhead war-room table surround, dark felt and subtle cartographic notes around the edges, quiet center for the real campaign map.',
  },
};
