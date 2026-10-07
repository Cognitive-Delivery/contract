/**
 * The type generator's own tests: a schema built to break out of the generated file is rendered,
 * and what would have been written is read back as code. Run by `npm test`.
 *
 * The generator writes TypeScript into the repository that embeds the contract, and that
 * repository compiles it into its product. An internal security review showed a description
 * carrying the block-comment terminator closing its doc comment, so the rest of the description
 * became a top-level statement in the consumer's `src/generated/contractTypes.ts`, and an enum
 * value carrying a quote could do the same through a string literal. `npm test` stayed
 * Conformant throughout, because nothing here ever looked at what the generator emits.
 *
 * The generator is at the repository root and is not in the published package (`files` in
 * package.json), so it is loaded here, not at module top, the same way the additive guard is:
 * absent, the run says so rather than passing a generator it never saw.
 */

/** The payload the review used, verbatim. */
export const PAYLOAD = '*/ export const __contractProbe = (globalThis.__INJECTED = "x"); /** end';

async function loadGenerator() {
  try {
    return await import('../generate-contract-types.mjs');
  } catch (error) {
    if (error && error.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw error;
  }
}

/**
 * The source with every comment removed and every string literal emptied: what a TypeScript
 * compiler would treat as code. A deliberately small scanner, enough for the generator's output
 * (no regular-expression literals, no template literals with substitutions); a construct it does
 * not expect is reported rather than guessed at.
 */
export function codeOf(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end === -1) throw new Error(`unterminated block comment at ${i}`);
      out += ' ';
      i = end + 2;
    } else if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      i = end === -1 ? source.length : end;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== c) {
        if (source[j] === '\n') throw new Error(`newline inside a string literal at ${j}`);
        j += source[j] === '\\' ? 2 : 1;
      }
      if (j >= source.length) throw new Error(`unterminated string literal at ${i}`);
      out += `${c}${c}`;
      i = j + 1;
    } else if (c === '`') {
      throw new Error(`template literal at ${i}: the generator never emits one`);
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** The decoded value of every double-quoted string literal in the source, in order. */
function stringLiterals(source) {
  const values = [];
  const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const match of code.matchAll(/"(?:[^"\\\n]|\\.)*"/g)) values.push(JSON.parse(match[0]));
  return values;
}

export async function runGeneratorTests() {
  const generator = await loadGenerator();
  if (generator === null) return { present: false, count: 0, failures: [] };
  const { renderContractTypes } = generator;
  const failures = [];
  let count = 0;
  const check = (name, ok, detail = '') => {
    count += 1;
    if (!ok) failures.push(`generator/${name}${detail ? `: ${detail}` : ''}`);
  };
  const refuses = (name, fn) => {
    let threw = false;
    try { fn(); } catch { threw = true; }
    check(name, threw, 'expected a refusal, got output');
  };

  // 1. Descriptions at all three emission sites (schema, definition, property), and enum values
  //    carrying every character that could end or escape a literal.
  const hostileEnum = ["a'b", 'c"d', '*/ x', 'back\\slash', 'line\nbreak', 'ls ps ', '${x}'];
  const hostile = {
    'probe.schema.json': {
      description: `root ${PAYLOAD}`,
      type: 'object',
      definitions: {
        token: { description: PAYLOAD, type: 'string', enum: hostileEnum },
      },
      properties: {
        p: { description: `${PAYLOAD}\r\n*/ more   */`, type: 'string' },
        q: { $ref: '#/definitions/token' },
      },
    },
  };
  let output = '';
  try {
    output = renderContractTypes(hostile, '1.0.0', { 'probe.schema.json': 'Probe' });
  } catch (error) {
    check('hostile-schema-renders', false, error.message);
  }
  if (output) {
    let code = null;
    try {
      code = codeOf(output);
    } catch (error) {
      check('output-scans', false, error.message);
    }
    if (code !== null) {
      check('no-injected-statement', !/__contractProbe|__INJECTED|globalThis/.test(code),
        'schema text reached the generated file as code');
      // Exactly what the generator means to write and nothing else: the version constant and two
      // type aliases (the definition and the schema), built from these words alone, with no call,
      // assignment or block a statement would need.
      const allowed = new Set(['export', 'type', 'const', 'as', 'readonly', 'string', 'Probe', 'ProbeToken', 'CONTRACT_SCHEMA_VERSION']);
      const strays = [...new Set(code.match(/[A-Za-z_$][\w$]*/g) ?? [])].filter((w) => !allowed.has(w));
      const exports = (code.match(/\bexport\b/g) ?? []).length;
      check('only-generated-statements', strays.length === 0 && exports === 3 && !/[()]/.test(code),
        `${exports} export(s), unexpected words: ${JSON.stringify(strays.slice(0, 5))}`);
    }
    // Every enum value comes back from the output exactly as the schema stated it.
    const literals = stringLiterals(output);
    const missing = hostileEnum.filter((v) => !literals.includes(v));
    check('enum-values-round-trip', missing.length === 0, `not recovered: ${JSON.stringify(missing)}`);
    // A doc comment is one line: no CR, LF, U+2028 or U+2029 survives inside one.
    const comments = output.match(/\/\*\*[^\n]*?\*\//g) ?? [];
    check('doc-comments-one-line', comments.filter((c) => c.includes('__contractProbe')).length === 3,
      `found ${comments.length} single-line comments carrying the payload text`);
  }

  // 2. Names: only identifier characters reach a type name, and only local refs are followed.
  const named = (definitions, extra = {}) => ({ 'n.schema.json': { type: 'object', definitions, ...extra } });
  refuses('definition-key-not-identifier', () => renderContractTypes(named({ 'x; alert(1)': { type: 'string' } }), '1.0.0', { 'n.schema.json': 'N' }));
  refuses('ref-outside-definitions', () => renderContractTypes(named({}, { properties: { a: { $ref: 'https://example.invalid/x.json' } } }), '1.0.0', { 'n.schema.json': 'N' }));
  refuses('type-name-not-identifier', () => renderContractTypes(named({}), '1.0.0', { 'n.schema.json': 'N = 1; X' }));
  refuses('version-not-semver', () => renderContractTypes(named({}), "1.0.0'; x()", { 'n.schema.json': 'N' }));
  refuses('enum-object-value', () => renderContractTypes(named({ e: { enum: [{}] } }), '1.0.0', { 'n.schema.json': 'N' }));

  return { present: true, count, failures };
}
