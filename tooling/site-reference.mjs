#!/usr/bin/env node
/**
 * The schema reference of the documentation site: `/reference/` and one page per schema at
 * `/reference/<name>/`, generated from `schemas/*.schema.json` by a walker of our own. Called by
 * `tooling/build-site.mjs` (`buildReference`); never run on its own except for its self-test.
 *
 * The walker follows the traversal conventions of `generate-schemas-lock.mjs`, so the reference
 * and the lock agree on what exists: a dotted path per declared property, `[]` for items, `.*`
 * for the shape of every unnamed member, `#name` for a definition, and a union's branches walked
 * as the same path. It does not import the lock generator, which has its own side effects. Two
 * deliberate differences, both stated on the page: a local `$ref` is NOT expanded in place (the
 * row links to the definition's section instead, where the lock digests the definition at the
 * referring path), and an inlined copy of another schema (the lease's `grantedManifest`, the
 * record's `manifest` and `lease`, listed once in `conformance/inlined-copies.mjs`) is walked in
 * place and labelled as a copy.
 *
 * Nothing is dropped silently. Every keyword the walker knows is rendered in its column; a
 * keyword it does not know is listed verbatim in the constraints column with its JSON, because a
 * review found a generator dropping keywords silently once before. `if` bodies and `contains`
 * clauses are conditions rather than declarations (conformance/metaschema.json says so), so their
 * `properties` are rendered as conditions, not as rows: `if`/`then` as "required when", and
 * `contains` as a constraint on the array.
 *
 * Deterministic: schema files in sorted order, keys in document order, nothing from the
 * environment. Every internal href carries the site base the caller passes.
 *
 * `CDF_SITE_SELF_TEST=1 node tooling/site-reference.mjs` runs the walker assertions against the
 * repository's schemas and builds nothing; `build-site.mjs`'s self-test runs the same block.
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { INLINED_COPIES } from '../conformance/inlined-copies.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');

/** A refusal with a named cause, in the walker's own words. */
class ReferenceError_ extends Error {}

// ---------------------------------------------------------------------------------------------
// Keywords.
// ---------------------------------------------------------------------------------------------

/** Keywords the walker handles structurally (children, type, text) rather than as constraints. */
const STRUCTURAL = new Set([
  'type', 'properties', 'required', 'items', 'additionalProperties', 'patternProperties',
  'definitions', 'description', '$comment', 'title', '$ref',
  'anyOf', 'oneOf', 'allOf', 'not', 'if', 'then', 'else', 'contains', 'propertyNames',
]);

/** Keywords rendered in the constraints column, in this order. */
const CONSTRAINT_KEYWORDS = [
  'const', 'enum', 'pattern', 'format', 'minLength', 'maxLength',
  'minimum', 'exclusiveMinimum', 'maximum', 'exclusiveMaximum', 'multipleOf',
  'minItems', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties',
  'default', 'examples',
];

/** Keywords that belong to a schema file's root and are rendered in the page header. */
const ROOT_KEYWORDS = new Set(['$schema', '$id']);

const ENUM_IN_FULL = 10;

// ---------------------------------------------------------------------------------------------
// Text helpers.
// ---------------------------------------------------------------------------------------------

/**
 * HTML-escaped. A control character (the audit event's `summary` pattern refuses U+0000 to
 * U+001F as literal characters) is shown as its `\uXXXX` escape, because U+0000 is not valid in
 * HTML and the others would render as nothing, which is a constraint dropped silently.
 */
function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** Description text: escaped, with the schemas' backtick spans rendered as code. */
function prose(text) {
  return esc(text).replace(/`([^`]+)`/g, '<code>$1</code>');
}

function code(value) {
  return `<code>${esc(value)}</code>`;
}

function json(value) {
  return code(JSON.stringify(value));
}

/** The first sentence of a description, for a one-line listing. */
export function firstSentence(text) {
  const m = /^(.*?[.!?])(?:\s|$)/.exec(text.trim());
  return m ? m[1] : text.trim();
}

/** `a`, `b` or `c`. */
function listOf(items, conjunction = 'or') {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`;
}

/**
 * The stability `$comment` convention, as conformance/metaschema.json states it:
 * `stability: stable|development[; deprecated: <replacement>][; <free text>]`. Returns null for a
 * comment that is not in that form, which the caller then shows verbatim.
 */
export function parseStability(comment) {
  if (typeof comment !== 'string') return null;
  const m = /^stability: (stable|development)(?:; deprecated: ([^;]+))?(?:; (.*))?$/.exec(comment);
  if (!m) return null;
  return { level: m[1], deprecated: m[2] ? m[2].trim() : null, note: m[3] ? m[3].trim() : null };
}

function isLocalRef(node) {
  return Boolean(node) && typeof node === 'object' && typeof node.$ref === 'string' && node.$ref.startsWith('#/definitions/');
}

function refName(node) {
  return node.$ref.slice('#/definitions/'.length);
}

/** `enum` in full up to ten values; beyond that a count and three examples. */
function enumText(values, what = 'one of') {
  const shown = values.length <= ENUM_IN_FULL ? values : values.slice(0, 3);
  const list = shown.map((v) => json(v)).join(', ');
  return values.length <= ENUM_IN_FULL
    ? `${what} ${list}`
    : `${what} ${values.length} values, e.g. ${list}`;
}

// ---------------------------------------------------------------------------------------------
// The walker.
// ---------------------------------------------------------------------------------------------

function definitionOf(name, ctx) {
  const target = ctx.definitions[name];
  if (!target || typeof target !== 'object') {
    throw new ReferenceError_(`${ctx.file}: $ref to #/definitions/${name}, which the schema does not define`);
  }
  return target;
}

