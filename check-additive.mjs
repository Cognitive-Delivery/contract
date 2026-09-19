#!/usr/bin/env node
/**
 * The additive-only guard, run against a baseline rather than against itself.
 *
 * `schemas.lock.json` records the shape of the schema set. Comparing the lock with the schemas
 * that sit beside it catches nothing, because a change that regenerates the lock agrees with
 * the lock: the file heals the moment it is broken. The comparison that means something is
 * against the shape as it was *before* the change, which in CI is the base branch and locally
 * is the previous commit.
 *
 * Two things are checked:
 *
 *   1. **Drift.** The committed lock matches the schemas beside it. A schema change that did
 *      not regenerate the lock leaves no record of what the shape used to be, which is what
 *      the next comparison needs.
 *   2. **Compatibility.** Against the baseline, within one major version, only additions are
 *      allowed. A new required field, a removed field, a retyped field, or an enum that lost a
 *      value all break a reader that is already in a customer's repository. Across a major
 *      version they are permitted and reported, because that is what a major version is for.
 *
 * Usage:
 *   node check-additive.mjs                          drift check only
 *   node check-additive.mjs --baseline <lock.json>   drift check and comparison
 *   node check-additive.mjs --baseline-ref origin/main
 */

import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLock } from './generate-schemas-lock.mjs';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

/** Everything one side says about a property path, compared with the other. */
function compareEntry(path, before, after, breaks) {
  if (!after) {
    breaks.push(`${path}: removed. An older reader loses a field it depends on.`);
    return;
  }

  if (!before.required && after.required) {
    breaks.push(`${path}: became required. Records an older writer already wrote stop validating.`);
  }

  const beforeType = JSON.stringify(before.type ?? null);
  const afterType = JSON.stringify(after.type ?? null);
  if (beforeType !== afterType) {
    breaks.push(`${path}: type changed from ${beforeType} to ${afterType}. Both sides now disagree about what they are reading.`);
  }

  if (Array.isArray(before.enum)) {
    const kept = new Set(after.enum ?? []);
    const lost = before.enum.filter((value) => !kept.has(value));
    if (!Array.isArray(after.enum)) {
      // An enum that disappeared is a widening, which is additive. Nothing to report.
    } else if (lost.length > 0) {
      breaks.push(`${path}: enum lost ${lost.map((v) => `"${v}"`).join(', ')}. A value that was legal is now rejected.`);
    }
  } else if (Array.isArray(after.enum)) {
    breaks.push(`${path}: became a closed enum of ${after.enum.length} value(s). Anything outside the list is now rejected.`);
  }
}

function compare(baseline, current) {
  const breaks = [];

  for (const [file, before] of Object.entries(baseline.schemas ?? {})) {
    const after = current.schemas[file];
    if (!after) {
      breaks.push(`${file}: schema removed from the set.`);
      continue;
    }
    for (const [path, entry] of Object.entries(before)) {
      compareEntry(`${file} ${path}`, entry, after[path], breaks);
    }
  }

  return breaks;
}

async function baselineFromRef(ref) {
  const dir = await mkdtemp(join(tmpdir(), 'cdf-baseline-'));
  const target = join(dir, 'schemas.lock.json');
  const { stdout } = await run('git', ['show', `${ref}:schemas.lock.json`], {
    cwd: here,
    maxBuffer: 32 * 1024 * 1024,
  });
  await writeFile(target, stdout, 'utf8');
  return target;
}

async function main() {
  const current = await buildLock();
  const committed = JSON.parse(await readFile(resolve(here, 'schemas.lock.json'), 'utf8'));

  if (JSON.stringify(committed.schemas) !== JSON.stringify(current.schemas)) {
    console.error('schemas.lock.json is out of date. Run `npm run lock` and commit the result.');
    console.error('The lock is the only record of the shape before this change; without it the next');
    console.error('compatibility check has nothing to compare against.');
    process.exit(1);
  }

  let baselinePath = arg('--baseline');
  const ref = arg('--baseline-ref');

  if (!baselinePath && ref) {
    try {
      baselinePath = await baselineFromRef(ref);
    } catch {
      console.log(`No schemas.lock.json at ${ref}; nothing to compare against. Drift check passed.`);
      return;
    }
  }

  if (!baselinePath) {
    console.log('Lock is current. No baseline given, so no compatibility comparison was made.');
    return;
  }

  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  const breaks = compare(baseline, current);

  if (breaks.length === 0) {
    console.log(`Additive only against baseline ${baseline.schemaSetVersion}. ${Object.keys(current.schemas).length} schemas checked.`);
    return;
  }

  const majorChanged = baseline.major !== current.major;
  const heading = `${breaks.length} breaking change(s) against baseline ${baseline.schemaSetVersion}:`;

  if (majorChanged) {
    console.log(heading);
    for (const line of breaks) {
      console.log(`  - ${line}`);
    }
    console.log(`\nAllowed: the major version moved from ${baseline.major} to ${current.major}.`);
    console.log('A documented migration is required before release.');
    return;
  }

  console.error(heading);
  for (const line of breaks) {
    console.error(`  - ${line}`);
  }
  console.error(`\nThe major version is still ${current.major}. Within 1.x, changes are additive only.`);
  console.error('Customers have these files in their repositories and older readers are still reading them.');
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
