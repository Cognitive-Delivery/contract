#!/usr/bin/env node
/**
 * The additive-only guard, run against a baseline rather than against itself.
 *
 * `schemas.lock.json` records the shape of the schema set. Comparing the lock with the schemas
 * that sit beside it catches nothing, because a change that regenerates the lock agrees with
 * the lock: the file heals the moment it is broken. The comparison that means something is
 * against the shape as it was *before* the change, which in CI is the base branch or the
 * pushed-from commit, and locally is whatever ref you name.
 *
 * Three things are checked:
 *
 *   1. **Drift.** The committed lock matches the schemas beside it. A schema change that did
 *      not regenerate the lock leaves no record of what the shape used to be, which is what
 *      the next comparison needs.
 *   2. **Compatibility.** Against the baseline, within one major version, only additions are
 *      allowed. Each breaking change is a named finding (below). Across a major version they
 *      are permitted and reported, because that is what a major version is for.
 *   3. **The allow-list.** `compat-allowlist.json` names tightenings accepted within the major
 *      because the evidence shows no conformant writer ever produced what they refuse. An entry
 *      must point at an existing evidence file, and no entry present in the baseline may be
 *      missing now: the list is history, not configuration.
 *
 * Findings, in the style of `buf breaking`:
 *
 *   FIELD_REMOVED           a property path is gone
 *   FIELD_NOW_REQUIRED      an optional field became required, or a new field arrived required
 *   TYPE_CHANGED            the type set changed
 *   ENUM_NARROWED           an enum lost a value, or a field became a closed enum
 *   PATTERN_TIGHTENED       a `pattern` was added or changed, or a `not.pattern` was added
 *   BOUND_TIGHTENED         a bound was added, a minimum raised or a maximum lowered
 *   CONTENT_MODEL_CLOSED    `additionalProperties` went from open to false or to a schema
 *   UNION_CHANGED           an `anyOf` lost a branch, or a branch type or pattern (gaining one widens)
 *   SCHEMA_REMOVED          a schema file is gone
 *
 * The last four need a baseline in lock format 2. Against a format-1 baseline they are
 * reported as NOT COMPARABLE rather than passed quietly.
 *
 * Usage:
 *   node check-additive.mjs                          drift check only
 *   node check-additive.mjs --baseline <lock.json>   drift check and comparison with a lock file
 *   node check-additive.mjs --baseline-ref origin/main   the schemas at that ref, digested now
 */

import { readFile, writeFile, mkdtemp, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLock, LOCK_FORMAT } from './generate-schemas-lock.mjs';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const allowlistPath = resolve(here, 'compat-allowlist.json');

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

/**
 * `after` names the exact value the finding admits (the new pattern, `maximum=16`, the enum), so
 * an allow-list entry waves through one tightening and not every later tightening at the same
 * path: batch one's entry for a 2^53 `maximum` would otherwise have covered lowering it to 16.
 */
function finding(code, file, path, message, after) {
  return { code, file, path, message, after: String(after) };
}

function parentPath(path) {
  const cut = Math.max(path.lastIndexOf('.'), path.lastIndexOf('['));
  return cut === -1 ? '' : path.slice(0, cut);
}

