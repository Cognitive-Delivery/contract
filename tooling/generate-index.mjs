#!/usr/bin/env node
/**
 * Writes `schemas/index.json`: one entry per schema with its file, `$id`, title, dialect and the
 * file patterns a registry (SchemaStore, an editor) matches it to. Run by `npm run lock`;
 * `conformance/schema-checks.mjs` validates the file and fails when it is stale. The building is
 * `conformance/schema-index.mjs`, which ships in the package; this is the writer.
 */

import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIndex, serialiseIndex } from '../conformance/schema-index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const index = await buildIndex();
await writeFile(resolve(here, '..', 'schemas', 'index.json'), serialiseIndex(index), 'utf8');
console.log(`Wrote schemas/index.json with ${index.schemas.length} entries.`);
