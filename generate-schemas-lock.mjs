#!/usr/bin/env node
/**
 * Generates contract/schemas.lock.json — the normalised digest that makes the additive-only
 * rule mechanical rather than a sentence in a README.
 *
 * For every schema it records, per property path: its type, whether it is required, and any
 * closed enum. That is enough to detect the four changes that break `1.x`:
 *
 *   - a new REQUIRED field         (an older writer's records stop validating)
 *   - a REMOVED field              (an older reader loses data it depended on)
 *   - a RETYPED field              (both sides disagree about what they are reading)
 *   - a NARROWED enum              (a value that was legal becomes illegal)
 *
 * A new OPTIONAL field is allowed and simply updates the lock. That is the whole point: adding
 * is safe, and everything else needs a major version and a migration, because customers have
 * these files in their repositories and older readers are still reading them.
 *
 * Run via `npm run generate:contract-lock`. The comparison lives in
 * test/unit/contractCompatibility.test.ts.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(here, 'schemas');
const lockPath = resolve(here, 'schemas.lock.json');

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
      entry.enum = [...node.enum].map(String).sort();
    }
    if (node.$ref) {
      entry.ref = node.$ref;
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
  for (const [key, child] of Object.entries(node.definitions ?? {})) {
    digest(child, `#${key}`, false, out);
  }
  for (const branch of node.anyOf ?? []) {
    digest(branch, path, required, out);
  }
}

export async function buildLock() {
  const files = (await readdir(schemaDir)).filter((n) => n.endsWith('.json')).sort();
  const schemas = {};

  for (const file of files) {
    const schema = JSON.parse(await readFile(join(schemaDir, file), 'utf8'));
    const flat = {};
    digest(schema, '', false, flat);
    schemas[file] = Object.fromEntries(Object.keys(flat).sort().map((k) => [k, flat[k]]));
  }

  const version = JSON.parse(await readFile(resolve(here, 'package.json'), 'utf8')).version;

  return {
    note: 'Generated. The additive-only rule for 1.x is enforced against this file by test/unit/contractCompatibility.test.ts.',
    schemaSetVersion: version,
    major: version.split('.')[0],
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
