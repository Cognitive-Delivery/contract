#!/usr/bin/env node
/**
 * Rewrites every inlined copy of a schema from its source, so the copies cannot drift by hand.
 * `conformance/schema-checks.mjs` holds the identity check that fails when they do; this is the
 * tool that makes them identical again. The list of copies is `conformance/inlined-copies.mjs`.
 *
 *   node tooling/inline-granted-manifest.mjs
 *
 * Each copy keeps its own `description` (what the copy MEANS in that schema differs from what the
 * source means) and drops `$schema`, `$id` and `title`, which belong to a file, not a definition.
 * Copies are rewritten in list order, so a copy of a schema that itself carries a copy (the record's
 * `lease`, which carries the granted manifest) is taken after its source has been refreshed.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { INLINED_COPIES, inlinedBodyOf } from '../conformance/inlined-copies.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(here, '..', 'schemas');

const changed = [];
for (const { file, pointer, source } of INLINED_COPIES) {
  const sourceSchema = JSON.parse(await readFile(resolve(schemaDir, source), 'utf8'));
  const inlined = inlinedBodyOf(sourceSchema);
  const path = resolve(schemaDir, file);
  const text = await readFile(path, 'utf8');
  const schema = JSON.parse(text);
  let holder = schema;
  for (const key of pointer.slice(0, -1)) holder = holder[key];
  const last = pointer[pointer.length - 1];
  const previous = holder[last] ?? {};
  holder[last] = previous.description !== undefined ? { description: previous.description, ...inlined } : { ...inlined };
  const out = `${JSON.stringify(schema, null, 2)}\n`;
  if (out !== text) {
    await writeFile(path, out, 'utf8');
    changed.push(`schemas/${file}#/${pointer.join('/')}`);
  }
}
console.log(changed.length === 0 ? 'Every inlined copy is already identical to its source.' : `Rewrote: ${changed.join(', ')}`);
