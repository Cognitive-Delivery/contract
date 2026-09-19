/**
 * The reference adapter: JSON Schema validation with Ajv, and a round trip that goes
 * through JSON and keeps whatever it did not recognise.
 *
 * It exists so the corpus can be run against something in this repository rather than only
 * inside a product. An implementation in another language reuses `fixtures/` unchanged and
 * writes its own adapter; nothing here is privileged.
 *
 * The round trip is deliberately the naive one. Parsing to a plain object and serialising it
 * back is the behaviour a reader must not improve on: the moment it picks fields it knows,
 * a newer writer's data is silently dropped and the append-only record is no longer what was
 * written.
 */

import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(here, '..', 'schemas');

/** Fixture prefix → schema file. The prefix is the shape name the runner passes. */
function schemaFileFor(shape) {
  return `${shape}.schema.json`;
}

export async function createAjvAdapter() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validators = new Map();
  const files = (await readdir(schemaDir)).filter((name) => name.endsWith('.schema.json')).sort();

  for (const file of files) {
    const schema = JSON.parse(await readFile(join(schemaDir, file), 'utf8'));
    const shape = file.replace(/\.schema\.json$/, '');
    validators.set(shape, ajv.compile(schema));
  }

  return {
    /** The errors from the last failed validate, for reporting. */
    lastErrors: null,

    validate(shape, value) {
      const validator = validators.get(shape);
      if (!validator) {
        throw new Error(`No schema for shape "${shape}". Expected schemas/${schemaFileFor(shape)}.`);
      }
      const ok = validator(value);
      this.lastErrors = ok ? null : validator.errors;
      return ok;
    },

    roundTrip(shape, value) {
      return JSON.parse(JSON.stringify(value));
    },

    canonicalise(value) {
      return canonicalise(value);
    },
  };
}

/**
 * Canonical bytes, per section 7 of `SPEC-agent-lease-manifest.md`.
 *
 * Thirty lines, and every hash in the contract rests on them. It is short because the rules
 * lean on `JSON.stringify`, whose string escaping and number formatting the specification
 * adopts wholesale — deliberately, so that a JavaScript implementation cannot drift from the
 * text by accident. An implementation in a language without those exact semantics has to do
 * this part by hand, which is what `conformance/canonical-vectors.json` is for.
 */
export function canonicalise(value) {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      // A placeholder here would silently change the artefact being signed.
      throw new Error('canonicalise: a non-finite number is not serialisable');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    // Element order is significant and is left exactly as given.
    return `[${value.map(canonicalise).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      // An absent member is omitted, not serialised as null.
      .filter(([, member]) => member !== undefined)
      // `<` on JavaScript strings compares UTF-16 code units, which is the normative order.
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, member]) => `${JSON.stringify(key)}:${canonicalise(member)}`).join(',')}}`;
  }
  throw new Error(`canonicalise: unsupported value of type ${typeof value}`);
}
