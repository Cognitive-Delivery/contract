/**
 * The GitHub Pages site, built into a temporary directory and checked, or `npm test` fails.
 *
 * A currency check, not a conformance one, and one that runs before the site is deployed rather
 * than after: the generator (`tooling/build-site.mjs`) renders every page from this repository's
 * own files, so a page that links to nothing, an anchor that moved, a schema without a reference
 * page or a `.json` byte the generator touched is a defect of this tree, and this tree is where
 * `npm test` runs.
 *
 * What is checked, in the order the failures are reported:
 *   (a) the build itself: `<tmp>/<major>.x/` laid out from `schemas/*.json` as the workflow lays
 *       it out, then `buildSite`; a refusal (`SiteError`, which already names the page and the
 *       link) is a failure line, not a crash;
 *   (b) every `href` and `src` on every page: a site-internal one resolves to a file written
 *       (`<path>` or `<path>/index.html`) and, when it carries a fragment, to an `id` (or `name`)
 *       on that page; one that is neither site-internal nor absolute is a failure;
 *   (c) every schema has a page under `/reference/<name>/`, every `docs/**\/*.md` has its page,
 *       and the fixed pages (README, SPEC, GOVERNANCE, CONTRIBUTING, SECURITY, CHANGELOG) exist;
 *   (d) the `.json` files under `<tmp>/<major>.x/` are byte-identical to `schemas/` after the
 *       build, and the generator wrote no `.json` anywhere else;
 *   (e) no page carries `<script`, a `<link` to anything but the site, an inline `on<event>=`
 *       handler, or a `src=` to another host; the hosts the pages link to by `href` are returned
 *       as information (`externalHosts`), not failed, so the reader sees the list;
 *   (f) determinism: a second build into a second directory is byte-identical to the first.
 * Both directories are removed afterwards, on failure too.
 *
 * `tooling/` and `marked` are not in the published package (`files` in package.json; `marked` is
 * a devDependency), so from the installed tarball the check reports itself as not run, with the
 * reason, rather than failing a package that is by design a subset — the same posture as the
 * additive guard's tests and the Layout check.
 */

import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const FIXED_PAGES = ['README.md', 'SPEC-agent-lease-manifest.md', 'GOVERNANCE.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md'];

/** Every file under `dir`, as POSIX paths relative to it, sorted. */
async function walk(dir, prefix = '') {
  const out = [];
  for (const name of (await readdir(dir)).sort()) {
    const abs = join(dir, name);
    const rel = prefix === '' ? name : `${prefix}/${name}`;
    if ((await stat(abs)).isDirectory()) out.push(...(await walk(abs, rel)));
    else out.push(rel);
  }
  return out;
}

