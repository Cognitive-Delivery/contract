#!/usr/bin/env node
/**
 * Generates schemas.lock.json — the normalised digest that makes the additive-only
 * rule mechanical rather than a sentence in a README.
 *
 * For every schema it records, per property path: its type, whether it is required, any
 * closed enum, and — since lock format 2 — the constraints that can be TIGHTENED without
 * changing the type: `pattern`, the `allOf[].not.pattern` set, `minLength`, `maxLength`,
 * `minimum`, `maximum`, `additionalProperties` and the number of `anyOf` branches. Per schema it
 * records the content model (open or closed) at the root.
 *
 * That is enough for check-additive.mjs to detect every change that breaks `1.x`:
 *
 *   - a new REQUIRED field          (an older writer's records stop validating)
 *   - a REMOVED field               (an older reader loses data it depended on)
 *   - a RETYPED field               (both sides disagree about what they are reading)
 *   - a NARROWED enum               (a value that was legal becomes illegal)
 *   - a TIGHTENED pattern or bound  (a value that was legal becomes illegal)   [format 2]
 *   - a CLOSED content model        (a key that was carried is now refused)    [format 2]
 *   - a CHANGED union               (a branch that accepted a form is gone)    [format 2]
 *
 * Lock format 1 recorded only the first four, which is how 1.0.x could have tightened a
 * pattern unseen. A baseline in format 1 is still comparable for those four; the newer
 * findings are reported as not comparable rather than silently passed.
 *
 * Later formats, each recorded on the entry beside the above:
 *
 *   - format 3  a union's branch types and branch patterns on the PARENT entry (`anyOfTypes`,
 *               `anyOfPatterns`), because format 2 let the last branch overwrite the path's own
 *               type; and the key patterns `propertyNames` refuses (`keyNotPatterns`).
 *   - format 4  a local `$ref` is followed and the definition's constraints are digested AT the
 *               referring path, with `ref` recorded beside them and `via` naming where the
 *               constraint lives in the definition, so re-pointing a property to a stricter
 *               definition is a visible change rather than a changed string (see resolveRef).
 *   - format 5  `stability` and `deprecated` from the property's `$comment`, and
 *               `conditionalRequired`, the names an `allOf[].if/then` makes required.
 *
 * `LOCK_FORMAT` below is the current one.
 *
 * Run via `npm run lock`. The comparison lives in check-additive.mjs.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(here, 'schemas');
const lockPath = resolve(here, 'schemas.lock.json');

export const LOCK_FORMAT = 5; // 4: a local $ref is digested at the referring path (see resolveRef); 5: stability, deprecated and conditional required

function compareJson(a, b) {
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * The patterns a value must NOT match, expressed as `allOf: [{ not: { pattern } }, …]`.
 * This is how a path rule is written without lookahead (RFC 9485 I-Regexp has none), so the
 * lock has to see it as the constraint it is: adding one tightens, removing one loosens.
 */
function notPatternsOf(node) {
  return (node.allOf ?? [])
    .filter((branch) => branch && typeof branch === 'object' && branch.not && typeof branch.not.pattern === 'string')
    .map((branch) => branch.not.pattern)
    .sort();
}

/** Walk a schema and emit a flat path → shape map. Deterministic: keys are sorted on write. */
/**
 * A local `$ref` is followed (lock format 4): the referenced definition's constraints are
 * digested AT the referring path, with `ref` recorded beside them. Before this, a property that
 * was re-pointed from one definition to a stricter one changed only its `ref` string, which the
 * guard did not compare, so `hooks` could go from "any object" to a typed event map unseen, and a
 * value that became a `$ref` lost its recorded type and read as TYPE_CHANGED. The definition is
 * still digested under `#<name>` as before. A cycle stops at the second visit and records the
 * ref only.
 */
function resolveRef(node, ctx) {
  if (!node || typeof node !== 'object' || typeof node.$ref !== 'string' || !node.$ref.startsWith('#/definitions/')) return node;
  const name = node.$ref.slice('#/definitions/'.length);
  const target = ctx.definitions?.[name];
  if (!target || typeof target !== 'object' || ctx.stack.includes(name)) return node;
  const { $ref, ...rest } = node;
  return { ...target, ...rest, $ref, __resolvedFrom: name };
}

