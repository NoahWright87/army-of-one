/**
 * (PHASE13-b) Generated levels, headless.
 *   npm run gen -- --seed 42                 # print a level: blocks, orientations, budget, ground
 *   npm run gen -- --seed 42 --budget 600    # a harder one
 *   npm run gen -- --coverage 500            # 500 seeds: missing edge matches, rerolls
 * Uses the official blocks (src/content/blocks/).
 */
import { OFFICIAL_BLOCKS } from '../src/content/blocks';
import { generateLevel } from '../src/gen/level';
import { genMissionId } from '../src/gen/mission-id';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const coverage = Number(arg('coverage', '0'));
if (coverage > 0) {
  const missing = new Map<string, number>();
  let rerolls = 0;
  let unreachable = 0;
  let spent = 0;
  for (let seed = 1; seed <= coverage; seed++) {
    const lvl = generateLevel(OFFICIAL_BLOCKS, { id: 'cov', nameKey: 'x', seed });
    rerolls += lvl.attempts - 1;
    if (!lvl.reachable) unreachable++;
    spent += lvl.spent;
    for (const w of lvl.warnings) {
      const key = w.replace(/^row \d+ col \d+: /, '');
      missing.set(key, (missing.get(key) ?? 0) + 1);
    }
  }
  console.log(`${coverage} levels from ${OFFICIAL_BLOCKS.length} blocks`);
  console.log(`  rerolls (objective unreachable): ${rerolls}, never reachable: ${unreachable}`);
  console.log(`  average spent: ${Math.round(spent / coverage)}`);
  console.log(missing.size ? '  missing matches:' : '  every cell matched exactly');
  for (const [k, v] of [...missing].sort((a, b) => b[1] - a[1])) console.log(`    ${v}× ${k}`);
  process.exit(0);
}

const seed = Number(arg('seed', '1'));
const budgetArg = arg('budget', '');
const budget = budgetArg ? Number(budgetArg) : undefined;
const id = genMissionId(seed, budget);
const lvl = generateLevel(OFFICIAL_BLOCKS, { id, nameKey: 'map.generated.name', seed, budget });
console.log(
  `${id}: ${lvl.map.width}×${lvl.map.height}, attempts ${lvl.attempts}, spent ${lvl.spent}`,
);
for (const row of lvl.cells) {
  console.log(
    row
      .map(
        (c) =>
          `${c.blockId.replace('starter-', '')}/o${c.orientation} $${c.spent}/${c.budget}${c.fit === 'exact' ? '' : ` (${c.fit})`}`,
      )
      .map((s) => s.padEnd(34))
      .join(''),
  );
}
const m = lvl.map;
console.log(
  `squads ${m.squads?.length} (${m.squads?.reduce((a, s) => a + s.members.length, 0)} soldiers), ` +
    `turrets ${m.turrets?.length}, mines ${m.mines?.length}, cover ${m.cover?.length}, ` +
    `captures ${(m.capturePoints?.length ?? 1) - 1}`,
);
for (const w of lvl.warnings) console.log(`warning: ${w}`);
if (process.argv.includes('--ground')) for (const r of m.ground!.rows) console.log(r);
