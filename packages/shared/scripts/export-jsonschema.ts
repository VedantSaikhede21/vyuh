// Exports every registered zod schema as one bundled JSON Schema ($defs).
// Consumed by `pnpm gen:schemas` → datamodel-code-generator → apps/api Pydantic models.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { schemaRegistry } from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, '../schema/vyuh.schema.json');

const { schemas } = z.toJSONSchema(schemaRegistry, {
  target: 'draft-2020-12',
  io: 'input',
  unrepresentable: 'throw',
  uri: (id) => `#/$defs/${id}`,
});

const defs: Record<string, unknown> = {};
for (const id of Object.keys(schemas).sort()) {
  const omit = new Set(['$schema', '$id', 'id']);
  defs[id] = Object.fromEntries(
    Object.entries(schemas[id] as Record<string, unknown>).filter(([key]) => !omit.has(key)),
  );
}

const bundle = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'vyuh.schema.json',
  title: 'VyuhSchemas',
  description: 'GENERATED from packages/shared (zod). Do not edit — run `pnpm gen:schemas`.',
  $defs: defs,
};

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
console.log(`Wrote ${Object.keys(defs).length} schemas → ${outFile}`);