function digest(node, path, required, out, ctx = { definitions: {}, stack: [] }) {
  if (!node || typeof node !== 'object') {
    return;
  }
  node = resolveRef(node, ctx);
  if (node.__resolvedFrom) {
    ctx = { definitions: ctx.definitions, stack: [...ctx.stack, node.__resolvedFrom], via: { name: node.__resolvedFrom, at: path } };
  }

  if (path) {
    const entry = { required };
    // The same constraint seen through a `$ref`: `via` is where it lives in the definition
    // (`#allow.hosts[]` for `allow.hosts[]`), so one allow-list entry at the definition covers it.
    if (ctx.via && path.startsWith(ctx.via.at)) {
      entry.via = `#${ctx.via.name}${path.slice(ctx.via.at.length)}`;
    }
    if (node.type !== undefined) {
      entry.type = Array.isArray(node.type) ? [...node.type].sort() : node.type;
    }
    if (Array.isArray(node.enum)) {
      // Values keep their JSON type: [1, 2] and ["1", "2"] are different contracts.
      entry.enum = [...node.enum].sort(compareJson);
    }
    if (node.$ref) {
      entry.ref = node.$ref;
    }
    if (typeof node.pattern === 'string') {
      entry.pattern = node.pattern;
    }
    const nots = notPatternsOf(node);
    if (nots.length > 0) {
      entry.notPatterns = nots;
    }
    // Keys an object refuses by name: `propertyNames: { allOf: [{ not: { pattern } }] }` or
    // `propertyNames: { not: { pattern } }`. Adding one tightens; it has to be visible.
    if (node.propertyNames && typeof node.propertyNames === 'object') {
      const keyNots = [
        ...notPatternsOf(node.propertyNames),
        ...(node.propertyNames.not && typeof node.propertyNames.not.pattern === 'string' ? [node.propertyNames.not.pattern] : []),
      ].sort();
      if (keyNots.length > 0) {
        entry.keyNotPatterns = keyNots;
      }
    }
    for (const bound of ['minLength', 'maxLength', 'minimum', 'maximum']) {
      if (typeof node[bound] === 'number') {
        entry[bound] = node[bound];
      }
    }
    if (node.additionalProperties !== undefined) {
      entry.additionalProperties = typeof node.additionalProperties === 'boolean' ? node.additionalProperties : 'schema';
    }
    if (Array.isArray(node.anyOf)) {
      entry.anyOf = node.anyOf.length;
    }
    // Format 5: what the schema promises about the field. `$comment` carries `stability: stable`
    // or `stability: development` and optionally `deprecated: <replacement>` (conformance/metaschema.json
    // holds the form); the guard refuses lowering stability within a major and treats deprecation
    // as additive. `conditionalRequired` is the set of names an `allOf[].if/then` makes required,
    // which the lease record uses per event and which was invisible to earlier formats.
    if (typeof node.$comment === 'string') {
      const stability = /^stability: (stable|development)/.exec(node.$comment);
      if (stability) entry.stability = stability[1];
      const deprecated = /; deprecated: ([^;]+)/.exec(node.$comment);
      if (deprecated) entry.deprecated = deprecated[1].trim();
    }
    const conditional = new Set();
    for (const clause of node.allOf ?? []) {
      if (clause && typeof clause === 'object' && clause.if && clause.then && Array.isArray(clause.then.required)) {
        for (const name of clause.then.required) conditional.add(name);
      }
    }
    if (conditional.size > 0) entry.conditionalRequired = [...conditional].sort();
    out[path] = entry;
  } else {
    // The root has no entry of its own, but its allOf if/then (the lease record's per-event
    // requirements) is a promise too: recorded under the empty path when present.
    const rootConditional = new Set();
    for (const clause of node.allOf ?? []) {
      if (clause && typeof clause === 'object' && clause.if && clause.then && Array.isArray(clause.then.required)) for (const name of clause.then.required) rootConditional.add(name);
    }
    if (rootConditional.size > 0) out[''] = { required: false, conditionalRequired: [...rootConditional].sort() };
  }

  const requiredHere = new Set(node.required ?? []);
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    digest(child, path ? `${path}.${key}` : key, requiredHere.has(key), out, ctx);
  }
  if (node.items) {
    digest(node.items, `${path}[]`, false, out, ctx);
  }
  if (node.additionalProperties && typeof node.additionalProperties === 'object') {
    // The shape of every unnamed member, e.g. the scalar-only `details` values.
    digest(node.additionalProperties, `${path}.*`, false, out, ctx);
  }
  for (const [key, child] of Object.entries(node.definitions ?? {})) {
    digest(child, `#${key}`, false, out, ctx);
  }
  // A union's branches describe the SAME path. Walking them as if they were the path itself
  // let the last branch overwrite the entry (format 2 recorded `workspace_id` with the second
  // branch's pattern and no type). Format 3 keeps the parent entry and records the union on it:
  // the branch types as a sorted set and the branch patterns as a sorted set. Children of a
  // branch (properties, items) are still walked, because they are real paths.
  if (Array.isArray(node.anyOf) && path) {
    const entry = out[path];
    const types = new Set();
    const patterns = new Set();
    for (const rawBranch of node.anyOf) {
      const branch = resolveRef(rawBranch, ctx);
      if (!branch || typeof branch !== 'object') continue;
      for (const t of Array.isArray(branch.type) ? branch.type : branch.type ? [branch.type] : []) types.add(t);
      if (typeof branch.pattern === 'string') patterns.add(branch.pattern);
    }
    if (types.size > 0) entry.anyOfTypes = [...types].sort();
    if (patterns.size > 0) entry.anyOfPatterns = [...patterns].sort();
  }
  for (const rawBranch of node.anyOf ?? []) {
    const branch = resolveRef(rawBranch, ctx);
    if (!branch || typeof branch !== 'object') continue;
    const branchCtx = branch.__resolvedFrom ? { definitions: ctx.definitions, stack: [...ctx.stack, branch.__resolvedFrom], via: { name: branch.__resolvedFrom, at: path } } : ctx;
    const requiredHere = new Set(branch.required ?? []);
    for (const [key, child] of Object.entries(branch.properties ?? {})) {
      digest(child, path ? `${path}.${key}` : key, requiredHere.has(key), out, branchCtx);
    }
    if (branch.items) {
      digest(branch.items, `${path}[]`, false, out, branchCtx);
    }
    if (branch.additionalProperties && typeof branch.additionalProperties === 'object') {
      digest(branch.additionalProperties, `${path}.*`, false, out, branchCtx);
    }
  }
}

