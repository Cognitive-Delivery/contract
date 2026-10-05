/**
 * Every place a schema carries an inlined, dereferenced copy of another schema, stated once.
 *
 * Schemas are self-contained on purpose (a reader in any language needs nothing else), so the
 * lease carries the manifest and the record carries both. The copies are held identical to their
 * sources by `schema-checks.mjs` (fails) and rewritten by `tooling/inline-granted-manifest.mjs`
 * (repairs); both read this list. `source` is the schema file whose dereferenced body is copied,
 * `file` and `pointer` say where the copy lives.
 */
export const INLINED_COPIES = [
  { file: 'agent-lease.schema.json', pointer: ['definitions', 'grantedManifest'], source: 'agent-lease-manifest.schema.json' },
  { file: 'lease-record.schema.json', pointer: ['definitions', 'manifest'], source: 'agent-lease-manifest.schema.json' },
  { file: 'lease-record.schema.json', pointer: ['definitions', 'lease'], source: 'agent-lease.schema.json' },
];

/** Inline every `$ref` into `#/definitions/<key>` of `source`, dropping `definitions` itself. */
export function dereference(node, source) {
  if (Array.isArray(node)) return node.map((item) => dereference(item, source));
  if (!node || typeof node !== 'object') return node;
  if (typeof node.$ref === 'string') {
    const key = node.$ref.replace('#/definitions/', '');
    if (!source.definitions || !(key in source.definitions)) throw new Error(`unresolvable $ref ${node.$ref}`);
    // Keywords beside the `$ref` (a description, the stability `$comment`) ride along, as the lock
    // generator's resolveRef does; draft-07 ignores them beside `$ref`, a copy must not lose them.
    const { $ref, ...rest } = node;
    return dereference({ ...structuredClone(source.definitions[key]), ...rest }, source);
  }
  return Object.fromEntries(
    Object.entries(node).filter(([k]) => k !== 'definitions').map(([k, v]) => [k, dereference(v, source)]),
  );
}

/** The body a copy must equal: the source dereferenced, without the keys that belong to a file. */
export function inlinedBodyOf(sourceSchema) {
  const body = dereference(structuredClone(sourceSchema), sourceSchema);
  for (const key of ['$schema', '$id', 'title', 'description']) delete body[key];
  return body;
}
