/**
 * The claims check: every count and list the documents state, recomputed from the repository.
 *
 * The fourth review of 6 October 2026 found twenty-two statements the artefacts contradicted, and
 * most were numbers or lists that had been true once: "110 entries cover the 115 tightenings" (58
 * do), "every schema carries `schema_version`" (seven of ten), "eleven spellings" (ten values).
 * A number in prose is a fact with a short half-life unless something recomputes it, so this file
 * holds a declarative list of claims, each `{ id, file, pattern, compute }`: the file the statement
 * lives in, a regular expression whose one capture group is the stated value, and a function that
 * computes the true value from the repository. `npm test` fails when the two differ, and when the
 * pattern no longer finds its statement, because a claim that silently stopped matching is a check
 * that silently stopped running.
 *
 * Stated values may be digits (`1,234`), number words (`seven`, `thirty-three`) or a list of
 * backticked names; the comparison is on the parsed value. A claim whose source file or inputs are
 * not present (the published package ships no CONTRIBUTING, `docs/`, allow-list, guard or git
 * history) is reported NOT CHECKED with its reason rather than passed. Claims about a release are
 * computed from that release's tag, so they stay true as `main` moves on, and need a clone with
 * tags (CI's conformance job checks out full history for this).
 *
 * `EXCLUDED` lists the stated numbers deliberately not checked here, each with its reason.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { extractClauses } from './spec-clauses.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** A claim that cannot be computed where it runs; reported NOT CHECKED with the reason. */
class NotAvailable extends Error {}

// ---------------------------------------------------------------------------------------------
// Parsing a stated value.
// ---------------------------------------------------------------------------------------------

const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** `1,234`, `seven`, `Seven` or `thirty-three` as a number; null when it is none of those. */
export function parseCount(text) {
  const t = String(text).trim().toLowerCase();
  if (/^\d{1,3}(,\d{3})*$|^\d+$/.test(t)) return Number(t.replace(/,/g, ''));
  if (UNITS.includes(t)) return UNITS.indexOf(t);
  if (Object.hasOwn(TENS, t)) return TENS[t];
  const m = /^([a-z]+)-([a-z]+)$/.exec(t);
  if (m && Object.hasOwn(TENS, m[1]) && UNITS.indexOf(m[2]) > 0 && UNITS.indexOf(m[2]) < 10) return TENS[m[1]] + UNITS.indexOf(m[2]);
  return null;
}

