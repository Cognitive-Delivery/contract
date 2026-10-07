# Contributing

The quickest way to understand what this repository will and will not accept is to read the
compatibility section of the [README](README.md). Everything below follows from it.

## Running the checks

```
npm ci
npm test                 # the conformance corpus against the reference adapter
npm run check:additive   # the lock is current, and this change is additive
```

`npm test` is `conformance/run.mjs`, and it checks more than the corpus. The runner
(`conformance/runner.mjs`): every valid fixture accepted; every invalid fixture rejected with a
written reason and, when the adapter reports its errors, at the instance path its `.expect.json`
names; a valid config's `sealed` paths each naming a field the fixture carries; a round trip that
must not lose an unknown field at the top level or inside a nested object; the canonical-bytes
vectors of [SPEC-agent-lease-manifest.md](SPEC-agent-lease-manifest.md) §7 and RFC 8785's own; the
narrowing vectors (shape for every adapter, behaviour when `narrow` is supplied); the signature
vectors when `hash` and `verify` are supplied; and the lease rules L1 to L3 when `rules` is
supplied. A half the adapter does not offer is reported as not checked, never as passed. Then the
schema checks (`conformance/schema-checks.mjs`): every schema compiles under Ajv strict mode, every
inlined copy is byte-for-byte its source dereferenced, every schema validates against
`conformance/metaschema.json`, `schemas/index.json` is valid and current, and
`cdfContract.schemaSetVersion` matches the package version. Then the guard's own scenarios
(`conformance/guard-tests.mjs`), the README's Layout block (`conformance/layout-check.mjs`), the
site (`conformance/site-check.mjs`: built twice into temporary directories from this tree; every
link and anchor resolves, every schema and document has a page, the `$id` bytes are untouched, no
page carries a script or reaches another host, and the two builds are byte-identical), the
SPEC traceability map (`conformance/traceability-check.mjs`), the currency of the exported suite
(`conformance/suite/`), and the version statement: `package.json` (twice), the README, the
CHANGELOG (a section with a body and a link definition), `schemas.lock.json`, every `$id` and the
SPEC header agree, and nothing still names the old `$id` host. The version check was added
because the lock silently kept the previous version through a release. Last, the claims check
(`conformance/claims-check.mjs`): every count and list the documents state (the corpus in numbers
in the README, the schemas that carry `schema_version`, the vector counts in the SPEC, the guard's
counts between two release tags, the tagged commits in `docs/decisions.md`) is recomputed from the
repository and compared. A statement you add with a number in it gets a claim beside it, with the
file, a pattern capturing the value and a function computing it; a number you edit is checked on
the next run; and a statement you remove fails the run until its claim goes too.
`node conformance/claims-check.mjs` lists the claims that are NOT CHECKED and why, and the file's
`EXCLUDED` list names the stated numbers it deliberately leaves alone.

`npm run check:additive -- --baseline-ref origin/main` compares the schema set against the shape
it had at that ref, digesting the baseline's schemas with the current generator; in CI the baseline
is the branch you are merging into, or the pushed-from commit. It reports named findings in the style of
`buf breaking`: `FIELD_REMOVED`, `FIELD_NOW_REQUIRED`, `TYPE_CHANGED`, `ENUM_NARROWED`, `STABILITY_LOWERED`, `CONDITIONAL_REQUIRED_ADDED`,
`PATTERN_TIGHTENED`, `BOUND_TIGHTENED`, `CONTENT_MODEL_CLOSED`, `UNION_CHANGED` and
`SCHEMA_REMOVED`. Since lock format 4 a local `$ref` is digested at the path that refers to it, so re-pointing a property to a stricter definition is a visible change rather than a changed string the guard ignores. `PATTERN_TIGHTENED`, `BOUND_TIGHTENED`, `CONTENT_MODEL_CLOSED` and `UNION_CHANGED` need a baseline
in lock format 2 or later (`lockFormat` in `schemas.lock.json`), and against an older one are
reported as not comparable rather than passed quietly; a union's branch types and patterns are
compared from format 3; `STABILITY_LOWERED` and `CONDITIONAL_REQUIRED_ADDED` need format 5 and are
not compared against an older baseline; and a re-pointed `$ref` is visible only against a format
4 or later baseline. A `--baseline-ref` baseline is always digested with the current generator,
so an older format arises only with an explicit `--baseline` lock file. Note what the check does **not** do: it compares schema shapes only, and will
report "Lock is current" on a lock whose version field is stale. That check lives in `npm test`,
as do the guard's own scenario tests (`conformance/guard-tests.mjs`): every finding is seen to
fire and every additive change seen to pass, because a guard nobody has watched fail is a
sentence in a README.

