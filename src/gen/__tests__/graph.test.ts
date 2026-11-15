import { describe, expect, it } from 'vitest';
import { OFFICIAL_BLOCKS } from '../../content/blocks';
import { newBlock, type BlockDef } from '../block';
import { blockGraph } from '../graph';

const filled = (id: string, ch: string): BlockDef => ({
  ...newBlock(id),
  ground: newBlock().ground.map(() => ch.repeat(15)),
});

describe('blockGraph ([D104])', () => {
  it('links blocks whose sides can touch, and only those', () => {
    const grass = filled('grass', 'G');
    const water = filled('water', 'W');
    const shore: BlockDef = {
      ...newBlock('shore'),
      ground: newBlock().ground.map(() => 'GGGGGGGWWWWWWWW'),
    };
    const g = blockGraph([grass, water, shore]);
    // Grass touches grass and the shore's grass side; water touches water and the shore's
    // water side; the shore touches all three.
    expect(g.links[0]!.sort()).toEqual([0, 2]);
    expect(g.links[1]!.sort()).toEqual([1, 2]);
    expect(g.links[2]!.sort()).toEqual([0, 1, 2]);
  });

  it('every official block connects to something', () => {
    const g = blockGraph(OFFICIAL_BLOCKS);
    for (let i = 0; i < g.ids.length; i++) expect(g.links[i]!.length, g.ids[i]).toBeGreaterThan(0);
  });
});
