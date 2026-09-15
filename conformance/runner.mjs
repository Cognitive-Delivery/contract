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
 * Three things are asserted, and the third is the one people forget:
 *
 *   1. Every valid fixture is accepted.
 *   2. Every invalid fixture is rejected — and carries a written reason why, because
 *      "this should fail" with no reason is untestable folklore.
 *   3. A valid fixture round-trips **without losing unknown-but-valid fields**. That is what
 *      lets a newer writer and an older reader coexist, and it is the property most easily
 *      broken by a well-meaning field pick.
 */

import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, '..', 'fixtures');

/** Fixture file prefix → the shape it exercises. */
export const SHAPES = [
  'provenance',
  'audit-event',
  'cdi-signal',
  'cdi-assessment',
  'config-core',
  'agent-lease-manifest',
  'agent-lease',
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
 * @param adapter {{ validate(shape: string, value: unknown): boolean }}
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

  return {
    validCount: valid.length,
    invalidCount: invalid.length,
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