/** Everything one side says about a property path, compared with the other. */
export function compareEntry(file, path, before, after, extended, out, baselineFormat = 3) {
  if (!after) {
    out.push(finding('FIELD_REMOVED', file, path, 'removed. An older reader loses a field it depends on.', 'removed'));
    return;
  }

  if (!before.required && after.required) {
    out.push(finding('FIELD_NOW_REQUIRED', file, path, 'became required. Records an older writer already wrote stop validating.', 'required'));
  }

  // Format 2 let a union's last branch overwrite the path's own type, so a type comparison on a
  // union site against a format-2 baseline compares an artefact of that defect. Skipped there.
  // A plain type that becomes a union still containing that type has widened, not changed.
  const unionSite = before.anyOf !== undefined || after.anyOf !== undefined;
  const beforeTypes = Array.isArray(before.type) ? before.type : before.type ? [before.type] : [];
  const widenedIntoUnion = after.anyOf !== undefined && before.anyOf === undefined && after.type === undefined
    && beforeTypes.length > 0 && beforeTypes.every((t) => (after.anyOfTypes ?? []).includes(t));
  const typeComparable = !(unionSite && baselineFormat < 3) && !widenedIntoUnion;
  const beforeType = JSON.stringify(before.type ?? null);
  const afterType = JSON.stringify(after.type ?? null);
  if (typeComparable && beforeType !== afterType) {
    out.push(finding('TYPE_CHANGED', file, path, `type changed from ${beforeType} to ${afterType}. Both sides now disagree about what they are reading.`, `type=${afterType}`));
  }

  // A format-1 baseline stringified its enum values, so against one the comparison is by
  // string; against a format-2 baseline a value keeps its JSON type and [1] is not ["1"].
  const enumKey = extended ? (v) => JSON.stringify(v) : (v) => String(v);
  if (Array.isArray(before.enum)) {
    if (Array.isArray(after.enum)) {
      const kept = new Set(after.enum.map(enumKey));
      const lost = before.enum.filter((value) => !kept.has(enumKey(value)));
      if (lost.length > 0) {
        out.push(finding('ENUM_NARROWED', file, path, `enum lost ${lost.map((v) => JSON.stringify(v)).join(', ')}. A value that was legal is now rejected.`, `enum=${JSON.stringify(after.enum)}`));
      }
    }
    // An enum that disappeared is a widening, which is additive. Nothing to report.
  } else if (Array.isArray(after.enum)) {
    out.push(finding('ENUM_NARROWED', file, path, `became a closed enum of ${after.enum.length} value(s). Anything outside the list is now rejected.`, `enum=${JSON.stringify(after.enum)}`));
  }

  if (!extended) {
    return;
  }

  if (after.pattern !== undefined && before.pattern !== after.pattern) {
    out.push(finding('PATTERN_TIGHTENED', file, path, before.pattern === undefined
      ? `gained pattern ${JSON.stringify(after.pattern)}. A value that was legal may now be rejected.`
      : `pattern changed from ${JSON.stringify(before.pattern)} to ${JSON.stringify(after.pattern)}. A value that was legal may now be rejected.`, `pattern=${after.pattern}`));
  }
  const beforeNots = new Set(before.notPatterns ?? []);
  const addedNots = (after.notPatterns ?? []).filter((p) => !beforeNots.has(p));
  if (addedNots.length > 0) {
    out.push(finding('PATTERN_TIGHTENED', file, path, `now refuses ${addedNots.map((p) => JSON.stringify(p)).join(', ')}. A value that was legal may now be rejected.`, `not=${JSON.stringify(addedNots)}`));
  }

  const beforeKeyNots = new Set(before.keyNotPatterns ?? []);
  const addedKeyNots = (after.keyNotPatterns ?? []).filter((p) => !beforeKeyNots.has(p));
  if (addedKeyNots.length > 0) {
    out.push(finding('PATTERN_TIGHTENED', file, path, `now refuses member names matching ${addedKeyNots.map((p) => JSON.stringify(p)).join(', ')}. A key that was carried may now be rejected.`, `keyNot=${JSON.stringify(addedKeyNots)}`));
  }

  for (const lower of ['minLength', 'minimum']) {
    if (after[lower] !== undefined && (before[lower] === undefined || after[lower] > before[lower])) {
      out.push(finding('BOUND_TIGHTENED', file, path, `${lower} ${before[lower] === undefined ? 'added' : 'raised'} to ${after[lower]}.`, `${lower}=${after[lower]}`));
    }
  }
  for (const upper of ['maxLength', 'maximum']) {
    if (after[upper] !== undefined && (before[upper] === undefined || after[upper] < before[upper])) {
      out.push(finding('BOUND_TIGHTENED', file, path, `${upper} ${before[upper] === undefined ? 'added' : 'lowered'} to ${after[upper]}.`, `${upper}=${after[upper]}`));
    }
  }

  const beforeOpen = before.additionalProperties === undefined || before.additionalProperties === true;
  const afterOpen = after.additionalProperties === undefined || after.additionalProperties === true;
  if (beforeOpen && !afterOpen) {
    out.push(finding('CONTENT_MODEL_CLOSED', file, path, 'no longer carries unknown members. A newer writer\'s field is now refused.', `additionalProperties=${after.additionalProperties}`));
  }

  // A union that gains a branch accepts more; one that loses a branch, or disappears, accepts less.
  if (before.anyOf !== undefined && (after.anyOf === undefined || after.anyOf < before.anyOf)) {
    out.push(finding('UNION_CHANGED', file, path, `anyOf went from ${before.anyOf} to ${after.anyOf ?? 'none'} branch(es). A form that validated may no longer.`, `anyOf=${after.anyOf ?? 'none'}`));
  }
  if (baselineFormat >= 3) {
    // A union that gains a pattern branch widens; one that loses a pattern branch narrows; a
    // plain string that becomes a union of patterns narrows (it used to accept anything).
    const afterUnionPatterns = new Set(after.anyOfPatterns ?? []);
    const lostUnionPatterns = (before.anyOfPatterns ?? []).filter((p) => !afterUnionPatterns.has(p));
    if (lostUnionPatterns.length > 0) {
      out.push(finding('PATTERN_TIGHTENED', file, path, `union pattern ${lostUnionPatterns.map((p) => JSON.stringify(p)).join(', ')} removed. A value that was legal may now be rejected.`, `anyOfPatterns=${JSON.stringify([...afterUnionPatterns].sort())}`));
    }
    if ((before.anyOfPatterns ?? []).length === 0 && before.pattern === undefined && afterUnionPatterns.size > 0) {
      out.push(finding('PATTERN_TIGHTENED', file, path, `now must match one of ${[...afterUnionPatterns].map((p) => JSON.stringify(p)).join(', ')}. A value that was legal may now be rejected.`, `anyOfPatterns=${JSON.stringify([...afterUnionPatterns].sort())}`));
    }
    const beforeUnionTypes = before.anyOfTypes ?? [];
    const afterUnionTypes = new Set(after.anyOfTypes ?? []);
    const lostTypes = beforeUnionTypes.filter((t) => !afterUnionTypes.has(t));
    if (lostTypes.length > 0) out.push(finding('TYPE_CHANGED', file, path, `union lost type(s) ${lostTypes.join(', ')}. A form that validated no longer does.`, `anyOfTypes=${JSON.stringify(after.anyOfTypes ?? [])}`));
  }
}

