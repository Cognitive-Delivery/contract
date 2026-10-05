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
import { runGuardTests } from './guard-tests.mjs';
import { runSchemaChecks } from './schema-checks.mjs';

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
  // Every `$id` names this major, at the host that serves it. `tooling/sync-version.mjs` writes
  // them; this is the check that nobody edited one by hand or forgot the sync on a major bump.
  const major = version.split('.')[0];
  const { readdir } = await import('node:fs/promises');
  const { idFor } = await import('../tooling/sync-version.mjs');
  for (const file of (await readdir(resolve(root, 'schemas'))).filter((n) => n.endsWith('.schema.json')).sort()) {
    const id = JSON.parse(await readFile(resolve(root, 'schemas', file), 'utf8')).$id;
    if (id !== idFor(major, file)) {
      problems.push(`schemas/${file} has $id ${id}, not ${idFor(major, file)} — run \`npm run version:sync\``);
    }
  }
  // The specification's header names the schema set it specifies.
  const spec = await readFile(resolve(root, 'SPEC-agent-lease-manifest.md'), 'utf8');
  if (!spec.includes(`Schema set ${major}.`)) {
    problems.push(`SPEC-agent-lease-manifest.md header does not name schema set ${major}.x`);
  }
  // Nothing anywhere still points at the host that never served the schemas.
  const { execFileSync } = await import('node:child_process');
  let stale = '';
  // Built from parts so this file does not match its own check.
  const oldHost = ['cognitivedelivery.co.uk', 'contract/'].join('/');
  try { stale = execFileSync('git', ['grep', '-l', oldHost, '--', 'schemas', 'fixtures', 'README.md', 'SPEC-agent-lease-manifest.md', 'conformance', ':!conformance/run.mjs'], { cwd: root, encoding: 'utf8' }); } catch { stale = ''; }
  if (stale.trim()) {
    problems.push(`these files still reference the old $id host, which never served the schemas: ${stale.trim().split('\n').join(', ')}`);
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
console.log(`Version ${currency.version} stated consistently in package.json (twice), README, CHANGELOG, schemas.lock.json, every $id and the SPEC header.`);

// The guard is a control, so it is tested like one: every finding seen to fire, every
// additive change seen to pass, the allow-list seen to refuse an entry without evidence.
const guard = await runGuardTests();
console.log(`Additive guard: ${guard.count} scenarios, ${guard.failures.length} failure(s).`);

// The schema set itself: strict compile, the inlined granted manifest identical to its
// source, and the package's own version statement. Held here, not in a consumer.
const schemaChecks = await runSchemaChecks();
console.log(`Schema checks: ${schemaChecks.schemaCount} schemas strict-compiled, identity and version checked, ${schemaChecks.failures.length} failure(s).`);

const failures = [...report.failures, ...currency.problems, ...guard.failures, ...schemaChecks.failures];

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):\n`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log('Conformant.');
