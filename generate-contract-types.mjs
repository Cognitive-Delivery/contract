#!/usr/bin/env node
/**
 * CDF governance contract → TypeScript generator.
 *
 * Reads contract/schemas/*.json and emits src/generated/contractTypes.ts.
 * Run via `npm run generate:contract`.
 *
 * --check mode: regenerate in memory, compare to the committed file, exit 1 on diff.
 *   Wired into the governance gate so editing a schema without regenerating is caught
 *   at the same moment, and by the same habit, as editing the surface manifest.
 *
 * Output is deterministic — stable key order, no timestamps, no random data. The header
 * carries a `(generated — do not edit)` marker.
 *
 * Deliberately narrow: it handles only the JSON Schema subset these schemas use.
 * A general JSON-Schema-to-TypeScript compiler would be a dependency and a maintenance
 * surface, and the contract package is dependency-free on purpose. If a schema starts
 * using a construct this does not understand, it throws rather than emitting something
 * plausible and wrong.
 *
 * See contract/README.md for the contract itself.
 */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Read paths resolve from this file, never from a parent. The contract is its own
 * repository and is embedded in a consumer as a submodule, so `schemas/` sits beside
 * this script in both layouts and only the consumer's root moves.
 */
const schemaDir = resolve(here, 'schemas');
const packagePath = resolve(here, 'package.json');

/**
 * The write path is the one thing that genuinely belongs to the consumer: the types are
 * generated into the repository that embeds the contract, not into the contract itself.
 * Run standalone, `..` is whatever directory happens to contain the checkout, so this is
 * guarded below rather than trusted.
 */
const consumerRoot = resolve(here, '..');
const outputPath = resolve(consumerRoot, 'src/generated/contractTypes.ts');

/** File name → exported type name. Explicit, so a new schema is a deliberate addition. */
const TYPE_NAMES = {
  'provenance.schema.json': 'ContractProvenance',
  'audit-event.schema.json': 'ContractAuditEvent',
  'cdi-signal.schema.json': 'ContractCdiSignal',
  'cdi-assessment.schema.json': 'ContractCdiAssessment',
  'config-core.schema.json': 'ContractConfigCore',
  'agent-lease-manifest.schema.json': 'AgentLeaseManifest',
  'agent-lease.schema.json': 'AgentLease',
  'plugin-manifest.schema.json': 'ContractPluginManifest',
  'plugin-marketplace.schema.json': 'ContractPluginMarketplace',
};

function pascal(name) {
  return name.replace(/(^|[^a-zA-Z0-9])([a-zA-Z0-9])/g, (_m, _s, c) => c.toUpperCase());
}

function refName(root, ref) {
  const key = ref.replace('#/definitions/', '');
  return `${root}${pascal(key)}`;
}

/** Render one schema node as a TypeScript type expression. */
function renderType(node, rootName, indent) {
  if (node.$ref) {
    return refName(rootName, node.$ref);
  }

  if (Array.isArray(node.anyOf)) {
    return node.anyOf.map((entry) => renderType(entry, rootName, indent)).join(' | ');
  }

  if (Array.isArray(node.enum)) {
    return node.enum.map((value) => (typeof value === 'string' ? `'${value}'` : String(value))).join(' | ');
  }

  const kind = node.type;

  if (Array.isArray(kind)) {
    return kind.map((one) => renderType({ ...node, type: one }, rootName, indent)).join(' | ');
  }

  switch (kind) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array':
      return `readonly ${wrapUnion(renderType(node.items ?? {}, rootName, indent))}[]`;
    case 'object':
      return renderObject(node, rootName, indent);
    case undefined:
      // No type and no ref: the schema says nothing about the shape, so neither do we.
      return 'unknown';
    default:
      throw new Error(`Unsupported schema type "${kind}" — this generator is deliberately narrow.`);
  }
}

function wrapUnion(expression) {
  return expression.includes('|') ? `(${expression})` : expression;
}