/** Open unless the root says otherwise. JSON Schema's default is open, and so is the contract's. */
function contentModelOf(schema) {
  return schema.additionalProperties === false ? 'closed' : 'open';
}

/**
 * Build the lock for a schema directory. Defaults to this repository's; check-additive.mjs
 * passes a baseline's schemas exported from git, so a baseline is always digested with the
 * CURRENT generator rather than read from whatever lock format it happened to commit.
 */
export async function buildLock(options = {}) {
  const dir = options.schemaDir ?? schemaDir;
  // `.schema.json` only: `schemas/index.json` is the index of the schemas, not one of them.
  const files = (await readdir(dir)).filter((n) => n.endsWith('.schema.json')).sort();
  const schemas = {};
  const contentModels = {};

  for (const file of files) {
    const schema = JSON.parse(await readFile(join(dir, file), 'utf8'));
    const flat = {};
    digest(schema, '', false, flat, { definitions: schema.definitions ?? {}, stack: [] });
    schemas[file] = Object.fromEntries(Object.keys(flat).sort().map((k) => [k, flat[k]]));
    contentModels[file] = contentModelOf(schema);
  }

  const version = options.version ?? JSON.parse(await readFile(resolve(here, 'package.json'), 'utf8')).version;

  return {
    note: 'Generated by generate-schemas-lock.mjs. The additive-only rule for 1.x is enforced against this file by check-additive.mjs. schemaSetVersion is the PACKAGE version; only `major` is load-bearing. lockFormat 4 records patterns, bounds, content models, union sizes and union branch types and patterns as well as types, required and enums, and digests a local $ref at the referring path so a re-pointed reference is a visible change. lockFormat 5 adds stability, deprecated and conditionalRequired per entry.',
    lockFormat: LOCK_FORMAT,
    // NOTE ON THE NAME. This is the PACKAGE version, and 1.0.1 is where that first stopped
    // being the same thing as the schema set's version: it changed nothing in schemas/, because
    // it released the specification and the canonical-bytes vectors. Only `major` is
    // load-bearing — the additive-only rule is scoped to it — and a tooling-only release cannot
    // move a major, so nothing downstream is affected.
    schemaSetVersion: version,
    major: version.split('.')[0],
    contentModels,
    schemas,
  };
}

async function main() {
  const lock = await buildLock();
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${lockPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