## Before you start

Sign off every commit (`git commit -s`): the `DCO` check refuses a pull request with a commit that
has no `Signed-off-by` trailer, and it is the Developer Certificate of Origin, not a copyright
assignment. A **semantic change** — a new schema, a field whose meaning is not obvious from its
name, a narrowing rule or refusal code, a reserved vocabulary, a change to what the corpus checks —
starts as a one-page proposal on [docs/proposals/TEMPLATE.md](docs/proposals/TEMPLATE.md), with its
Backward compatibility and Security sections answered; [GOVERNANCE.md](GOVERNANCE.md) says who
decides and how. A fixture, a tightening with its evidence, a description or a tooling fix needs no
proposal. The pull-request template lists what the checks cannot see.

## Changing the SPEC

Every normative clause of `SPEC-agent-lease-manifest.md` is mapped in `conformance/traceability.json`.
Adding a clause (a sentence with a bold **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** or
**MAY**) fails `npm test` until you add its entry: run `node conformance/traceability-check.mjs` to
see the id and key it was given, then map it to the fixture, vector, check or rule that tests it,
or exclude it with a reason. Editing a clause changes its key and fails the same way: re-affirm the
entry by updating its `key`. Inserting a clause earlier in a section renumbers the ones after it,
which the check reports as stale entries plus unmapped clauses; add new clauses at the end of a
section where you can.

## Stability and deprecation

Every declared property carries a `$comment` beginning `stability: stable` or
`stability: development` (`conformance/metaschema.json` refuses one without it, and `npm test` runs
that check). `stable` is a promise under the additive rule. `development` says the field may change
within the major, and the guard lets it: a `development` field may be tightened or removed without
an allow-list entry, which is the point of marking it. Lowering a field from `stable` to
`development` is `STABILITY_LOWERED`, breaking, because it withdraws a promise. To retire a field,
append `; deprecated: <what to use instead>` to its comment, which is additive, and keep the field
until the next major: `FIELD_REMOVED` names a deprecated field as still a field. The marker is a
draft-07 `$comment` rather than a custom keyword because Bowtie showed a strict validator elsewhere
refusing one, and a schema only this repository can compile is not portable. Lock format 5 records
`stability`, `deprecated` and `conditionalRequired` (the names an `allOf` `if`/`then` makes
required; adding one is `CONDITIONAL_REQUIRED_ADDED`).

## Tightening a schema within 1.x

Sometimes a schema must refuse what it used to accept: a hash field that was always meant to be
SHA-256 gains a pattern, or a path rule gains a form it should never have allowed. The guard
reports each of these as breaking, and it is right to. The way through is
`compat-allowlist.json`: one entry per finding, naming `finding`, `schema`, `path`, `after` (the
exact value admitted, as the guard prints it: `pattern=^[0-9a-f]{64}$`, `maximum=16`,
`enum=[...]`), a `reason`, a `date`, and an `evidence` file (normally the invalid fixture that
proves the refused form, or a recorded check of real artefacts under `fixtures/evidence/` showing no
conformant writer ever produced it). `after` is what stops an entry outliving its tightening: the
same finding at the same path with a different value is a new tightening and needs its own entry,
so the entry that admitted a `maximum` of 2^53 does not quietly admit lowering it to 16. The guard
refuses an entry whose evidence file does not exist, and refuses a change that drops an entry the
baseline had: the list is history, never configuration. An entry is a claim that no reader in a customer's
repository loses a record it depends on, and it is reviewed like a schema change.

