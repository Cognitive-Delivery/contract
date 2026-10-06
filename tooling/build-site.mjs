#!/usr/bin/env node
/**
 * Builds the GitHub Pages site for the governance contract from the repository tree:
 * `node tooling/build-site.mjs <out-dir>` (`npm run site` builds `_site/`).
 *
 * The workflow (`.github/workflows/pages.yml`) lays out the schema bytes first: the `$id` copies
 * under `<out-dir>/<major>.x/` and one frozen directory per release tag under
 * `<out-dir>/<major.minor.patch>/`. This script never writes a `.json` file and never touches
 * those directories' JSON. It reads `<major>.x/` to list the `$id` files and check each `$id`,
 * and the frozen directories to list them; without `<major>.x/` it refuses to build.
 *
 * Every page is rendered from a file in this repository: the Markdown documents through `marked`
 * (GFM, no sanitiser), and the front, conformance, proposals, reference and version pages from the
 * same files `npm test` already checks. Only repository-authored Markdown is rendered, which is
 * content under review and not user input; rendering anything from outside the repository would
 * require a sanitiser. Raw HTML inside that Markdown is rendered as text rather than as markup, so
 * a `<title>` written as a placeholder in a heading stays visible as a placeholder (GitHub strips
 * it; nothing in the tree uses inline HTML as markup).
 *
 * Deterministic: no dates, no timestamps, nothing from the environment in the output, directories
 * read in sorted order, so two builds of one tree are byte-identical. A relative link to a path
 * that does not exist in the repository aborts the build naming the page and the link; the site
 * check relies on that.
 *
 * `CDF_SITE_SELF_TEST=1 node tooling/build-site.mjs` runs the slug and link-map assertions and
 * builds nothing.
 *
 * The schema reference (`/reference/`, one page per schema from `schemas/*.schema.json`) is
 * `buildReference` below, which hands the schema files to the walker in `tooling/site-reference.mjs`
 * and places its pages in the template; the walker's self-test runs under the same flag.
 */

import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Marked } from 'marked';

import { idFor } from '../conformance/ids.mjs';
import { loadReferenceInputs, referencePages, selfTestReference } from './site-reference.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');

/** The site is served under this path prefix: https://cognitive-delivery.github.io/contract/ */
export const SITE_BASE = '/contract';
const SITE_NAME = 'Cognitive Delivery governance contract';
const REPO_URL = 'https://github.com/Cognitive-Delivery/contract';
const NPM_URL = 'https://www.npmjs.com/package/@cognitive-delivery/contract';
const SCHEMASTORE_URL = 'https://www.schemastore.org/';
const SPEC_FILE = 'SPEC-agent-lease-manifest.md';

const NAV = [
  ['Reference', '/reference/'],
  ['Implementing', '/docs/implementing/'],
  ['Specification', '/spec/'],
  ['Conformance', '/conformance/'],
  ['Governance', '/governance/'],
  ['Versions', '/versions/'],
  ['Changelog', '/changelog/'],
];

/** Directories never walked when the repository tree is read for link resolution. */
const UNWALKED = new Set(['.git', 'node_modules', '_site']);

/** A refusal with a named cause; the command line reports it and exits 1. */
class SiteError extends Error {}

// ---------------------------------------------------------------------------------------------
// Heading anchors: GitHub's slug algorithm, so a link that works on GitHub works here.
// ---------------------------------------------------------------------------------------------

/**
 * Lower-case; drop every character that is not a letter, a number, a combining mark, whitespace,
 * an underscore or a hyphen; then spaces to hyphens. Nothing is collapsed or trimmed, which is
 * why `[1.2.1] — 2026-10-06` becomes `121--2026-10-06`, exactly as GitHub renders it.
 */
export function githubSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/ /g, '-');
}

