#!/usr/bin/env node
/**
 * Writes the dereferenced manifest schema into every schema that carries an inlined copy of it,
 * so the copies cannot drift from the source by hand. `conformance/schema-checks.mjs` holds the
 * identity check that fails when they do; this is the tool that makes them identical again.
 *
 *   node tooling/inline-granted-manifest.mjs
 *
 * Copies:
 *   agent-lease.schema.json          #/definitions/grantedManifest
 *
 * Each copy keeps its own `description` (what the copy MEANS in that schema differs from what the
 * source means) and drops `$schema`, `$id` and `title`, which belong to a file, not a definition.
 * The identity check ignores exactly those four keys.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(here, '..', 'schemas');

const COPIES = [
  { file: 'agent-lease.schema.json', pointer: ['definitions', 'grantedManifest'] },
];

function dereference(node, source) {
  if (Array.isArray(node)) return node.map((item) => dereference(item, source));
  if (!node || typeof node !== 'object') return node;
  if (typeof node.$ref === 'string') {
    const key = node.$ref.replace('#/definitions/', '');
    if (!source.definitions || !(key in source.definitions)) throw new Error(`unresolvable $ref ${node.$ref}`);
    return dereference(structuredClone(source.definitions[key]), source);
  }
  return Object.fromEntries(
    Object.entries(node).filter(([k]) => k !== 'definitions').map(([k, v]) => [k, dereference(v, source)]),
  );
}

const manifest = JSON.parse(await readFile(resolve(schemaDir, 'agent-lease-manifest.schema.json'), 'utf8'));
const inlined = dereference(structuredClone(manifest), manifest);
for (const key of ['$schema', '$id', 'title', 'description']) delete inlined[key];

const changed = [];
for (const { file, pointer } of COPIES) {
  const path = resolve(schemaDir, file);
  const text = await readFile(path, 'utf8');
  const schema = JSON.parse(text);
  let holder = schema;
  for (const key of pointer.slice(0, -1)) holder = holder[key];
  const last = pointer[pointer.length - 1];
  const previous = holder[last] ?? {};
  // Keep the copy's own description first, then the source's shape in the source's key order.
  const next = previous.description !== undefined ? { description: previous.description, ...inlined } : { ...inlined };
  holder[last] = next;
  const out = `${JSON.stringify(schema, null, 2)}\n`;
  if (out !== text) {
    await writeFile(path, out, 'utf8');
    changed.push(`schemas/${file}#/${pointer.join('/')}`);
  }
}
console.log(changed.length === 0 ? 'Every inlined manifest copy is already identical to its source.' : `Rewrote: ${changed.join(', ')}`);
