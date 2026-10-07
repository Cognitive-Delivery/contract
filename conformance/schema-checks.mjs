/**
 * Checks on the schema set itself, run by `npm test`. These used to live in the consuming
 * harness's tests, which meant the contract's own CI could not fail on them: a documented
 * control that did not act, in the repository whose job is to be checkable by strangers.
 *
 *   1. Every schema compiles under Ajv strict mode. Strict mode refuses unknown keywords and
 *      ambiguous constructs that a lenient compiler silently ignores — and a keyword Ajv
 *      ignores is a constraint no implementation enforces.
 *   2. Every inlined copy (the granted manifest in agent-lease.schema.json, the manifest and the
 *      lease in lease-record.schema.json) is byte-for-byte its source schema, dereferenced
 *      (`inlined-copies.mjs`). The contract keeps every schema self-contained, so the copies
 *      exist; this is what stops them drifting.
 *   3. Every schema validates against conformance/metaschema.json: the dialect, `$id`, title and
 *      description conventions, no `format`, and a stability `$comment` on every declared
 *      property.
 *   4. schemas/index.json is valid against its own schema (`schema-index.mjs`) and current with
 *      the schemas, so a registry entry never points at a file the index does not know.
 *   5. package.json's `cdfContract.schemaSetVersion` matches the package version. The version
 *      currency check in run.mjs covers the README, CHANGELOG and lock; this field had been
 *      left out and sat stale at 1.0.0 through two releases.
 *   6. No `description`, `title` or `$comment` anywhere in a schema contains the block-comment
 *      terminator (star then slash). The type generator writes description text into doc comments
 *      in a consumer's source tree; it escapes the terminator, and this refuses the text in the
 *      first place, so the protection does not rest on one function. The check is watched firing
 *      on a sample every run, because a check nobody has seen fail is a sentence in a comment.
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

const ANNOTATIONS = ['description', 'title', '$comment'];

/**
 * Every annotation in a schema tree that carries the block-comment terminator, as JSON pointers.
 * Only string values are annotations: a property NAMED `description` under `properties` is a
 * schema, and is walked rather than read.
 */
export function commentTerminatorSites(node, pointer = '') {
  const sites = [];
  if (Array.isArray(node)) {
    node.forEach((child, i) => sites.push(...commentTerminatorSites(child, `${pointer}/${i}`)));
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      const here = `${pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
      if (ANNOTATIONS.includes(key) && typeof value === 'string') {
        if (value.includes('*/')) sites.push(here);
      } else {
        sites.push(...commentTerminatorSites(value, here));
      }
    }
  }
  return sites;
}

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

  // 3. Conventions: every schema validates against conformance/metaschema.json (dialect, $id,
  //     title, description; no `format`; a stability $comment on every declared property).
  const meta = JSON.parse(await readFile(resolve(here, 'metaschema.json'), 'utf8'));
  const conventions = new Ajv({ strict: false, allErrors: true }).compile(meta);
  for (const [file, schema] of schemas) {
    if (!conventions(schema)) {
      const first = conventions.errors.slice(0, 3).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');
      failures.push(`conventions/${file}: ${first}${conventions.errors.length > 3 ? ` (+${conventions.errors.length - 3} more)` : ''}`);
    }
  }

  // 4. The schema index (schemas/index.json) is valid against its own schema and current with
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

  // 5. The package's own statement of the schema-set version.
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const stated = pkg.cdfContract?.schemaSetVersion;
  if (stated !== pkg.version) {
    failures.push(`version/package.json cdfContract.schemaSetVersion is ${stated}, not ${pkg.version}.`);
  }

  // 6. No annotation can close a generated doc comment. Seen firing first, on a sample with the
  //     terminator at each annotation keyword and a property named `description` that is clean.
  const sample = {
    title: 'a */ b',
    properties: { description: { type: 'string', description: 'clean' }, x: { $comment: '*/' } },
    definitions: { d: { description: 'x */ export const y = 1; /**' } },
  };
  const fired = commentTerminatorSites(sample).sort();
  const wanted = ['/definitions/d/description', '/properties/x/$comment', '/title'];
  if (JSON.stringify(fired) !== JSON.stringify(wanted)) {
    failures.push(`comment-terminator/self-test: expected ${JSON.stringify(wanted)}, got ${JSON.stringify(fired)}`);
  }
  for (const [file, schema] of schemas) {
    for (const site of commentTerminatorSites(schema)) {
      failures.push(`comment-terminator/${file}#${site}: contains the block-comment terminator, which would end a generated doc comment.`);
    }
  }

  return { schemaCount: schemas.size, failures };
}