/** One slugger per page: a repeated heading gets `-1`, `-2`, as on GitHub. */
export function createSlugger() {
  const seen = new Map();
  return (text) => {
    const base = githubSlug(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };
}

// ---------------------------------------------------------------------------------------------
// Link rewriting: repository paths to site URLs.
// ---------------------------------------------------------------------------------------------

/**
 * The site page for a repository path, or null when the path has no page of its own (such a
 * path links to GitHub instead). A directory path ends in `/`.
 */
export function pageFor(repoPath) {
  const fixed = {
    'README.md': '/readme/',
    [SPEC_FILE]: '/spec/',
    'GOVERNANCE.md': '/governance/',
    'CONTRIBUTING.md': '/contributing/',
    'SECURITY.md': '/security/',
    'CHANGELOG.md': '/changelog/',
    'docs/conformance/': '/conformance/',
    'docs/proposals/': '/governance/proposals/',
  };
  if (Object.hasOwn(fixed, repoPath)) return fixed[repoPath];
  let m;
  if ((m = /^docs\/conformance\/([^/]+)\.md$/.exec(repoPath))) return `/conformance/${m[1]}/`;
  if ((m = /^docs\/proposals\/([^/]+)\.md$/.exec(repoPath))) {
    return `/governance/proposals/${m[1] === 'TEMPLATE' ? 'template' : m[1]}/`;
  }
  if ((m = /^docs\/([^/]+)\.md$/.exec(repoPath))) return `/docs/${m[1]}/`;
  if ((m = /^schemas\/([^/]+)\.schema\.json$/.exec(repoPath))) return `/reference/${m[1]}/`;
  return null;
}

/**
 * Rewrites one Markdown link found in `sourcePath` (a repository-relative POSIX path). Absolute
 * links and in-page fragments are left alone. A relative link resolves against the source file's
 * directory, as on GitHub, and must name something in the tree.
 */
export function siteHref(href, sourcePath, ctx) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//') || href.startsWith('#')) return href;
  const hash = href.indexOf('#');
  const target = hash === -1 ? href : href.slice(0, hash);
  const fragment = hash === -1 ? '' : href.slice(hash);
  if (target === '') return href;
  const normalised = posix.normalize(posix.join(posix.dirname(sourcePath), target));
  const isDir = normalised.endsWith('/');
  const repoPath = isDir ? normalised.slice(0, -1) : normalised;
  if (repoPath === '..' || repoPath.startsWith('../')) {
    throw new SiteError(`${sourcePath}: the link "${href}" leaves the repository`);
  }
  const kind = ctx.tree.get(repoPath);
  if (kind === undefined || (isDir && kind !== 'dir')) {
    throw new SiteError(`${sourcePath}: the link "${href}" names ${normalised}, which does not exist in the repository`);
  }
  let url;
  if (kind === 'dir') {
    const page = pageFor(`${repoPath}/`);
    url = page ? `${SITE_BASE}${page}` : `${REPO_URL}/tree/main/${repoPath}`;
  } else {
    const page = pageFor(repoPath);
    const m = /^schemas\/([^/]+\.json)$/.exec(repoPath);
    if (page) url = `${SITE_BASE}${page}`;
    else if (m) url = `${SITE_BASE}/${ctx.major}.x/${m[1]}`;
    else url = `${REPO_URL}/blob/main/${repoPath}`;
  }
  return `${url}${fragment}`;
}

// ---------------------------------------------------------------------------------------------
// Markdown rendering.
// ---------------------------------------------------------------------------------------------

function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The heading's text as GitHub slugs it: inline markup rendered to text, tags removed. */
function plainText(parser, tokens) {
  return parser.parseInline(tokens, parser.textRenderer).replace(/<[^>]*>/g, '');
}

/**
 * A renderer bound to one source file, so relative links resolve against it and heading slugs
 * de-duplicate per page. `versionAnchors` adds `id="x.y.z"` to every `## [x.y.z]` heading.
 */
