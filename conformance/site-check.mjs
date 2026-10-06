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
 *   (b) every `href` on every page: a site-internal one resolves to a file written (`<path>` or
 *       `<path>/index.html`) and, when it carries a fragment, to an `id` (or `name`) on that page;
 *       one that is neither site-internal nor absolute is a failure;
 *   (c) every schema has a page under `/reference/<name>/`, every `docs/**\/*.md` has its page,
 *       and the fixed pages (README, SPEC, GOVERNANCE, CONTRIBUTING, SECURITY, CHANGELOG) exist;
 *   (d) the `.json` files under `<tmp>/<major>.x/` are byte-identical to `schemas/` after the
 *       build, and the generator wrote no `.json` anywhere else;
 *   (e) every resource a page loads is the site's own: a `<link>` only with `rel` of `stylesheet`,
 *       `icon` or `apple-touch-icon` and a site-internal `href` that resolves to a written file;
 *       `src=` on any tag and every URL of a `srcset=` only when site-internal and resolving;
 *       inside every `.css` written, each `url()` either a relative or site-internal path that
 *       resolves to a written file or the one data URI below (the website's eyebrow mark, admitted
 *       by exact match); no page carries `<script` or an inline `on<event>=` handler, no stylesheet
 *       carries `@import`, and any other `<link>`, any other data URI and any URL to another host
 *       in a resource position fails. The hosts the pages link to by `<a href>` are returned as
 *       information (`externalHosts`), not failed, so the reader sees the list. The distinct
 *       targets resolved this way are counted once each as `assets`;
 *   (f) determinism: a second build into a second directory is byte-identical to the first, the
 *       copied binaries included.
 * Both directories are removed afterwards, on failure too.
 *
 * `tooling/` and `marked` are not in the published package (`files` in package.json; `marked` is
 * a devDependency), so from the installed tarball the check reports itself as not run, with the
 * reason, rather than failing a package that is by design a subset — the same posture as the
 * additive guard's tests and the Layout check. The data URI constant lives here, not imported
 * from `tooling/`, so the module loads from the package too.
 */

import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, resolve } from 'node:path';

const FIXED_PAGES = ['README.md', 'SPEC-agent-lease-manifest.md', 'GOVERNANCE.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md'];

/** The `rel` values a `<link>` may carry; anything else is refused. */
const LINK_RELS = ['stylesheet', 'icon', 'apple-touch-icon'];

/**
 * The one data URI a stylesheet may carry: the website's eyebrow mark (`.eyebrow::before` in
 * `tooling/site.css`), byte for byte. Any other data URI fails.
 */
const PERMITTED_DATA_URI = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 1 L15 5 L8 9 L1 5 Z' fill='%237FCBD9'/%3E%3Cpath d='M1 5 L8 9 L8 15 L1 11 Z' fill='%234FB6C9'/%3E%3Cpath d='M15 5 L8 9 L8 15 L15 11 Z' fill='%233A93A5'/%3E%3C/svg%3E";

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

/**
 * Every tag on a page with its attributes: `[{ tag, text, attrs: [{ name, value }] }]`, in
 * document order. `text` is the tag as written, for a failure line to name it.
 */
