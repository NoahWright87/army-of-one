// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/** Modules that must stay pure TypeScript: headless, deterministic, renderer-agnostic. */
export const PURE_MODULES = [
  'src/sim/**/*.ts',
  'src/timeline/**/*.ts',
  'src/persistence/**/*.ts',
  'src/contracts/**/*.ts',
  'src/content/**/*.ts',
];

export const purityRules = {
  'no-restricted-imports': [
    'error',
    {
      paths: [{ name: 'phaser', message: 'Pure modules must not depend on Phaser.' }],
      patterns: [
        {
          group: ['**/render/**', '**/ui/**', '**/app/**', 'phaser/*'],
          message: 'Pure modules must not import presentation code.',
        },
      ],
    },
  ],
  'no-restricted-globals': [
    'error',
    { name: 'window', message: 'No DOM in pure modules.' },
    { name: 'document', message: 'No DOM in pure modules.' },
    { name: 'localStorage', message: 'Use the persistence storage interface.' },
    { name: 'sessionStorage', message: 'Use the persistence storage interface.' },
    { name: 'performance', message: 'No wall-clock time in pure modules.' },
    { name: 'requestAnimationFrame', message: 'No frame timing in pure modules.' },
  ],
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Sim must be deterministic; see core/rng.ts.' },
    { object: 'Date', property: 'now', message: 'No wall-clock time in pure modules.' },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "NewExpression[callee.name='Date']",
      message: 'No wall-clock time in pure modules.',
    },
  ],
};

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'tools/fixtures/**', 'assets/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: PURE_MODULES,
    rules: purityRules,
  },
  prettier,
);