An entry's `path` may name a definition rather than a property. Since lock format 4 a constraint
reached through a local `$ref` is recorded with `via`, the place it lives in the definition
(`#allow.read_paths[]` for `allow.read_paths[]`, as `schemas.lock.json` records it), and the guard
accepts an entry whose `path` is either the property path or that `via`, in the same `schema`. So
one entry at a definition's path covers every property in that schema that refers to it, which
is why, at v1.2.0, 58 of the allow-list's 110 entries covered the 115 tightenings the guard reports
between v1.1.0 and v1.2.0 (the other 52 entries are 1.1.0's own). It does not reach
across files: the copies inlined in `agent-lease` and `lease-record` are separate schemas and
carry their own entries.

## Changing the specification

`SPEC-agent-lease-manifest.md` is normative, in RFC 2119 language, and the schemas are not free
to disagree with it. If a change makes the two say different things, one of them is wrong and
the pull request has to say which.

Section 7 — canonical bytes — does not change within a major version. Every hash in this
contract is taken over those bytes, so a change there silently invalidates every signature anyone
has ever produced. Since 1.1 the section says canonical bytes are RFC 8785 after
undefined-removal, and the corpus carries RFC 8785's own vectors (`conformance/jcs/`, vendored at
a pinned commit with its licence and source recorded) beside the contract's nine; a pull request
that touches §7, `canonical-vectors.json` or `jcs/` is a 2.0 pull request, whatever else it says.

## Changing a schema

1. Change the schema.
2. Add or update fixtures. A new optional field belongs in the `populated` fixture for that
   shape, not the `minimal` one.
3. Run `npm run lock` and commit `schemas.lock.json`. The lock is the record of the shape
   before the next change; a schema change without it leaves nothing to compare against.
   If `npm run check:additive -- --baseline-ref origin/main` reports a finding, either loosen
   the change or add an allow-list entry with its evidence (see "Tightening a schema within 1.x").
4. Run the checks.

## What will be refused

**Anything that is not additive, within `1.x`.** A new required field, a removed field, a
narrowed type, a closed enum where there was none, or an enum that lost a value. Customers have
these files in their repositories and older readers are still reading them. These need `2.0.0`
and a documented migration.

**A new value in `cdi-signal.event_type`, or a change to the six CDI dimension ids, as an
ordinary change.** The Index is computed from that vocabulary, so adding to it changes what the
Index measures. That is a contract change and is governed by ADR-013.

**A reader that throws on something it does not recognise.** `phase` is an open string, unknown
source forms are reported rather than rejected, and unknown fields survive a round trip.

**A fixture under `invalid/` with no `.reason` file and no `.expect.json` beside it.** "This should
fail" with no reason is untestable folklore, and "this should fail" with no place is a rejection
that can happen for the wrong reason and pass; the runner fails the build for either. The
`.expect.json` is `{ "path": "/where", "keyword": "why" }`: `path` must match an error the
implementation reports, `keyword` is informative.

**A signed fixture that does not verify under `conformance/test-key.txt`.** Re-sign it with the
test key; never commit a lease signed with a real key, and never commit a real key.

**Anything that widens what may reach a permanent record.** See [SECURITY.md](SECURITY.md).

## Reporting a problem

Open an issue with the *Defect* template (what is wrong, what the contract says, which half is
wrong) or the *Proposal* template for a change. For a security problem, follow
[SECURITY.md](SECURITY.md) instead; the issue form links to the private advisory.