/** The type a reader sees: the declared type, the union of the branches, or the definition's. */
function typeText(node, ctx, depth = 0) {
  if (!node || typeof node !== 'object') return 'any';
  if (isLocalRef(node)) {
    return depth > 8 ? 'any' : typeText(definitionOf(refName(node), ctx), ctx, depth + 1);
  }
  if (node.type !== undefined) return Array.isArray(node.type) ? node.type.join(' | ') : String(node.type);
  const branches = node.anyOf ?? node.oneOf;
  if (Array.isArray(branches)) {
    const types = [];
    for (const branch of branches) {
      for (const t of typeText(branch, ctx, depth + 1).split(' | ')) if (!types.includes(t)) types.push(t);
    }
    if (types.length > 0) return types.join(' | ');
  }
  if (node.properties || node.additionalProperties !== undefined || node.patternProperties) return 'object';
  if (node.items) return 'array';
  return 'any';
}

/** The `allOf: [{ not: { pattern } }, …]` idiom: the patterns a value must not match. */
function notPatternsOf(node) {
  return (node.allOf ?? [])
    .filter((b) => b && typeof b === 'object' && b.not && typeof b.not.pattern === 'string' && Object.keys(b).length === 1 && Object.keys(b.not).length === 1)
    .map((b) => b.not.pattern);
}

function isConditional(branch) {
  return Boolean(branch) && typeof branch === 'object' && branch.if !== undefined;
}

function isContains(branch) {
  return Boolean(branch) && typeof branch === 'object' && branch.contains !== undefined && Object.keys(branch).length === 1;
}

/** What an object's keys must satisfy, from `propertyNames`. */
function keysText(names) {
  if (names === true) return [];
  if (names === false) return ['no keys at all'];
  const parts = [];
  if (typeof names.pattern === 'string') parts.push(`keys must match ${code(names.pattern)}`);
  if (Array.isArray(names.enum)) parts.push(enumText(names.enum, 'keys one of'));
  const refused = [];
  if (names.not && typeof names.not === 'object') {
    if (typeof names.not.pattern === 'string') refused.push(`keys must not match ${code(names.not.pattern)}`);
    if (Array.isArray(names.not.enum)) refused.push(enumText(names.not.enum, 'keys must not be'));
    const otherNot = Object.keys(names.not).filter((k) => k !== 'pattern' && k !== 'enum');
    if (otherNot.length > 0) refused.push(`keys must not satisfy ${json(names.not)}`);
  }
  for (const p of notPatternsOf(names)) refused.push(`keys must not match ${code(p)}`);
  parts.push(...refused);
  if (typeof names.minLength === 'number') parts.push(`key min length ${esc(names.minLength)}`);
  if (typeof names.maxLength === 'number') parts.push(`key max length ${esc(names.maxLength)}`);
  if (names.description) parts.push(`<small>${prose(names.description)}</small>`);
  const known = new Set(['pattern', 'enum', 'not', 'description', 'minLength', 'maxLength', 'type']);
  for (const [k, v] of Object.entries(names)) {
    if (known.has(k)) continue;
    if (k === 'allOf' && Array.isArray(v) && notPatternsOf(names).length === v.length) continue;
    parts.push(`<code>propertyNames.${esc(k)}</code>: ${json(v)}`);
  }
  return parts;
}

/**
 * One line about a schema node, for a union branch, a `contains` clause or a `not`. Shows the
 * type, the discriminating `const`/`enum` of each declared property, the requirements and the
 * constraints, and the description.
 */
function summarise(node, ctx, depth = 0) {
  if (node === true) return 'anything';
  if (node === false) return 'nothing';
  if (!node || typeof node !== 'object') return json(node);
  if (isLocalRef(node)) {
    return `${definitionLink(refName(node))}${node.description ? ` (${prose(node.description)})` : ''}`;
  }
  const type = typeText(node, ctx);
  const parts = type === 'any' ? [] : [esc(type)];
  if (node.properties && typeof node.properties === 'object') {
    const keys = Object.entries(node.properties).map(([k, child]) => {
      if (child && typeof child === 'object') {
        if (child.const !== undefined) return `${code(k)} = ${json(child.const)}`;
        if (Array.isArray(child.enum) && child.enum.length === 1) return `${code(k)} = ${json(child.enum[0])}`;
        if (Array.isArray(child.enum)) return `${code(k)} ${enumText(child.enum)}`;
      }
      return code(k);
    });
    parts.push(`with ${keys.join(', ')}`);
  }
  if (Array.isArray(node.required) && node.required.length > 0) {
    parts.push(`requires ${node.required.map((r) => code(r)).join(', ')}`);
  }
  if (node.items && !Array.isArray(node.items) && depth < 2) parts.push(`of ${summarise(node.items, ctx, depth + 1)}`);
  parts.push(...constraintsOf(node, ctx, { summary: true, depth: depth + 1 }));
  if (node.description) parts.push(prose(node.description));
  return parts.length === 0 ? 'anything' : parts.join(', ');
}

function definitionLink(name) {
  return `<a href="#definition-${esc(name)}">#${esc(name)}</a>`;
}

/**
 * The constraints column of one node: every known constraint keyword in its own words, the
 * union and refusal idioms in words, and every unknown keyword verbatim. With `summary` the text
 * is for a one-line branch summary and nested unions are counted rather than listed.
 */
