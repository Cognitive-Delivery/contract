/**
 * The README's Layout block names every file in the repository, or `npm test` fails.
 *
 * A currency check, not a conformance one. The review of 5 October 2026 found the Layout
 * omitting eleven files added since it was written — the signature vectors, the test key, the
 * allow-list, the guard's tests, the strict-compile checks — none of which a reader could learn
 * about from the README. Prose about a directory has the same half-life as prose about a
 * version: short, unless something checks it.
 *
 * What is compared: every entry at the repository's top level, plus every entry one level down
 * in `conformance/`, `fixtures/` and `tooling/`, against the first token of every line in the
 * fenced block under `## Layout`. Nested lines in the block (indented) belong to the directory
 * named by the nearest unindented line above them. Either direction of mismatch fails, with both
 * lists printed. Ignored: `node_modules`, `package-lock.json`, anything beginning with a dot.
 *
 * In the published package the repository is not present, so the check reports itself as not run
 * rather than failing on a tarball that is, by design, a subset.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const IGNORED = new Set(['node_modules', 'package-lock.json']);
const NESTED = ['conformance', 'fixtures', 'tooling'];

async function entriesOf(dir, prefix) {
  const names = (await readdir(dir)).filter((n) => !n.startsWith('.') && !IGNORED.has(n)).sort();
  const out = [];
  for (const name of names) {
    const isDir = (await stat(join(dir, name))).isDirectory();
    out.push(`${prefix}${name}${isDir ? '/' : ''}`);
  }
  return out;
}

/** The paths the repository actually holds, in the form the Layout block names them. */
export async function diskLayout(root) {
  const top = await entriesOf(root, '');
  const nested = [];
  for (const dir of NESTED) {
    if (top.includes(`${dir}/`)) nested.push(...(await entriesOf(join(root, dir), `${dir}/`)));
  }
  return [...top, ...nested].sort();
}

/** The paths the README's Layout block names. */
export function readmeLayout(readme) {
  // The first fenced block after the heading and before the next section; prose may sit between.
  const section = /^## Layout\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(readme);
  const match = section && /```[^\n]*\n([\s\S]*?)\n```/.exec(section[1]);
  if (!match) return null;
  const paths = [];
  let parent = '';
  for (const line of match[1].split('\n')) {
    if (line.trim() === '') continue;
    const indented = /^\s/.test(line);
    const token = line.trim().split(/\s+/)[0];
    if (!indented) {
      parent = token.endsWith('/') ? token : '';
      paths.push(token);
    } else {
      paths.push(`${parent}${token}`);
    }
  }
  return paths.sort();
}

/** Returns `{ checked, failures }`. `checked` is false in the published package. */
export async function runLayoutCheck(root) {
  const repo = resolve(root);
  try {
    await stat(join(repo, 'check-additive.mjs'));
  } catch {
    return { checked: false, failures: [] };
  }
  const readme = await readFile(join(repo, 'README.md'), 'utf8');
  const named = readmeLayout(readme);
  if (named === null) {
    return { checked: true, failures: ['layout: README.md has no fenced block under "## Layout"'] };
  }
  const onDisk = await diskLayout(repo);
  const failures = [];
  const missing = onDisk.filter((p) => !named.includes(p));
  const stale = named.filter((p) => !onDisk.includes(p));
  if (missing.length > 0) failures.push(`layout: README.md Layout does not name ${missing.join(', ')}`);
  if (stale.length > 0) failures.push(`layout: README.md Layout names ${stale.join(', ')}, which do not exist`);
  return { checked: true, failures };
}
