/**
 * Every normative clause of the SPEC is answered by a named test, or excluded with a reason.
 *
 * `traceability.json` maps each clause id from `spec-clauses.mjs` to what tests it:
 *   fixture:<name>   a file under fixtures/valid, fixtures/invalid or fixtures/invalid-by-rule
 *   vector:<name>    a narrowing vector by name
 *   check:<id>       one of the runner's or run.mjs's own checks (CHECK_IDS)
 *   rule:<code>      a lease rule from lease-rules.mjs
 * or `excluded` with a reason, for a clause the corpus cannot test (runtime behaviour, a
 * SHOULD, a definition). An entry carries the clause's `key` (its first sixty characters) so that
 * editing a clause fails this check until the mapping is re-affirmed.
 *
 * Fails on: a clause with no entry; an entry for a clause that no longer exists; a key that no
 * longer matches; a `covers` id that names nothing; an exclusion with no reason. This is the
 * MCP SEP practice of requirement-to-test traceability, applied to a schema contract: a clause
 * nobody can point a test at is a sentence in a README.
 */

import { readFile, readdir, access } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractClauses } from './spec-clauses.mjs';
import { LEASE_RULES } from './lease-rules.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

export const CHECK_IDS = [
  'valid-accepted', 'invalid-rejected', 'rejection-path', 'round-trip', 'corpus-complete', 'sealed-path',
  'canonical', 'jcs', 'narrowing', 'signatures', 'lease-rules',
  'strict-compile', 'identity', 'version', 'layout', 'additive-guard', 'traceability',
];

async function fixtureNames() {
  const names = new Set();
  for (const kind of ['valid', 'invalid', 'invalid-by-rule']) {
    let files = [];
    try { files = await readdir(join(root, 'fixtures', kind)); } catch { continue; }
    for (const f of files) if (f.endsWith('.json') && !f.endsWith('.expect.json')) names.add(f.replace(/\.json$/, ''));
  }
  return names;
}

export async function runTraceabilityCheck() {
  const failures = [];
  const spec = await readFile(join(root, 'SPEC-agent-lease-manifest.md'), 'utf8');
  const clauses = extractClauses(spec);
  const map = JSON.parse(await readFile(join(here, 'traceability.json'), 'utf8'));
  const entries = map.clauses ?? {};
  const fixtures = await fixtureNames();
  const vectors = new Set(JSON.parse(await readFile(join(here, 'narrowing-vectors.json'), 'utf8')).vectors.map((v) => v.name));
  const byId = new Map(clauses.map((c) => [c.id, c]));

  for (const clause of clauses) {
    const entry = entries[clause.id];
    if (!entry) { failures.push(`traceability: clause ${clause.id} has no entry — "${clause.key}…"`); continue; }
    if (entry.key !== clause.key) failures.push(`traceability: clause ${clause.id} changed; the entry's key is "${entry.key}" but the SPEC now says "${clause.key}". Re-affirm what tests it.`);
    const covers = Array.isArray(entry.covers) ? entry.covers : [];
    if (typeof entry.excluded === 'string' && entry.excluded.trim() !== '') continue;
    if (entry.excluded !== undefined) failures.push(`traceability: clause ${clause.id} is excluded without a reason.`);
    if (covers.length === 0 && entry.excluded === undefined) failures.push(`traceability: clause ${clause.id} covers nothing and is not excluded.`);
    for (const id of covers) {
      const [kind, ...rest] = id.split(':');
      const name = rest.join(':');
      const ok = kind === 'fixture' ? fixtures.has(name)
        : kind === 'vector' ? vectors.has(name)
          : kind === 'check' ? CHECK_IDS.includes(name)
            : kind === 'rule' ? LEASE_RULES.includes(name)
              : false;
      if (!ok) failures.push(`traceability: clause ${clause.id} is covered by ${id}, which does not exist.`);
    }
  }
  for (const id of Object.keys(entries)) {
    if (!byId.has(id)) failures.push(`traceability: entry ${id} names a clause the SPEC no longer has.`);
  }
  const excluded = clauses.filter((c) => typeof entries[c.id]?.excluded === 'string').length;
  return { clauseCount: clauses.length, excluded, failures };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await runTraceabilityCheck();
  console.log(`${r.clauseCount} clauses, ${r.excluded} excluded, ${r.failures.length} failure(s).`);
  for (const f of r.failures) console.error(`  - ${f}`);
  process.exit(r.failures.length === 0 ? 0 : 1);
}
