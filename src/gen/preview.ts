/**
 * (PHASE13-a) Turns one block into a playable `MapDef`: the editor's Play button.
 *
 * The block sits above a short grass staging strip with the player's spawns. Its first
 * objective slot becomes the flag objective (capture it to win); without one, the flag goes at
 * the top centre. (PHASE13-b) `budget` spends the block's budget like a generated level would;
 * leave it out to spawn everything. Pure TS.
 */
import { BLOCK_CELLS } from '../content/ground';
import { BLOCK_TUNING } from '../content/tuning';
import type { MapDef } from '../sim/world/map';
import { assembleMap } from './assemble';
import type { BlockDef } from './block';
import { spendBudget } from './budget';

export { waterRects } from './assemble';

export interface PreviewOptions {
  /** Map id (and save slot) to use. */
  id: string;
  nameKey: string;
  /** Enemy budget ([D85]); null or missing = everything spawns. */
  budget?: number | null;
  /** Seed for the order within a priority. */
  seed?: number;
}

export function blockToPreviewMap(block: BlockDef, opts: PreviewOptions): MapDef {
  const cs = BLOCK_TUNING.cellSize;
  const { spawned } = spendBudget(block, opts.budget ?? null, opts.seed ?? 1);
  const slot = block.items.find((i) => i.kind === 'objective');
  const objective =
    slot && 'at' in slot
      ? { x: slot.at[0] * cs, y: slot.at[1] * cs }
      : { x: (BLOCK_CELLS * cs) / 2, y: 1.5 * cs };
  return assembleMap({
    id: opts.id,
    nameKey: opts.nameKey,
    cols: 1,
    rows: 1,
    placed: [{ block, col: 0, row: 0, spawned, prefix: '' }],
    objective,
  });
}
