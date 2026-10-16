// Exports every registered zod schema as one bundled JSON Schema ($defs).
// Consumed by `pnpm gen:schemas` → datamodel-code-generator → apps/api Pydantic models.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  CLASS_PROFILES,
  DAY_MIN_EL_DEG,
  FIRST_TRACK_MAX_DIFFICULTY,
  FIRST_TRACK_MAX_S,
  GENERATOR_BAND_WINDOWS_DEG,
  MIN_WARNING_S,
  NIGHT_SUN_EL_DEG,
  ThreatClass,
  schemaRegistry,
} from '../src/index.ts';

type Json = Record<string, unknown>;

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, '../schema/vyuh.schema.json');
const profilesFile = resolve(here, '../../../apps/api/app/seed/generated/class_profiles.json');
const difficultyFile = resolve(here, '../../../apps/api/app/seed/generated/difficulty.json');
const timeBandsFile = resolve(here, '../../../apps/api/app/seed/generated/time_bands.json');
const REF_PREFIX = '#/$defs/';
const DISCRIMINATOR_KEYS = ['type', 'kind'];

const { schemas } = z.toJSONSchema(schemaRegistry, {
  target: 'draft-2020-12',
  io: 'input',
  unrepresentable: 'throw',
  uri: (id) => `${REF_PREFIX}${id}`,
});

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * zod emits a regex `pattern` next to `format` (uuid, date-time, …). The format
 * already says it all, and Pydantic rejects `pattern` on UUID/datetime fields.
 */
function stripFormatPatterns(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripFormatPatterns);
  if (!isObj(node)) return node;
  const hasFormat = typeof node.format === 'string';
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !(hasFormat && key === 'pattern'))
      .map(([key, value]) => [key, stripFormatPatterns(value)]),
  );
}

/**
 * Adds an OpenAPI-style `discriminator` to unions whose members all carry a
 * `const` on the same key, so datamodel-codegen emits a Pydantic tagged union.
 */
function addDiscriminators(defs: Record<string, Json>): void {
  const constOf = (ref: unknown, key: string): string | undefined => {
    if (!isObj(ref) || typeof ref.$ref !== 'string') return undefined;
    const target = defs[ref.$ref.slice(REF_PREFIX.length)];
    const prop = isObj(target?.properties) ? target.properties[key] : undefined;
    return isObj(prop) && typeof prop.const === 'string' ? prop.const : undefined;
  };
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!isObj(node)) return;
    for (const unionKey of ['oneOf', 'anyOf']) {
      const members = node[unionKey];
      if (!Array.isArray(members) || members.length < 2) continue;
      for (const key of DISCRIMINATOR_KEYS) {
        const consts = members.map((m) => constOf(m, key));
        if (consts.every((c): c is string => c !== undefined)) {
          const mapping = Object.fromEntries(
            consts.map((c, i) => [c, (members[i] as Json).$ref as string]),
          );
          node.discriminator = { propertyName: key, mapping };
          break;
        }
      }
    }
    Object.values(node).forEach(visit);
  };
  visit(defs);
}

const omit = new Set(['$schema', '$id', 'id']);
const defs: Record<string, Json> = {};
for (const id of Object.keys(schemas).sort()) {
  const entries = Object.entries(schemas[id] as Json).filter(([key]) => !omit.has(key));
  defs[id] = stripFormatPatterns(Object.fromEntries(entries)) as Json;
}
addDiscriminators(defs);

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

// Class profiles for the API (threat_types seed): Python never reads packages/ at runtime
// (decision 49), so the values are exported here and covered by the CI no-diff check.
const threat: ReadonlySet<string> = new Set(ThreatClass.options);
const profiles = {
  _generated:
    'GENERATED FILE — DO NOT EDIT. Source: packages/shared/src/threats.ts; run `pnpm gen:schemas`.',
  classes: Object.fromEntries(
    Object.entries(CLASS_PROFILES).map(([cls, p]) => [cls, { isThreat: threat.has(cls), ...p }]),
  ),
};
mkdirSync(dirname(profilesFile), { recursive: true });
writeFileSync(profilesFile, `${JSON.stringify(profiles, null, 2)}\n`, 'utf8');
console.log(`Wrote ${Object.keys(CLASS_PROFILES).length} class profiles → ${profilesFile}`);

// Difficulty constants for the generator (SPEC §7.1), same pattern as the profiles.
const difficulty = {
  _generated:
    'GENERATED FILE — DO NOT EDIT. Source: packages/shared/src/difficulty.ts; run `pnpm gen:schemas`.',
  minWarningS: MIN_WARNING_S,
  firstTrackMaxS: FIRST_TRACK_MAX_S,
  firstTrackMaxDifficulty: FIRST_TRACK_MAX_DIFFICULTY,
};
writeFileSync(
  difficultyFile,
  `${JSON.stringify(difficulty, null, 2)}
`,
  'utf8',
);
console.log(`Wrote difficulty constants → ${difficultyFile}`);

// Time-of-day bands for the generator (decision 74), same pattern.
const timeBands = {
  _generated:
    'GENERATED FILE — DO NOT EDIT. Source: packages/shared/src/time-band.ts; run `pnpm gen:schemas`.',
  nightSunElDeg: NIGHT_SUN_EL_DEG,
  dayMinElDeg: DAY_MIN_EL_DEG,
  generatorWindowsDeg: GENERATOR_BAND_WINDOWS_DEG,
};
writeFileSync(
  timeBandsFile,
  `${JSON.stringify(timeBands, null, 2)}
`,
  'utf8',
);
console.log(`Wrote time bands → ${timeBandsFile}`);
