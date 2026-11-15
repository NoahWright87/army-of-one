/**
 * (PHASE13) Which blocks can sit next to which ([D101], [D104]): two blocks connect if some side
 * of one (in any orientation) matches some side of the other. A block's degree (how many blocks
 * it connects to) is its rarity, without anyone setting one: well-connected blocks turn up
 * everywhere, a block that connects to little only where its neighbours lead to it.
 */
import type { BlockDef } from './block';
import { EdgeMatcher, sideProfiles } from './edges';

export interface BlockGraph {
  ids: string[];
  /** links[i] = indexes of the blocks block i can touch (itself included if it can). */
  links: number[][];
}

/** Every side of a block in every orientation: each side forwards and backwards. */
function allSides(b: BlockDef): string[] {
  const out = new Set<string>();
  for (const s of Object.values(sideProfiles(b))) {
    out.add(s);
    out.add([...s].reverse().join(''));
  }
  return [...out];
}

export function blockGraph(blocks: readonly BlockDef[], matcher = new EdgeMatcher()): BlockGraph {
  const sides = blocks.map(allSides);
  const links = blocks.map(() => [] as number[]);
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i; j < blocks.length; j++) {
      const touch = sides[i]!.some((a) => sides[j]!.some((b) => matcher.match(a, b)));
      if (!touch) continue;
      links[i]!.push(j);
      if (j !== i) links[j]!.push(i);
    }
  }
  return { ids: blocks.map((b) => b.id), links };
}
