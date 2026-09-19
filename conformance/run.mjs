#!/usr/bin/env node
/**
 * Runs the conformance corpus against the reference adapter and exits non-zero on any failure.
 *
 * `npm test` in this repository is this file. It is what makes the claim in the README
 * checkable by someone who has never met the product: clone, install, run, read the exit code.
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runConformance } from './runner.mjs';
import { createAjvAdapter } from './ajv-adapter.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The repository's own version, stated in four places, checked as one.
 *
 * Not a conformance property — a currency one, and it belongs in `npm test` because that is what
 * runs on every push. The README's version line silently fell behind on the 1.0.1 bump and was
 * caught by a person reading it, which is the failure mode this repository argues against
 * everywhere else. A version in prose is a fact with a short half-life unless something checks it.
 */
async function checkVersionCurrency() {
  const root = resolve(here, '..');
  const [pkg, readme, changelog, lock] = await Promise.all([
    readFile(resolve(root, 'package.json'), 'utf8'),
    readFile(resolve(root, 'README.md'), 'utf8'),
    readFile(resolve(root, 'CHANGELOG.md'), 'utf8'),
    readFile(resolve(root, 'schemas.lock.json'), 'utf8'),
  ]);
  const version = JSON.parse(pkg).version;
  const problems = [];
  if (!readme.includes(`Version **${version}**`)) {
    problems.push(`README.md does not carry "Version **${version}**"`);
  }
  if (!changelog.includes(`## [${version}]`)) {
    problems.push(`CHANGELOG.md has no "## [${version}]" section`);
  }
  if (!changelog.includes(`[${version}]: https://`)) {
    problems.push(`CHANGELOG.md has no link definition for [${version}]`);
  }
  // schemas.lock.json was the one that actually escaped. `check:additive` reported "Lock is
  // current" on a lock carrying the PREVIOUS version, because it compares schema shapes and
  // never looks at the version field — so 1.0.1 published with a stale lock and it took a
  // DOWNSTREAM consumer's test to notice. A gate that cannot fail on its own artefact is not
  // guarding it.
  const lockVersion = JSON.parse(lock).schemaSetVersion;
  if (lockVersion !== version) {
    problems.push(`schemas.lock.json records schemaSetVersion ${lockVersion}, not ${version} — run \`npm run lock\``);
  }
  return { version, problems };
}

const adapter = await createAjvAdapter();
const report = await runConformance(adapter);

console.log(
  `Conformance: ${report.validCount} valid fixtures, ${report.invalidCount} rejections, `
  + `canonical bytes ${report.canonicalChecked ? 'checked' : 'NOT CHECKED (adapter offers no canonicalise)'}.`,
);

const currency = await checkVersionCurrency();
console.log(`Version ${currency.version} stated consistently in package.json, README, CHANGELOG and schemas.lock.json.`);

const failures = [...report.failures, ...currency.problems];

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):\n`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log('Conformant.');
