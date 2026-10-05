#!/usr/bin/env node
/**
 * Writes `conformance/suite/<shape>.json` in the official JSON-Schema-Test-Suite format from the
 * schemas and fixtures. Run by `npm run lock`; `npm test` fails when the export is stale. The
 * building is `conformance/suite-export.mjs`, which ships in the package; this is the writer.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSuite, serialiseSuite } from '../conformance/suite-export.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, '..', 'conformance', 'suite');

await mkdir(dir, { recursive: true });
const suite = await buildSuite();
let tests = 0;
for (const [file, cases] of Object.entries(suite)) {
  await writeFile(join(dir, file), serialiseSuite(cases), 'utf8');
  tests += cases.reduce((n, c) => n + c.tests.length, 0);
}
console.log(`Wrote ${Object.keys(suite).length} suite file(s) with ${tests} tests to conformance/suite/.`);