function createRenderer(sourcePath, ctx, { versionAnchors = false } = {}) {
  const slug = createSlugger();
  const problems = [];
  let firstH1 = null;
  const marked = new Marked();
  marked.use({
    gfm: true,
    walkTokens(token) {
      if (token.type === 'link') {
        try {
          token.href = siteHref(token.href, sourcePath, ctx);
        } catch (error) {
          problems.push(error);
        }
      } else if (token.type === 'image') {
        problems.push(new SiteError(`${sourcePath}: images are not rendered (${token.href})`));
      }
    },
    renderer: {
      heading({ tokens, depth }) {
        const plain = plainText(this.parser, tokens);
        if (depth === 1 && firstH1 === null) firstH1 = plain;
        const id = slug(plain);
        // `[1.2.1]` is a reference link in the CHANGELOG (the file defines `[1.2.1]: https://...`),
        // so its plain text has no brackets; a heading without the definition keeps them.
        const version = versionAnchors ? /^\[?(\d+\.\d+\.\d+)\]?(?:\s|$)/.exec(plain) : null;
        const anchor = version ? `<span id="${esc(version[1])}"></span>` : '';
        return `<h${depth} id="${esc(id)}">${anchor}${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      html({ text }) {
        return esc(text);
      },
    },
  });
  const finish = (html) => {
    if (problems.length > 0) throw problems[0];
    return html;
  };
  return {
    block: (markdown) => finish(marked.parse(markdown, { async: false })),
    inline: (markdown) => finish(marked.parseInline(markdown, { async: false })),
    title: () => firstH1,
  };
}

// ---------------------------------------------------------------------------------------------
// The page template: one function, no library.
// ---------------------------------------------------------------------------------------------

/** `section` names the nav entry a page belongs to when that is not its own path (a reference page). */
function template({ title, body, path, section, ctx }) {
  const items = NAV.map(([label, href]) => {
    const current = href === (section ?? path) ? ' aria-current="page"' : '';
    return `<li><a href="${SITE_BASE}${href}"${current}>${label}</a></li>`;
  }).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="${SITE_BASE}/site.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header>
<p class="site"><a href="${SITE_BASE}/">${SITE_NAME}</a> <span class="version">${esc(ctx.version)}</span></p>
<nav aria-label="Sections"><ul>${items}</ul></nav>
</header>
<main id="main">
${body}</main>
<footer><p>${esc(ctx.licence)}. Source, corpus and specification: <a href="${REPO_URL}">github.com/Cognitive-Delivery/contract</a>.</p></footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------------------------
// Reading the repository.
// ---------------------------------------------------------------------------------------------

/** Every path in the repository, as `path -> 'file' | 'dir'`, for link resolution. */
async function repositoryTree(root) {
  const tree = new Map();
  async function walk(dir, prefix) {
    for (const name of (await readdir(dir)).sort()) {
      if (UNWALKED.has(name)) continue;
      const abs = resolve(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if ((await stat(abs)).isDirectory()) {
        tree.set(rel, 'dir');
        await walk(abs, rel);
      } else {
        tree.set(rel, 'file');
      }
    }
  }
  await walk(root, '');
  return tree;
}

async function readRepo(path) {
  return readFile(resolve(ROOT, path), 'utf8');
}

/** Paragraphs of a Markdown file: blank-line-separated blocks, each joined into one line. */
function paragraphs(markdown) {
  return markdown
    .split(/\n[ \t]*\n/)
    .map((block) => block.trim().split('\n').map((l) => l.trim()).join(' '))
    .filter((p) => p !== '');
}

/** The first prose paragraph after the H1: not a heading, not a table, not a fence. */
function firstParagraph(markdown) {
  const after = markdown.split(/^# .*$/m)[1] ?? '';
  return paragraphs(after).find((p) => !/^(#|\||```|-|\*|\d+\.)/.test(p)) ?? null;
}

/** The value of a `| **Name** | value |` row in a record's property table, or null. */
function propertyRow(markdown, name) {
  const m = new RegExp(`^\\|\\s*\\*\\*${name}\\*\\*\\s*\\|(.*)\\|\\s*$`, 'm').exec(markdown);
  return m ? m[1].trim() : null;
}

/** The body of the `## ` section whose title matches, up to the next `## `. */
function sectionBody(markdown, headingPattern) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => /^## /.test(l) && headingPattern.test(l.slice(3)));
  if (start === -1) return null;
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end === -1) end = lines.length;
  return { heading: lines[start].slice(3).trim(), body: lines.slice(start + 1, end).join('\n').trim() };
}

