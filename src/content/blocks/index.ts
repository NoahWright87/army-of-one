/**
 * (PHASE13-b) Official blocks ([D88]): committed JSON, made in the block editor (Download JSON)
 * and added here. The `starter-*` blocks are PLACEHOLDERS written to exercise the generator;
 * the owner's blocks replace them.
 *
 * To add one: drop `<id>.json` in this folder and import it below.
 */
import { parseBlockObject, validateBlock, type BlockDef } from '../../gen/block';
import starterCrossroads from './starter-crossroads.json';
import starterField from './starter-field.json';
import starterLakeCorner from './starter-lake-corner.json';
import starterLakeShore from './starter-lake-shore.json';
import starterRoadBend from './starter-road-bend.json';
import starterRoad from './starter-road.json';
import starterShoreRoad from './starter-shore-road.json';
import starterStreamBend from './starter-stream-bend.json';
import starterStreamMouth from './starter-stream-mouth.json';
import starterStreamRoad from './starter-stream-road.json';
import starterStream from './starter-stream.json';
import starterTee from './starter-tee.json';

const RAW: readonly unknown[] = [
  starterCrossroads,
  starterField,
  starterLakeCorner,
  starterLakeShore,
  starterRoadBend,
  starterRoad,
  starterShoreRoad,
  starterStreamBend,
  starterStreamMouth,
  starterStreamRoad,
  starterStream,
  starterTee,
];

/** Every official block, checked. A broken one throws at load (tests catch it first). */
export const OFFICIAL_BLOCKS: readonly BlockDef[] = RAW.map((raw) => {
  const res = parseBlockObject(raw);
  if (!res.ok) throw new Error(`official block: ${res.key}`);
  const problems = validateBlock(res.block);
  if (problems.length) {
    throw new Error(`official block ${res.block.id}: ${problems.map((p) => p.key).join(', ')}`);
  }
  return res.block;
});