function constraintsOf(node, ctx, { summary = false, depth = 0, root = false, declared = null } = {}) {
  const out = [];
  for (const key of CONSTRAINT_KEYWORDS) {
    if (!Object.hasOwn(node, key)) continue;
    const v = node[key];
    switch (key) {
      case 'const': out.push(`const ${json(v)}`); break;
      case 'enum': out.push(enumText(v)); break;
      case 'pattern': out.push(`pattern ${code(v)}`); break;
      case 'format': out.push(`format ${code(v)}`); break;
      case 'minLength': out.push(`min length ${esc(v)}`); break;
      case 'maxLength': out.push(`max length ${esc(v)}`); break;
      case 'minimum': out.push(`min ${esc(v)}`); break;
      case 'maximum': out.push(`max ${esc(v)}`); break;
      case 'exclusiveMinimum': out.push(`greater than ${esc(v)}`); break;
      case 'exclusiveMaximum': out.push(`less than ${esc(v)}`); break;
      case 'multipleOf': out.push(`multiple of ${esc(v)}`); break;
      case 'minItems': out.push(`min items ${esc(v)}`); break;
      case 'maxItems': out.push(`max items ${esc(v)}`); break;
      case 'uniqueItems': out.push(v ? 'unique items' : `<code>uniqueItems</code>: ${json(v)}`); break;
      case 'minProperties': out.push(`min properties ${esc(v)}`); break;
      case 'maxProperties': out.push(`max properties ${esc(v)}`); break;
      case 'default': out.push(`default ${json(v)}`); break;
      case 'examples': out.push(`examples ${Array.isArray(v) ? v.map((e) => json(e)).join(', ') : json(v)}`); break;
      default: break;
    }
  }

  // Refusals and conditions written as `allOf` branches, then whatever other branches remain.
  const nots = notPatternsOf(node);
  if (nots.length > 0) out.push(`must not match ${nots.map((p) => code(p)).join(', ')}`);
  const allOfRest = (node.allOf ?? []).filter((b) => !(b && typeof b === 'object' && b.not && Object.keys(b).length === 1 && typeof b.not.pattern === 'string' && Object.keys(b.not).length === 1));
  const containsClauses = [
    ...(node.contains !== undefined ? [node.contains] : []),
    ...allOfRest.filter(isContains).map((b) => b.contains),
  ];
  for (const clause of containsClauses) out.push(`must contain an item: ${summarise(clause, ctx, depth + 1)}`);
  if (isConditional(node) || allOfRest.some(isConditional)) {
    out.push(summary ? 'conditional requirements' : '<a href="#conditional-requirements">conditional requirements</a> (below)');
  }
  const plainAllOf = allOfRest.filter((b) => !isContains(b) && !isConditional(b));
  if (plainAllOf.length > 0) {
    out.push(summary && depth > 1
      ? `all of ${plainAllOf.length} schemas`
      : `all of: ${plainAllOf.map((b, i) => `(${i + 1}) ${summarise(b, ctx, depth + 1)}`).join('; ')}`);
  }
  for (const [keyword, label] of [['anyOf', 'any of'], ['oneOf', 'exactly one of']]) {
    const branches = node[keyword];
    if (!Array.isArray(branches)) continue;
    out.push(summary && depth > 1
      ? `${label} ${branches.length} branches`
      : `${label}: ${branches.map((b, i) => `(${i + 1}) ${summarise(b, ctx, depth + 1)}`).join('; ')}`);
  }
  if (node.not !== undefined) out.push(`must not be: ${summarise(node.not, ctx, depth + 1)}`);
  if (node.propertyNames !== undefined) out.push(...keysText(node.propertyNames));
  if (node.additionalProperties === false) out.push('no additional properties');
  else if (node.additionalProperties && typeof node.additionalProperties === 'object' && !summary) {
    out.push(`additional properties: see ${code(`${declared?.path ?? ''}.*`)}`);
  } else if (node.additionalProperties && typeof node.additionalProperties === 'object' && summary) {
    out.push(`additional properties ${summarise(node.additionalProperties, ctx, depth + 1)}`);
  }
  if (Array.isArray(node.required) && node.required.length > 0 && !summary) {
    const undeclared = node.required.filter((r) => !(node.properties && Object.hasOwn(node.properties, r)));
    if (undeclared.length > 0) out.push(`requires ${undeclared.map((r) => code(r)).join(', ')} (not declared here)`);
  }
  if (typeof node.$comment === 'string' && parseStability(node.$comment) === null && !summary) {
    out.push(`<code>$comment</code>: ${esc(node.$comment)}`);
  }
  if (typeof node.$ref === 'string' && !isLocalRef(node)) out.push(`<code>$ref</code>: ${code(node.$ref)}`);
  for (const [k, v] of Object.entries(node)) {
    if (STRUCTURAL.has(k) || CONSTRAINT_KEYWORDS.includes(k)) continue;
    if (root && ROOT_KEYWORDS.has(k)) continue;
    out.push(`unknown keyword ${code(k)}: ${json(v)}`);
  }
  return out;
}

/**
 * The `if`/`then`/`else` clauses an object node carries, each read into words: the if-condition
 * from `if.properties.<field>.const` or `.enum` (with `if.required` naming the same field, or
 * alone, read as presence), and `then.required` / `else.required` as the names made required.
 * A condition in any other form is kept verbatim, never dropped.
 */
function conditionalsOf(node, owner) {
  const clauses = [];
  if (node.if !== undefined) clauses.push({ if: node.if, then: node.then, else: node.else });
  for (const branch of node.allOf ?? []) if (isConditional(branch)) clauses.push({ if: branch.if, then: branch.then, else: branch.else });
  return clauses.map((clause) => {
    const cond = readCondition(clause.if);
    const entries = [];
    for (const [branch, body] of [['then', clause.then], ['else', clause.else]]) {
      if (!body || typeof body !== 'object') continue;
      for (const name of body.required ?? []) {
        for (const value of cond.values ?? [null]) entries.push({ field: name, branch, value });
      }
    }
    const extra = {};
    for (const [branch, body] of [['then', clause.then], ['else', clause.else]]) {
      if (!body || typeof body !== 'object') continue;
      const rest = Object.fromEntries(Object.entries(body).filter(([k]) => k !== 'required' && k !== 'properties'));
      if (Object.keys(rest).length > 0) extra[branch] = rest;
    }
    return { owner, condition: cond, then: clause.then, else: clause.else, entries, extra };
  });
}