/**
 * Compare two locks. Returns `{ findings, extended }`: the breaking findings, and whether the
 * format-2 comparisons were possible against this baseline.
 */
export function compare(baseline, current) {
  const findings = [];
  const extended = (baseline.lockFormat ?? 1) >= 2 && (current.lockFormat ?? 1) >= 2;

  for (const [file, before] of Object.entries(baseline.schemas ?? {})) {
    const after = current.schemas[file];
    if (!after) {
      findings.push(finding('SCHEMA_REMOVED', file, '', 'schema removed from the set.', 'removed'));
      continue;
    }
    for (const [path, entry] of Object.entries(before)) {
      compareEntry(file, path, entry, after[path], extended, findings, baseline.lockFormat ?? 1);
    }
    // A field that did not exist before and arrives required breaks every older writer, when
    // its parent already existed (a required member of a brand-new optional object is fine).
    for (const [path, entry] of Object.entries(after)) {
      if (!before[path] && entry.required && (parentPath(path) === '' || before[parentPath(path)])) {
        findings.push(finding('FIELD_NOW_REQUIRED', file, path, 'added as required. Records an older writer already wrote stop validating.', 'required'));
      }
    }
    if (extended) {
      const beforeModel = baseline.contentModels?.[file] ?? 'open';
      const afterModel = current.contentModels?.[file] ?? 'open';
      if (beforeModel === 'open' && afterModel === 'closed') {
        findings.push(finding('CONTENT_MODEL_CLOSED', file, '', 'root content model closed. Product-specific sections are now refused.', 'additionalProperties=false'));
      }
    }
  }

  return { findings, extended };
}

