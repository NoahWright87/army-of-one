/**
 * (PHASE13-a) Painted ground and edge tags for map blocks ([D80]–[D82]). Pure data.
 *
 * A block is BLOCK_CELLS × BLOCK_CELLS paintable cells. Each side of a block carries an edge tag;
 * the tag paints that side's outer row of cells (corners excluded, they belong to two sides) and
 * says whether you can cross that side. Blocks only join where their tags match exactly ([D81]).
 */

/** Cells per block side. Odd, so roads and doors can sit dead centre ([D80]). */
export const BLOCK_CELLS = 15;

/** One letter per ground kind, so a block's ground stays readable as JSON rows. */
export type GroundKind = 'G' | 'D' | 'R' | 'S' | 'C' | 'W';

export interface GroundDef {
  /** strings.ts key for the editor palette. */
  nameKey: string;
  /** Placeholder colour (0xRRGGBB) until real ground art exists ([D21]). */
  color: number;
  /** Water is impassable (it becomes the map's water); everything else is visual only ([D87]). */
  passable: boolean;
}

export const GROUND: Readonly<Record<GroundKind, GroundDef>> = {
  G: { nameKey: 'ground.grass', color: 0x4f7a3a, passable: true },
  D: { nameKey: 'ground.dirt', color: 0x7a6142, passable: true },
  R: { nameKey: 'ground.road', color: 0x5b5b57, passable: true },
  S: { nameKey: 'ground.sand', color: 0xc2ad78, passable: true },
  C: { nameKey: 'ground.concrete', color: 0x8d9094, passable: true },
  W: { nameKey: 'ground.water', color: 0x2c5f8a, passable: false },
};

export const GROUND_KINDS = Object.keys(GROUND) as GroundKind[];

export function isGroundKind(c: string): c is GroundKind {
  return Object.prototype.hasOwnProperty.call(GROUND, c);
}

/**
 * An edge tag ([D81]): what the side looks like and whether you can cross it.
 *
 * `profile` has one letter per cell along the side, read **clockwise around the block**
 * (north: west→east, east: north→south, south: east→west, west: south→north), so turning a
 * block never reverses a profile. A `#` is a cell where a wall crosses the edge: painted as
 * concrete, and walls may sit on it. Two blocks join where one side's tag is the `mirror` of the
 * other's (they read the shared edge in opposite directions); symmetric tags are their own
 * mirror. Flipping a block swaps each tag for its mirror.
 */
export interface EdgeTagDef {
  nameKey: string;
  profile: string;
  passable: boolean;
  /** The same edge read the other way (default: itself, for symmetric profiles). */
  mirror?: string;
  /** (PHASE13-b) Part of an enemy base: blocks with such an edge go in the base rows ([D83]). */
  base?: boolean;
}

export const EDGE_TAGS = {
  grass: { nameKey: 'edge.grass', profile: 'GGGGGGGGGGGGGGG', passable: true },
  road: { nameKey: 'edge.road', profile: 'GGGGGGRRRGGGGGG', passable: true },
  stream: { nameKey: 'edge.stream', profile: 'GGGGGGWWWGGGGGG', passable: true },
  water: { nameKey: 'edge.water', profile: 'WWWWWWWWWWWWWWW', passable: false },
  concrete: { nameKey: 'edge.concrete', profile: 'CCCCCCCCCCCCCCC', passable: true, base: true },
  // (PHASE13-b) A base wall crossing the side: concrete (inside) first, then grass, reading
  // clockwise; `perimeter-r` is the same edge read the other way.
  perimeter: {
    nameKey: 'edge.perimeter',
    profile: 'CCCCCCC#GGGGGGG',
    passable: true,
    mirror: 'perimeter-r',
    base: true,
  },
  'perimeter-r': {
    nameKey: 'edge.perimeterR',
    profile: 'GGGGGGG#CCCCCCC',
    passable: true,
    mirror: 'perimeter',
    base: true,
  },
} as const satisfies Record<string, EdgeTagDef>;

export type EdgeTag = keyof typeof EDGE_TAGS;

export const EDGE_TAG_IDS = Object.keys(EDGE_TAGS) as EdgeTag[];

export function isEdgeTag(t: string): t is EdgeTag {
  return Object.prototype.hasOwnProperty.call(EDGE_TAGS, t);
}

/** The tag the neighbouring block needs on the shared side (see `EdgeTagDef.mirror`). */
export function mirrorTag(t: EdgeTag): EdgeTag {
  const def: EdgeTagDef = EDGE_TAGS[t];
  return (def.mirror as EdgeTag | undefined) ?? t;
}

/** Profile letter for a wall crossing the edge. */
export const WALL_CELL = '#';

/** A tag's definition, with every optional field visible. */
export function edgeDef(t: EdgeTag): EdgeTagDef {
  return EDGE_TAGS[t];
}
