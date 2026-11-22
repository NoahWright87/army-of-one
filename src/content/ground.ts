/**
 * (PHASE13) Painted ground and edge presets for map blocks ([D80], [D101]–[D103]). Pure data.
 *
 * A block is BLOCK_CELLS × BLOCK_CELLS painted tiles. Blocks join where their touching edges
 * match tile for tile, allowing each tile to be off by one place ([D101]); there are no edge
 * tags. Presets are just quick ways to paint a standard edge.
 */

/** Tiles per block side. Odd, so roads and doors can sit dead centre ([D80]). */
export const BLOCK_CELLS = 15;

/** One letter per tile type, so a block's ground stays readable as JSON rows. */
export type GroundKind = 'G' | 'D' | 'R' | 'S' | 'C' | 'W' | 'K' | 'X' | 'B' | 'T';

export interface GroundDef {
  /** strings.ts key for the editor palette. */
  nameKey: string;
  /** Placeholder colour (0xRRGGBB) until real ground art exists ([D21]). */
  color: number;
  /** Can soldiers and vehicles cross it? */
  passable: boolean;
  /** Does it stop shots? (Water doesn't; walls and rocks do, [D103].) */
  solid: boolean;
  /** Only the generator paints it (a bridge cut across water, [D102]). */
  generated?: boolean;
}

export const GROUND: Readonly<Record<GroundKind, GroundDef>> = {
  G: { nameKey: 'ground.grass', color: 0x4f7a3a, passable: true, solid: false },
  D: { nameKey: 'ground.dirt', color: 0x7a6142, passable: true, solid: false },
  R: { nameKey: 'ground.road', color: 0x5b5b57, passable: true, solid: false },
  S: { nameKey: 'ground.sand', color: 0xc2ad78, passable: true, solid: false },
  C: { nameKey: 'ground.concrete', color: 0x8d9094, passable: true, solid: false },
  W: { nameKey: 'ground.water', color: 0x2c5f8a, passable: false, solid: false },
  K: { nameKey: 'ground.rocks', color: 0x6e6259, passable: false, solid: true },
  X: { nameKey: 'ground.wall', color: 0x3a3d42, passable: false, solid: true },
  T: { nameKey: 'ground.trench', color: 0x49372b, passable: true, solid: false },
  B: { nameKey: 'ground.bridge', color: 0x8a6a3d, passable: true, solid: false, generated: true },
};

export const GROUND_KINDS = Object.keys(GROUND) as GroundKind[];

/** What authors paint with (the bridge is the generator's). */
export const PAINT_KINDS = GROUND_KINDS.filter((k) => !GROUND[k].generated);

export function isGroundKind(c: string): c is GroundKind {
  return Object.prototype.hasOwnProperty.call(GROUND, c);
}

/**
 * Standard edges, read clockwise around the block (north west→east, east north→south, south
 * east→west, west south→north). Applying one paints that side's outer row of tiles. They're
 * conveniences, not rules: any painted edge matches any other that agrees tile for tile ([D101]).
 */
export const EDGE_PRESETS: readonly { nameKey: string; profile: string }[] = [
  { nameKey: 'edge.grass', profile: 'GGGGGGGGGGGGGGG' },
  { nameKey: 'edge.road', profile: 'GGGGGGRRRGGGGGG' },
  { nameKey: 'edge.river', profile: 'GGGGGGWWWGGGGGG' },
  { nameKey: 'edge.shoreL', profile: 'WWWWWWWGGGGGGGG' },
  { nameKey: 'edge.shoreR', profile: 'GGGGGGGGWWWWWWW' },
  { nameKey: 'edge.water', profile: 'WWWWWWWWWWWWWWW' },
  { nameKey: 'edge.ridge', profile: 'GGGGGGKKKGGGGGG' },
  { nameKey: 'edge.concrete', profile: 'CCCCCCCCCCCCCCC' },
  { nameKey: 'edge.concreteRoad', profile: 'CCCCCCRRRCCCCCC' },
  { nameKey: 'edge.baseWallL', profile: 'CCCCCCCXGGGGGGG' },
  { nameKey: 'edge.baseWallR', profile: 'GGGGGGGXCCCCCCC' },
];
