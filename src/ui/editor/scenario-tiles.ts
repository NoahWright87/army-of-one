import type { GroundKind } from '../../content/ground';
import type { CoverMaterial } from '../../sim/world/map';

interface Tile {
  background: string;
  ink: string;
  marks: readonly string[];
}

/** Coarse, top-down miniatures. Each mark is one eighth of a map cell. */
export const terrainTiles: Record<GroundKind, Tile> = {
  U: {
    background: '#263f28',
    ink: '#779250',
    marks: [
      '.##.....',
      '####..#.',
      '###..###',
      '..#..###',
      '......#.',
      '..###...',
      '.#####..',
      '..###...',
    ],
  },
  G: {
    background: '#527c3c',
    ink: '#688e47',
    marks: [
      '........',
      '.#......',
      '###.....',
      '.....#..',
      '....###.',
      '........',
      '..#.....',
      '.###....',
    ],
  },
  D: {
    background: '#855839',
    ink: '#be8c58',
    marks: [
      '........',
      '.##.....',
      '.....##.',
      '........',
      '..##....',
      '......#.',
      '.....##.',
      '........',
    ],
  },
  R: {
    background: '#3d434b',
    ink: '#f0cc75',
    marks: [
      '........',
      '........',
      '........',
      '##..##..',
      '##..##..',
      '........',
      '........',
      '........',
    ],
  },
  S: {
    background: '#cead69',
    ink: '#f6e2ac',
    marks: [
      '........',
      '..####..',
      '........',
      '.....###',
      '........',
      '####....',
      '........',
      '...###..',
    ],
  },
  C: {
    background: '#b5bbc5',
    ink: '#737c8a',
    marks: [
      '####.###',
      '....#...',
      '....#...',
      '....#...',
      '###.####',
      '...#....',
      '...#....',
      '...#....',
    ],
  },
  W: {
    background: '#286896',
    ink: '#82d7e9',
    marks: [
      '........',
      '.###....',
      '....###.',
      '........',
      '........',
      '....###.',
      '.###....',
      '........',
    ],
  },
  K: {
    background: '#554b48',
    ink: '#c5aca0',
    marks: [
      '........',
      '.##.....',
      '####....',
      '.##..##.',
      '....####',
      '.....##.',
      '..##....',
      '........',
    ],
  },
  X: {
    background: '#353b46',
    ink: '#a3adc0',
    marks: [
      '########',
      '...#....',
      '...#....',
      '########',
      '.....#..',
      '.....#..',
      '########',
      '.#......',
    ],
  },
  T: {
    background: '#523a37',
    ink: '#be9978',
    marks: [
      '.##..##.',
      '##....##',
      '##....##',
      '.##..##.',
      '.##..##.',
      '##....##',
      '##....##',
      '.##..##.',
    ],
  },
  B: {
    background: '#956640',
    ink: '#edbf7c',
    marks: [
      '##....##',
      '########',
      '##....##',
      '########',
      '##....##',
      '########',
      '##....##',
      '########',
    ],
  },
};

export const wallTile: Tile = {
  background: '#232a36',
  ink: '#ced3e0',
  marks: [
    '........',
    '.######.',
    '.###.##.',
    '.###.##.',
    '.######.',
    '.#.####.',
    '.######.',
    '........',
  ],
};

export const coverTiles: Record<CoverMaterial, Tile> = {
  sandbags: {
    background: '#70502e',
    ink: '#f1d590',
    marks: [
      '........',
      '.##.##..',
      '###.###.',
      '........',
      '..##.##.',
      '.###.###',
      '........',
      '........',
    ],
  },
  crate: {
    background: '#794124',
    ink: '#ffb86a',
    marks: [
      '........',
      '.######.',
      '.##..##.',
      '.#.#..#.',
      '.#..#.#.',
      '.##..##.',
      '.######.',
      '........',
    ],
  },
  fence: {
    background: '#243b38',
    ink: '#9de0cb',
    marks: [
      '........',
      '.######.',
      '.#.#..#.',
      '..#.#...',
      '...#.#..',
      '.#..#.#.',
      '.######.',
      '........',
    ],
  },
  halfWall: {
    background: '#404650',
    ink: '#f1f3fa',
    marks: [
      '........',
      '........',
      '.######.',
      '.######.',
      '.######.',
      '.######.',
      '........',
      '........',
    ],
  },
  window: {
    background: '#275270',
    ink: '#bdefff',
    marks: [
      '........',
      '.######.',
      '.#.#..#.',
      '.######.',
      '.#.#..#.',
      '.#.#..#.',
      '.######.',
      '........',
    ],
  },
  bunkerWindow: {
    background: '#59603c',
    ink: '#dbeb9a',
    marks: [
      '........',
      '..####..',
      '.######.',
      '.#....#.',
      '.#....#.',
      '.######.',
      '..####..',
      '........',
    ],
  },
};

export function tileStamp(tile: Tile): HTMLCanvasElement {
  const stamp = document.createElement('canvas');
  stamp.width = stamp.height = 8;
  const ctx = stamp.getContext('2d')!;
  ctx.fillStyle = tile.background;
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillStyle = tile.ink;
  tile.marks.forEach((row, y) => {
    [...row].forEach((pixel, x) => {
      if (pixel === '#') ctx.fillRect(x, y, 1, 1);
    });
  });
  return stamp;
}
