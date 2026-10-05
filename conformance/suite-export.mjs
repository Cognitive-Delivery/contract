/**
 * The corpus in the official JSON-Schema-Test-Suite format, so validators that are not this
 * runner can run it: one file per schema under `conformance/suite/draft7/` (Bowtie reads the dialect
 * from the directory's name, as in the official suite's `tests/draft7`), each a JSON array of test
 * cases `{ description, schema, tests: [{ description, data, valid }] }`
 * (https://github.com/json-schema-org/JSON-Schema-Test-Suite, test-schema.json).
 *
 * One case per schema, carrying the full self-contained schema (every `$ref` is local, so no
 * remote needs configuring) and every fixture as a test: `fixtures/valid/` with `valid: true`,
 * `fixtures/invalid/` with `valid: false`, and `fixtures/invalid-by-rule/` with `valid: true`
 * and a description saying which SPEC §6 rule refuses it, because the schema accepts it and the
 * rule is what the other half of the corpus tests. Written by `npm run lock`
 * (`tooling/export-suite.mjs`); `npm test` fails when the committed export is stale, so the
 * suite another validator runs is always the corpus this runner runs. CI runs it through Bowtie
 * against six implementations in six languages, which is what "a reader in any language" means
 * once it is checked rather than claimed.
 */

import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

async function fixturesOf(kind) {
  const dir = join(root, 'fixtures', kind);
  let files = [];
  try { files = await readdir(dir); } catch { return []; }
  const out = [];
  for (const file of files.filter((n) => n.endsWith('.json') && !n.endsWith('.expect.json')).sort()) {
    const name = file.replace(/\.json$/, '');
    let rule = null;
    if (kind === 'invalid-by-rule') {
      try { rule = JSON.parse(await readFile(join(dir, `${name}.expect.json`), 'utf8')).rule ?? null; } catch { rule = null; }
    }
    out.push({ name, data: JSON.parse(await readFile(join(dir, file), 'utf8')), kind, rule });
  }
  return out;
}

/** `{ [file]: cases[] }`, one entry per schema, deterministic. */
export async function buildSuite() {
  const schemaFiles = (await readdir(join(root, 'schemas'))).filter((n) => n.endsWith('.schema.json')).sort();
  const fixtures = [...(await fixturesOf('valid')), ...(await fixturesOf('invalid')), ...(await fixturesOf('invalid-by-rule'))];
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const suite = {};
  for (const file of schemaFiles) {
    const shape = file.replace(/\.schema\.json$/, '');
    const schema = JSON.parse(await readFile(join(root, 'schemas', file), 'utf8'));
    const tests = fixtures
      .filter((f) => f.name.startsWith(`${shape}.`))
      .map((f) => ({
        description: f.kind === 'valid' ? `${f.name} validates`
          : f.kind === 'invalid' ? `${f.name} is refused`
            : `${f.name} is schema-valid and refused by SPEC §6 rule ${f.rule ?? '?'}, which the schema cannot state`,
        data: f.data,
        valid: f.kind !== 'invalid',
      }));
    // One case per schema would be simplest, but a harness that reads a case as one line of JSON
    // (Bowtie's Go harness, bufio.Scanner, 64 KiB) errors on every test of a case above that
    // size, and the plugin manifest with its stability comments is 66 KB as one line. So the
    // tests are chunked into cases that each serialise under CASE_LINE_BUDGET bytes, every case
    // carrying the full schema; a schema alone above the budget still gets one test per case,
    // which is the best that can be done without changing what is tested.
    const cases = [];
    const title = `${schema.title ?? shape} (${file}, @cognitive-delivery/contract ${pkg.version})`;
    let chunk = [];
    const lineLength = (list, index) => JSON.stringify({ description: `${title}: fixtures ${index}`, schema, tests: list }).length;
    for (const test of tests) {
      if (chunk.length > 0 && lineLength([...chunk, test], cases.length + 1) > CASE_LINE_BUDGET) {
        cases.push(chunk);
        chunk = [];
      }
      chunk.push(test);
    }
    if (chunk.length > 0) cases.push(chunk);
    suite[`${shape}.json`] = cases.map((list, i) => ({
      description: cases.length === 1
        ? `${title}: every fixture of the conformance corpus`
        : `${title}: fixtures, part ${i + 1} of ${cases.length}`,
      schema,
      tests: list,
    }));
  }
  return suite;
}

/** Bytes per serialised case, with headroom under the 64 KiB a line-reading harness allows. */
export const CASE_LINE_BUDGET = 60000;

export function serialiseSuite(cases) {
  return `${JSON.stringify(cases, null, 2)}\n`;
}

/** Files under `conformance/suite/` that differ from what `buildSuite()` produces now. */
export async function staleSuiteFiles() {
  const suite = await buildSuite();
  const dir = join(here, 'suite', 'draft7');
  const stale = [];
  let present = [];
  try { present = (await readdir(dir)).filter((n) => n.endsWith('.json')); } catch { present = []; }
  for (const [file, cases] of Object.entries(suite)) {
    let text = null;
    try { text = await readFile(join(dir, file), 'utf8'); } catch { text = null; }
    if (text !== serialiseSuite(cases)) stale.push(file);
  }
  for (const file of present) if (!(file in suite)) stale.push(`${file} (no such schema)`);
  return stale;
}