async function loadContext(outDir) {
  const pkg = JSON.parse(await readRepo('package.json'));
  const version = pkg.version;
  const major = version.split('.')[0];
  const idDir = resolve(outDir, `${major}.x`);
  let idFiles;
  try {
    idFiles = (await readdir(idDir)).sort();
  } catch {
    throw new SiteError(`${outDir}/${major}.x/ is absent: the workflow and the site check lay out the $id copies from schemas/ before the generator runs`);
  }
  const schemaFiles = idFiles.filter((f) => f.endsWith('.schema.json'));
  for (const file of schemaFiles) {
    const id = JSON.parse(await readFile(resolve(idDir, file), 'utf8')).$id;
    if (id !== idFor(major, file)) {
      throw new SiteError(`${major}.x/${file}: $id is ${id}, not ${idFor(major, file)}`);
    }
  }
  const frozen = [];
  const names = (await readdir(outDir))
    .filter((d) => /^\d+\.\d+\.\d+$/.test(d))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const name of names) {
    if (!(await stat(resolve(outDir, name))).isDirectory()) continue;
    const files = (await readdir(resolve(outDir, name))).filter((f) => f !== 'index.html').sort();
    frozen.push({ version: name, files });
  }
  return {
    version,
    major,
    licence: pkg.license,
    tree: await repositoryTree(ROOT),
    idFiles,
    schemaFiles,
    hasIndexJson: idFiles.includes('index.json'),
    frozen,
  };
}

// ---------------------------------------------------------------------------------------------
// The pages.
// ---------------------------------------------------------------------------------------------

function link(href, text) {
  return `<a href="${esc(href)}">${esc(text)}</a>`;
}

function site(path) {
  return `${SITE_BASE}${path}`;
}

/** Front page: what the contract is, who it is for, three ways in, the facts, the two lists. */
async function frontPage(ctx) {
  const readme = await readRepo('README.md');
  const opening = firstParagraph(readme);
  if (opening === null) throw new SiteError('README.md: no opening paragraph after the title');
  const spec = await readRepo(SPEC_FILE);
  const specHeader = spec.split('\n')[2] ?? '';
  if (!/^\*\*Version /.test(specHeader)) {
    throw new SiteError(`${SPEC_FILE}: line 3 is not the "**Version ..." header line`);
  }
  const readmeInline = createRenderer('README.md', ctx).inline;
  const specInline = createRenderer(SPEC_FILE, ctx).inline;
  const ways = [
    ['Read a schema', '/reference/', 'the reference, one page per schema'],
    ['Implement the contract', '/docs/implementing/', 'the adapter interface and the corpus, in one place'],
    ['Upgrade a writer', '/docs/upgrading-1.0-to-1.2/', 'what a reader or writer built against 1.0 owes 1.2'],
  ];
  const current = ctx.schemaFiles
    .map((f) => `<li>${link(site(`/${ctx.major}.x/${f}`), f)}</li>`)
    .join('\n');
  const frozen = ctx.frozen.length === 0
    ? '<p>No frozen copies were laid out in this build.</p>'
    : `<ul>\n${ctx.frozen.map((v) => `<li>${link(site(`/${v.version}/`), `${v.version}/`)}: the schemas as tagged v${esc(v.version)}, frozen</li>`).join('\n')}\n</ul>`;
  const indexJson = ctx.hasIndexJson
    ? `, with ${link(site(`/${ctx.major}.x/index.json`), 'index.json')}`
    : '';
  const body = `<h1>${SITE_NAME}</h1>
<p class="lead">${readmeInline(opening)}</p>
<p>For the implementer of a second reader or writer of these artefacts, in any language, and for anyone checking a claim that an implementation conforms.</p>
<ul class="ways">
${ways.map(([label, path, blurb]) => `<li><a href="${site(path)}"><strong>${label}</strong></a> <span>${blurb}</span></li>`).join('\n')}
</ul>
<dl class="facts">
<dt>Current version</dt><dd>${esc(ctx.version)}</dd>
<dt>Specification</dt><dd>${link(site('/spec/'), 'The Agent Lease Manifest')}: ${specInline(specHeader)}</dd>
<dt>Licence</dt><dd>${esc(ctx.licence)}</dd>
<dt>Repository</dt><dd>${link(REPO_URL, 'github.com/Cognitive-Delivery/contract')}</dd>
<dt>Package</dt><dd>${link(NPM_URL, '@cognitive-delivery/contract on npm')}</dd>
<dt>Registry</dt><dd>${link(SCHEMASTORE_URL, 'SchemaStore')}</dd>
</dl>
<h2 id="current">Current (${esc(ctx.major)}.x)</h2>
<p>The schema set, served at each schema's <code>$id</code> (the current <code>${esc(ctx.major)}.x</code>)${indexJson}.</p>
<ul>
${current}
</ul>
<h2 id="released">Released, frozen</h2>
${frozen}
<p>${link(site('/versions/'), 'Versions')} links each release to its GitHub Release and its changelog section.</p>
`;
  return { path: '/', title: SITE_NAME, body };
}

