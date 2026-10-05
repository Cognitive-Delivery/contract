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

/** Inline every `$ref` into `#/definitions/<key>` of `source`, dropping `definitions` itself. */
function dereference(node, source) {
  if (Array.isArray(node)) {
    return node.map((item) => dereference(item, source));
  }
  if (!node || typeof node !== 'object') {
    return node;
  }
  if (typeof node.$ref === 'string') {
    const key = node.$ref.replace('#/definitions/', '');
    if (!source.definitions || !(key in source.definitions)) {
      throw new Error(`unresolvable $ref ${node.$ref}`);
    }
    return dereference(structuredClone(source.definitions[key]), source);
  }
  return Object.fromEntries(
    Object.entries(node).filter(([k]) => k !== 'definitions').map(([k, v]) => [k, dereference(v, source)]),
  );
}

export async function runSchemaChecks() {
  const failures = [];
  const schemas = await loadSchemas();

  // 1. Strict compile.
  for (const [file, schema] of schemas) {
    try {
      new Ajv({ strict: true, allErrors: true, allowUnionTypes: true }).compile(schema);
    } catch (error) {
      failures.push(`strict/${file}: ${error.message.split('\n')[0]}`);
    }
  }

  // 2. The inlined granted manifest is the manifest schema, dereferenced.
  const manifest = schemas.get('agent-lease-manifest.schema.json');
  const lease = schemas.get('agent-lease.schema.json');
  if (manifest && lease) {
    const expected = dereference(structuredClone(manifest), manifest);
    const actual = structuredClone(lease.definitions?.grantedManifest ?? {});
    for (const key of ['$schema', '$id', 'title', 'description']) {
      delete expected[key];
      delete actual[key];
    }
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      failures.push('identity/agent-lease.schema.json#/definitions/grantedManifest has drifted from agent-lease-manifest.schema.json. Regenerate the inlined copy from the source.');
    }
  } else {
    failures.push('identity: agent-lease-manifest.schema.json or agent-lease.schema.json is missing.');
  }

  // 3. The package's own statement of the schema-set version.
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const stated = pkg.cdfContract?.schemaSetVersion;
  if (stated !== pkg.version) {
    failures.push(`version/package.json cdfContract.schemaSetVersion is ${stated}, not ${pkg.version}.`);
  }

  return { schemaCount: schemas.size, failures };
}
