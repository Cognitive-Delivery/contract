# Contributing

The quickest way to understand what this repository will and will not accept is to read the
compatibility section of the [README](README.md). Everything below follows from it.

## Running the checks

```
npm ci
npm test                 # the conformance corpus against the reference adapter
npm run check:additive   # the lock is current, and this change is additive
```

`npm test` runs four things: every valid fixture, every rejection and its written reason, a
round trip that must not lose an unknown field, and the canonical-bytes vectors of
[SPEC-agent-lease-manifest.md](SPEC-agent-lease-manifest.md) §7. It also checks that the version
in `package.json` matches the one stated in the README, the CHANGELOG and `schemas.lock.json` —
added because the lock silently kept the previous version through a release.

`npm run check:additive -- --baseline-ref origin/main` compares the schema set against the shape
it had at that ref, digesting the baseline's schemas with the current generator; in CI the baseline
is the branch you are merging into, or the pushed-from commit. It reports named findings in the style of
`buf breaking`: `FIELD_REMOVED`, `FIELD_NOW_REQUIRED`, `TYPE_CHANGED`, `ENUM_NARROWED`, `STABILITY_LOWERED`, `CONDITIONAL_REQUIRED_ADDED`,
`PATTERN_TIGHTENED`, `BOUND_TIGHTENED`, `CONTENT_MODEL_CLOSED`, `UNION_CHANGED` and
`SCHEMA_REMOVED`. Since lock format 4 a local `$ref` is digested at the path that refers to it, so re-pointing a property to a stricter definition is a visible change rather than a changed string the guard ignores. The last four findings need a baseline in lock format 2 (`lockFormat` in
`schemas.lock.json`); against an older baseline they are reported as not comparable rather than
passed quietly. Note what the check does **not** do: it compares schema shapes only, and will
report "Lock is current" on a lock whose version field is stale. That check lives in `npm test`,
as do the guard's own scenario tests (`conformance/guard-tests.mjs`): every finding is seen to
fire and every additive change seen to pass, because a guard nobody has watched fail is a
sentence in a README.

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

Open an issue. For a security problem, follow [SECURITY.md](SECURITY.md) instead.
