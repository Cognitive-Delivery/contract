#!/usr/bin/env node
/**
 * Prints one release's section of CHANGELOG.md. The release workflow uses it as the GitHub
 * Release's notes, so the release page says what the CHANGELOG says and nothing is written twice.
 *
 *   node tooling/changelog-section.mjs 1.1.0
 *
 * Exits 1 with a message when the section does not exist, which the release workflow turns
 * into a failed release: a tag with no CHANGELOG section is the version-currency defect the
 * test already refuses, and the release should not be the place it finally slips through.
 * The extraction itself is `conformance/changelog.mjs`, which `npm test` also exercises.
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { changelogSection } from '../conformance/changelog.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const version = process.argv[2];
if (!version) {
  console.error('usage: changelog-section.mjs <version>');
  process.exit(2);
}
const changelog = await readFile(resolve(here, '..', 'CHANGELOG.md'), 'utf8');
const section = changelogSection(changelog, version);
if (section === null) {
  console.error(`CHANGELOG.md has no "## [${version}]" section.`);
  process.exit(1);
}
process.stdout.write(`${section}\n`);
