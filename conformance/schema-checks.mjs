/**
 * Checks on the schema set itself, run by `npm test`. These used to live in the consuming
 * harness's tests, which meant the contract's own CI could not fail on them: a documented
 * control that did not act, in the repository whose job is to be checkable by strangers.
 *
 *   1. Every schema compiles under Ajv strict mode. Strict mode refuses unknown keywords and
 *      ambiguous constructs that a lenient compiler silently ignores — and a keyword Ajv
 *      ignores is a constraint no implementation enforces.
 *   2. The granted manifest inlined in agent-lease.schema.json is byte-for-byte the manifest
 *      schema, dereferenced. The contract keeps every schema self-contained, so the copy
 *      exists; this is what stops it drifting.
 *   3. package.json's `cdfContract.schemaSetVersion` matches the package version. The version
 *      currency check in run.mjs covers the README, CHANGELOG and lock; this field had been
 *      left out and sat stale at 1.0.0 through two releases.
 */

import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

import { INLINED_COPIES, inlinedBodyOf } from './inlined-copies.mjs';
import { INDEX_SCHEMA, indexStaleness } from './schema-index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const schemaDir = resolve(root, 'schemas');

async function loadSchemas() {
  const files = (await readdir(schemaDir)).filter((n) => n.endsWith('.schema.json')).sort();
  const out = new Map();
  for (const file of files) {
    out.set(file, JSON.parse(await readFile(join(schemaDir, file), 'utf8')));
  }
  return out;
}


export async function runSchemaChecks() {
  const failures = [];
  const schemas = await loadSchemas();

  // 1. Strict compile.
  for (const [file, schema] of schemas) {
    try {
      // strictRequired is left off: `required` inside an `anyOf`/`oneOf` branch or an `if` clause,
      // with the property defined on the parent, is ordinary JSON Schema and Ajv's strictRequired
      // cannot see the parent from the branch. Every other strict check stays on.
      // No custom keyword is registered: Bowtie showed Ajv's strict mode in another harness refusing
      // one, and a schema only this repository's Ajv can compile is not portable. Annotations use
      // `$comment`, which draft-07 defines.
      new Ajv({ strict: true, strictRequired: false, allErrors: true, allowUnionTypes: true }).compile(schema);
    } catch (error) {
      failures.push(`strict/${file}: ${error.message.split('\n')[0]}`);
    }
  }

  // 2. Every inlined copy is its source, dereferenced (`conformance/inlined-copies.mjs`): the
  //    granted manifest in the lease, and the manifest and the lease in the record.
  for (const { file, pointer, source } of INLINED_COPIES) {
    const sourceSchema = schemas.get(source);
    const holder = schemas.get(file);
    if (!sourceSchema || !holder) {
      failures.push(`identity: ${source} or ${file} is missing.`);
      continue;
    }
    const expected = inlinedBodyOf(sourceSchema);
    let actual = holder;
    for (const key of pointer) actual = actual?.[key];
    actual = structuredClone(actual ?? {});
    delete actual.description;
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      failures.push(`identity/${file}#/${pointer.join('/')} has drifted from ${source}. Run \`node tooling/inline-granted-manifest.mjs\`.`);
    }
  }

  // 2c. Conventions: every schema validates against conformance/metaschema.json (dialect, $id,
  //     title, description; no `format`; a stability $comment on every declared property).
  const meta = JSON.parse(await readFile(resolve(here, 'metaschema.json'), 'utf8'));
  const conventions = new Ajv({ strict: false, allErrors: true }).compile(meta);
  for (const [file, schema] of schemas) {
    if (!conventions(schema)) {
      const first = conventions.errors.slice(0, 3).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');
      failures.push(`conventions/${file}: ${first}${conventions.errors.length > 3 ? ` (+${conventions.errors.length - 3} more)` : ''}`);
    }
  }

  // 2d. The schema index (schemas/index.json) is valid against its own schema and current with
  //     the schemas: a registry entry that points at a file the index does not know is a registry
  //     entry nobody checked.
  try {
    const index = JSON.parse(await readFile(resolve(root, 'schemas', 'index.json'), 'utf8'));
    const validIndex = new Ajv({ strict: true, allErrors: true }).compile(INDEX_SCHEMA);
    if (!validIndex(index)) {
      failures.push(`index/schemas/index.json: ${validIndex.errors.slice(0, 3).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')}`);
    }
  } catch (error) {
    failures.push(`index/schemas/index.json: ${error.message}`);
  }
  const indexStale = await indexStaleness();
  if (indexStale) failures.push(`index/${indexStale} — run \`npm run lock\` and commit it.`);

  // 3. The package's own statement of the schema-set version.
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const stated = pkg.cdfContract?.schemaSetVersion;
  if (stated !== pkg.version) {
    failures.push(`version/package.json cdfContract.schemaSetVersion is ${stated}, not ${pkg.version}.`);
  }

  return { schemaCount: schemas.size, failures };
}