function renderObject(node, rootName, indent) {
  const pad = ' '.repeat(indent);
  const inner = ' '.repeat(indent + 2);
  const properties = node.properties ?? {};
  const required = new Set(node.required ?? []);
  const keys = Object.keys(properties).sort();

  if (keys.length === 0) {
    const additional = node.additionalProperties;
    if (additional && typeof additional === 'object') {
      return `Readonly<Record<string, ${renderType(additional, rootName, indent)}>>`;
    }
    return 'Readonly<Record<string, unknown>>';
  }

  const lines = keys.map((key) => {
    const property = properties[key];
    const optional = required.has(key) ? '' : '?';
    const doc = property.description
      ? `${inner}/** ${property.description.replace(/\s+/g, ' ').trim()} */\n`
      : '';
    return `${doc}${inner}readonly ${JSON.stringify(key)}${optional}: ${renderType(property, rootName, indent + 2)};`;
  });

  // `additionalProperties: true` is deliberately NOT rendered as an index signature.
  //
  // It is a runtime requirement — a reader must not drop fields a newer writer added — and
  // encoding it in the type does the opposite of what is wanted: an index signature makes the
  // contract type HARDER to satisfy, so a perfectly conformant closed interface stops being
  // assignable to it. That broke every assignability check the generated types exist to enable.
  //
  // The forward-compatibility property is real and is tested where it belongs: the round-trip
  // assertion in the conformance corpus.
  return `{\n${lines.join('\n')}\n${pad}}`;
}

async function build() {
  const files = (await readdir(schemaDir)).filter((name) => name.endsWith('.json')).sort();
  const blocks = [];

  for (const file of files) {
    const typeName = TYPE_NAMES[file];
    if (!typeName) {
      throw new Error(`No type name registered for ${file} — add it to TYPE_NAMES deliberately.`);
    }

    const schema = JSON.parse(await readFile(join(schemaDir, file), 'utf8'));

    for (const [key, definition] of Object.entries(schema.definitions ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      const name = `${typeName}${pascal(key)}`;
      const doc = definition.description ? `/** ${definition.description.replace(/\s+/g, ' ').trim()} */\n` : '';
      blocks.push(`${doc}export type ${name} = ${renderType(definition, typeName, 0)};`);
    }

    const doc = schema.description ? `/** ${schema.description.replace(/\s+/g, ' ').trim()} */\n` : '';
    blocks.push(`${doc}export type ${typeName} = ${renderType(schema, typeName, 0)};`);
  }

  const version = JSON.parse(await readFile(packagePath, 'utf8')).version;

  return [
    '/**',
    ' * CDF governance contract types (generated — do not edit).',
    ' *',
    ' * Source of truth: contract/schemas/*.json. Regenerate with `npm run generate:contract`.',
    ' * Editing this file by hand makes the type disagree with the contract, and the contract',
    ' * is what a second implementation reads.',
    ' *',
    ' * These describe what a CONFORMANT READER MUST ACCEPT. This product may legitimately',
    ' * guarantee more about what it writes — writing narrow and reading wide is correct — so',
    ' * its own writer types can be narrower, and a compile-time assignability check proves',
    ' * they still satisfy the contract.',
    ' */',
    '',
    `export const CONTRACT_SCHEMA_VERSION = '${version}' as const;`,
    '',
    blocks.join('\n\n'),
    '',
  ].join('\n');
}

/**
 * Refuse to run outside a consumer. The contract repository has no `src/generated/`, so a
 * standalone checkout would otherwise create one in whatever directory contains it — a
 * write outside the repository, silently, and a `--check` that reports a stale file that
 * was never meant to exist here.
 */
async function assertEmbeddedInConsumer() {
  try {
    await readFile(resolve(consumerRoot, 'package.json'), 'utf8');
  } catch {
    console.error('This generator emits types into the repository that embeds the contract.');
    console.error(`No package.json found at ${consumerRoot}.`);
    console.error('Run it from that repository, where the contract is checked out as a submodule.');
    process.exit(1);
  }
}

async function main() {
  await assertEmbeddedInConsumer();
  const generated = await build();
  const checkMode = process.argv.includes('--check');

  if (checkMode) {
    let existing = null;
    try {
      existing = await readFile(outputPath, 'utf8');
    } catch {
      existing = null;
    }
    if (existing !== generated) {
      console.error('contractTypes.ts is stale relative to contract/schemas/.');
      console.error('Run `npm run generate:contract` and commit the result.');
      process.exit(1);
    }
    console.log('contractTypes.ts matches contract/schemas/.');
    return;
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, generated, 'utf8');
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
