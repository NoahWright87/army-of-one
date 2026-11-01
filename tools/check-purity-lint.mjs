// Proves the purity lint rules actually fire: lints a deliberately impure fixture as if it lived
// in src/sim/, and fails unless every expected rule reports an error.
import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';

const fixture = 'tools/fixtures/purity/impure.ts';
const eslint = new ESLint();
const [result] = await eslint.lintText(readFileSync(fixture, 'utf8'), {
  filePath: 'src/sim/__purity_fixture__.ts',
});
const fired = new Set(result.messages.map((m) => m.ruleId));
const expected = [
  'no-restricted-imports',
  'no-restricted-properties',
  'no-restricted-globals',
  'no-restricted-syntax',
];
const missing = expected.filter((r) => !fired.has(r));
if (missing.length) {
  console.error(`Purity lint did not fire for: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`Purity lint OK (${result.messages.length} violations caught in fixture).`);