const ALLOWLIST_FIELDS = ['finding', 'schema', 'path', 'after', 'reason', 'date', 'evidence'];

/** Validate the allow-list's shape and that every evidence file exists. Returns problems. */
export async function validateAllowlist(allowlist, root = here) {
  const problems = [];
  if (!allowlist || !Array.isArray(allowlist.entries)) {
    return ['compat-allowlist.json must carry an `entries` array.'];
  }
  allowlist.entries.forEach((entry, index) => {
    for (const field of ALLOWLIST_FIELDS) {
      if (typeof entry[field] !== 'string' || entry[field].length === 0) {
        problems.push(`allow-list entry ${index}: missing or empty "${field}".`);
      }
    }
    if (typeof entry.date === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
      problems.push(`allow-list entry ${index}: date must be YYYY-MM-DD.`);
    }
  });
  await Promise.all(allowlist.entries.map(async (entry, index) => {
    if (typeof entry.evidence !== 'string') return;
    try {
      await access(resolve(root, entry.evidence));
    } catch {
      problems.push(`allow-list entry ${index} (${entry.finding} ${entry.schema} ${entry.path}): evidence file ${entry.evidence} does not exist. A tightening with no evidence is not accepted.`);
    }
  }));
  return problems;
}

/** Entries present in the baseline allow-list that are missing now. The list is history. */
export function missingAllowlistEntries(baseline, current) {
  // A baseline entry written before `after` existed (1.1.0 and earlier) is matched on finding,
  // schema and path; one that names its value must still be present with that value.
  const key = (e) => `${e.finding}|${e.schema}|${e.path}`;
  const full = (e) => `${key(e)}|${e.after}`;
  const nowKeys = new Set((current?.entries ?? []).map(key));
  const nowFull = new Set((current?.entries ?? []).map(full));
  return (baseline?.entries ?? []).filter((e) => (e.after === undefined ? !nowKeys.has(key(e)) : !nowFull.has(full(e))));
}

/** Split findings into those an allow-list entry accepts and those it does not. */
export function applyAllowlist(findings, allowlist) {
  const accepted = [];
  const unlisted = [];
  const entries = allowlist?.entries ?? [];
  for (const f of findings) {
    // `after` must match too: an entry admits one specific tightening, not every later one.
    const entry = entries.find((e) => e.finding === f.code && e.schema === f.file && e.path === f.path && e.after === f.after);
    (entry ? accepted : unlisted).push(entry ? { ...f, entry } : f);
  }
  return { accepted, unlisted };
}

async function fileFromRef(ref, name) {
  const dir = await mkdtemp(join(tmpdir(), 'cdf-baseline-'));
  const target = join(dir, name);
  const { stdout } = await run('git', ['show', `${ref}:${name}`], { cwd: here, maxBuffer: 32 * 1024 * 1024 });
  await writeFile(target, stdout, 'utf8');
  return target;
}

/**
 * The baseline, digested from the schemas AS THEY WERE at `ref` with the current generator.
 * Reading the baseline's committed lock instead would compare two lock formats, and format 2
 * recorded a union's last branch over the parent entry; a baseline computed fresh has no such
 * history. The committed lock stays the drift record for its own commit, which is a different job.
 */
