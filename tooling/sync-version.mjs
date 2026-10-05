#!/usr/bin/env node
/**
 * One version, stated in one place: package.json. Everything else that says a version is
 * written FROM it here, and `npm test` checks they still agree.
 *
 *   - package.json  `cdfContract.schemaSetVersion`   (sat stale at 1.0.0 for two releases)
 *   - README.md     "Version **x.y.z**"              (fell behind on 1.0.1)
 *   - schemas/*     `$id` = https://cognitive-delivery.github.io/contract/<major>.x/<file>
 *   - fixtures      any `$schema` that names one of ours
 *
 * `$id` carries the MAJOR only, as `1.x`: it is an identifier, and an identifier that changed on
 * every minor release would be a version number with extra steps. A reader resolving it gets the
 * current 1.x schema, which the additive-only rule says is what it wants. The schema-set version
 * a document was written against is its own `schema_version` field, never the `$id`.
 *
 * Run by `npm run lock` before the lock is generated, and on its own as `npm run version:sync`.
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ID_HOST, idFor } from '../conformance/ids.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// Defined in conformance/ids.mjs, which ships in the package; re-exported here so the import
// path older tooling used keeps working.
export { ID_HOST, idFor };

export async function syncVersion({ write = true } = {}) {
  const pkgPath = resolve(root, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  const version = pkg.version;
  const major = version.split('.')[0];
  const changed = [];

  // package.json
  if (pkg.cdfContract?.schemaSetVersion !== version) {
    pkg.cdfContract = { ...(pkg.cdfContract ?? {}), schemaSetVersion: version };
    changed.push('package.json');
    if (write) await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  }

  // README version line
  const readmePath = resolve(root, 'README.md');
  const readme = await readFile(readmePath, 'utf8');
  const nextReadme = readme.replace(/^Version \*\*\d+\.\d+\.\d+\*\*/m, `Version **${version}**`);
  if (nextReadme !== readme) {
    changed.push('README.md');
    if (write) await writeFile(readmePath, nextReadme, 'utf8');
  }

  // $id on every schema
  const schemaDir = resolve(root, 'schemas');
  const oldIds = new Map();
  for (const file of (await readdir(schemaDir)).filter((n) => n.endsWith('.schema.json')).sort()) {
    const path = join(schemaDir, file);
    const text = await readFile(path, 'utf8');
    const schema = JSON.parse(text);
    const wanted = idFor(major, file);
    if (schema.$id !== wanted) {
      if (schema.$id) oldIds.set(schema.$id, wanted);
      // Replace the line rather than re-serialising, so formatting and key order are untouched.
      const next = text.replace(/^(\s*"\$id":\s*)"[^"]*"/m, `$1"${wanted}"`);
      changed.push(`schemas/${file}`);
      if (write) await writeFile(path, next, 'utf8');
    }
  }

  // fixtures that name one of our schemas by $schema
  const fixtureRoot = resolve(root, 'fixtures');
  for (const kind of ['valid', 'invalid']) {
    const dir = join(fixtureRoot, kind);
    for (const file of (await readdir(dir)).filter((n) => n.endsWith('.json'))) {
      const path = join(dir, file);
      const text = await readFile(path, 'utf8');
      let next = text;
      for (const [oldId, newId] of oldIds) next = next.split(oldId).join(newId);
      next = next.replace(/https:\/\/cognitivedelivery\.co\.uk\/contract\/\d+\.\d+\.\d+\/([a-z-]+\.schema\.json)/g, (_m, f) => idFor(major, f));
      if (next !== text) {
        changed.push(`fixtures/${kind}/${file}`);
        if (write) await writeFile(path, next, 'utf8');
      }
    }
  }

  return { version, major, changed };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncVersion().then(({ version, changed }) => {
    console.log(changed.length === 0 ? `Version ${version} already stated everywhere.` : `Version ${version} written to: ${changed.join(', ')}`);
  }).catch((error) => { console.error(error); process.exit(1); });
}
