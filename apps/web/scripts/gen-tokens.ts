// Writes app/tokens.generated.css from lib/theme/tokens.ts (decision 164).
//   pnpm --filter @vyuh/web gen:tokens          write
//   pnpm --filter @vyuh/web gen:tokens --check  fail when the file is out of date

import { readFileSync, writeFileSync } from 'node:fs';
import { TOKEN_GROUPS } from '../lib/theme/tokens.ts';

const OUT = new URL('../app/tokens.generated.css', import.meta.url);

function render(): string {
  const lines = ['/* GENERATED FILE — DO NOT EDIT. Source: lib/theme/tokens.ts */', ':root {'];
  for (const [group, values] of Object.entries(TOKEN_GROUPS)) {
    lines.push(`  /* ${group} */`);
    for (const [name, value] of Object.entries(values)) lines.push(`  --${name}: ${value};`);
  }
  lines.push('}', '');
  return lines.join('\n');
}

const css = render();
if (process.argv.includes('--check')) {
  if (readFileSync(OUT, 'utf8').replaceAll('\r\n', '\n') !== css) {
    console.error(
      'app/tokens.generated.css is out of date: run pnpm --filter @vyuh/web gen:tokens',
    );
    process.exit(1);
  }
} else {
  writeFileSync(OUT, css);
}