function readCondition(ifNode) {
  if (!ifNode || typeof ifNode !== 'object') return { verbatim: JSON.stringify(ifNode) };
  const keys = Object.keys(ifNode);
  const props = ifNode.properties && typeof ifNode.properties === 'object' ? Object.entries(ifNode.properties) : [];
  const required = Array.isArray(ifNode.required) ? ifNode.required : null;
  const simpleKeys = keys.every((k) => k === 'properties' || k === 'required');
  if (simpleKeys && props.length === 1) {
    const [field, sub] = props[0];
    const subKeys = Object.keys(sub ?? {}).filter((k) => k !== '$comment' && k !== 'description');
    const values = sub && sub.const !== undefined ? [sub.const] : Array.isArray(sub?.enum) ? sub.enum : null;
    const onlyThatField = required === null || (required.length === 1 && required[0] === field);
    if (values && onlyThatField && subKeys.every((k) => k === 'const' || k === 'enum')) {
      return {
        field, values,
        text: `when ${code(field)} is ${listOf(values.map((v) => json(v)))}`,
        plain: `when \`${field}\` is ${listOf(values.map((v) => `\`${JSON.stringify(v)}\``))}`,
      };
    }
  }
  if (simpleKeys && props.length === 0 && required && required.length === 1) {
    return { field: required[0], present: true, text: `when ${code(required[0])} is present`, plain: `when \`${required[0]}\` is present` };
  }
  return { verbatim: JSON.stringify(ifNode), text: `when the object matches ${json(ifNode)}`, plain: `when the object matches \`${JSON.stringify(ifNode)}\`` };
}

/** The "required when" text of one property from the clauses that apply to its object. */
function requiredWhen(name, conditionals) {
  const parts = [];
  for (const c of conditionals) {
    const branches = new Set(c.entries.filter((e) => e.field === name).map((e) => e.branch));
    for (const branch of branches) {
      parts.push(branch === 'then' ? c.condition.text : c.condition.text.replace(/^when /, 'unless '));
    }
  }
  return parts;
}

/**
 * Walks one schema document. Returns the rows under the root, one block per definition, every
 * conditional clause, and the root's own facts.
 */
export function walkSchema(file, schema) {
  const ctx = { file, definitions: schema.definitions ?? {}, conditionals: [] };
  const copies = new Map(
    INLINED_COPIES.filter((c) => c.file === file && c.pointer[0] === 'definitions').map((c) => [c.pointer[1], c.source]),
  );

  const rows = [];
  walkChildren(schema, '', { conditionals: [], note: null, owner: 'root' }, rows, ctx);

  const definitions = [];
  for (const [name, def] of Object.entries(ctx.definitions)) {
    const defRows = [];
    const copy = copies.get(name) ?? null;
    const note = copy ? `an inlined copy of ${copy}, held identical to its source` : null;
    walkNode(def, `#${name}`, { required: false, requiredWhen: [], note, inheritNote: false, owner: `#${name}`, conditionals: [], kind: 'definition' }, defRows, ctx);
    definitions.push({ name, title: typeof def.title === 'string' ? def.title : null, copy, rows: defRows });
  }

  const root = {
    type: typeText(schema, ctx),
    contentModel: schema.additionalProperties === false ? 'closed' : 'open',
    required: Array.isArray(schema.required) ? schema.required : [],
    constraints: constraintsOf(schema, ctx, { root: true, declared: { path: '' } }),
    stability: parseStability(schema.$comment),
    comment: typeof schema.$comment === 'string' ? schema.$comment : null,
  };
  const propertyCount = [...rows, ...definitions.flatMap((d) => d.rows)].filter((r) => r.kind === 'property').length;
  return { file, schema, rows, definitions, conditionals: ctx.conditionals, root, propertyCount };
}

/** Emits the row for `node` at `path`, then walks its children. */
function walkNode(node, path, opts, rows, ctx) {
  if (!node || typeof node !== 'object') {
    rows.push({
      path, kind: opts.kind ?? 'property', type: node === true ? 'any' : node === false ? 'nothing' : 'any', ref: null,
      required: opts.required, requiredWhen: opts.requiredWhen, title: null, description: '',
      constraints: [`schema ${json(node)}`], stability: null, note: opts.note,
    });
    return;
  }
  const ref = isLocalRef(node) ? refName(node) : null;
  const target = ref ? definitionOf(ref, ctx) : null;
  const description = typeof node.description === 'string' ? node.description : target && typeof target.description === 'string' ? target.description : '';
  rows.push({
    path,
    kind: opts.kind ?? 'property',
    type: typeText(node, ctx),
    ref,
    required: opts.required,
    requiredWhen: opts.requiredWhen,
    title: typeof node.title === 'string' ? node.title : null,
    description,
    constraints: constraintsOf(node, ctx, { declared: { path } }),
    stability: parseStability(node.$comment),
    note: opts.note,
  });
  if (ref) return; // not expanded in place: the definition's section carries its rows
  walkChildren(node, path, { conditionals: opts.conditionals ?? [], note: opts.inheritNote === false ? null : opts.note, owner: opts.owner ?? path }, rows, ctx);
}

/** Walks the children of an object/array/union node at `path`, without a row for the node. */
function walkChildren(node, path, { conditionals: inherited, note, owner, bodyCondition = null }, rows, ctx) {
  if (!node || typeof node !== 'object' || isLocalRef(node)) return;
  const own = conditionalsOf(node, owner);
  ctx.conditionals.push(...own);
  const conditionals = [...inherited, ...own];
  const requiredHere = new Set(Array.isArray(node.required) ? node.required : []);
  const child = (sub, subPath, extra = {}) => walkNode(sub, subPath, {
    required: false, requiredWhen: [], note, owner: subPath, conditionals, ...extra,
  }, rows, ctx);

  for (const [key, sub] of Object.entries(node.properties ?? {})) {
    // Inside a `then`/`else` body the body's own `required` holds under its condition only.
    const when = [...(bodyCondition && requiredHere.has(key) ? [bodyCondition] : []), ...requiredWhen(key, conditionals)];
    child(sub, path ? `${path}.${key}` : key, {
      required: bodyCondition ? false : requiredHere.has(key),
      requiredWhen: when.filter((w, i) => when.indexOf(w) === i),
    });
  }
  if (Array.isArray(node.items)) {
    node.items.forEach((sub, i) => child(sub, `${path}[${i}]`, { kind: 'items' }));
  } else if (node.items !== undefined) {
    child(node.items, `${path}[]`, { kind: 'items' });
  }
  if (node.additionalProperties && typeof node.additionalProperties === 'object') {
    child(node.additionalProperties, `${path}.*`, { kind: 'additional' });
  }
  for (const [pattern, sub] of Object.entries(node.patternProperties ?? {})) {
    child(sub, `${path}.{${pattern}}`, { kind: 'pattern' });
  }
  for (const keyword of ['anyOf', 'oneOf', 'allOf']) {
    const branches = node[keyword];
    if (!Array.isArray(branches)) continue;
    branches.forEach((branch, i) => {
      if (!branch || typeof branch !== 'object' || isLocalRef(branch)) return;
      if (isConditional(branch)) {
        walkConditionBodies(branch, path, { conditionals, note, owner }, rows, ctx);
        return;
      }
      const branchNote = `${keyword} branch ${i + 1} of ${branches.length}${branch.description ? `: ${branch.description}` : ''}`;
      walkChildren(branch, path, { conditionals, note: note ? `${note}; ${branchNote}` : branchNote, owner }, rows, ctx);
    });
  }
  if (node.if !== undefined) walkConditionBodies(node, path, { conditionals, note, owner }, rows, ctx);
}