async function baselineLockFromRef(ref) {
  const { stdout: listing } = await run('git', ['ls-tree', '--name-only', `${ref}:schemas`], { cwd: here });
  const files = listing.split('\n').filter((n) => n.endsWith('.json'));
  if (files.length === 0) throw new Error(`no schemas at ${ref}`);
  const dir = await mkdtemp(join(tmpdir(), 'cdf-baseline-schemas-'));
  for (const file of files) {
    const { stdout } = await run('git', ['show', `${ref}:schemas/${file}`], { cwd: here, maxBuffer: 32 * 1024 * 1024 });
    await writeFile(join(dir, file), stdout, 'utf8');
  }
  let version = 'unknown';
  try {
    const { stdout } = await run('git', ['show', `${ref}:package.json`], { cwd: here });
    version = JSON.parse(stdout).version ?? version;
  } catch { /* a baseline without package.json keeps 'unknown' */ }
  return buildLock({ schemaDir: dir, version });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const describe = (f) => `${f.code} ${f.file}${f.path ? ` ${f.path}` : ''}: ${f.message}`;

async function main() {
  const current = await buildLock();
  const committed = await readJson(resolve(here, 'schemas.lock.json'));

  if (JSON.stringify(committed.schemas) !== JSON.stringify(current.schemas)
    || JSON.stringify(committed.contentModels ?? null) !== JSON.stringify(current.contentModels)
    || (committed.lockFormat ?? 1) !== LOCK_FORMAT) {
    console.error('schemas.lock.json is out of date. Run `npm run lock` and commit the result.');
    console.error('The lock is the only record of the shape before this change; without it the next');
    console.error('compatibility check has nothing to compare against.');
    process.exit(1);
  }

  const allowlist = await readJson(allowlistPath);
  const allowlistProblems = await validateAllowlist(allowlist);
  if (allowlistProblems.length > 0) {
    console.error('compat-allowlist.json is not acceptable:');
    for (const p of allowlistProblems) console.error(`  - ${p}`);
    process.exit(1);
  }

  const baselinePath = arg('--baseline');
  const ref = arg('--baseline-ref');
  let baselineAllowlist = null;
  let baseline = null;

  if (baselinePath) {
    baseline = await readJson(baselinePath);
  } else if (ref) {
    try {
      baseline = await baselineLockFromRef(ref);
    } catch {
      console.log(`No schemas at ${ref}; nothing to compare against. Drift check passed.`);
      return;
    }
    try {
      baselineAllowlist = await readJson(await fileFromRef(ref, 'compat-allowlist.json'));
    } catch {
      baselineAllowlist = null; // the baseline predates the allow-list
    }
  }

  if (!baseline) {
    console.log('Lock is current and the allow-list is well-formed. No baseline given, so no compatibility comparison was made.');
    return;
  }
  const { findings, extended } = compare(baseline, current);
  const { accepted, unlisted } = applyAllowlist(findings, allowlist);
  const dropped = missingAllowlistEntries(baselineAllowlist, allowlist);

  if (!extended) {
    console.log(`Baseline ${baseline.schemaSetVersion} is lock format ${baseline.lockFormat ?? 1}: PATTERN_TIGHTENED, BOUND_TIGHTENED, CONTENT_MODEL_CLOSED and UNION_CHANGED are NOT COMPARABLE against it. (A --baseline-ref baseline is always digested with the current generator, so this only happens with an explicit --baseline lock file.)`);
  }
  for (const f of accepted) {
    console.log(`accepted (allow-listed ${f.entry.date}): ${describe(f)} — ${f.entry.reason}`);
  }

  const majorChanged = baseline.major !== current.major;
  const problems = [...unlisted.map(describe), ...dropped.map((e) => `allow-list entry removed: ${e.finding} ${e.schema} ${e.path} (${e.after}). The list is history; entries are never deleted within a major.`)];

  if (problems.length === 0) {
    console.log(`Additive only against baseline ${baseline.schemaSetVersion}. ${Object.keys(current.schemas).length} schemas checked, ${accepted.length} allow-listed tightening(s).`);
    return;
  }

  const heading = `${problems.length} breaking change(s) against baseline ${baseline.schemaSetVersion}:`;
  if (majorChanged && dropped.length === 0) {
    console.log(heading);
    for (const line of problems) console.log(`  - ${line}`);
    console.log(`\nAllowed: the major version moved from ${baseline.major} to ${current.major}.`);
    console.log('A documented migration is required before release.');
    return;
  }

  console.error(heading);
  for (const line of problems) console.error(`  - ${line}`);
  console.error(`\nThe major version is still ${current.major}. Within ${current.major}.x, changes are additive only.`);
  console.error('Customers have these files in their repositories and older readers are still reading them.');
  console.error('A tightening the evidence permits is accepted through compat-allowlist.json, with the evidence file named.');
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
