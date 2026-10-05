/**
 * The normative clauses of SPEC-agent-lease-manifest.md, extracted deterministically so each can
 * be traced to the fixture, vector, check or rule that tests it (`traceability.json`).
 *
 * A clause is one sentence, table row or list item inside a numbered section that carries a bold
 * RFC 2119 key word (**MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY**). Its id is
 * `<section>-<ordinal>` in document order, and its `key` is the first sixty characters of the
 * normalised text: the traceability map stores the key beside the id, so that editing a clause
 * (which may change what it demands) fails the check until the mapping is re-affirmed, while
 * adding a clause lower in a section leaves the earlier ids intact.
 *
 * Deliberately simple: paragraphs are joined, sentences split on `.`, `!` or `?` followed by
 * whitespace and a capital or backtick, table rows and list items are one clause each. It is a
 * floor, and it says so: a clause written without a bold key word is not a clause here.
 */

const KEY_WORD = /\*\*(MUST NOT|MUST|SHOULD NOT|SHOULD|MAY|REQUIRED|SHALL NOT|SHALL|RECOMMENDED|OPTIONAL)\*\*/;

function normalise(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/** `[{ id, section, key, text }]` in document order. */
export function extractClauses(spec) {
  const clauses = [];
  const counts = new Map();
  let section = null;
  let paragraph = [];
  let inFence = false;

  const emit = (text) => {
    const clean = normalise(text);
    if (!section || !KEY_WORD.test(clean)) return;
    const ordinal = (counts.get(section) ?? 0) + 1;
    counts.set(section, ordinal);
    clauses.push({ id: `${section}-${ordinal}`, section, key: clean.slice(0, 60), text: clean });
  };
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const joined = normalise(paragraph.join(' '));
    paragraph = [];
    // Sentences: a terminator followed by a space and a capital letter, a backtick, a digit or a quote.
    for (const sentence of joined.split(/(?<=[.!?])\s+(?=[A-Z`"'(\d*])/)) emit(sentence);
  };

  for (const raw of spec.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('```')) { flushParagraph(); inFence = !inFence; continue; }
    if (inFence) continue;
    const heading = /^#{2,3} (\d+(?:\.\d+)?)\.? /.exec(line);
    if (heading) { flushParagraph(); section = heading[1]; continue; }
    if (/^#/.test(line)) { flushParagraph(); section = null; continue; }
    if (line.trim() === '') { flushParagraph(); continue; }
    if (line.startsWith('|')) { flushParagraph(); if (!/^\|[\s-|]+\|$/.test(line.trim())) emit(line); continue; }
    if (/^\s*(\d+\.|-|\*)\s/.test(line)) { flushParagraph(); paragraph.push(line.replace(/^\s*(\d+\.|-|\*)\s/, '')); continue; }
    paragraph.push(line);
  }
  flushParagraph();
  return clauses;
}
