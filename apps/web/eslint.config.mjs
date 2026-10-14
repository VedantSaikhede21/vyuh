import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // DESIGN §3/§12, decision 62: colours come from tokens (globals.css) or
    // lib/theme/scene-colours.ts — never raw hex in app/ or components/.
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/#(\\d|a|b|c|d|e|f|A|B|C|D|E|F){3,8}\\b/]',
          message: 'No raw hex colours: use a design token or lib/theme/scene-colours.ts.',
        },
        {
          selector: 'TemplateElement[value.raw=/#(\\d|a|b|c|d|e|f|A|B|C|D|E|F){3,8}\\b/]',
          message: 'No raw hex colours: use a design token or lib/theme/scene-colours.ts.',
        },
        {
          selector: 'Literal[value=/rgba?\\W\\d/]',
          message: 'No raw rgb() colours: use a design token or lib/theme/scene-colours.ts.',
        },
      ],
    },
  },
  globalIgnores(['.next/**', 'out/**', 'next-env.d.ts']),
]);
