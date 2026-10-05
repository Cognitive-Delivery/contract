/**
 * The reference conformance runner.
 *
 * Honest framing: **the corpus is the portable artefact; this runner is a reference
 * implementation.** The fixtures under `contract/fixtures/` are plain files with no TypeScript
 * in them, so an implementation in another language reads the same bytes and writes its own
 * runner. This one exists so a JavaScript or TypeScript implementation does not have to.
 *
 * It takes the implementation under test as an argument and imports nothing from any product.
 *
 * Five things are asserted. The third is the one people forget, the fourth decides whether two
 * implementations can verify each other's signatures at all, and the fifth is the heart of the
 * specification:
 *
 *   1. Every valid fixture is accepted.
 *   2. Every invalid fixture is rejected — and carries a written reason why, because
 *      "this should fail" with no reason is untestable folklore.
 *   3. A valid fixture round-trips **without losing unknown-but-valid fields**. That is what
 *      lets a newer writer and an older reader coexist, and it is the property most easily
 *      broken by a well-meaning field pick.
 *   4. Canonical bytes match, for an adapter that offers a `canonicalise`: the contract's nine
 *      vectors and RFC 8785's own six (`jcs/`). Schema agreement is not interoperability: every
 *      hash in this contract is taken over canonical bytes, so two implementations that both pass
 *      1 to 3 and disagree here cannot check each other's work.
 *   5. Narrowing matches the vectors of §5, for an adapter that offers `narrow`; every adapter
 *      has the vectors checked for shape.
 */

import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, '..', 'fixtures');
const vectorsFile = resolve(here, 'canonical-vectors.json');

/** Fixture file prefix → the shape it exercises. */
export const SHAPES = [
  'provenance',
  'audit-event',
  'cdi-signal',
  'cdi-assessment',
  'config-core',
  'agent-lease-manifest',
  'agent-lease',
  'plugin-manifest',
  'plugin-marketplace',
];

function shapeOf(file) {
  return SHAPES.find((shape) => basename(file).startsWith(`${shape}.`)) ?? null;
}

async function loadFixtures(kind) {
  const dir = join(fixturesDir, kind);
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  const loaded = [];

  for (const file of files) {
    const shape = shapeOf(file);
    if (!shape) {
      throw new Error(`Fixture ${kind}/${file} does not name a known shape. Prefix it with one of: ${SHAPES.join(', ')}.`);
    }
    loaded.push({
      file,
      shape,
      data: JSON.parse(await readFile(join(dir, file), 'utf8')),
    });
  }
  return loaded;
}

async function reasonFor(file) {
  try {
    const text = await readFile(join(fixturesDir, 'invalid', file.replace(/\.json$/, '.reason')), 'utf8');
    return text.trim();
  } catch {
    return null;
  }
}

/**
 * Section 7 of the specification, as executable vectors.
 *
 * Optional, because an implementation that only reads artefacts never canonicalises anything.
 * An implementation that issues, signs or hashes one is not conformant without this, and the
 * report says so by name rather than by silence: `canonicalChecked` is false when it was skipped.
 */
