/**
 * The guard's own tests: each finding fires on a doctored lock and stays silent on an
 * additive change, and the allow-list accepts a named tightening and refuses one with no
 * evidence. Run by `npm test`, because a guard that nobody has watched fail is a sentence
 * in a README.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The guard lives at the repository root and is not in the published package (`files` in
 * package.json), so it is loaded here rather than at module top: a static import made the
 * installed package's `npm test` fail with ERR_MODULE_NOT_FOUND before a single fixture ran
 * (review of 5 October 2026, defect 1). When it is absent the run says so — `present: false`
 * and zero scenarios — rather than passing a guard it never saw.
 */
async function loadGuard() {
  try {
    return await import('../check-additive.mjs');
  } catch (error) {
    if (error && error.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw error;
  }
}

function lock(schemas, contentModels = {}, lockFormat = 5) {
  return { lockFormat, schemaSetVersion: '1.0.0', major: '1', contentModels, schemas };
}

const base = () => lock({
  'x.schema.json': {
    a: { required: false, type: 'string', stability: 'stable' },
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
  const guard = await loadGuard();
  if (guard === null) {
    return { present: false, count: 0, failures: [] };
  }
  const { compare, applyAllowlist, validateAllowlist, missingAllowlistEntries } = guard;
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
    after.schemas['x.schema.json'].d.keyNotPatterns = []; // key refusal removed = loosened
    after.schemas['x.schema.json'].g.enum = ['x', 'y', 'z']; // enum widened
    after.schemas['x.schema.json'].f.anyOf = 4; // a union gained a branch = widened
    delete after.schemas['x.schema.json'].a.type; // a plain string became a union that still accepts a string
    after.schemas['x.schema.json'].a.anyOf = 2;
    after.schemas['x.schema.json'].a.anyOfTypes = ['object', 'string'];
    after.schemas['x.schema.json'].a.deprecated = 'use b'; // deprecation is additive
    after.schemas['x.schema.json'].b.stability = 'stable'; // marking stability where there was none, additive
    after.schemas['x.schema.json'].c.stability = 'development'; // development where unmarked: not a lowering
    expect('additive-is-silent', codes(compare(base(), after)), []);
  }

  // Each finding fires.
  const cases = [
    ['pattern-added', (s) => { s.a.pattern = '^[0-9a-f]{64}$'; }, ['PATTERN_TIGHTENED a']],
    ['pattern-changed', (s) => { s.c.pattern = '^[a-z]{2,}$'; }, ['PATTERN_TIGHTENED c']],
    ['not-pattern-added', (s) => { s.e.notPatterns = ['^/', '^~']; }, ['PATTERN_TIGHTENED e']],
    ['key-not-pattern-added', (s) => { s.d.keyNotPatterns = ['token']; }, ['PATTERN_TIGHTENED d']],
    ['min-length-added', (s) => { s.a.minLength = 1; }, ['BOUND_TIGHTENED a']],
    ['maximum-lowered', (s) => { s.b.maximum = 5; }, ['BOUND_TIGHTENED b']],
    ['minimum-raised', (s) => { s.b.minimum = 1; }, ['BOUND_TIGHTENED b']],
    ['content-model-closed', (s) => { s.d.additionalProperties = false; }, ['CONTENT_MODEL_CLOSED d']],
    ['content-model-schema', (s) => { s.d.additionalProperties = 'schema'; }, ['CONTENT_MODEL_CLOSED d']],
    ['union-lost-a-branch', (s) => { s.f.anyOf = 2; }, ['UNION_CHANGED f']],
    ['union-removed', (s) => { delete s.f.anyOf; }, ['UNION_CHANGED f']],
    ['field-removed', (s) => { delete s.a; }, ['FIELD_REMOVED a']],
    ['field-now-required', (s) => { s.a.required = true; }, ['FIELD_NOW_REQUIRED a']],
    ['new-required-field', (s) => { s.z = { required: true, type: 'string' }; }, ['FIELD_NOW_REQUIRED z']],
    ['type-changed', (s) => { s.a.type = 'integer'; }, ['TYPE_CHANGED a']],
    ['enum-narrowed', (s) => { s.g.enum = ['x']; }, ['ENUM_NARROWED g']],
    ['enum-closed', (s) => { s.a.enum = ['only']; }, ['ENUM_NARROWED a']],
    ['stability-lowered', (s) => { s.a.stability = 'development'; }, ['STABILITY_LOWERED a']],
    ['conditional-required-added', (s) => { s.d.conditionalRequired = ['x']; }, ['CONDITIONAL_REQUIRED_ADDED d']],
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

  // Union sites (format 3): a lost branch type or a removed union pattern is a narrowing; against
  // a format-2 baseline the path's own type is not compared on a union site, because format 2
  // recorded the last branch's type there.
  {
    const before = lock({ 'x.schema.json': { u: { required: true, type: 'string', anyOf: 2, anyOfPatterns: ['^a$', '^b$'], anyOfTypes: ['string'] } } });
    const narrower = lock({ 'x.schema.json': { u: { required: true, type: 'string', anyOf: 1, anyOfPatterns: ['^a$'], anyOfTypes: ['string'] } } });
    expect('union-pattern-removed', codes(compare(before, narrower)), ['PATTERN_TIGHTENED u', 'UNION_CHANGED u']);
    const wider = lock({ 'x.schema.json': { u: { required: true, type: 'string', anyOf: 3, anyOfPatterns: ['^a$', '^b$', '^c$'], anyOfTypes: ['string'] } } });
    expect('union-pattern-added-is-silent', codes(compare(before, wider)), []);
    const typeLost = lock({ 'x.schema.json': { v: { required: false, anyOf: 1, anyOfTypes: ['string'] } } });
    const typeBefore = lock({ 'x.schema.json': { v: { required: false, anyOf: 2, anyOfTypes: ['object', 'string'] } } });
    expect('union-type-lost', codes(compare(typeBefore, typeLost)), ['TYPE_CHANGED v', 'UNION_CHANGED v']);
    const f2 = lock({ 'x.schema.json': { w: { required: false, type: 'object', anyOf: 2 } } }, {}, 2);
    const f3 = lock({ 'x.schema.json': { w: { required: false, anyOf: 2, anyOfTypes: ['object', 'string'] } } });
    expect('format2-union-type-not-compared', codes(compare(f2, f3)), []);
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
    const allowlist = { entries: [{ finding: 'PATTERN_TIGHTENED', schema: 'x.schema.json', path: 'a', after: 'pattern=^[0-9a-f]{64}$', reason: 'r', date: '2026-10-04', evidence: 'README.md' }] };
    const { accepted, unlisted } = applyAllowlist(compare(base(), after).findings, allowlist);
    expect('allowlist-accepts-named', accepted.map((f) => f.code), ['PATTERN_TIGHTENED']);
    expect('allowlist-leaves-unlisted', unlisted.map((f) => f.code), ['BOUND_TIGHTENED']);
    // An entry admits ONE tightening: the same finding at the same path with a different value
    // is a new tightening and needs its own entry. (Batch one's entry for a 2^53 maximum must
    // not cover lowering it to 16.)
    const other = { entries: [{ ...allowlist.entries[0], after: 'pattern=^[a-z]+$' }] };
    expect('allowlist-refuses-other-after', applyAllowlist(compare(base(), after).findings, other).accepted.length, 0);
    const lowered = base(); lowered.schemas['x.schema.json'].b.maximum = 5;
    const oldBound = { entries: [{ finding: 'BOUND_TIGHTENED', schema: 'x.schema.json', path: 'b', after: 'maximum=10', reason: 'r', date: '2026-10-04', evidence: 'README.md' }] };
    // A tightening seen through a $ref (lock format 4 `via`) is covered by the entry at its definition.
    const viaLock = base(); viaLock.schemas['x.schema.json'].v = { required: false, type: 'string', via: '#v' };
    const viaAfter = base(); viaAfter.schemas['x.schema.json'].v = { required: false, type: 'string', via: '#v', pattern: '^[a-z]+$' };
    const viaList = { entries: [{ finding: 'PATTERN_TIGHTENED', schema: 'x.schema.json', path: '#v', after: 'pattern=^[a-z]+$', reason: 'r', date: '2026-10-05', evidence: 'README.md' }] };
    expect('allowlist-covers-via-definition', applyAllowlist(compare(viaLock, viaAfter).findings, viaList).accepted.length, 1);
    expect('allowlist-old-bound-does-not-cover-lower', applyAllowlist(compare(base(), lowered).findings, oldBound).unlisted.map((f) => f.after), ['maximum=5']);
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
    expect('allowlist-valid-passes', await validateAllowlist({ entries: [{ finding: 'X', schema: 's', path: 'p', after: 'pattern=^x$', reason: 'r', date: '2026-10-04', evidence: 'README.md' }] }, resolve(here, '..')), []);
    expect('allowlist-refuses-missing-after', (await validateAllowlist({ entries: [{ finding: 'X', schema: 's', path: 'p', reason: 'r', date: '2026-10-04', evidence: 'README.md' }] }, resolve(here, '..'))).some((p) => p.includes('"after"')), true);
  }

  // The list is history: a baseline entry that is gone is reported.
  {
    const entry = { finding: 'PATTERN_TIGHTENED', schema: 'x.schema.json', path: 'a' };
    expect('allowlist-entry-removed', missingAllowlistEntries({ entries: [entry] }, { entries: [] }).length, 1);
    expect('allowlist-entry-kept', missingAllowlistEntries({ entries: [entry] }, { entries: [entry] }).length, 0);
    // A baseline entry from before `after` existed is satisfied by the same entry with an `after`;
    // one that names its value is not satisfied by a different value.
    const { after: _dropped, ...legacy } = { ...entry, after: 'pattern=^x$' };
    expect('allowlist-legacy-entry-satisfied', missingAllowlistEntries({ entries: [legacy] }, { entries: [{ ...legacy, after: 'pattern=^x$' }] }).length, 0);
    expect('allowlist-valued-entry-not-satisfied-by-other-value', missingAllowlistEntries({ entries: [{ ...legacy, after: 'pattern=^x$' }] }, { entries: [{ ...legacy, after: 'pattern=^y$' }] }).length, 1);
  }

  return { present: true, count: cases.length + 23, failures };
}