/** The `then`/`else` bodies of one clause: their declarations are rows, labelled by the condition. */
function walkConditionBodies(clause, path, { conditionals, note, owner }, rows, ctx) {
  const cond = readCondition(clause.if);
  for (const [branch, body] of [['then', clause.then], ['else', clause.else]]) {
    if (!body || typeof body !== 'object' || isLocalRef(body)) continue;
    const text = branch === 'then' ? cond.text : cond.text.replace(/^when /, 'unless ');
    const bodyNote = `${branch}: ${branch === 'then' ? cond.plain : cond.plain.replace(/^when /, 'unless ')}`;
    walkChildren(body, path, { conditionals, note: note ? `${note}; ${bodyNote}` : bodyNote, owner, bodyCondition: text }, rows, ctx);
  }
}

// ---------------------------------------------------------------------------------------------
// Rendering.
// ---------------------------------------------------------------------------------------------

function stabilityCell(stability) {
  if (!stability) return '<td class="stability"></td>';
  let text = esc(stability.level);
  if (stability.deprecated) text += `, deprecated: ${code(stability.deprecated)}`;
  if (stability.note) text += `<br><small>${prose(stability.note)}</small>`;
  return `<td class="stability stability-${esc(stability.level)}${stability.deprecated ? ' deprecated' : ''}">${text}</td>`;
}

function rowHtml(row) {
  const path = `${code(row.path)}${row.note ? `<br><small class="note">${prose(row.note)}</small>` : ''}`;
  const type = `${esc(row.type)}${row.ref ? ` ${definitionLink(row.ref)}` : ''}`;
  const required = [row.required ? 'yes' : '', ...row.requiredWhen].filter(Boolean).join('<br>');
  const description = `${row.title ? `<strong>${esc(row.title)}</strong> ` : ''}${prose(row.description)}`;
  return `<tr><td class="path">${path}</td><td>${type}</td><td>${required}</td><td>${description}</td><td>${row.constraints.join('<br>')}</td>${stabilityCell(row.stability)}</tr>`;
}

function tableHtml(rows) {
  return `<table class="reference">
<thead><tr><th>Path</th><th>Type</th><th>Required</th><th>Description</th><th>Constraints</th><th>Stability</th></tr></thead>
<tbody>
${rows.map(rowHtml).join('\n')}
</tbody>
</table>`;
}

function conditionalsHtml(conditionals, ctx) {
  const rows = [];
  for (const c of conditionals) {
    const where = c.owner === 'root' ? 'the root' : code(c.owner);
    for (const e of c.entries) {
      const text = c.condition.values
        ? `${e.branch === 'then' ? 'when' : 'unless'} ${code(c.condition.field)} is ${json(e.value)}`
        : e.branch === 'then' ? c.condition.text : c.condition.text.replace(/^when /, 'unless ');
      rows.push(`<tr><td>${code(e.field)}</td><td>${text}</td><td>${where}</td></tr>`);
    }
    for (const [branch, body] of [['then', c.then], ['else', c.else]]) {
      if (!body || typeof body !== 'object' || !body.properties) continue;
      for (const [name, sub] of Object.entries(body.properties)) {
        rows.push(`<tr><td>${code(name)}</td><td>${branch === 'then' ? c.condition.text : c.condition.text.replace(/^when /, 'unless ')}, must be ${summarise(sub, ctx, 2)}</td><td>${where}</td></tr>`);
      }
    }
    for (const [branch, rest] of Object.entries(c.extra)) {
      rows.push(`<tr><td></td><td>${branch} also: ${json(rest)}</td><td>${where}</td></tr>`);
    }
  }
  return `<table>
<thead><tr><th>Property</th><th>Required</th><th>Where</th></tr></thead>
<tbody>
${rows.join('\n')}
</tbody>
</table>`;
}

/** The number of entries (one per required name per condition value) across the clauses. */
export function conditionalEntryCount(walked) {
  return walked.conditionals.reduce((n, c) => n + c.entries.length, 0);
}

function schemaName(file) {
  return file.replace(/\.schema\.json$/, '');
}