function tags(html) {
  const out = [];
  for (const tag of html.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g)) {
    const attrs = [];
    for (const attr of tag[2].matchAll(/\s([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)) {
      attrs.push({ name: attr[1].toLowerCase(), value: attr[2] });
    }
    out.push({ tag: tag[1].toLowerCase(), text: tag[0], attrs });
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

/** The URLs of a `srcset` list: each candidate's first token, the descriptor dropped. */
function srcsetUrls(value) {
  return value.split(',').map((c) => c.trim().split(/\s+/)[0]).filter((u) => u !== '');
}

/** Every `url(...)` in a stylesheet, unquoted, in order. */
function cssUrls(css) {
  const out = [];
  for (const m of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)/g)) {
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out;
}

/**
 * Checks one built site at `out`. Returns `{ pages, links, assets, failures, externalHosts }` for
 * the files it finds; the caller has already built the site and decided what to compare it with.
 */
async function checkBuilt(out, { root, siteBase, pageFor, major, schemaJson }) {
  const failures = [];
  const externalHosts = new Set();
  const assets = new Set();
  const files = await walk(out);
  const htmlFiles = files.filter((f) => f.endsWith('.html'));
  const cssFiles = files.filter((f) => f.endsWith('.css'));
  const fileSet = new Set(files);
  const idsOf = new Map();
  const pageIds = async (rel) => {
    if (!idsOf.has(rel)) {
      const html = await readFile(join(out, rel), 'utf8');
      const ids = new Set();
      for (const t of tags(html)) for (const a of t.attrs) if (a.name === 'id' || a.name === 'name') ids.add(a.value);
      idsOf.set(rel, ids);
    }
    return idsOf.get(rel);
  };
  let links = 0;

  /**
   * A resource URL (a stylesheet, an icon, an image, a font) to the file it names in the output:
   * `{ rel }` when it is site-internal and written, `{ error }` saying why otherwise. `fromDir`
   * is the directory a relative URL resolves against (a stylesheet's); pages pass `null`, since a
   * page's resource must be site-internal.
   */
  const resolveResource = (url, fromDir) => {
    if (url.startsWith('data:')) return { error: url === PERMITTED_DATA_URI ? null : 'is not the permitted data URI', data: true };
    if (isAbsolute(url)) return { error: 'loads from another host' };
    const path = url.split(/[#?]/)[0];
    let rel;
    if (path === siteBase || path.startsWith(`${siteBase}/`)) {
      rel = path === siteBase ? '' : path.slice(siteBase.length + 1);
    } else if (fromDir !== null && !path.startsWith('/')) {
      rel = posix.normalize(posix.join(fromDir, path));
      if (rel.startsWith('../') || rel === '..') return { error: `names ${rel}, which is outside the site` };
    } else {
      return { error: `is neither relative nor under ${siteBase}/` };
    }
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    if (!fileSet.has(rel)) return { error: `names ${rel}, which the build did not write` };
    return { rel };
  };

  // (b) and (e): every page's tags.
  for (const page of htmlFiles) {
    const html = await readFile(join(out, page), 'utf8');
    if (/<script/i.test(html)) failures.push(`site: ${page}: contains <script`);
    for (const t of tags(html)) {
      const attr = (name) => t.attrs.find((a) => a.name === name)?.value;
      for (const a of t.attrs) {
        if (/^on[a-z]+$/.test(a.name)) failures.push(`site: ${page}: <${t.tag}> carries an inline event handler ${a.name}=`);
      }

      // A <link> is a resource load: three rel values, site-internal, written.
      if (t.tag === 'link') {
        const href = attr('href');
        if (href !== undefined) links += 1;
        const rel = (attr('rel') ?? '').trim().toLowerCase();
        if (!LINK_RELS.includes(rel)) {
          failures.push(`site: ${page}: ${t.text} is a <link> whose rel is not ${LINK_RELS.join(', ')}`);
          continue;
        }
        if (href === undefined) {
          failures.push(`site: ${page}: ${t.text} is a <link> without an href`);
          continue;
        }
        const resolved = resolveResource(href, null);
        if (resolved.error) failures.push(`site: ${page}: ${t.text} ${resolved.error}`);
        else assets.add(resolved.rel);
        continue;
      }

      // src= on any tag and every URL of a srcset= are resource loads: site-internal, written.
      for (const a of t.attrs) {
        if (a.name !== 'src' && a.name !== 'srcset') continue;
        if (a.name === 'src') links += 1;
        const urls = a.name === 'src' ? [a.value] : srcsetUrls(a.value);
        for (const url of urls) {
          const resolved = resolveResource(url, null);
          if (resolved.error) failures.push(`site: ${page}: <${t.tag} ${a.name}="${a.value}"> ${resolved.error}`);
          else assets.add(resolved.rel);
        }
      }

      // href= elsewhere (an <a>): site-internal and resolving, with its fragment, or absolute
      // and reported as an external host.
      const href = attr('href');
      if (href === undefined) continue;
      links += 1;
      if (isAbsolute(href)) {
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

  // (e), the stylesheets: no @import; every url() relative or site-internal and written, or the
  // one permitted data URI.
  for (const cssFile of cssFiles) {
    const css = await readFile(join(out, cssFile), 'utf8');
    if (/@import\b/.test(css)) failures.push(`site: ${cssFile}: carries @import, and the site loads nothing but its own files`);
    for (const url of cssUrls(css)) {
      const resolved = resolveResource(url, posix.dirname(cssFile) === '.' ? '' : posix.dirname(cssFile));
      if (resolved.error) failures.push(`site: ${cssFile}: url(${url}) ${resolved.error}`);
      else if (!resolved.data) assets.add(resolved.rel);
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

  return { pages: htmlFiles.length, links, assets: assets.size, failures, externalHosts: [...externalHosts].sort(), files };
}

/**
 * Returns `{ checked, reason, pages, links, assets, failures, externalHosts }`. `checked` is
 * false, with `reason`, when the generator or its dependency is not present (the published
 * package).
 */
export async function runSiteCheck(root) {
  const repo = resolve(root);
  const loaded = await loadGenerator(repo);
  if (loaded.reason) {
    return { checked: false, reason: loaded.reason, pages: 0, links: 0, assets: 0, failures: [], externalHosts: [] };
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
        return { checked: true, pages: 0, links: 0, assets: 0, failures: [`site: the generator refused the build: ${error.message}`], externalHosts: [] };
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
