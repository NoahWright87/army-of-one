/** Painted neutral cover and enemy fixed emplacements; dimensions are art pixels. */
export const COVER_ART = {
  sandbags: {
    key: 'cover_sandbags',
    rubble: 'rubble_sandbags',
    mode: 'strip',
    width: 256,
    height: 64,
  },
  crate: { key: 'cover_crate', rubble: 'rubble_wood', mode: 'block', width: 128, height: 128 },
  fence: { key: 'cover_fence', rubble: 'rubble_metal', mode: 'strip', width: 256, height: 64 },
  halfWall: {
    key: 'cover_halfWall',
    rubble: 'rubble_concrete',
    mode: 'strip',
    width: 256,
    height: 64,
  },
  window: { key: 'cover_window', rubble: 'rubble_concrete', mode: 'strip', width: 256, height: 64 },
  bunkerWindow: {
    key: 'cover_bunkerWindow',
    rubble: 'rubble_concrete',
    mode: 'strip',
    width: 256,
    height: 64,
  },
} as const;

export const BATTLEFIELD_FILES = {
  cover_sandbags: {
    file: 'cover_sandbags.png',
    width: 256,
    height: 64,
    brief: 'Repeating overhead khaki burlap sandbag barricade, two staggered rows.',
  },
  cover_crate: {
    file: 'cover_crate.png',
    width: 128,
    height: 128,
    brief: 'Square wooden supply crate lid with broad planks, braces and steel corner straps.',
  },
  cover_fence: {
    file: 'cover_fence.png',
    width: 256,
    height: 64,
    brief: 'Thin overhead chain-link fence strip with post tops and transparent mesh holes.',
  },
  cover_halfWall: {
    file: 'cover_halfWall.png',
    width: 256,
    height: 64,
    brief: 'Low pale concrete wall top with block joints and restrained chips.',
  },
  cover_window: {
    file: 'cover_window.png',
    width: 256,
    height: 64,
    brief:
      'Pale concrete window sill cross-section with transparent slot, steel frame and glass fragments.',
  },
  cover_bunkerWindow: {
    file: 'cover_bunkerWindow.png',
    width: 256,
    height: 64,
    brief:
      'Heavy charcoal concrete firing slit cross-section with reinforcing braces and transparent slot.',
  },
  rubble_sandbags: {
    file: 'rubble_sandbags.png',
    width: 256,
    height: 64,
    brief: 'Flattened torn sandbags and spilled sand clumps, sparse transparent gaps.',
  },
  rubble_wood: {
    file: 'rubble_wood.png',
    width: 128,
    height: 128,
    brief: 'Broken crate planks, braces and bent steel straps.',
  },
  rubble_concrete: {
    file: 'rubble_concrete.png',
    width: 256,
    height: 64,
    brief: 'Broken concrete chunks with exposed reinforcing wire.',
  },
  rubble_metal: {
    file: 'rubble_metal.png',
    width: 256,
    height: 64,
    brief: 'Bent fence rails, post caps and crumpled mesh.',
  },
  turret_base: {
    file: 'turret_base.png',
    width: 128,
    height: 128,
    brief: 'Grey octagonal fixed gun platform, central mount and restrained red plates.',
  },
  turret_gun: {
    file: 'turret_gun.png',
    width: 128,
    height: 128,
    brief: 'Rotating grey gun head, breech pivot at canvas center, barrel facing +x.',
  },
  turret_wreck: {
    file: 'turret_wreck.png',
    width: 128,
    height: 128,
    brief: 'Charred and buckled fixed-emplacement wreck with torn mounting ring and broken gun.',
  },
} as const;

export type CoverArtMaterial = keyof typeof COVER_ART;
export type BattlefieldArtKey = keyof typeof BATTLEFIELD_FILES;
