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
import { runLayoutCheck } from './layout-check.mjs';
import { runSiteCheck } from './site-check.mjs';
import { idFor } from './ids.mjs';
import { changelogSection } from './changelog.mjs';
import { runTraceabilityCheck } from './traceability-check.mjs';
import { staleSuiteFiles } from './suite-export.mjs';
import { runClaimsCheck } from './claims-check.mjs';

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
  // The release workflow publishes this section as the GitHub Release's notes, so it has to
  // extract to something: a heading with an empty body would release an empty page.
  const section = changelogSection(changelog, version);
  if (section === null || section.trim() === '' || section.trim() === 'Nothing yet.') {
    problems.push(`CHANGELOG.md section [${version}] is missing or empty — the release notes come from it`);
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
  // `idFor` comes from ./ids.mjs, which ships in the package: importing it from tooling/ is what
  // stopped the installed package running this file at all (review of 5 October 2026).
  const major = version.split('.')[0];
  const { readdir } = await import('node:fs/promises');
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
  // stderr ignored: from the installed package there is no repository, and "not a git
  // repository" is the expected answer there, not a finding.
  try { stale = execFileSync('git', ['grep', '-l', oldHost, '--', 'schemas', 'fixtures', 'README.md', 'SPEC-agent-lease-manifest.md', 'conformance', ':!conformance/run.mjs'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { stale = ''; }
  if (stale.trim()) {
    problems.push(`these files still reference the old $id host, which never served the schemas: ${stale.trim().split('\n').join(', ')}`);
  }
  return { version, problems };
}

const adapter = await createAjvAdapter();
const report = await runConformance(adapter);

console.log(
  `Conformance: ${report.validCount} valid fixtures, ${report.invalidCount} rejections, `
  + `canonical bytes ${report.canonicalChecked ? 'checked' : 'NOT CHECKED (adapter offers no canonicalise)'}, `
  + `narrowing ${report.narrowingChecked ? 'checked' : 'vectors well-formed, behaviour NOT CHECKED (the reference adapter validates only; the reference implementation runs them in its own suite)'}, `
  + `signatures ${report.signaturesChecked ? 'checked' : 'NOT CHECKED (adapter offers no hash/verify)'}, `
  + `lease rules ${report.rulesChecked ? 'checked' : 'by-rule fixtures schema-valid, rules NOT CHECKED (adapter offers no rules)'}, `
  + `rejection paths ${report.errorPathsChecked ? 'checked' : 'NOT CHECKED (adapter reports no errors)'}.`,
);

const currency = await checkVersionCurrency();
console.log(`Version ${currency.version} stated consistently in package.json (twice), README, CHANGELOG, schemas.lock.json, every $id and the SPEC header.`);

// The guard is a control, so it is tested like one: every finding seen to fire, every
// additive change seen to pass, the allow-list seen to refuse an entry without evidence.
const guard = await runGuardTests();
console.log(guard.present
  ? `Additive guard: ${guard.count} scenarios, ${guard.failures.length} failure(s).`
  : 'Additive guard: NOT PRESENT in this package (check-additive.mjs ships with the repository, not the tarball); its scenarios run from a clone.');

// The schema set itself: strict compile, the inlined granted manifest identical to its
// source, and the package's own version statement. Held here, not in a consumer.
const schemaChecks = await runSchemaChecks();
console.log(`Schema checks: ${schemaChecks.schemaCount} schemas strict-compiled, identity and version checked, ${schemaChecks.failures.length} failure(s).`);

// The README's Layout block names every file, or a reader learns about a file by stumbling on
// it. Repository only: the tarball is a documented subset.
const layout = await runLayoutCheck(resolve(here, '..'));
console.log(layout.checked
  ? `Layout: README.md names every entry at the top level and under conformance/, fixtures/ and tooling/, ${layout.failures.length} failure(s).`
  : 'Layout: NOT CHECKED (published package; the repository check runs from a clone).');

// The site, built twice into temporary directories from this tree and checked before anything
// deploys it: every link and anchor resolves, every schema and document has a page, the `$id`
// bytes are untouched, no page carries a script, every stylesheet, icon, image and font a page
// loads is the site's own file (`assets`), and the two builds are the same bytes. The generator
// and `marked` are not in the package, so from the tarball the check says so rather than failing
// a documented subset.
const site = await runSiteCheck(resolve(here, '..'));
if (site.checked) {
  console.log(`Site: ${site.pages} pages, ${site.links} links, ${site.assets} assets, ${site.failures.length} failure(s).`);
  console.log(`Site: external hosts linked by href: ${site.externalHosts.length > 0 ? site.externalHosts.join(', ') : 'none'}.`);
} else {
  console.log(`Site: NOT CHECKED (${site.reason}).`);
}

// Every normative clause of the SPEC is answered by a named fixture, vector, check or rule, or
// excluded with a reason; an edited clause must be re-affirmed.
const trace = await runTraceabilityCheck();
console.log(`Traceability: ${trace.clauseCount} SPEC clauses mapped, ${trace.excluded} excluded with a reason, ${trace.failures.length} failure(s).`);

// The suite other validators run (conformance/suite/, official JSON-Schema-Test-Suite format) is
// the corpus this runner just ran, or it is stale and says so.
const stale = await staleSuiteFiles();
console.log(stale.length === 0
  ? 'Suite export: conformance/suite/ is current with the schemas and fixtures.'
  : `Suite export: ${stale.length} stale file(s) — run \`npm run lock\`.`);
const suiteFailures = stale.map((f) => `suite: conformance/suite/${f} is stale; run \`npm run lock\` and commit it.`);

// Every count and list the documents state, recomputed from the repository: a number in prose is
// a fact with a short half-life unless something checks it (the fourth review found twenty-two
// that had gone stale). A claim whose source is not in the package, or that needs the release tags,
// is listed NOT CHECKED rather than passed.
const claims = await runClaimsCheck();
console.log(`Claims: ${claims.checked} checked, ${claims.failures.length} failure(s).`);
if (claims.notChecked.length > 0) {
  const byReason = new Map();
  for (const n of claims.notChecked) byReason.set(n.reason, [...(byReason.get(n.reason) ?? []), n.id]);
  console.log(`Claims: ${claims.notChecked.length} NOT CHECKED (\`node conformance/claims-check.mjs\` lists each): ${[...byReason].map(([reason, ids]) => `${ids.length} because ${reason}`).join('; ')}.`);
}

const failures = [...report.failures, ...currency.problems, ...guard.failures, ...schemaChecks.failures, ...layout.failures, ...site.failures, ...trace.failures, ...suiteFailures, ...claims.failures];

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):\n`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log('Conformant.');