async function checkCanonicalisation(adapter, failures) {
  if (typeof adapter.canonicalise !== 'function') {
    return false;
  }
  const doc = JSON.parse(await readFile(vectorsFile, 'utf8'));

  for (const vector of doc.vectors) {
    let bytes;
    try {
      bytes = adapter.canonicalise(vector.value);
    } catch (error) {
      failures.push(`canonical/${vector.name}: threw (${error.message}) — ${vector.why}`);
      continue;
    }
    if (typeof bytes !== 'string') {
      failures.push(`canonical/${vector.name}: canonicalise must return a string, got ${typeof bytes}`);
      continue;
    }
    // The hash is the authoritative comparison: it survives anything that might mangle this
    // file in transit. The byte string is reported because a hash alone is undebuggable.
    const digest = createHash('sha256').update(bytes, 'utf8').digest('hex');
    if (digest !== vector.sha256) {
      failures.push(
        `canonical/${vector.name}: expected ${JSON.stringify(vector.canonical)} (sha256 ${vector.sha256}), `
        + `got ${JSON.stringify(bytes)} (sha256 ${digest}) — ${vector.why}`,
      );
    }
  }

  // RFC 8785's own test suite, vendored at a pinned commit (see jcs/SOURCE). Section 7 says
  // canonical bytes ARE RFC 8785 after undefined-removal, so an implementation that passes the
  // contract's nine vectors and fails these has found a disagreement the contract must hear about.
  const jcsDir = resolve(here, 'jcs');
  for (const file of (await readdir(join(jcsDir, 'input'))).filter((n) => n.endsWith('.json')).sort()) {
    const value = JSON.parse(await readFile(join(jcsDir, 'input', file), 'utf8'));
    const expectedHex = (await readFile(join(jcsDir, 'outhex', file.replace(/\.json$/, '.txt')), 'utf8')).replace(/[^0-9a-fA-F]/g, '').toLowerCase();
    let bytes;
    try {
      bytes = adapter.canonicalise(value);
    } catch (error) {
      failures.push(`canonical/jcs/${file}: threw (${error.message})`);
      continue;
    }
    const gotHex = Buffer.from(String(bytes), 'utf8').toString('hex');
    if (gotHex !== expectedHex) {
      failures.push(`canonical/jcs/${file}: bytes differ from RFC 8785's reference output. Got ${JSON.stringify(bytes)}.`);
    }
  }

  for (const c of doc.must_fail) {
    const value = { x: c.construct === 'NaN' ? Number.NaN : Number.POSITIVE_INFINITY };
    let threw = false;
    try {
      adapter.canonicalise(value);
    } catch {
      threw = true;
    }
    if (!threw) {
      failures.push(`canonical/${c.name}: serialised without failing, but it must fail — ${c.why}`);
    }
  }
  return true;
}

/**
 * Section 5 of the specification, as executable vectors: a declared manifest and a parent grant,
 * and either the granted manifest narrowing MUST produce or the refusal codes (R1 to R6 of §5.2)
 * it MUST return. Generated once from the reference implementation and committed, so the
 * reference implementation is the oracle and this file is the contract.
 *
 * Two layers. The structural layer runs for every adapter: each vector's parent, declared and
 * granted manifests validate against the schemas, and each refusal code is one the specification
 * defines. The behavioural layer runs when the adapter offers
 * `narrow(declared, parent) => { granted } | { refusals: string[] }`: granted manifests are
 * compared by canonical bytes (so an adapter must offer `canonicalise` too) and refusal sets
 * exactly. An adapter without `narrow` is reported as not checked, never as passed.
 */