/** Every Markdown file with a page of its own, rendered as one. */
async function documentPages(ctx) {
  const pages = [];
  for (const [repoPath, kind] of [...ctx.tree.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (kind !== 'file' || !repoPath.endsWith('.md')) continue;
    const path = pageFor(repoPath);
    if (path === null) continue;
    const renderer = createRenderer(repoPath, ctx, { versionAnchors: repoPath === 'CHANGELOG.md' });
    const body = renderer.block(await readRepo(repoPath));
    const title = renderer.title() ?? repoPath;
    pages.push({ path, title: `${title} · ${SITE_NAME}`, body });
  }
  return pages;
}

/** The conformance index: the claim rule from the SPEC, the reports, the recorded portability. */
async function conformancePage(ctx) {
  const spec = await readRepo(SPEC_FILE);
  const section = sectionBody(spec, /Conformance$/);
  if (section === null) throw new SiteError(`${SPEC_FILE}: no "## N. Conformance" section`);
  const specRenderer = createRenderer(SPEC_FILE, ctx);
  const specAnchor = `${site('/spec/')}#${githubSlug(section.heading)}`;
  const sectionNumber = /^(\d+)\./.exec(section.heading)?.[1] ?? '';

  const reports = [];
  for (const repoPath of [...ctx.tree.keys()].sort()) {
    const m = /^docs\/conformance\/([^/]+)\.md$/.exec(repoPath);
    if (!m || ctx.tree.get(repoPath) !== 'file') continue;
    const markdown = await readRepo(repoPath);
    const renderer = createRenderer(repoPath, ctx);
    const titleLine = /^# (.*)$/m.exec(markdown)?.[1] ?? m[1];
    const summary = firstParagraph(markdown) ?? '';
    const sentence = /^(.*?[.!?])(?:\s|$)/.exec(summary)?.[1] ?? summary;
    const contract = propertyRow(markdown, 'Contract');
    reports.push(
      `<li><a href="${site(pageFor(repoPath))}">${renderer.inline(titleLine)}</a>`
      + (contract ? ` (contract ${renderer.inline(contract)})` : '')
      + (sentence ? `: ${renderer.inline(sentence)}` : '')
      + '</li>',
    );
  }

  const readme = await readRepo('README.md');
  const readmeParagraphs = paragraphs(readme);
  const bowtie = readmeParagraphs.find((p) => p.includes('Bowtie'));
  const re2 = readmeParagraphs.find((p) => p.includes('RE2'));
  if (!bowtie || !re2) throw new SiteError('README.md: the Bowtie or RE2 paragraph is missing, and the site quotes rather than types them');
  const readmeRenderer = createRenderer('README.md', ctx);
  const quoted = [...new Set([re2, bowtie])].map((p) => `<p>${readmeRenderer.inline(p)}</p>`).join('\n');

  const evidence = [];
  for (const repoPath of [...ctx.tree.keys()].sort()) {
    if (!/^fixtures\/evidence\/[^/]+\.md$/.test(repoPath) || ctx.tree.get(repoPath) !== 'file') continue;
    const renderer = createRenderer(repoPath, ctx);
    for (const line of (await readRepo(repoPath)).split('\n')) {
      if (!/\b(RE2|Bowtie)\b/.test(line)) continue;
      const text = line.replace(/^\s*[-*]\s+/, '').trim();
      evidence.push(`<li>${renderer.inline(text)} (${link(`${REPO_URL}/blob/main/${repoPath}`, repoPath)})</li>`);
    }
  }

  const body = `<h1>Conformance</h1>
<h2 id="claiming-conformance">Claiming conformance</h2>
<p>What an implementation must do to claim conformance, as <a href="${esc(specAnchor)}">SPEC §${esc(sectionNumber)}</a> states it today:</p>
<div class="quoted">
${specRenderer.block(section.body)}</div>
<h2 id="implementation-reports">Implementation reports</h2>
${reports.length === 0 ? '<p>No implementation report has been recorded yet.</p>' : `<ul>\n${reports.join('\n')}\n</ul>`}
<h2 id="recorded-portability">Recorded portability</h2>
<p>From the README, as written:</p>
<blockquote>
${quoted}
</blockquote>
${evidence.length === 0 ? '' : `<p>From the recorded checks under ${link(`${REPO_URL}/tree/main/fixtures/evidence`, 'fixtures/evidence/')}:</p>\n<ul>\n${evidence.join('\n')}\n</ul>\n`}`;
  return { path: '/conformance/', title: `Conformance · ${SITE_NAME}`, body };
}

/** The proposals index: title, status and date parsed from each record's property table. */
async function proposalsPage(ctx) {
  const rows = [];
  let template = null;
  for (const repoPath of [...ctx.tree.keys()].sort()) {
    const m = /^docs\/proposals\/([^/]+)\.md$/.exec(repoPath);
    if (!m || ctx.tree.get(repoPath) !== 'file') continue;
    const markdown = await readRepo(repoPath);
    const renderer = createRenderer(repoPath, ctx);
    const titleLine = /^# (.*)$/m.exec(markdown)?.[1] ?? m[1];
    const href = site(pageFor(repoPath));
    if (m[1] === 'TEMPLATE') {
      template = `<p><a href="${href}">${renderer.inline(titleLine)}</a> (<code>${esc(repoPath)}</code>): the form a proposal takes.</p>`;
      continue;
    }
    const status = propertyRow(markdown, 'Status');
    const date = propertyRow(markdown, 'Date');
    if (status === null || date === null) {
      throw new SiteError(`${repoPath}: the property table has no Status or Date row`);
    }
    rows.push(`<tr><td><a href="${href}">${renderer.inline(titleLine)}</a></td><td>${renderer.inline(status)}</td><td>${renderer.inline(date)}</td></tr>`);
  }
  const body = `<h1>Proposals</h1>
<p>One page per semantic change to the contract, kept as the record. ${link(site('/governance/'), 'GOVERNANCE')} says which changes need one.</p>
${rows.length === 0 ? '<p>No proposal has been recorded.</p>' : `<table>\n<thead><tr><th>Proposal</th><th>Status</th><th>Date</th></tr></thead>\n<tbody>\n${rows.join('\n')}\n</tbody>\n</table>`}
<h2 id="the-template">The template</h2>
${template ?? '<p>No template is present.</p>'}
`;
  return { path: '/governance/proposals/', title: `Proposals · ${SITE_NAME}`, body };
}

/**
 * The schema reference: `/reference/` and one page per schema at `/reference/<name>/`, from the
 * walker in `site-reference.mjs`. The schema files are the ones laid out under `<major>.x/` (the
 * `$id` copies of `schemas/`), read from `schemas/` so the pages describe the tree being built.
 * `pageFor` maps `schemas/<name>.schema.json` to `/reference/<name>/`, so a Markdown link to a
 * schema resolves to its page.
 */
async function buildReference(ctx) {
  const inputs = await loadReferenceInputs(ctx.schemaFiles, ROOT);
  return referencePages(inputs, { base: SITE_BASE, major: ctx.major, siteName: SITE_NAME });
}

/** `/versions/`: every frozen directory, its GitHub Release and its changelog section. */
function versionsPage(ctx) {
  const rows = ctx.frozen.map((v) => `<tr><td>${esc(v.version)}</td>`
    + `<td>${link(site(`/${v.version}/`), `/${v.version}/`)}</td>`
    + `<td>${link(`${REPO_URL}/releases/tag/v${v.version}`, `v${v.version}`)}</td>`
    + `<td>${link(`${site('/changelog/')}#${v.version}`, `CHANGELOG ${v.version}`)}</td></tr>`);
  const body = `<h1>Versions</h1>
<p>The current schema set is ${esc(ctx.version)}, served at each schema's <code>$id</code> under <code>/${esc(ctx.major)}.x/</code> and listed on the ${link(site('/'), 'front page')}. Each release is also served frozen under its own directory, byte for byte as tagged and never rewritten.</p>
${rows.length === 0 ? '<p>No frozen copies were laid out in this build.</p>' : `<table>\n<thead><tr><th>Version</th><th>Frozen copy</th><th>Release</th><th>Changelog</th></tr></thead>\n<tbody>\n${rows.join('\n')}\n</tbody>\n</table>`}
`;
  return { path: '/versions/', title: `Versions · ${SITE_NAME}`, body };
}

/** `/<version>/index.html`: today's sentence and file list, in the template. */
function versionPage(ctx, v) {
  const files = v.files.map((f) => `<li>${link(site(`/${v.version}/${f}`), f)}</li>`).join('\n');
  const body = `<h1>@cognitive-delivery/contract ${esc(v.version)}</h1>
<p>Byte for byte as tagged. Never rewritten.</p>
<ul>
${files}
</ul>
<p>${link(`${REPO_URL}/releases/tag/v${v.version}`, `Release v${v.version}`)} and its ${link(`${site('/changelog/')}#${v.version}`, 'changelog section')}.</p>
`;
  return { path: `/${v.version}/`, title: `contract ${v.version} · ${SITE_NAME}`, body };
}

function notFoundPage() {
  const body = `<h1>Page not found</h1>
<p>There is no page at this address. The sections above and the ${link(site('/'), 'front page')} reach everything the site serves.</p>
`;
  return { path: '/404.html', title: `Page not found · ${SITE_NAME}`, body };
}

// ---------------------------------------------------------------------------------------------
// Building.
// ---------------------------------------------------------------------------------------------

async function writePage(outDir, page, ctx, log) {
  const file = page.path.endsWith('/') ? `${page.path}index.html` : page.path;
  const abs = resolve(outDir, `.${file}`);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, template({ ...page, ctx }), 'utf8');
  log(`wrote ${file}`);
}

/** Builds the site into `outDir`. Returns the number of pages written. */
export async function buildSite(outDir, { log = console.log } = {}) {
  const out = resolve(outDir);
  const ctx = await loadContext(out);
  const pages = [
    await frontPage(ctx),
    ...(await documentPages(ctx)),
    await conformancePage(ctx),
    await proposalsPage(ctx),
    ...(await buildReference(ctx)),
    versionsPage(ctx),
    ...ctx.frozen.map((v) => versionPage(ctx, v)),
    notFoundPage(),
  ];
  const seen = new Set();
  for (const page of pages) {
    if (seen.has(page.path)) throw new SiteError(`two pages at ${page.path}`);
    seen.add(page.path);
    await writePage(out, page, ctx, log);
  }
  await copyFile(resolve(here, 'site.css'), resolve(out, 'site.css'));
  log(`Site: ${pages.length} pages written to ${outDir}`);
  return pages.length;
}

// ---------------------------------------------------------------------------------------------
// Self-test: the slug algorithm and the link map, under an environment flag.
// ---------------------------------------------------------------------------------------------

function selfTest() {
  const cases = [
    ['9. Conformance', '9-conformance'],
    ['[1.2.1] — 2026-10-06', '121--2026-10-06'],
    ['Proposal: allow.tool_args as a declaration at development stability', 'proposal-allowtool_args-as-a-declaration-at-development-stability'],
    ['Compatibility, within 1.x', 'compatibility-within-1x'],
    ['Part A: what the schemas now refuse', 'part-a-what-the-schemas-now-refuse'],
    ['Tightening a schema within 1.x', 'tightening-a-schema-within-1x'],
    ['4.4 Scope', '44-scope'],
    ['What the plugin schemas model, and what they add', 'what-the-plugin-schemas-model-and-what-they-add'],
  ];
  let count = 0;
  const check = (actual, wanted, what) => {
    if (actual !== wanted) throw new Error(`${what}: got "${actual}", wanted "${wanted}"`);
    count += 1;
  };
  for (const [text, wanted] of cases) check(githubSlug(text), wanted, `slug of "${text}"`);
  const slug = createSlugger();
  check(slug('Summary'), 'summary', 'first "Summary"');
  check(slug('Summary'), 'summary-1', 'second "Summary"');
  check(slug('Summary'), 'summary-2', 'third "Summary"');

  const ctx = {
    major: '1',
    tree: new Map([
      ['README.md', 'file'], [SPEC_FILE, 'file'], ['LICENSE', 'file'], ['docs', 'dir'],
      ['docs/implementing.md', 'file'], ['docs/conformance', 'dir'], ['docs/conformance/cdf-harness.md', 'file'],
      ['docs/proposals', 'dir'], ['docs/proposals/TEMPLATE.md', 'file'], ['schemas', 'dir'],
      ['schemas/agent-lease.schema.json', 'file'], ['schemas/index.json', 'file'], ['conformance', 'dir'],
      ['conformance/runner.mjs', 'file'], ['.github', 'dir'], ['.github/CODEOWNERS', 'file'],
    ]),
  };
  const links = [
    ['README.md', 'docs/implementing.md', '/contract/docs/implementing/'],
    ['README.md', 'SPEC-agent-lease-manifest.md#9-conformance', '/contract/spec/#9-conformance'],
    ['README.md', 'docs/conformance/', '/contract/conformance/'],
    ['docs/implementing.md', 'conformance/cdf-harness.md', '/contract/conformance/cdf-harness/'],
    ['docs/decisions.md', 'proposals/', '/contract/governance/proposals/'],
    ['GOVERNANCE.md', 'docs/proposals/TEMPLATE.md', '/contract/governance/proposals/template/'],
    ['GOVERNANCE.md', '.github/CODEOWNERS', 'https://github.com/Cognitive-Delivery/contract/blob/main/.github/CODEOWNERS'],
    ['SECURITY.md', 'LICENSE', 'https://github.com/Cognitive-Delivery/contract/blob/main/LICENSE'],
    ['README.md', 'schemas/agent-lease.schema.json', '/contract/reference/agent-lease/'],
    ['README.md', 'schemas/index.json', '/contract/1.x/index.json'],
    ['README.md', 'conformance/runner.mjs', 'https://github.com/Cognitive-Delivery/contract/blob/main/conformance/runner.mjs'],
    ['README.md', 'conformance/', 'https://github.com/Cognitive-Delivery/contract/tree/main/conformance'],
    ['README.md', 'https://bowtie.report', 'https://bowtie.report'],
    ['README.md', '#why-this-exists', '#why-this-exists'],
  ];
  for (const [source, href, wanted] of links) check(siteHref(href, source, ctx), wanted, `link "${href}" from ${source}`);
  let refused = false;
  try { siteHref('docs/missing.md', 'README.md', ctx); } catch (error) { refused = error instanceof SiteError; }
  check(refused, true, 'a link to a path not in the tree is refused');
  count += 0;
  console.log(`build-site self-test: ${count} assertions passed`);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  if (process.env.CDF_SITE_SELF_TEST === '1') {
    selfTest();
    await selfTestReference();
  } else {
    const outDir = process.argv[2];
    if (!outDir) {
      console.error('usage: node tooling/build-site.mjs <out-dir>   (with <out-dir>/<major>.x/ already laid out)');
      process.exit(1);
    }
    try {
      await buildSite(outDir);
    } catch (error) {
      if (error instanceof SiteError) {
        console.error(`build-site: ${error.message}`);
        process.exit(1);
      }
      console.error(`build-site: unexpected failure: ${error.stack ?? error}`);
      process.exit(2);
    }
  }
}
