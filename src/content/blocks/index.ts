/**
 * (PHASE13-b) Official blocks ([D88]): committed JSON, made in the block editor (Download JSON)
 * and added here. The `starter-*` blocks are PLACEHOLDERS written to exercise the generator;
 * the owner's blocks replace them.
 *
 * To add one: drop `<id>.json` in this folder and import it below.
 */
import { parseBlockObject, validateBlock, type BlockDef } from '../../gen/block';
import starterBaseCorner from './starter-base-corner.json';
import starterBaseGate from './starter-base-gate.json';
import starterBaseHq from './starter-base-hq.json';
import starterBaseInner from './starter-base-inner.json';
import starterBaseRoad from './starter-base-road.json';
import starterBaseWall from './starter-base-wall.json';
import starterBaseYard from './starter-base-yard.json';
import starterCrossroads from './starter-crossroads.json';
import starterField from './starter-field.json';
import starterLakeCorner from './starter-lake-corner.json';
import starterLakeEdge from './starter-lake-edge.json';
import starterLakeInner from './starter-lake-inner.json';
import starterLake from './starter-lake.json';
import starterLanding from './starter-landing.json';
import starterRidgeBend from './starter-ridge-bend.json';
import starterRidgeEnd from './starter-ridge-end.json';
import starterRidgePass from './starter-ridge-pass.json';
import starterRidge from './starter-ridge.json';
import starterRiverBend from './starter-river-bend.json';
import starterRiverBridge from './starter-river-bridge.json';
import starterRiverMouth from './starter-river-mouth.json';
import starterRiver from './starter-river.json';
import starterRoadBend from './starter-road-bend.json';
import starterRoadTee from './starter-road-tee.json';
import starterRoad from './starter-road.json';

const RAW: readonly unknown[] = [
  starterBaseCorner,
  starterBaseGate,
  starterBaseHq,
  starterBaseInner,
  starterBaseRoad,
  starterBaseWall,
  starterBaseYard,
  starterCrossroads,
  starterField,
  starterLakeCorner,
  starterLakeEdge,
  starterLakeInner,
  starterLake,
  starterLanding,
  starterRidgeBend,
  starterRidgeEnd,
  starterRidgePass,
  starterRidge,
  starterRiverBend,
  starterRiverBridge,
  starterRiverMouth,
  starterRiver,
  starterRoadBend,
  starterRoadTee,
  starterRoad,
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