/** The backticked names in a stated list, sorted: "`a`, `b` and `c`" is ['a', 'b', 'c']. */
export function parseNames(text) {
  return [...String(text).matchAll(/`([^`]+)`/g)].map((m) => m[1]).sort();
}

// ---------------------------------------------------------------------------------------------
// Computing a true value.
// ---------------------------------------------------------------------------------------------

function makeContext(root) {
  const cache = new Map();
  const memo = (key, fn) => {
    if (!cache.has(key)) cache.set(key, fn());
    return cache.get(key);
  };

  const need = (path) => {
    if (!existsSync(join(root, path))) throw new NotAvailable(`${path} is not present (the published package does not ship it)`);
  };
  const text = (path) => { need(path); return readFile(join(root, path), 'utf8'); };
  const json = async (path) => JSON.parse(await text(path));

  // Git, only when `root` is itself the top of a clone: from an installed package inside someone
  // else's repository, `git` would answer about that repository instead.
  const gitRoot = memo('gitRoot', () => {
    try {
      const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      return resolve(top) === resolve(root);
    } catch { return false; }
  });
  const git = (args) => {
    if (!gitRoot) throw new NotAvailable('not a git clone of this repository');
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  };
  const needRef = (ref) => {
    try { git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]); } catch (error) {
      if (error instanceof NotAvailable) throw error;
      throw new NotAvailable(`${ref} is not in this clone (a shallow checkout has no tags)`);
    }
  };
  const showAt = (ref, path) => { needRef(ref); return git(['show', `${ref}:${path}`]); };

  /** `{ file: schema }` for every `*.schema.json` at a ref, or in the working tree. */
  const schemasAt = (ref) => memo(`schemas:${ref}`, async () => {
    const out = {};
    if (ref === null) {
      for (const f of (await readdir(join(root, 'schemas'))).filter((n) => n.endsWith('.schema.json')).sort()) {
        out[f] = JSON.parse(await readFile(join(root, 'schemas', f), 'utf8'));
      }
      return out;
    }
    needRef(ref);
    for (const f of git(['ls-tree', '--name-only', `${ref}:schemas`]).split('\n').filter((n) => n.endsWith('.schema.json')).sort()) {
      out[f] = JSON.parse(showAt(ref, `schemas/${f}`));
    }
    return out;
  });

  /** The guard's comparison between two release tags, with the allow-list as it was at `current`. */
  const guardBetween = (baselineRef, currentRef) => memo(`guard:${baselineRef}:${currentRef}`, async () => {
    need('check-additive.mjs');
    need('generate-schemas-lock.mjs');
    const { compare, applyAllowlist } = await import(pathToFileURL(join(root, 'check-additive.mjs')).href);
    const { buildLock } = await import(pathToFileURL(join(root, 'generate-schemas-lock.mjs')).href);
    const lockAt = async (ref) => {
      const dir = await mkdtemp(join(tmpdir(), 'cdf-claims-'));
      try {
        needRef(ref);
        for (const f of git(['ls-tree', '--name-only', `${ref}:schemas`]).split('\n').filter((n) => n.endsWith('.json'))) {
          await writeFile(join(dir, f), showAt(ref, `schemas/${f}`), 'utf8');
        }
        return await buildLock({ schemaDir: dir, version: ref });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    };
    const allowlist = JSON.parse(showAt(currentRef, 'compat-allowlist.json'));
    const { findings } = compare(await lockAt(baselineRef), await lockAt(currentRef));
    const { accepted, unlisted } = applyAllowlist(findings, allowlist);
    return {
      findings: findings.length,
      accepted: accepted.length,
      unlisted: unlisted.length,
      entriesUsed: new Set(accepted.map((f) => f.entry)).size,
      entries: allowlist.entries.length,
    };
  });

  return { root, text, json, git, needRef, showAt, schemasAt, guardBetween };
}

/** Files under a fixtures directory that are fixtures, not their `.expect.json` or `.reason`. */
async function fixtureCount(root, dir) {
  return (await readdir(join(root, 'fixtures', dir))).filter((f) => f.endsWith('.json') && !f.endsWith('.expect.json')).length;
}

/** Every string-valued `pattern` keyword, counted as `tooling/regex-portability` counts them. */
function countPatterns(node) {
  if (Array.isArray(node)) return node.reduce((n, item) => n + countPatterns(item), 0);
  if (!node || typeof node !== 'object') return 0;
  let n = typeof node.pattern === 'string' ? 1 : 0;
  for (const [k, v] of Object.entries(node)) if (k !== 'pattern') n += countPatterns(v);
  return n;
}

/**
 * `properties` keys: all of them, and the declared ones, which are those outside `if`, `contains`,
 * `not` and `propertyNames` bodies (conditions, not declarations; conformance/metaschema.json and
 * the site reference count the same way, independently of this).
 */
export function countPropertyKeys(node, inCondition = false) {
  if (Array.isArray(node)) {
    return node.reduce((acc, item) => {
      const c = countPropertyKeys(item, inCondition);
      return { all: acc.all + c.all, declared: acc.declared + c.declared };
    }, { all: 0, declared: 0 });
  }
  if (!node || typeof node !== 'object') return { all: 0, declared: 0 };
  let all = 0;
  let declared = 0;
  for (const [k, v] of Object.entries(node)) {
    if (k === 'properties' && v && typeof v === 'object' && !Array.isArray(v)) {
      const n = Object.keys(v).length;
      all += n;
      if (!inCondition) declared += n;
      for (const child of Object.values(v)) {
        const c = countPropertyKeys(child, inCondition);
        all += c.all;
        declared += c.declared;
      }
      continue;
    }
    const c = countPropertyKeys(v, inCondition || ['if', 'contains', 'not', 'propertyNames'].includes(k));
    all += c.all;
    declared += c.declared;
  }
  return { all, declared };
}

function sumKeys(schemas) {
  return Object.values(schemas).reduce((acc, s) => {
    const c = countPropertyKeys(s);
    return { all: acc.all + c.all, declared: acc.declared + c.declared };
  }, { all: 0, declared: 0 });
}

/** The schemas that declare a `schema_version` property anywhere, by name without `.schema.json`. */
function schemasWithSchemaVersion(schemas) {
  const declares = (node) => {
    if (Array.isArray(node)) return node.some(declares);
    if (!node || typeof node !== 'object') return false;
    if (node.properties && typeof node.properties === 'object' && Object.hasOwn(node.properties, 'schema_version')) return true;
    return Object.values(node).some(declares);
  };
  return Object.entries(schemas).filter(([, s]) => declares(s)).map(([f]) => f.replace(/\.schema\.json$/, '')).sort();
}

async function clausesAt(ctx, ref) {
  const spec = ref === null ? await ctx.text('SPEC-agent-lease-manifest.md') : ctx.showAt(ref, 'SPEC-agent-lease-manifest.md');
  const map = ref === null
    ? JSON.parse(await readFile(join(here, 'traceability.json'), 'utf8'))
    : JSON.parse(ctx.showAt(ref, 'conformance/traceability.json'));
  const clauses = extractClauses(spec);
  const excluded = clauses.filter((c) => typeof map.clauses?.[c.id]?.excluded === 'string').length;
  return { clauses: clauses.length, excluded };
}

async function suiteCounts(root) {
  const dir = join(root, 'conformance', 'suite', 'draft7');
  let cases = 0;
  let tests = 0;
  for (const f of (await readdir(dir)).filter((n) => n.endsWith('.json'))) {
    const list = JSON.parse(await readFile(join(dir, f), 'utf8'));
    cases += list.length;
    for (const c of list) tests += c.tests.length;
  }
  return { cases, tests };
}

const shortCommit = (ctx, tag) => { ctx.needRef(tag); return ctx.git(['rev-parse', '--short=7', `${tag}^{commit}`]).trim(); };
const shortObject = (ctx, tag) => { ctx.needRef(tag); return ctx.git(['rev-parse', '--short=7', tag]).trim(); };

// ---------------------------------------------------------------------------------------------
// The claims. `pattern` has one capture group: the stated value. `kind` is 'count' (the default),
// 'names' (a backticked list, compared as a sorted set) or 'text' (compared verbatim).
// ---------------------------------------------------------------------------------------------

const vectorsLength = (file, key) => async (ctx) => (await ctx.json(`conformance/${file}`))[key].length;
const enumLength = (file, pick) => async (ctx) => pick((await ctx.schemasAt(null))[file]).length;

export const CLAIMS = [
  // README, "The corpus in numbers": the current figures, all of them recomputed.
  { id: 'readme-valid-fixtures', file: 'README.md', pattern: /holds \*\*(\d[\d,]*)\*\* valid fixtures/, compute: (ctx) => fixtureCount(ctx.root, 'valid') },
  { id: 'readme-invalid-fixtures', file: 'README.md', pattern: /\*\*(\d[\d,]*)\*\* invalid fixtures/, compute: (ctx) => fixtureCount(ctx.root, 'invalid') },
  { id: 'readme-by-rule-fixtures', file: 'README.md', pattern: /\*\*(\d[\d,]*)\*\* by-rule\s+fixtures/, compute: (ctx) => fixtureCount(ctx.root, 'invalid-by-rule') },
  { id: 'readme-suite-tests', file: 'README.md', pattern: /suite carries as \*\*(\d[\d,]*)\*\* tests/, compute: async (ctx) => (await suiteCounts(ctx.root)).tests },
  { id: 'readme-suite-cases', file: 'README.md', pattern: /tests in \*\*(\d[\d,]*)\*\* cases/, compute: async (ctx) => (await suiteCounts(ctx.root)).cases },
  { id: 'readme-canonical-vectors', file: 'README.md', pattern: /Beside them are \*\*(\d+)\*\*\s+canonical-bytes vectors/, compute: vectorsLength('canonical-vectors.json', 'vectors') },
  { id: 'readme-canonical-must-fail', file: 'README.md', pattern: /with \*\*(\d+)\*\* values that must fail to serialise/, compute: vectorsLength('canonical-vectors.json', 'must_fail') },
  { id: 'readme-jcs-vectors', file: 'README.md', pattern: /RFC 8785's own \*\*(\d+)\*\*/, compute: async (ctx) => (await readdir(join(ctx.root, 'conformance', 'jcs', 'input'))).filter((f) => f.endsWith('.json')).length },
  { id: 'readme-narrowing-vectors', file: 'README.md', pattern: /\*\*(\d+)\*\*\s+narrowing vectors/, compute: vectorsLength('narrowing-vectors.json', 'vectors') },
  { id: 'readme-signature-vectors', file: 'README.md', pattern: /\*\*(\d+)\*\* signature vectors/, compute: vectorsLength('signature-vectors.json', 'vectors') },
  { id: 'readme-spec-clauses', file: 'README.md', pattern: /The SPEC has \*\*(\d+)\*\* normative clauses/, compute: async (ctx) => (await clausesAt(ctx, null)).clauses },
  { id: 'readme-spec-excluded', file: 'README.md', pattern: /\*\*(\d+)\*\* of them\s+excluded from the traceability map/, compute: async (ctx) => (await clausesAt(ctx, null)).excluded },
  { id: 'readme-patterns', file: 'README.md', pattern: /The schemas carry \*\*(\d+)\*\* patterns/, compute: async (ctx) => Object.values(await ctx.schemasAt(null)).reduce((n, s) => n + countPatterns(s), 0) },
  { id: 'readme-declared-properties', file: 'README.md', pattern: /\*\*(\d+)\*\* declared properties; counted/, compute: async (ctx) => sumKeys(await ctx.schemasAt(null)).declared },
  { id: 'readme-properties-keys', file: 'README.md', pattern: /`properties` keys there are\s+\*\*(\d+)\*\*/, compute: async (ctx) => sumKeys(await ctx.schemasAt(null)).all },
  { id: 'readme-condition-keys', file: 'README.md', pattern: /because \*\*(\d+)\*\* keys sit inside/, compute: async (ctx) => { const c = sumKeys(await ctx.schemasAt(null)); return c.all - c.declared; } },
  { id: 'readme-allowlist-entries', file: 'README.md', pattern: /`compat-allowlist\.json` holds \*\*(\d+)\*\* entries/, compute: async (ctx) => (await ctx.json('compat-allowlist.json')).entries.length },

  // README, elsewhere.
  { id: 'readme-schema-version-count', file: 'README.md', pattern: /(\w+) schemas carry `schema_version` and require it/, compute: async (ctx) => schemasWithSchemaVersion(await ctx.schemasAt(null)).length },
  { id: 'readme-schema-version-list', file: 'README.md', kind: 'names', pattern: /carry `schema_version` and require it \(([^)]*)\)/, compute: async (ctx) => schemasWithSchemaVersion(await ctx.schemasAt(null)) },
  { id: 'readme-event-type-enum', file: 'README.md', pattern: /closed enum of (\d+) values/, compute: enumLength('cdi-signal.schema.json', (s) => s.properties.event_type.enum) },
  { id: 'readme-hook-events', file: 'README.md', pattern: /\(the ([\w-]+) events the hooks reference lists/, compute: enumLength('plugin-manifest.schema.json', (s) => s.definitions.hooksMap.propertyNames.enum) },
  { id: 'readme-canonical-more', file: 'README.md', pattern: /`conformance\/canonical-vectors\.json` (\w+) more/, compute: vectorsLength('canonical-vectors.json', 'vectors') },
  { id: 'readme-jcs-own', file: 'README.md', pattern: /carries RFC 8785's own (\w+) reference vectors/, compute: async (ctx) => (await readdir(join(ctx.root, 'conformance', 'jcs', 'input'))).filter((f) => f.endsWith('.json')).length },
  { id: 'readme-canonical-fail', file: 'README.md', pattern: /plus (\w+) values that must \*fail\*/, compute: vectorsLength('canonical-vectors.json', 'must_fail') },
  { id: 'readme-canonical-all', file: 'README.md', pattern: /the runner checks all (\w+);/, compute: async (ctx) => (await ctx.json('conformance/canonical-vectors.json')).vectors.length + (await readdir(join(ctx.root, 'conformance', 'jcs', 'input'))).filter((f) => f.endsWith('.json')).length },

  // The SPEC.
  { id: 'spec-schema-version-count', file: 'SPEC-agent-lease-manifest.md', pattern: /(\w+) schemas in the set carry `schema_version`/, compute: async (ctx) => schemasWithSchemaVersion(await ctx.schemasAt(null)).length },
  { id: 'spec-schema-version-list', file: 'SPEC-agent-lease-manifest.md', kind: 'names', pattern: /carry `schema_version` as `major\.minor` \(schema set [\d.]+\): ([\s\S]*?); `config-core`/, compute: async (ctx) => schemasWithSchemaVersion(await ctx.schemasAt(null)) },
  { id: 'spec-canonical-vectors', file: 'SPEC-agent-lease-manifest.md', pattern: /`conformance\/canonical-vectors\.json` carries (\w+) vectors/, compute: vectorsLength('canonical-vectors.json', 'vectors') },
  { id: 'spec-canonical-fail', file: 'SPEC-agent-lease-manifest.md', pattern: /plus (\w+) cases that \*\*MUST\*\* fail to serialise/, compute: vectorsLength('canonical-vectors.json', 'must_fail') },
  { id: 'spec-jcs', file: 'SPEC-agent-lease-manifest.md', pattern: /carries RFC 8785's own (\w+) reference vectors/, compute: async (ctx) => (await readdir(join(ctx.root, 'conformance', 'jcs', 'input'))).filter((f) => f.endsWith('.json')).length },
  { id: 'spec-lease-events', file: 'SPEC-agent-lease-manifest.md', pattern: /(\w+) events, with what each \*\*MUST\*\*/, compute: enumLength('lease-record.schema.json', (s) => s.properties.event.enum) },

  // docs/ (repository only).
  { id: 'implementing-canonical', file: 'docs/implementing.md', pattern: /each of the (\w+) vectors in `canonical-vectors\.json`/, compute: vectorsLength('canonical-vectors.json', 'vectors') },
  { id: 'implementing-jcs', file: 'docs/implementing.md', pattern: /the (\w+) inputs under `jcs\/input\/`/, compute: async (ctx) => (await readdir(join(ctx.root, 'conformance', 'jcs', 'input'))).filter((f) => f.endsWith('.json')).length },
  { id: 'implementing-must-fail', file: 'docs/implementing.md', pattern: /and (\w+) values that must fail \(`NaN`/, compute: vectorsLength('canonical-vectors.json', 'must_fail') },
  { id: 'upgrading-lease-events', file: 'docs/upgrading-1.0-to-1.2.md', pattern: /one line per decision, (\w+) events/, compute: enumLength('lease-record.schema.json', (s) => s.properties.event.enum) },
  { id: 'decisions-1.0.x-commits', file: 'docs/decisions.md', kind: 'text', pattern: /\| 1\.0\.0, 1\.0\.1 and 1\.0\.2 \| [\d-]+ \| ([0-9a-f]{7}, [0-9a-f]{7}, [0-9a-f]{7}) \(annotated/, compute: (ctx) => ['v1.0.0', 'v1.0.1', 'v1.0.2'].map((t) => shortCommit(ctx, t)).join(', ') },
  { id: 'decisions-1.0.x-tag-objects', file: 'docs/decisions.md', kind: 'text', pattern: /\(annotated tags ([0-9a-f]{7}, [0-9a-f]{7}, [0-9a-f]{7})\)/, compute: (ctx) => ['v1.0.0', 'v1.0.1', 'v1.0.2'].map((t) => shortObject(ctx, t)).join(', ') },
  { id: 'decisions-1.1.0-commit', file: 'docs/decisions.md', kind: 'text', pattern: /\| 1\.1\.0 \| [\d-]+ \| ([0-9a-f]{7}) \|/, compute: (ctx) => shortCommit(ctx, 'v1.1.0') },
  { id: 'decisions-1.2.0-commit', file: 'docs/decisions.md', kind: 'text', pattern: /\| 1\.2\.0 \| [\d-]+ \| ([0-9a-f]{7}) \|/, compute: (ctx) => shortCommit(ctx, 'v1.2.0') },
  { id: 'decisions-1.2.1-commit', file: 'docs/decisions.md', kind: 'text', pattern: /\| 1\.2\.1 \| [\d-]+ \| ([0-9a-f]{7}) \|/, compute: (ctx) => shortCommit(ctx, 'v1.2.1') },
  { id: 'proposal-tool-args-keys', file: 'docs/proposals/2026-10-05-tool-args-declaration.md', pattern: /at 1\.2\.1, (\d+) `properties` keys carry one/, compute: async (ctx) => sumKeys(await ctx.schemasAt('v1.2.1')).all },
  { id: 'proposal-tool-args-declared', file: 'docs/proposals/2026-10-05-tool-args-declaration.md', pattern: /the (\d+)\s+declared properties the site reference lists/, compute: async (ctx) => sumKeys(await ctx.schemasAt('v1.2.1')).declared },

  // The guard between two release tags (repository with tags only).
  { id: 'contributing-entries-used', file: 'CONTRIBUTING.md', pattern: /at v1\.2\.0, (\d+) of the allow-list's/, compute: async (ctx) => (await ctx.guardBetween('v1.1.0', 'v1.2.0')).entriesUsed },
  { id: 'contributing-entries', file: 'CONTRIBUTING.md', pattern: /of the allow-list's (\d+) entries covered/, compute: async (ctx) => (await ctx.guardBetween('v1.1.0', 'v1.2.0')).entries },
  { id: 'contributing-tightenings', file: 'CONTRIBUTING.md', pattern: /covered the (\d+) tightenings the guard reports/, compute: async (ctx) => (await ctx.guardBetween('v1.1.0', 'v1.2.0')).accepted },
  { id: 'contributing-other-entries', file: 'CONTRIBUTING.md', pattern: /the other (\d+) entries are 1\.1\.0's/, compute: async (ctx) => { const g = await ctx.guardBetween('v1.1.0', 'v1.2.0'); return g.entries - g.entriesUsed; } },
  { id: 'changelog-1.2.0-tightenings', file: 'CHANGELOG.md', pattern: /against 1\.1\.0\s+the guard reports (\d+) allow-listed tightenings/, compute: async (ctx) => (await ctx.guardBetween('v1.1.0', 'v1.2.0')).accepted },
  { id: 'changelog-1.2.0-entries-used', file: 'CHANGELOG.md', pattern: /covered by (\d+) of the allow-list's/, compute: async (ctx) => (await ctx.guardBetween('v1.1.0', 'v1.2.0')).entriesUsed },
  { id: 'changelog-1.2.0-entries', file: 'CHANGELOG.md', pattern: /of the allow-list's (\d+) entries \(an/, compute: async (ctx) => (await ctx.guardBetween('v1.1.0', 'v1.2.0')).entries },
  { id: 'changelog-1.2.0-other-entries', file: 'CHANGELOG.md', pattern: /the other (\d+)\s+entries are 1\.1\.0's/, compute: async (ctx) => { const g = await ctx.guardBetween('v1.1.0', 'v1.2.0'); return g.entries - g.entriesUsed; } },
  { id: 'changelog-1.2.0-clauses', file: 'CHANGELOG.md', pattern: /extracts the (\d+) clauses with stable ids/, compute: async (ctx) => (await clausesAt(ctx, 'v1.2.0')).clauses },
  { id: 'changelog-1.2.0-excluded', file: 'CHANGELOG.md', pattern: /excluded with a reason \((\d+) are:/, compute: async (ctx) => (await clausesAt(ctx, 'v1.2.0')).excluded },
  { id: 'changelog-1.2.0-keys', file: 'CHANGELOG.md', pattern: /All (\d+) `properties` keys \(/, compute: async (ctx) => sumKeys(await ctx.schemasAt('v1.2.0')).all },
  { id: 'changelog-1.2.1-keys', file: 'CHANGELOG.md', pattern: /`properties` keys \((\d+) at 1\.2\.1/, compute: async (ctx) => sumKeys(await ctx.schemasAt('v1.2.1')).all },
  { id: 'changelog-1.2.0-declared', file: 'CHANGELOG.md', pattern: /which are (\d+) declared properties \(/, compute: async (ctx) => sumKeys(await ctx.schemasAt('v1.2.0')).declared },
  { id: 'changelog-1.2.1-declared', file: 'CHANGELOG.md', pattern: /declared properties \((\d+) at 1\.2\.1\)/, compute: async (ctx) => sumKeys(await ctx.schemasAt('v1.2.1')).declared },
];

/** Stated numbers deliberately not checked here, and why. Kept so a reader sees the edge. */
export const EXCLUDED = [
  { where: 'CHANGELOG 1.1.0', statement: 'against 1.0.2 the guard reports 46 allow-listed tightenings', reason: "1.1.0's allow-list entries predate `after` and its guard used lock format 3, so today's guard cannot reproduce the count; checked by hand on 6 October 2026 with v1.1.0's own check-additive.mjs (46)" },
  { where: 'README, CHANGELOG, the SPEC, fixtures/evidence/, docs/conformance/', statement: 'counts of the reference deployment\'s real records (audit records, signals, provenance, lease records) and its ten distinct actor.runtime values', reason: 'the journals live in the reference implementation\'s repository; each count is dated and its evidence file names how it was taken' },
  { where: 'docs/conformance/cdf-harness.md', statement: 'the recorded run output (40 valid and 98 invalid fixtures, 6 tests)', reason: 'a verbatim record of one run at a named pin, true of that run whatever the corpus holds later' },
  { where: 'fixtures/evidence/*.md', statement: 'pattern counts at a check (139, 211, 226 patterns)', reason: 'dated records of the check that an allow-list entry cites; the current count is the README claim above' },
  { where: 'CHANGELOG release sections', statement: 'what an entry added ("Eighteen invalid fixtures", "27 scenarios", "Eleven valid fixtures")', reason: 'a count of what that change added, which later changes do not make false' },
  { where: 'docs/implementing.md', statement: '"Three further lines from the installed package"', reason: 'a count of lines run.mjs prints, not of repository content; the lines themselves are quoted beside it' },
];

// ---------------------------------------------------------------------------------------------
// Running them.
// ---------------------------------------------------------------------------------------------

function sameValue(kind, stated, actual) {
  if (kind === 'names') {
    const a = parseNames(stated);
    return { ok: JSON.stringify(a) === JSON.stringify([...actual].sort()), shown: a.join(', '), truth: [...actual].sort().join(', ') };
  }
  if (kind === 'text') return { ok: stated.trim() === String(actual), shown: stated.trim(), truth: String(actual) };
  const n = parseCount(stated);
  return { ok: n !== null && n === actual, shown: stated, truth: String(actual) };
}

/** `{ checked, notChecked: [{ id, reason }], failures: [string], total }`. */
export async function runClaimsCheck(root = resolve(here, '..')) {
  const ctx = makeContext(root);
  const failures = [];
  const notChecked = [];
  let checked = 0;
  const files = new Map();
  for (const claim of CLAIMS) {
    try {
      if (!files.has(claim.file)) files.set(claim.file, existsSync(join(root, claim.file)) ? await readFile(join(root, claim.file), 'utf8') : null);
      const source = files.get(claim.file);
      if (source === null) throw new NotAvailable(`${claim.file} is not present (the published package does not ship it)`);
      const match = claim.pattern.exec(source);
      if (!match) {
        failures.push(`claims: ${claim.id}: the statement is no longer in ${claim.file} (pattern ${claim.pattern}); update the claim with the text, or remove it with the statement`);
        continue;
      }
      const actual = await claim.compute(ctx);
      const { ok, shown, truth } = sameValue(claim.kind ?? 'count', match[1], actual);
      checked += 1;
      if (!ok) failures.push(`claims: ${claim.id}: ${claim.file} states "${shown}", the repository says ${truth}`);
    } catch (error) {
      if (error instanceof NotAvailable) notChecked.push({ id: claim.id, reason: error.message });
      else failures.push(`claims: ${claim.id}: could not compute: ${error.message.split('\n')[0]}`);
    }
  }
  return { checked, notChecked, failures, total: CLAIMS.length };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const r = await runClaimsCheck();
  for (const n of r.notChecked) console.log(`NOT CHECKED ${n.id}: ${n.reason}`);
  for (const f of r.failures) console.error(f);
  console.log(`Claims: ${r.checked} checked, ${r.failures.length} failure(s).`);
  process.exit(r.failures.length > 0 ? 1 : 0);
}