/** Every `docs/**\/*.md`, as repository-relative POSIX paths. */
async function markdownUnderDocs(root) {
  const files = await walk(join(root, 'docs'));
  return files.filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`);
}

/** Lays out `<out>/<major>.x/` from `schemas/*.json`, byte for byte, as the workflow does. */
async function layOutIds(root, out, major) {
  const idDir = join(out, `${major}.x`);
  await mkdir(idDir, { recursive: true });
  const names = (await readdir(join(root, 'schemas'))).filter((n) => n.endsWith('.json')).sort();
  for (const name of names) await copyFile(join(root, 'schemas', name), join(idDir, name));
  return names;
}

/**
 * The generator and its one dependency, loaded here rather than at module top because neither
 * ships in the package. Returns `{ module }` or `{ reason }`.
 */
async function loadGenerator(root) {
  try {
    await stat(join(root, 'tooling', 'build-site.mjs'));
  } catch {
    return { reason: 'tooling/ is not in the package' };
  }
  try {
    return { module: await import('../tooling/build-site.mjs') };
  } catch (error) {
    if (error && error.code === 'ERR_MODULE_NOT_FOUND') {
      return { reason: `the generator cannot be imported: ${error.message.split('\n')[0]}` };
    }
    throw error;
  }
}

/** The attributes of every tag on a page: `[{ tag, name, value }]`, in document order. */
function attributes(html) {
  const out = [];
  for (const tag of html.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g)) {
    for (const attr of tag[2].matchAll(/\s([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)) {
      out.push({ tag: tag[1].toLowerCase(), name: attr[1].toLowerCase(), value: attr[2] });
    }
  }
  return out;
}

/** The hostname of an absolute URL, or its scheme for a URL that has no host (`mailto:`). */
function hostOf(href) {
  if (/^https?:\/\//i.test(href)) {
    try { return new URL(href).host; } catch { return href; }
  }
  if (href.startsWith('//')) return href.slice(2).split(/[/?#]/)[0];
  return `${href.split(':')[0]}:`;
}

const isAbsolute = (href) => /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');

/**
 * Checks one built site at `out`. Returns `{ pages, links, failures, externalHosts }` for the
 * files it finds; the caller has already built the site and decided what to compare it with.
 */
async function checkBuilt(out, { root, siteBase, pageFor, major, schemaJson }) {
  const failures = [];
  const externalHosts = new Set();
  const files = await walk(out);
  const htmlFiles = files.filter((f) => f.endsWith('.html'));
  const fileSet = new Set(files);
  const idsOf = new Map();
  const pageIds = async (rel) => {
    if (!idsOf.has(rel)) {
      const html = await readFile(join(out, rel), 'utf8');
      const ids = new Set();
      for (const a of attributes(html)) if (a.name === 'id' || a.name === 'name') ids.add(a.value);
      idsOf.set(rel, ids);
    }
    return idsOf.get(rel);
  };
  let links = 0;

  // (b) and (e): every page's attributes.
  for (const page of htmlFiles) {
    const html = await readFile(join(out, page), 'utf8');
    if (/<script/i.test(html)) failures.push(`site: ${page}: contains <script`);
    for (const a of attributes(html)) {
      if (/^on[a-z]+$/.test(a.name)) {
        failures.push(`site: ${page}: <${a.tag}> carries an inline event handler ${a.name}=`);
        continue;
      }
      if (a.name !== 'href' && a.name !== 'src') continue;
      links += 1;
      const href = a.value;
      if (a.tag === 'link' && !href.startsWith(`${siteBase}/`)) {
        failures.push(`site: ${page}: <link> to ${href}, which is not the site`);
        continue;
      }
      if (isAbsolute(href)) {
        if (a.name === 'src') {
          failures.push(`site: ${page}: <${a.tag} src="${href}"> loads from another host`);
          continue;
        }
        externalHosts.add(hostOf(href));
        continue;
      }
      const hash = href.indexOf('#');
      const path = hash === -1 ? href : href.slice(0, hash);
      const fragment = hash === -1 ? null : href.slice(hash + 1);
      let target = page;
      if (path !== '') {
        if (path !== siteBase && !path.startsWith(`${siteBase}/`)) {
          failures.push(`site: ${page}: ${href} is neither absolute nor under ${siteBase}/`);
          continue;
        }
        let rel = path === siteBase ? '' : path.slice(siteBase.length + 1);
        if (rel === '' || rel.endsWith('/')) rel += 'index.html';
        if (!fileSet.has(rel)) {
          failures.push(`site: ${page}: ${href} names ${rel}, which the build did not write`);
          continue;
        }
        target = rel;
      }
      if (fragment !== null && target.endsWith('.html') && !(await pageIds(target)).has(fragment)) {
        failures.push(`site: ${page}: ${href} names #${fragment}, which is not an id on ${target}`);
      }
    }
  }

  // (c): every schema, every Markdown under docs/, and the fixed pages have a page.
  const expectPage = (repoPath) => {
    const sitePath = pageFor(repoPath);
    if (sitePath === null) {
      failures.push(`site: ${repoPath} has no page in the site's page map`);
      return;
    }
    const rel = `${sitePath.slice(1)}${sitePath.endsWith('/') ? 'index.html' : ''}`;
    if (!fileSet.has(rel)) failures.push(`site: ${repoPath} has no page: ${rel} was not written`);
  };
  for (const name of schemaJson.filter((n) => n.endsWith('.schema.json'))) {
    const rel = `reference/${name.replace(/\.schema\.json$/, '')}/index.html`;
    if (!fileSet.has(rel)) failures.push(`site: schemas/${name} has no reference page: ${rel} was not written`);
  }
  for (const md of await markdownUnderDocs(root)) expectPage(md);
  for (const fixed of FIXED_PAGES) expectPage(fixed);

  // (d): the `.json` bytes under `<major>.x/` are schemas/' bytes, and there is no other `.json`.
  const idDir = `${major}.x`;
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    if (!file.startsWith(`${idDir}/`) || file.slice(idDir.length + 1).includes('/')) {
      failures.push(`site: the generator wrote ${file}, and it must write no .json`);
      continue;
    }
    const name = file.slice(idDir.length + 1);
    if (!schemaJson.includes(name)) {
      failures.push(`site: ${file} is not a file of schemas/`);
      continue;
    }
    const [built, source] = await Promise.all([readFile(join(out, file)), readFile(join(root, 'schemas', name))]);
    if (!built.equals(source)) {
      failures.push(`site: ${file} is not byte-identical to schemas/${name} after the build (${built.length} bytes, source ${source.length})`);
    }
  }
  for (const name of schemaJson) {
    if (!fileSet.has(`${idDir}/${name}`)) failures.push(`site: ${idDir}/${name} is missing after the build`);
  }

  return { pages: htmlFiles.length, links, failures, externalHosts: [...externalHosts].sort(), files };
}

/**
 * Returns `{ checked, reason, pages, links, failures, externalHosts }`. `checked` is false, with
 * `reason`, when the generator or its dependency is not present (the published package).
 */
export async function runSiteCheck(root) {
  const repo = resolve(root);
  const loaded = await loadGenerator(repo);
  if (loaded.reason) {
    return { checked: false, reason: loaded.reason, pages: 0, links: 0, failures: [], externalHosts: [] };
  }
  const { buildSite, SITE_BASE, SiteError, pageFor } = loaded.module;
  const major = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8')).version.split('.')[0];
  const dirs = [];
  try {
    const first = await mkdtemp(join(tmpdir(), 'contract-site-'));
    dirs.push(first);
    const schemaJson = await layOutIds(repo, first, major);
    try {
      await buildSite(first, { log: () => {} });
    } catch (error) {
      if (error instanceof SiteError) {
        return { checked: true, pages: 0, links: 0, failures: [`site: the generator refused the build: ${error.message}`], externalHosts: [] };
      }
      throw error;
    }
    const result = await checkBuilt(first, { root: repo, siteBase: SITE_BASE, pageFor, major, schemaJson });

    // (f): the same tree, built again, is the same bytes.
    const second = await mkdtemp(join(tmpdir(), 'contract-site-'));
    dirs.push(second);
    await layOutIds(repo, second, major);
    await buildSite(second, { log: () => {} });
    const again = await walk(second);
    if (again.join('\n') !== result.files.join('\n')) {
      const missing = result.files.filter((f) => !again.includes(f));
      const extra = again.filter((f) => !result.files.includes(f));
      result.failures.push(`site: two builds wrote different file lists (only in the first: ${missing.join(', ') || 'none'}; only in the second: ${extra.join(', ') || 'none'})`);
    }
    for (const file of result.files.filter((f) => again.includes(f))) {
      const [a, b] = await Promise.all([readFile(join(first, file)), readFile(join(second, file))]);
      if (!a.equals(b)) result.failures.push(`site: ${file} differs between two builds of the same tree`);
    }

    const { files: _files, ...report } = result;
    return { checked: true, ...report };
  } finally {
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  }
}
