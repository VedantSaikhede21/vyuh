import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      'apps/api/**',
      'scripts/terrain/.venv/**',
      'apps/web/**',
      'packages/shared/schema/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['**/test/**/*.ts', '**/*.test.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    // Determinism (CLAUDE.md §2.5/§2.6): sim-core must not use wall-clock time,
    // unseeded randomness, or any rendering/DOM library.
    files: ['packages/sim-core/src/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG (rng.ts).' },
        { object: 'Date', property: 'now', message: 'Use the sim clock.' },
        { object: 'performance', property: 'now', message: 'Use the sim clock.' },
        // Engine-defined last bits differ between browsers and Node (decision 111).
        ...[
          'sin',
          'cos',
          'tan',
          'asin',
          'acos',
          'atan',
          'atan2',
          'exp',
          'expm1',
          'log',
          'log1p',
          'log2',
          'log10',
          'pow',
          'cbrt',
          'sinh',
          'cosh',
          'tanh',
        ].map((property) => ({
          object: 'Math',
          property,
          message: 'Use the engine-independent version in dmath.ts.',
        })),
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'Use the sim clock.' },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'performance', 'navigator'],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', 'three', 'three/*', '@react-three/*'],
              message: 'sim-core is pure TS.',
            },
          ],
        },
      ],
    },
  },
  {
    // suncalc's sun position only feeds the night flag (a threshold), and dmath is the port itself.
    files: ['packages/sim-core/src/dmath.ts', 'packages/sim-core/src/sun.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  prettier,
);