function schemaPage(walked, { base, major, siteName }) {
  const { file, schema, rows, definitions, conditionals, root, propertyCount } = walked;
  const name = schemaName(file);
  const raw = `${base}/${major}.x/${file}`;
  const rootFacts = [];
  if (schema.anyOf || schema.oneOf) {
    rootFacts.push(`${esc(root.type)}; ${root.constraints.join('; ')}`);
  } else {
    rootFacts.push(`${esc(root.type)}, ${root.contentModel === 'closed' ? 'closed (no additional properties)' : 'open (additional properties are carried)'}`);
    if (root.required.length > 0) rootFacts.push(`required: ${root.required.map((r) => code(r)).join(', ')}`);
    const rest = root.constraints.filter((c) => !/^no additional properties$/.test(c));
    if (rest.length > 0) rootFacts.push(rest.join('; '));
  }
  const rootStability = root.stability
    ? `${esc(root.stability.level)}${root.stability.deprecated ? `, deprecated: ${code(root.stability.deprecated)}` : ''}${root.stability.note ? ` (${prose(root.stability.note)})` : ''}`
    : root.comment
      ? `<code>$comment</code>: ${esc(root.comment)}`
      : 'none stated at the root; every declared property carries its own';
  const definitionCount = definitions.reduce((n, d) => n + d.rows.filter((r) => r.kind === 'property').length, 0);

  const definitionsHtml = definitions.length === 0 ? '' : `<h2 id="definitions">Definitions</h2>
<p>The named shapes this schema refers to as <code>#name</code>. A row above that links here is not expanded in place; its constraints are the definition's.</p>
${definitions.map((d) => `<h3 id="definition-${esc(d.name)}"><code>#${esc(d.name)}</code>${d.title ? `: ${esc(d.title)}` : ''}</h3>
${d.copy ? `<p class="note">An inlined copy of ${code(d.copy)} (${link(`${base}/reference/${schemaName(d.copy)}/`, 'its reference')}), carried so the schema is self-contained and held identical to its source by <code>npm test</code>.</p>\n` : ''}${tableHtml(d.rows)}`).join('\n')}
`;
  const conditionalsSection = conditionals.length === 0 ? '' : `<h2 id="conditional-requirements">Conditional requirements</h2>
<p>What an <code>if</code>/<code>then</code> clause makes required, one line per property and condition value; the same text appears in the Required column above.</p>
${conditionalsHtml(conditionals, { file, definitions: schema.definitions ?? {} })}
`;
  const body = `<h1>${esc(schema.title ?? name)}</h1>
<p class="lead">${prose(schema.description ?? '')}</p>
<dl class="facts">
<dt>Schema</dt><dd>${code(file)}, served as JSON at its <code>$id</code>: ${link(raw, schema.$id ?? raw)}</dd>
<dt>Dialect</dt><dd>${code(schema.$schema ?? 'not stated')}</dd>
<dt>Root</dt><dd>${rootFacts.join('<br>')}</dd>
<dt>Stability</dt><dd>${rootStability}</dd>
<dt>Properties</dt><dd>${propertyCount} declared: ${propertyCount - definitionCount} under the root, ${definitionCount} in definitions</dd>
</dl>
<h2 id="properties">Properties</h2>
<p>Every declared property under the root, in the schema's own order. <code>[]</code> is an array's items, <code>.*</code> the shape of every unnamed member, <code>#name</code> a definition. Objects carry additional properties unless a row says otherwise.</p>
${rows.length === 0 ? '<p>The root declares no properties of its own; see the definitions.</p>' : tableHtml(rows)}
${definitionsHtml}${conditionalsSection}`;
  return { path: `/reference/${name}/`, section: '/reference/', title: `${schema.title ?? name} · ${siteName}`, body };
}

function link(href, text) {
  return `<a href="${esc(href)}">${esc(text)}</a>`;
}

function indexPage(walkedAll, { base, major, siteName, stabilityLegend }) {
  const rows = walkedAll.map((w) => {
    const name = schemaName(w.file);
    return `<tr><td>${link(`${base}/reference/${name}/`, name)}</td>`
      + `<td>${esc(w.schema.title ?? '')}</td>`
      + `<td>${prose(firstSentence(w.schema.description ?? ''))}</td>`
      + `<td>${w.propertyCount}</td>`
      + `<td>${link(`${base}/${major}.x/${w.file}`, 'JSON')}</td></tr>`;
  });
  const total = walkedAll.reduce((n, w) => n + w.propertyCount, 0);
  const body = `<h1>Schema reference</h1>
<p>One page per schema of set ${esc(major)}.x, read from the schema files themselves: every declared property with its path, type, requirement, description, constraints and stability, and every definition a property refers to. The pages are generated from <code>schemas/*.schema.json</code> at every deploy, so they say what the schemas say and nothing else; the JSON each page links to is the file served at the schema's <code>$id</code>.</p>
<table>
<thead><tr><th>Schema</th><th>Title</th><th>Description</th><th>Properties</th><th>Raw</th></tr></thead>
<tbody>
${rows.join('\n')}
</tbody>
</table>
<p>${esc(String(walkedAll.length))} schemas, ${esc(String(total))} declared properties.</p>
<h2 id="stability">Stability</h2>
<p>Every declared property carries a <code>$comment</code> that states its stability, in the form <code>conformance/metaschema.json</code> holds: ${prose(stabilityLegend)}</p>
<ul class="legend">
<li><strong>stable</strong>: a promise under the additive-only rule for the major.</li>
<li><strong>development</strong>: may change within the major, and says so.</li>
<li><strong>deprecated</strong>: shown beside the stability with its replacement; a writer should stop using the field, and the field stays.</li>
</ul>
`;
  return { path: '/reference/', title: `Schema reference · ${siteName}`, body };
}

// ---------------------------------------------------------------------------------------------
// Entry points.
// ---------------------------------------------------------------------------------------------

/** Reads the schema files named (from `schemas/`) and the stability convention's own words. */
export async function loadReferenceInputs(files, root = ROOT) {
  const schemas = [];
  for (const file of files) {
    schemas.push({ file, schema: JSON.parse(await readFile(resolve(root, 'schemas', file), 'utf8')) });
  }
  const metaschema = JSON.parse(await readFile(resolve(root, 'conformance', 'metaschema.json'), 'utf8'));
  const stabilityLegend = metaschema.definitions?.stabilityComment?.description;
  if (typeof stabilityLegend !== 'string') {
    throw new ReferenceError_('conformance/metaschema.json: definitions.stabilityComment.description is missing, and the legend quotes it');
  }
  return { schemas, stabilityLegend };
}

