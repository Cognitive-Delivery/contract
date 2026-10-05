/**
 * The guard's own tests: each finding fires on a doctored lock and stays silent on an
 * additive change, and the allow-list accepts a named tightening and refuses one with no
 * evidence. Run by `npm test`, because a guard that nobody has watched fail is a sentence
 * in a README.
 */

import { compare, applyAllowlist, validateAllowlist, missingAllowlistEntries } from '../check-additive.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function lock(schemas, contentModels = {}, lockFormat = 2) {
  return { lockFormat, schemaSetVersion: '1.0.0', major: '1', contentModels, schemas };
}

const base = () => lock({
  'x.schema.json': {
    a: { required: false, type: 'string' },
    b: { required: true, type: 'integer', minimum: 0, maximum: 10 },
    c: { required: false, type: 'string', pattern: '^[a-z]+$' },
    d: { required: false, type: 'object', additionalProperties: true },
    e: { required: false, type: 'string', notPatterns: ['^/'] },
    f: { required: false, anyOf: 3 },
    g: { required: false, type: 'string', enum: ['x', 'y'] },
  },
}, { 'x.schema.json': 'open' });

const codes = (r) => r.findings.map((f) => `${f.code} ${f.path}`).sort();

export async function runGuardTests() {
  const failures = [];
  const expect = (name, actual, wanted) => {
    const a = JSON.stringify(actual);
    const w = JSON.stringify(wanted);
    if (a !== w) failures.push(`guard/${name}: expected ${w}, got ${a}`);
  };

  // Additive changes: nothing to report.
  {
    const after = base();
    after.schemas['x.schema.json'].h = { required: false, type: 'string' }; // new optional field
    delete after.schemas['x.schema.json'].c.pattern; // pattern removed = loosened
    after.schemas['x.schema.json'].b.maximum = 20; // maximum raised = loosened
    after.schemas['x.schema.json'].b.minimum = -1; // minimum lowered = loosened
    after.schemas['x.schema.json'].e.notPatterns = []; // refusal removed = loosened
    after.schemas['x.schema.json'].g.enum = ['x', 'y', 'z']; // enum widened
    expect('additive-is-silent', codes(compare(base(), after)), []);
  }

  // Each finding fires.
  const cases = [
    ['pattern-added', (s) => { s.a.pattern = '^[0-9a-f]{64}$'; }, ['PATTERN_TIGHTENED a']],
    ['pattern-changed', (s) => { s.c.pattern = '^[a-z]{2,}$'; }, ['PATTERN_TIGHTENED c']],
    ['not-pattern-added', (s) => { s.e.notPatterns = ['^/', '^~']; }, ['PATTERN_TIGHTENED e']],
    ['min-length-added', (s) => { s.a.minLength = 1; }, ['BOUND_TIGHTENED a']],
    ['maximum-lowered', (s) => { s.b.maximum = 5; }, ['BOUND_TIGHTENED b']],
    ['minimum-raised', (s) => { s.b.minimum = 1; }, ['BOUND_TIGHTENED b']],
    ['content-model-closed', (s) => { s.d.additionalProperties = false; }, ['CONTENT_MODEL_CLOSED d']],
    ['content-model-schema', (s) => { s.d.additionalProperties = 'schema'; }, ['CONTENT_MODEL_CLOSED d']],
    ['union-changed', (s) => { s.f.anyOf = 2; }, ['UNION_CHANGED f']],
    ['field-removed', (s) => { delete s.a; }, ['FIELD_REMOVED a']],
    ['field-now-required', (s) => { s.a.required = true; }, ['FIELD_NOW_REQUIRED a']],
    ['new-required-field', (s) => { s.z = { required: true, type: 'string' }; }, ['FIELD_NOW_REQUIRED z']],
    ['type-changed', (s) => { s.a.type = 'integer'; }, ['TYPE_CHANGED a']],
    ['enum-narrowed', (s) => { s.g.enum = ['x']; }, ['ENUM_NARROWED g']],
    ['enum-closed', (s) => { s.a.enum = ['only']; }, ['ENUM_NARROWED a']],
  ];
  for (const [name, mutate, wanted] of cases) {
    const after = base();
    mutate(after.schemas['x.schema.json']);
    expect(name, codes(compare(base(), after)), wanted);
  }

  // Root content model and removed schema.
  {
    const after = base();
    after.contentModels['x.schema.json'] = 'closed';
    expect('root-content-model-closed', codes(compare(base(), after)), ['CONTENT_MODEL_CLOSED ']);
    const gone = base();
    delete gone.schemas['x.schema.json'];
    expect('schema-removed', codes(compare(base(), gone)), ['SCHEMA_REMOVED ']);
  }

  // Enum values keep their type: [1,2] versus ["1","2"] is a change, not a match.
  {
    const before = lock({ 'x.schema.json': { t: { required: false, type: 'integer', enum: [1, 2] } } });
    const after = lock({ 'x.schema.json': { t: { required: false, type: 'integer', enum: ['1', '2'] } } });
    expect('enum-type-kept', codes(compare(before, after)), ['ENUM_NARROWED t']);
  }

  // A format-1 baseline: the four extended findings are not comparable, the classic four still are.
  {
    const before = base();
    before.lockFormat = 1;
    const after = base();
    after.schemas['x.schema.json'].a.pattern = '^x$';
    after.schemas['x.schema.json'].a.required = true;
    const result = compare(before, after);
    expect('format1-not-extended', result.extended, false);
    expect('format1-classic-still-fires', codes(result), ['FIELD_NOW_REQUIRED a']);
  }

  // The allow-list accepts a named tightening and nothing else.
  {
    const after = base();
    after.schemas['x.schema.json'].a.pattern = '^[0-9a-f]{64}$';
    after.schemas['x.schema.json'].b.maximum = 5;
    const allowlist = { entries: [{ finding: 'PATTERN_TIGHTENED', schema: 'x.schema.json', path: 'a', reason: 'r', date: '2026-10-04', evidence: 'README.md' }] };
    const { accepted, unlisted } = applyAllowlist(compare(base(), after).findings, allowlist);
    expect('allowlist-accepts-named', accepted.map((f) => f.code), ['PATTERN_TIGHTENED']);
    expect('allowlist-leaves-unlisted', unlisted.map((f) => f.code), ['BOUND_TIGHTENED']);
  }

  // An entry with no evidence file, or a missing field, is refused.
  {
    const problems = await validateAllowlist({ entries: [
      { finding: 'PATTERN_TIGHTENED', schema: 'x.schema.json', path: 'a', reason: 'r', date: '2026-10-04', evidence: 'fixtures/invalid/does-not-exist.json' },
      { finding: 'BOUND_TIGHTENED', schema: 'x.schema.json', path: 'b', date: '04/10/2026', evidence: 'README.md' },
    ] }, resolve(here, '..'));
    expect('allowlist-refuses-missing-evidence', problems.some((p) => p.includes('does-not-exist.json')), true);
    expect('allowlist-refuses-missing-reason', problems.some((p) => p.includes('"reason"')), true);
    expect('allowlist-refuses-bad-date', problems.some((p) => p.includes('YYYY-MM-DD')), true);
    expect('allowlist-valid-passes', await validateAllowlist({ entries: [{ finding: 'X', schema: 's', path: 'p', reason: 'r', date: '2026-10-04', evidence: 'README.md' }] }, resolve(here, '..')), []);
  }

  // The list is history: a baseline entry that is gone is reported.
  {
    const entry = { finding: 'PATTERN_TIGHTENED', schema: 'x.schema.json', path: 'a' };
    expect('allowlist-entry-removed', missingAllowlistEntries({ entries: [entry] }, { entries: [] }).length, 1);
    expect('allowlist-entry-kept', missingAllowlistEntries({ entries: [entry] }, { entries: [entry] }).length, 0);
  }

  return { count: cases.length + 12, failures };
}
