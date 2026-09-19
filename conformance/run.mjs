#!/usr/bin/env node
/**
 * Runs the conformance corpus against the reference adapter and exits non-zero on any failure.
 *
 * `npm test` in this repository is this file. It is what makes the claim in the README
 * checkable by someone who has never met the product: clone, install, run, read the exit code.
 */

import { runConformance } from './runner.mjs';
import { createAjvAdapter } from './ajv-adapter.mjs';

const adapter = await createAjvAdapter();
const report = await runConformance(adapter);

console.log(
  `Conformance: ${report.validCount} valid fixtures, ${report.invalidCount} rejections, `
  + `canonical bytes ${report.canonicalChecked ? 'checked' : 'NOT CHECKED (adapter offers no canonicalise)'}.`,
);

if (report.failures.length > 0) {
  console.error(`\n${report.failures.length} failure(s):\n`);
  for (const failure of report.failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log('Conformant.');
