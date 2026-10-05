/**
 * The schema index, `schemas/index.json`: what a registry or an editor needs to find a schema
 * without reading them all. One entry per schema: `file`, `$id`, `title`, `dialect`, and
 * `fileMatch`, the glob(s) of the files it describes where a file has a fixed name (`.cdf/config.yaml`,
 * a plugin's `.claude-plugin/plugin.json`, a marketplace's `.claude-plugin/marketplace.json`);
 * journal lines and manifests have no fixed file and carry none. Served beside the schemas at
 * `/<major>.x/index.json` and frozen with each release.
 */

import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const FILE_MATCH = {
  'config-core.schema.json': ['**/.cdf/config.yaml'],
  'plugin-manifest.schema.json': ['**/.claude-plugin/plugin.json'],
  'plugin-marketplace.schema.json': ['**/.claude-plugin/marketplace.json'],
};

export const INDEX_SCHEMA = {
  type: 'object',
  required: ['schema_set', 'generated_from', 'schemas'],
  properties: {
    schema_set: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    generated_from: { type: 'string', enum: ['schemas/*.schema.json'] },
    schemas: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['file', '$id', 'title', 'dialect'],
        properties: {
          file: { type: 'string', pattern: '^[a-z-]+\\.schema\\.json$' },
          $id: { type: 'string', pattern: '^https://cognitive-delivery\\.github\\.io/contract/[0-9]+\\.x/[a-z-]+\\.schema\\.json$' },
          title: { type: 'string', minLength: 1 },
          dialect: { type: 'string', enum: ['http://json-schema.org/draft-07/schema#'] },
          fileMatch: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

export async function buildIndex() {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const files = (await readdir(join(root, 'schemas'))).filter((n) => n.endsWith('.schema.json')).sort();
  const schemas = [];
  for (const file of files) {
    const schema = JSON.parse(await readFile(join(root, 'schemas', file), 'utf8'));
    const entry = { file, $id: schema.$id, title: schema.title, dialect: schema.$schema };
    if (FILE_MATCH[file]) entry.fileMatch = FILE_MATCH[file];
    schemas.push(entry);
  }
  return { schema_set: pkg.version, generated_from: 'schemas/*.schema.json', schemas };
}

export function serialiseIndex(index) {
  return `${JSON.stringify(index, null, 2)}\n`;
}

/** Null when `schemas/index.json` equals what `buildIndex()` produces now, else why not. */
export async function indexStaleness() {
  let text = null;
  try { text = await readFile(join(root, 'schemas', 'index.json'), 'utf8'); } catch { return 'schemas/index.json is missing'; }
  return text === serialiseIndex(await buildIndex()) ? null : 'schemas/index.json differs from the schemas';
}