/**
 * The reference pages: `/reference/` and `/reference/<name>/` for every schema given, as
 * `{ path, title, body }` for the caller's template, a schema page carrying `section: '/reference/'`
 * so the nav marks Reference as current on it. `base` is the site's path prefix and every
 * internal href carries it.
 */
export function referencePages({ schemas, stabilityLegend }, { base, major, siteName }) {
  const walkedAll = schemas.map(({ file, schema }) => walkSchema(file, schema));
  const options = { base, major, siteName, stabilityLegend };
  return [indexPage(walkedAll, options), ...walkedAll.map((w) => schemaPage(w, options))];
}

// ---------------------------------------------------------------------------------------------
// Self-test: the walker against the repository's schemas, under the site's environment flag.
// ---------------------------------------------------------------------------------------------

/** Every key of every `properties` object, counted independently of the walker. */
function countPropertyKeys(node, inCondition = false) {
  if (!node || typeof node !== 'object') return { all: 0, declared: 0 };
  if (Array.isArray(node)) {
    return node.reduce((acc, item) => {
      const c = countPropertyKeys(item, inCondition);
      return { all: acc.all + c.all, declared: acc.declared + c.declared };
    }, { all: 0, declared: 0 });
  }
  let all = 0;
  let declared = 0;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'properties' && value && typeof value === 'object') {
      const n = Object.keys(value).length;
      all += n;
      if (!inCondition) declared += n;
      for (const sub of Object.values(value)) {
        const c = countPropertyKeys(sub, inCondition);
        all += c.all;
        declared += c.declared;
      }
      continue;
    }
    // `if`, `contains`, `not` and `propertyNames` hold conditions, not declarations
    // (conformance/metaschema.json); `then`/`else` bodies are walked and so are declarations.
    const condition = inCondition || key === 'if' || key === 'contains' || key === 'not' || key === 'propertyNames';
    const c = countPropertyKeys(value, condition);
    all += c.all;
    declared += c.declared;
  }
  return { all, declared };
}

