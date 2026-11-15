/**
 * (PHASE13) Edge matching by tiles ([D101]): exact types, each tile allowed one place of slack.
 * Examples from the owner's design notes (G grass, W water, R road).
 */
import { describe, expect, it } from 'vitest';
import { newBlock, type BlockDef } from '../block';
import {
  countFits,
  EdgeMatcher,
  edgesMatch,
  fuzzyEqual,
  sidePassable,
  sideProfile,
} from '../edges';

describe('fuzzyEqual', () => {
  it('a river widening into a lake matches', () => {
    expect(fuzzyEqual('GGWGG', 'GWWWG')).toBe(true);
  });
  it('water against road does not, even though the grass agrees', () => {
    expect(fuzzyEqual('GGWGG', 'GGRGG')).toBe(false);
  });
  it('everything with a neighbour of its type within one place matches', () => {
    expect(fuzzyEqual('GGRWW', 'GRRRW')).toBe(true);
  });
  it('types must be exact: grass does not meet sand', () => {
    expect(fuzzyEqual('GGGGG', 'SSSSS')).toBe(false);
  });
  it('a feature two places off does not match', () => {
    expect(fuzzyEqual('GWGGG', 'GGGWG')).toBe(false);
  });
});

describe('sides', () => {
  const b: BlockDef = {
    ...newBlock(),
    ground: newBlock().ground.map((row, r) => (r === 0 ? 'RGGGGGGGGGGGGGW' : row)),
  };

  it('are read clockwise around the block', () => {
    expect(sideProfile(b, 'n')).toBe('RGGGGGGGGGGGGGW');
    expect(sideProfile(b, 'e')[0]).toBe('W'); // north-east corner first
    expect(sideProfile(b, 'w').at(-1)).toBe('R'); // west ends at the north-west corner
  });

  it('touching sides run in opposite directions, so one is reversed to compare', () => {
    // Our north edge (west→east) against their south edge (east→west): the same tiles.
    expect(edgesMatch('GGGRRRGGGGGGGGG', 'GGGGGGGGGRRRGGG')).toBe(true);
    expect(edgesMatch('GGGRRRGGGGGGGGG', 'GGGRRRGGGGGGGGG')).toBe(false);
  });

  it('are crossable with a run of two walkable tiles', () => {
    expect(sidePassable('WWWWWWWWWWWWWWW')).toBe(false);
    expect(sidePassable('WWWWWWBBWWWWWWW')).toBe(true);
    expect(sidePassable('KKKKKGKKKKKKKKK')).toBe(false);
  });

  it('count how many blocks fit against each side', () => {
    const grass = newBlock();
    const sides = [
      { n: 'G'.repeat(15), e: 'G'.repeat(15), s: 'G'.repeat(15), w: 'G'.repeat(15) },
      { n: 'W'.repeat(15), e: 'W'.repeat(15), s: 'W'.repeat(15), w: 'W'.repeat(15) },
    ];
    expect(countFits(grass, sides, new EdgeMatcher())).toEqual({ n: 1, e: 1, s: 1, w: 1 });
  });
});
