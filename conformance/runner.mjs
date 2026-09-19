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
 * Four things are asserted. The third is the one people forget, and the fourth is the one that
 * decides whether two implementations can verify each other's signatures at all:
 *
 *   1. Every valid fixture is accepted.
 *   2. Every invalid fixture is rejected — and carries a written reason why, because
 *      "this should fail" with no reason is untestable folklore.
 *   3. A valid fixture round-trips **without losing unknown-but-valid fields**. That is what
 *      lets a newer writer and an older reader coexist, and it is the property most easily
 *      broken by a well-meaning field pick.
 *   4. Canonical bytes match, for an adapter that offers a `canonicalise`. Schema agreement is
 *      not interoperability: every hash in this contract is taken over canonical bytes, so two
 *      implementations that both pass 1 to 3 and disagree here cannot check each other's work.
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
 * @param adapter {{ validate(shape: string, value: unknown): boolean,
 *                   roundTrip?(shape: string, value: unknown): unknown,
 *                   canonicalise?(value: unknown): string }}
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

  return {
    validCount: valid.length,
    invalidCount: invalid.length,
    canonicalChecked,
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