export async function selfTestReference() {
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(resolve(ROOT, 'schemas'))).filter((f) => f.endsWith('.schema.json')).sort();
  const inputs = await loadReferenceInputs(files);
  let count = 0;
  const check = (actual, wanted, what) => {
    if (actual !== wanted) throw new Error(`site-reference self-test: ${what}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(wanted)}`);
    count += 1;
  };
  const includes = (haystack, needle, what) => {
    if (!haystack.includes(needle)) throw new Error(`site-reference self-test: ${what}: ${JSON.stringify(needle)} not found in ${JSON.stringify(haystack).slice(0, 400)}`);
    count += 1;
  };

  check(inputs.schemas.length, 10, 'ten schemas');
  const walked = inputs.schemas.map(({ file, schema }) => walkSchema(file, schema));
  const byName = Object.fromEntries(walked.map((w) => [schemaName(w.file), w]));

  // Property rows equal the declared `properties` keys counted independently; the keys inside
  // `if`, `contains`, `not` and `propertyNames` bodies are conditions and are rendered as such.
  const counted = inputs.schemas.reduce((acc, { schema }) => {
    const c = countPropertyKeys(schema);
    return { all: acc.all + c.all, declared: acc.declared + c.declared };
  }, { all: 0, declared: 0 });
  const rowsTotal = walked.reduce((n, w) => n + w.propertyCount, 0);
  check(rowsTotal, counted.declared, `property rows across the set equal the declared \`properties\` keys (${counted.all} keys in all, ${counted.all - counted.declared} of them inside condition bodies)`);
  for (const w of walked) {
    check(w.propertyCount, countPropertyKeys(w.schema).declared, `${w.file}: property rows equal its declared keys`);
  }

  // The lease record's per-event requirements: one entry per required name per condition value,
  // counted independently from the clauses themselves.
  const leaseRecord = byName['lease-record'];
  let expectedEntries = 0;
  for (const clause of leaseRecord.schema.allOf ?? []) {
    if (!clause.if || !clause.then) continue;
    const event = clause.if.properties?.event ?? {};
    const values = event.const !== undefined ? 1 : Array.isArray(event.enum) ? event.enum.length : 1;
    expectedEntries += (clause.then.required ?? []).length * values;
  }
  const entries = conditionalEntryCount(leaseRecord);
  check(entries, expectedEntries, 'lease-record conditional-requirement entries equal the clauses read independently');
  check(entries >= 9, true, `lease-record yields at least nine conditional-requirement entries (${entries})`);
  const reasonsRow = leaseRecord.rows.find((r) => r.path === 'reasons');
  includes(reasonsRow.requiredWhen.join(' '), 'when <code>event</code> is <code>&quot;refused&quot;</code>', 'reasons is required when event is refused');
  const reasonRow = leaseRecord.rows.find((r) => r.path === 'reason');
  includes(reasonRow.requiredWhen.join(' '), '<code>&quot;narrowed&quot;</code>, <code>&quot;revoked&quot;</code> or <code>&quot;stopped&quot;</code>', 'reason is required for the three events');

  // A `then` body's declaration is a row, labelled by its condition, required under it only.
  const entry = byName['plugin-marketplace'].definitions.find((d) => d.name === 'entry');
  const strictRows = entry.rows.filter((r) => r.path === '#entry.strict');
  check(strictRows.length, 2, 'entry.strict is declared once and once more in the then body');
  check(strictRows[1].note, 'then: when `headersHelper` is present', 'the then-body row is labelled by its condition');
  check(strictRows[1].required, false, 'the then-body requirement is not shown as unconditional');
  check(strictRows[1].requiredWhen.length, 1, 'the then-body requirement is shown once');
  includes(strictRows[1].constraints.join('\n'), 'const <code>false</code>', 'the then-body row shows its const');

  // The lease's grantedManifest is an inlined copy, labelled as one and walked in place.
  const lease = byName['agent-lease'];
  const granted = lease.definitions.find((d) => d.name === 'grantedManifest');
  check(granted.copy, 'agent-lease-manifest.schema.json', 'agent-lease labels #grantedManifest as an inlined copy');
  includes(granted.rows[0].note, 'an inlined copy of agent-lease-manifest.schema.json', 'the copy note is on the definition row');
  check(granted.rows.some((r) => r.path === '#grantedManifest.allow.hosts[]'), true, 'the copy is walked in place');
  const manifestRow = lease.rows.find((r) => r.path === 'manifest');
  check(manifestRow.ref, 'grantedManifest', 'the manifest row links to the definition');
  check(lease.rows.some((r) => r.path.startsWith('manifest.')), false, 'a $ref is not expanded in place');

  // audit-event `details` shows its propertyNames refusals.
  const details = byName['audit-event'].rows.find((r) => r.path === 'details');
  const detailsConstraints = details.constraints.join('\n');
  for (const fragment of ['keys must not match', 'authorization|content|file|password|path|payload|prompt|request|secret|token', 'Authorization|Content|File']) {
    includes(detailsConstraints, fragment, 'audit-event details lists its key refusals');
  }
  check(byName['audit-event'].rows.some((r) => r.path === 'details.*'), true, 'audit-event details.* is a row');

  // agent-lease-manifest `allow.hosts[]` shows the host pattern; `allow.tool_args` is development.
  const manifest = byName['agent-lease-manifest'];
  const allow = manifest.definitions.find((d) => d.name === 'allow');
  const hosts = allow.rows.find((r) => r.path === '#allow.hosts[]');
  includes(hosts.constraints.join('\n'), 'pattern <code>^(\\*|(\\*\\.)?[a-z0-9]', 'allow.hosts[] shows the host pattern');
  includes(hosts.constraints.join('\n'), 'max length 253', 'allow.hosts[] shows its bound');
  const toolArgs = allow.rows.find((r) => r.path === '#allow.tool_args');
  check(toolArgs.stability.level, 'development', 'allow.tool_args is development');
  includes(toolArgs.constraints.join('\n'), 'keys must match', 'allow.tool_args shows its key pattern');
  const page = referencePages({ schemas: [inputs.schemas.find((s) => s.file === manifest.file)], stabilityLegend: inputs.stabilityLegend }, { base: '/contract', major: '1', siteName: 'test' })[1];
  includes(page.body, '<td class="stability stability-development">development', 'the page renders development');
  includes(page.body, 'href="#definition-allow"', 'the page links a $ref to its definition');
  includes(page.body, 'id="definition-allow"', 'the definition carries the id');

  // The stability convention's other forms, which no schema uses yet.
  check(parseStability('stability: stable; deprecated: new_name').deprecated, 'new_name', 'deprecated is parsed');
  check(parseStability('stability: stable; deprecated: new_name; free text').note, 'free text', 'the free text after deprecated is kept');
  check(parseStability('experimental'), null, 'a comment outside the convention is not a stability');
  const synthetic = walkSchema('synthetic.schema.json', {
    type: 'object',
    properties: { a: { type: 'string', $comment: 'stability: stable; deprecated: b', custom: 1 }, b: { type: 'string', $comment: 'note only' } },
  });
  check(synthetic.rows[0].stability.deprecated, 'b', 'a deprecated property renders its replacement');
  includes(synthetic.rows[0].constraints.join('\n'), 'unknown keyword <code>custom</code>: <code>1</code>', 'an unknown keyword is listed verbatim');
  includes(synthetic.rows[1].constraints.join('\n'), '<code>$comment</code>: note only', 'a $comment outside the convention is shown verbatim');

  // The summary's control-character refusal is visible rather than emitted raw.
  const summary = byName['audit-event'].rows.find((r) => r.path === 'summary');
  includes(summary.constraints.join('\n'), 'must not match <code>[\\u0000-\\u001f\\u007f]</code>', 'control characters in a pattern are shown as escapes');
  const reasonCode = leaseRecord.definitions.find((d) => d.name === 'reasonCode');
  includes(reasonCode.rows[0].constraints.join('\n'), 'any of: (1) pattern <code>^R[1-9][0-9]?$</code>; (2) pattern', 'a pattern-only branch is summarised without a type');

  // Enum collapse past ten values: the hooks event map's key list.
  const hooksMap = byName['plugin-manifest'].definitions.find((d) => d.name === 'hooksMap');
  includes(hooksMap.rows[0].constraints.join('\n'), 'keys one of 33 values, e.g.', 'an enum past ten values collapses to a count');
  const dimensions = byName['cdi-assessment'].rows.find((r) => r.path === 'dimensions');
  includes(dimensions.constraints.join('\n'), 'must contain an item: object, with <code>id</code> = <code>&quot;provenance-integrity&quot;</code>, requires <code>id</code>', 'contains is rendered as a constraint');

  // Every definition link on every page resolves to a definition heading on that page.
  const pages = referencePages(inputs, { base: '/contract', major: '1', siteName: 'test' });
  check(pages.length, 11, 'eleven reference pages');
  for (const p of pages) {
    const ids = new Set([...p.body.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    for (const m of p.body.matchAll(/href="#([^"]+)"/g)) {
      if (!ids.has(m[1])) throw new Error(`site-reference self-test: ${p.path}: #${m[1]} has no id on the page`);
    }
    for (const m of p.body.matchAll(/href="([^"#]+)/g)) {
      if (!/^[a-z]+:/.test(m[1]) && !m[1].startsWith('/contract/')) throw new Error(`site-reference self-test: ${p.path}: href without the base: ${m[1]}`);
    }
    count += 1;
  }
  console.log(`site-reference self-test: ${count} assertions passed (${rowsTotal} property rows, ${counted.all} properties keys, ${entries} lease-record conditional entries)`);
  return count;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  if (process.env.CDF_SITE_SELF_TEST === '1') {
    await selfTestReference();
  } else {
    console.error('usage: CDF_SITE_SELF_TEST=1 node tooling/site-reference.mjs   (the pages are built by tooling/build-site.mjs)');
    process.exit(1);
  }
}