const REFUSAL_CODES = new Set(['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);

async function checkNarrowing(adapter, failures) {
  const file = resolve(here, 'narrowing-vectors.json');
  const doc = JSON.parse(await readFile(file, 'utf8'));
  const behavioural = typeof adapter.narrow === 'function';
  if (behavioural && typeof adapter.canonicalise !== 'function') {
    failures.push('narrowing: an adapter that offers narrow must offer canonicalise, because granted manifests are compared by canonical bytes.');
    return false;
  }
  for (const vector of doc.vectors) {
    const where = `narrowing/${vector.name}`;
    if (vector.schema_invalid === true) {
      // The schemas refuse this declaration before any issuer sees it (§9 step 1). What the vector
      // pins is that they do, and which §5.2 condition that enforces; a conforming implementation
      // validates first and never narrows it, so the behavioural layer does not apply.
      if (adapter.validate('agent-lease-manifest', vector.declared)) {
        failures.push(`${where}: the declared manifest validates, but the schemas must refuse it — ${vector.why}`);
      }
      if (!Array.isArray(vector.refusals) || vector.refusals.some((c) => !REFUSAL_CODES.has(c))) {
        failures.push(`${where}: a schema-invalid vector names the §5.2 condition(s) the schema enforces.`);
      }
      continue;
    }
    if (!adapter.validate('agent-lease-manifest', vector.declared)) {
      failures.push(`${where}: the declared manifest does not validate; the vector is malformed.`);
    }
    if (!adapter.validate('agent-lease-manifest', vector.parent)) {
      failures.push(`${where}: the parent manifest does not validate; the vector is malformed.`);
    }
    const hasGranted = vector.granted !== undefined;
    const hasRefusal = Array.isArray(vector.refusals);
    if (hasGranted === hasRefusal) {
      failures.push(`${where}: a vector carries exactly one of granted or refusals.`);
      continue;
    }
    if (hasGranted && !adapter.validate('agent-lease-manifest', vector.granted)) {
      failures.push(`${where}: the granted manifest does not validate; the vector is malformed.`);
    }
    if (hasRefusal) {
      for (const code of vector.refusals) {
        if (!REFUSAL_CODES.has(code)) failures.push(`${where}: refusal code ${code} is not one of R1 to R6.`);
      }
    }
    if (!behavioural) continue;

    let result;
    try {
      result = adapter.narrow(vector.declared, vector.parent);
    } catch (error) {
      failures.push(`${where}: narrow threw (${error.message}) — ${vector.why}`);
      continue;
    }
    if (hasRefusal) {
      const got = [...new Set(result?.refusals ?? [])].sort();
      const want = [...new Set(vector.refusals)].sort();
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        failures.push(`${where}: expected refusal ${JSON.stringify(want)}, got ${JSON.stringify(result?.refusals ?? 'a grant')} — ${vector.why}`);
      }
      continue;
    }
    if (result?.refusals) {
      failures.push(`${where}: expected a grant, got refusal ${JSON.stringify(result.refusals)} — ${vector.why}`);
      continue;
    }
    const got = adapter.canonicalise(result.granted);
    const want = adapter.canonicalise(vector.granted);
    if (got !== want) {
      failures.push(`${where}: granted manifest differs — ${vector.why}\n      expected ${want}\n      got      ${got}`);
    }
  }
  return behavioural;
}

/**
 * @param adapter {{ validate(shape: string, value: unknown): boolean,
 *                   roundTrip?(shape: string, value: unknown): unknown,
 *                   canonicalise?(value: unknown): string,
 *                   narrow?(declared: unknown, parent: unknown): { granted: unknown } | { refusals: string[] } }}
 * @returns a report; `failures` empty means conformant.
 */
export async function runConformance(adapter) {
  const failures = [];
  const valid = await loadFixtures('valid');
  const invalid = await loadFixtures('invalid');

  // 1. Every valid fixture is accepted.
  for (const fixture of valid) {
    if (!adapter.validate(fixture.shape, fixture.data)) {
      failures.push(`valid/${fixture.file}: rejected, but it is a legitimate artefact`);
    }
  }

  // 2. Every invalid fixture is rejected, and says why it must be.
  for (const fixture of invalid) {
    const reason = await reasonFor(fixture.file);
    if (!reason) {
      failures.push(`invalid/${fixture.file}: no .reason file. An invalid fixture without a stated reason is untestable folklore.`);
    }
    if (adapter.validate(fixture.shape, fixture.data)) {
      failures.push(`invalid/${fixture.file}: accepted, but must be rejected — ${reason ?? 'no reason given'}`);
    }
  }

  // 3. Unknown-but-valid fields survive a round trip.
  for (const fixture of valid) {
    const marked = withUnknownField(fixture.data);
    if (!adapter.validate(fixture.shape, marked)) {
      failures.push(`valid/${fixture.file}: rejected once an unknown field was added. A reader must tolerate what a newer writer adds.`);
      continue;
    }
    if (typeof adapter.roundTrip === 'function') {
      const out = adapter.roundTrip(fixture.shape, marked);
      if (!hasUnknownField(out)) {
        failures.push(`valid/${fixture.file}: the unknown field was lost in a round trip. An older reader must not silently strip a newer writer's data.`);
      }
    }
  }

  // Corpus completeness: minimal and populated, per shape, plus at least one rejection each.
  for (const shape of SHAPES) {
    for (const variant of ['minimal', 'populated']) {
      if (!valid.some((f) => f.file === `${shape}.${variant}.json`)) {
        failures.push(`corpus: missing valid/${shape}.${variant}.json`);
      }
    }
    if (!invalid.some((f) => f.shape === shape)) {
      failures.push(`corpus: no invalid fixture exercises ${shape}`);
    }
  }

  // 4. Canonical bytes, if this implementation produces any.
  const canonicalChecked = await checkCanonicalisation(adapter, failures);

  // 5. Narrowing: structural for everyone, behavioural for an adapter that narrows.
  const narrowingChecked = await checkNarrowing(adapter, failures);

  return {
    validCount: valid.length,
    invalidCount: invalid.length,
    canonicalChecked,
    narrowingChecked,
    failures,
  };
}

const UNKNOWN_KEY = 'a_field_from_a_newer_writer';

function withUnknownField(data) {
  return { ...data, [UNKNOWN_KEY]: 'kept' };
}

function hasUnknownField(data) {
  return Boolean(data) && typeof data === 'object' && data[UNKNOWN_KEY] === 'kept';
}
