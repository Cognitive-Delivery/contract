#!/usr/bin/env node
/**
 * Generates schemas.lock.json — the normalised digest that makes the additive-only
 * rule mechanical rather than a sentence in a README.
 *
 * For every schema it records, per property path: its type, whether it is required, any
 * closed enum, and — since lock format 2 — the constraints that can be TIGHTENED without
 * changing the type: `pattern`, the `allOf[].not.pattern` set, `minLength`, `maxLength`,
 * `minimum`, `maximum`, `additionalProperties` and the number of `anyOf` branches. Per
 * schema it records the content model (open or closed) at the root.
 *
 * That is enough for check-additive.mjs to detect every change that breaks `1.x`:
 *
 *   - a new REQUIRED field          (an older writer's records stop validating)
 *   - a REMOVED field               (an older reader loses data it depended on)
 *   - a RETYPED field               (both sides disagree about what they are reading)
 *   - a NARROWED enum               (a value that was legal becomes illegal)
 *   - a TIGHTENED pattern or bound  (a value that was legal becomes illegal)   [format 2]
 *   - a CLOSED content model        (a key that was carried is now refused)    [format 2]
 *   - a CHANGED union               (a branch that accepted a form is gone)    [format 2]
 *
 * Lock format 1 recorded only the first four, which is how 1.0.x could have tightened a
 * pattern unseen. A baseline in format 1 is still comparable for those four; the newer
 * findings are reported as not comparable rather than silently passed.
 *
 * Run via `npm run lock`. The comparison lives in check-additive.mjs.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(here, 'schemas');
const lockPath = resolve(here, 'schemas.lock.json');

export const LOCK_FORMAT = 2;

function compareJson(a, b) {
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * The patterns a value must NOT match, expressed as `allOf: [{ not: { pattern } }, …]`.
 * This is how a path rule is written without lookahead (RFC 9485 I-Regexp has none), so the
 * lock has to see it as the constraint it is: adding one tightens, removing one loosens.
 */
function notPatternsOf(node) {
  return (node.allOf ?? [])
    .filter((branch) => branch && typeof branch === 'object' && branch.not && typeof branch.not.pattern === 'string')
    .map((branch) => branch.not.pattern)
    .sort();
}

/** Walk a schema and emit a flat path → shape map. Deterministic: keys are sorted on write. */
function digest(node, path, required, out) {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (path) {
    const entry = { required };
    if (node.type !== undefined) {
      entry.type = Array.isArray(node.type) ? [...node.type].sort() : node.type;
    }
    if (Array.isArray(node.enum)) {
      // Values keep their JSON type: [1, 2] and ["1", "2"] are different contracts.
      entry.enum = [...node.enum].sort(compareJson);
    }
    if (node.$ref) {
      entry.ref = node.$ref;
    }
    if (typeof node.pattern === 'string') {
      entry.pattern = node.pattern;
    }
    const nots = notPatternsOf(node);
    if (nots.length > 0) {
      entry.notPatterns = nots;
    }
    for (const bound of ['minLength', 'maxLength', 'minimum', 'maximum']) {
      if (typeof node[bound] === 'number') {
        entry[bound] = node[bound];
      }
    }
    if (node.additionalProperties !== undefined) {
      entry.additionalProperties = typeof node.additionalProperties === 'boolean' ? node.additionalProperties : 'schema';
    }
    if (Array.isArray(node.anyOf)) {
      entry.anyOf = node.anyOf.length;
    }
    out[path] = entry;
  }

  const requiredHere = new Set(node.required ?? []);
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    digest(child, path ? `${path}.${key}` : key, requiredHere.has(key), out);
  }
  if (node.items) {
    digest(node.items, `${path}[]`, false, out);
  }
  if (node.additionalProperties && typeof node.additionalProperties === 'object') {
    // The shape of every unnamed member, e.g. the scalar-only `details` values.
    digest(node.additionalProperties, `${path}.*`, false, out);
  }
  for (const [key, child] of Object.entries(node.definitions ?? {})) {
    digest(child, `#${key}`, false, out);
  }
  for (const branch of node.anyOf ?? []) {
    digest(branch, path, required, out);
  }
}

/** Open unless the root says otherwise. JSON Schema's default is open, and so is the contract's. */
function contentModelOf(schema) {
  return schema.additionalProperties === false ? 'closed' : 'open';
}

export async function buildLock() {
  const files = (await readdir(schemaDir)).filter((n) => n.endsWith('.json')).sort();
  const schemas = {};
  const contentModels = {};

  for (const file of files) {
    const schema = JSON.parse(await readFile(join(schemaDir, file), 'utf8'));
    const flat = {};
    digest(schema, '', false, flat);
    schemas[file] = Object.fromEntries(Object.keys(flat).sort().map((k) => [k, flat[k]]));
    contentModels[file] = contentModelOf(schema);
  }

  const version = JSON.parse(await readFile(resolve(here, 'package.json'), 'utf8')).version;

  return {
    note: 'Generated by generate-schemas-lock.mjs. The additive-only rule for 1.x is enforced against this file by check-additive.mjs. schemaSetVersion is the PACKAGE version; only `major` is load-bearing. lockFormat 2 records patterns, bounds, content models and union sizes as well as types, required and enums.',
    lockFormat: LOCK_FORMAT,
    // NOTE ON THE NAME. This is the PACKAGE version, and 1.0.1 is where that first stopped
    // being the same thing as the schema set's version: it changed nothing in schemas/, because
    // it released the specification and the canonical-bytes vectors. Only `major` is
    // load-bearing — the additive-only rule is scoped to it — and a tooling-only release cannot
    // move a major, so nothing downstream is affected.
    schemaSetVersion: version,
    major: version.split('.')[0],
    contentModels,
    schemas,
  };
}

async function main() {
  const lock = await buildLock();
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${lockPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
