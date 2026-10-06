# The Cognitive Delivery governance contract

The artefact shapes any Cognitive Delivery implementation must read and write identically, plus
a conformance corpus that proves it does.

Version **1.2.1**, versioned independently of any product that implements it.

## Why this exists

Two products will read and write `.cdf/` artefacts in the same customer repository, and both
contribute to one Cognitive Delivery Index. If they record governance differently, the Index
stops being an index and becomes two unrelated numbers.

A TypeScript interface is a definition only while every consumer is the same codebase. This is
the definition when they are not.

**The corpus is the portable artefact. The runner is a reference implementation.** A product
written in another language reuses `fixtures/` unchanged and writes its own runner.

## What is in the contract

| Schema | Covers |
|---|---|
| `provenance` | What produced a governed artefact |
| `audit-event` | One line of the append-only governance journal |
| `cdi-signal` | One line of the Index signal log |
| `cdi-assessment` | A recorded human assessment against the six dimensions |
| `config-core` | The part of `.cdf/config.yaml` every implementation must understand |
| `agent-lease-manifest` | What an agent declares it needs before the harness lets it run. Specified normatively in [SPEC-agent-lease-manifest.md](SPEC-agent-lease-manifest.md); since 1.2 hosts, commands, tools and approvals each have one identity rule (§4.4), so two implementations cannot disagree about what an entry names |
| `agent-lease` | The signed grant the kernel answers with; the only key that opens anything |
| `lease-record` | One line of the lease journal: the decision about a lease (granted, refused with reserved reason codes, narrowed, attached, revoked by an ancestor or the issuer, stopped, completed, expired), with the declared and granted hashes as the two identities of the decision. Since 1.2 |
| `plugin-manifest` | A plugin's `plugin.json`: the keys the Claude Code manifest reference documents, as of 2026-10-05, plus two CDF extensions (`cdf`, plugin-level `category`) |
| `plugin-marketplace` | A marketplace's `marketplace.json`: the keys and seven source forms the Claude Code marketplace reference documents, as of 2026-10-05, plus two CDF extensions (`local`, per-entry `cdf`) |

## What is deliberately not in it

- **Lifecycle phases.** `phase` is an **open string** everywhere it appears. The phase
  vocabulary belongs to the domain: software delivery has requirements, design, tasks and
  implementation, and another domain will not. A reader must tolerate an unrecognised phase —
  not throw, not coerce it to a known value, not drop it.
- **Product-specific config.** Deployment assurance, security centre and template settings are
  one product's business. `additionalProperties` is `true` at the config root so a product
  carries its own sections without failing the shared contract.
- **Implementation.** This is data and generated types. There is no logic here and no
  dependency on any product.

## What the plugin schemas model, and what they add

`plugin-manifest` and `plugin-marketplace` model the fields the Claude Code
[manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference) and
[marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference) document,
**as read on 2026-10-05**, with the same meaning, and pass unknown keys through as Claude Code does
(it strips an unknown top-level key with a warning). Where Claude Code's object is strict
(`userConfig` options, `channels` entries, `lspServers` configs, monitors) the contract's is too,
because honouring a key with the same meaning there means refusing an unknown one. The evidence is
in the corpus: the manifest reference's own example manifest and Anthropic's marketplace for its
bundled plugins both validate as fixtures.

Since 1.2 the inline forms are typed, not merely allowed: an inline `hooks` object is the event
map (the thirty-three events the hooks reference lists, five handler types with their required
fields) and an inline `mcpServers` object is a map of server configs (`stdio` needs `command`, a
remote type needs `url`). Three things are refused on sight because a plugin manifest ships to
everyone who installs it: a credential-shaped value in a hook header, an MCP `env` or an MCP
`headers` (seven shapes, the same the evidence sanitiser refuses; `${VAR}` interpolation and
`headersHelper` are the routes), an `authorization` key in a marketplace entry's `headers`, and a
contributed provider at plain `http://` anywhere but loopback. Anthropic's bundled-plugin manifest
still validates unchanged.

This is a dated statement, not a standing guarantee. The references change; a key added after that
date validates here (the content model is open) but is not yet modelled, and the date in the schema
descriptions says how current the modelling is. An earlier README promised more than a schema can
keep about a moving target: that every key Claude Code would ever define was already here. That
wording stopped being true as Claude Code grew, and it is now a banned claim in the reference
implementation's documentation gate.

**The contract has, Claude Code lacks.** Two extensions, both named here so no one mistakes them
for Claude Code's:

- **`cdf`** on a manifest and on a marketplace entry: what the harness alone understands
  (contributions, capabilities, attestation, a declared digest).
- **`local`** as a marketplace source form, for a marketplace that lists plugins already on disk.
  Claude Code's only local form is the relative-path string; CDF's first-party marketplace ships
  its plugins inside the repository and needs a form with nothing to fetch and nothing to pin.
- **`category`** on a manifest. Claude Code documents `category` on a marketplace entry only and
  strips it from `plugin.json` with a warning; CDF's plugin decision records key on it.

Two consequences of following Claude Code's rules are deliberate:

- **All seven Claude Code source forms are declared, including three the harness cannot fetch.**
  `npm`, `archive` and `command` validate and are *reported* as an unsupported source form. A
  reader that threw on them would refuse an entire marketplace over one entry nobody asked to
  install.
- **`name` is the only required key in a manifest.** That is Claude Code's rule, and adopting it
  is what lets a Claude Code plugin validate here.

## Two closed vocabularies, and why

Almost everything here is open. Two things are not:

- **`cdi-signal.event_type`** is a closed enum of 127 values. The Index is computed from this
  vocabulary, so a product adding a value changes what the Index measures. That should be a
  contract change, and this makes it one. Governed by ADR-013.
- **The six CDI dimension ids.** They are the instrument.

By contrast `audit-event.event_type` is **open**: the journal records what happened, and a
product may record its own kinds of event without changing what anything measures.

## Sealing is part of the contract

`config-core.sealed` lists fields an upper layer has fixed. An implementation that ignores it
fails conformance. A lower layer may match a sealed value or make it stricter, never looser.
Ignoring this would let a workspace quietly undo a control its organisation set.

## Compatibility, within 1.x

**Additive only.** New optional fields are allowed.

Renaming a field, removing a field, narrowing a type, or changing the meaning of an existing
field requires **2.0.0** and a documented migration. Customers have these files in their
repositories and older readers will still be reading them.

This is not a promise in a README. `schemas.lock.json` holds a normalised digest of required
fields and property types, and a check fails the build when the rule is broken without a major
version change.

The comparison is against the shape *before* the change, not against the lock sitting beside the
schemas: a lock regenerated in the same commit agrees with whatever broke it. On a pull request
the baseline is the branch being merged into; on a push it is the previous commit.

Every artefact carries `schema_version`, and the schemas require it: a conformant writer always
writes it. A reader meeting a pre-contract artefact without it may read it as `1.0`; it must not
emit one.

Since 1.2 every declared property says which promise it is under: a `$comment` of
`stability: stable` (held to the additive rule) or `stability: development` (may change within the
major, and says so; `allow.tool_args` and the plugin schemas' `capabilities.tool_args` are the only
such fields today). Lowering a field from stable to
development is a breaking change the guard reports; retiring a field is `; deprecated: <replacement>`
on its comment, which is additive, and the field stays until the next major.

## Installing

```
npm install @cognitive-delivery/contract
```

Releases are published from CI through npm trusted publishing, so each one carries a provenance
attestation linking the package on the registry to the commit and the workflow that built it.
A contract that asks other people to record what produced an artefact should be able to show
what produced its own. The same workflow creates a GitHub Release for the tag, with that
version's CHANGELOG section as its notes, the tarball attached, and the provenance links; and a
daily workflow fetches every schema's `$id` and fails when one does not serve the bytes on
`main`, because an identifier that stops resolving is a defect nobody reports.

You can also use it straight from this repository, as a submodule or a clone pinned to a tag.
`schemas/` and `fixtures/` are plain files and an implementation in another language needs
nothing else. Each schema is also served at its `$id`
(`https://cognitive-delivery.github.io/contract/1.x/<file>`), so a validator that resolves
identifiers finds the current 1.x schema there; the version a document was written against is its
own `schema_version` field.
Each release is also served frozen at `https://cognitive-delivery.github.io/contract/<version>/`
(`/1.1.0/`, `/1.2.0/`, `/1.2.1/`, …), byte for byte as tagged and never rewritten, so a reader that pinned a
version can fetch exactly what it shipped; and `schemas/index.json`, served beside both, lists every
schema with its `$id`, title, dialect and the file patterns it describes (`**/.cdf/config.yaml` for
`config-core`, the `.claude-plugin/` files for the plugin schemas), which is what a registry such as
SchemaStore reads.

## A worked example

A child agent asks for less than its parent holds, and gets less again than it asked for.

The **parent** lease grants a broad scope:

```json
{ "allow": { "tools": ["cdf_read_steering", "cdf_write_artefact"],
             "read_paths": ["**"], "write_paths": ["src/**"],
             "hosts": ["*.anthropic.com"], "commands": [] },
  "deny":  { "commands": ["sudo"], "paths": [".cdf/runtime/**"], "hosts": [] },
  "budget": { "tokens": 200000, "depth": 2, "fan_out": 4 } }
```

A **worker declares** what it wants — note it asks for one tool the parent does not hold, a host the
parent does not allow, and more tokens than remain:

```json
{ "schema_version": "1.0",
  "agent":  { "name": "implementer", "kind": "delegated-cli", "runtime_agent": "claude-code" },
  "intent": { "purpose": "Implement task 1.1 within its file scope.", "spec_slug": "phase-9", "task_id": "1.1" },
  "allow":  { "tools": ["cdf_write_artefact", "cdf_break_glass_advance"],
              "read_paths": ["src/**"], "write_paths": ["src/projects/**"],
              "hosts": ["api.anthropic.com", "example.com"], "commands": [] },
  "deny":   { "commands": [], "paths": [], "hosts": [] },
  "budget": { "tokens": 500000 },
  "approvals": [] }
```

The issuer **grants**:

```json
{ "allow": { "tools": ["cdf_write_artefact"],
             "read_paths": ["src/**"], "write_paths": ["src/projects/**"],
             "hosts": ["api.anthropic.com"], "commands": [] },
  "deny":  { "commands": ["sudo"], "paths": [".cdf/runtime/**"], "hosts": [] },
  "budget": { "tokens": 200000, "depth": 1, "fan_out": 4 } }
```

Reading the difference:

- `cdf_break_glass_advance` is **gone** — tools intersect by exact name, and the parent never held it.
- `example.com` is **gone** — the parent's `*.anthropic.com` does not contain it.
- `api.anthropic.com` **survives** — the parent's wildcard contains it.
- `src/projects/**` **survives** — the parent's `src/**` contains it, so containment keeps a genuine
  narrowing rather than dropping it as an exact-match miss would.
- `tokens` is **clamped** to what the parent had left, not what the child asked for.
- `depth` is **decremented**: this worker may issue one further generation, not two.
- The parent's `deny` entries are **inherited** although the child declared none. A child cannot shed
  a refusal.

Nothing about the child's identity opens anything. The lease id does.

The full rules, including the six conditions that require a refusal, are in
[SPEC-agent-lease-manifest.md](SPEC-agent-lease-manifest.md).

## Running the checks

```
npm ci
npm test                 # the corpus (valid, invalid at the named path, round trip), the canonical,
                         # narrowing and signature vectors, the lease rules, the guard's own scenarios,
                         # the schema and meta-schema checks, the Layout block, traceability, suite and
                         # index currency and the version statement, against the reference adapter
npm run check:additive   # the lock is current, and this change is additive
```

Both run in CI on every push and pull request, against Node 20 and 22, beside a job that compiles
every pattern under RE2. The point of a corpus is that a third party can check the claim, so the
check has to be runnable by someone who has never seen the product.

Since 1.2 the claim that "a reader in any language needs nothing else" is checked rather than
made. `conformance/suite/draft7/` carries the corpus in the official
[JSON-Schema-Test-Suite](https://github.com/json-schema-org/JSON-Schema-Test-Suite) format (one
file per schema, every fixture a test; `npm test` fails when it is stale), and CI runs it through
[Bowtie](https://bowtie.report) against six validators in six languages — `go-jsonschema`,
`rust-jsonschema`, `python-jsonschema`, `java-json-schema`, `dotnet-jsonschema-net` and `js-ajv` —
failing on any disagreement. A second job runs Sourcemeta's `jsonschema metaschema` and `lint`
over the schemas, with six style rules excluded by name and for a reason each in the workflow.
The latest result is the `contract` workflow's run on `main`:
<https://github.com/Cognitive-Delivery/contract/actions/workflows/contract.yml>.

The same `npm test` runs from the **installed package**, not only from a clone: CI packs the
tarball, installs it into an empty directory with `ajv`, and runs the installed package's own test.
The 1.1.0 release candidate (`main` at e91afb0, before the tag) could not, because two files it
imported were not in `files`, and no check in the clone could see that; the fix landed before
v1.1.0 was tagged, so the published 1.1.0 tarball runs its own test. Every file under
`conformance/` and `schemas.lock.json` are importable
through `exports`, so `@cognitive-delivery/contract/conformance/narrowing-vectors.json` resolves.
From the tarball the additive guard's scenarios are reported as not present rather than passed,
because the guard ships with the repository.

### Signature vectors and rejection places

`conformance/signature-vectors.json` names lease fixtures signed with the published **test key**
(`conformance/test-key.txt`) and the declarations they were issued from. Supply `hash(value)` and
`verify(lease, keyHex)` on your adapter and the runner checks that your `declared_hash` matches,
that the fixtures verify, and that they stop verifying when a byte of the signature or of the
granted manifest changes. The key is public on purpose; a verifier must refuse it outside a
conformance run. Every invalid fixture also carries an `.expect.json` naming the instance path its
rejection must be reported at, and the runner checks it when your adapter reports its errors
(`lastErrors`, Ajv's shape): rejecting a fixture for the wrong reason is not conformance.

### Every clause has a test

`conformance/traceability.json` maps every normative clause of the SPEC (every sentence, table row
or list item carrying a bold RFC 2119 key word, extracted by `conformance/spec-clauses.mjs` with an
id like `4.4-3`) to the fixtures, narrowing vectors, runner checks or lease rules that test it, or
excludes it with a reason (runtime behaviour, a SHOULD, a definition). `npm test` fails on a clause
with no entry, an entry for a clause that no longer exists, a mapping that names nothing, and, since
each entry carries the clause's first sixty characters, on a clause whose wording changed until the
mapping is re-affirmed. It is a floor, and it says so: it proves every clause has a named test, not
that the test is good. The practice is the Model Context Protocol's requirement-to-test traceability
for its enhancement proposals, applied to a schema contract.

### Lease rules

Draft-07 cannot compare one field with another, so "`expires_at` is after `issued_at`" (L1) and
"not its own parent" (L2) are rules of SPEC §6 rather than patterns, and "a `revoked` record's
`by` names the issuer or an ancestor lease" (L3, SPEC §6.1) needs the journal, which no schema
holds. `fixtures/invalid-by-rule/` holds leases and records the schema accepts and a rule refuses,
each with an `.expect.json` naming the rule and the path; the L3 fixture's also carries
`context.chain`, the ancestors of the revoked lease. Supply `rules(lease, context)` on your adapter
(returning `[{ rule, path }]`) and the runner checks every valid lease and record passes and every
by-rule fixture fails at the named rule, handing L3 its chain as `context.chainOf(leaseId)`; a rule
that needs the journal applies only when the chain is supplied. Omit `rules` and the run says
**rules NOT CHECKED** while still confirming the fixtures are schema-valid. The reference rules are
`conformance/lease-rules.mjs`.

### Narrowing vectors

`conformance/narrowing-vectors.json` is the third half of conformance made executable: a declared
manifest and a parent grant, and either the granted manifest narrowing must produce or the refusal
codes (R1 to R6 of SPEC §5.2) it must return. Supply `narrow(declared, parent)` on your adapter and
the runner compares granted manifests by canonical bytes and refusal sets exactly; omit it and the
run says **behaviour NOT CHECKED** while still checking every vector's shape. The vectors were
generated from the reference implementation and committed, so a disagreement is a finding about one
of the two implementations, and either kind is wanted. The reference implementation's own report, with
the hooks it supplies and the run that produced it, is
[docs/conformance/cdf-harness.md](docs/conformance/cdf-harness.md).

### Canonical bytes

`npm test` also runs the canonicalisation vectors, and this is the part worth reading before
you write an implementation in another language.

Every hash in this contract — `declared_hash`, every signature, the ledger chain — is taken over
**canonical bytes**. Schema agreement is not interoperability: two implementations can accept and
reject exactly the same artefacts and still produce different bytes for the same declaration, and
therefore be unable to verify a single one of each other's signatures. Everything looks correct
right up until somebody else's hash arrives.

Canonical bytes are **RFC 8785 (JSON Canonicalization Scheme) after removing absent members**, so
an implementation in another language can use an existing JCS library — Go, Java, Python, Rust,
.NET and JavaScript all have one — rather than port the rules by hand. The corpus proves it either
way: `conformance/jcs/` carries RFC 8785's own six reference vectors, and
`conformance/canonical-vectors.json` nine more with their expected byte strings and SHA-256
digests, plus two values that must *fail* to serialise. Supply a `canonicalise(value)` on your
adapter and the runner checks all fifteen; omit it and the run reports **NOT CHECKED** rather than
passing quietly. The restated rules are section 7 of
[SPEC-agent-lease-manifest.md](SPEC-agent-lease-manifest.md) — the escape set is closed, keys sort
by UTF-16 code unit, and an absent member is omitted rather than nulled.

## Implementing the contract

[docs/implementing.md](docs/implementing.md) is the adapter interface in one place: each hook as the
runner calls it, what sits beside an invalid fixture, how a validator that is not the runner consumes
`conformance/suite/draft7/`, what every NOT CHECKED line means, and a worked example from the
installed package. [docs/upgrading-1.0-to-1.2.md](docs/upgrading-1.0-to-1.2.md) is for a reader or
writer built against 1.0: what the schemas now refuse, what a 1.2 writer owes, and what did not
change. [docs/conformance/](docs/conformance/) holds conformance reports, the reference
implementation's first.

## Privacy properties that must not be lost

These are not stylistic. Audit and Index evidence is append-only and retained indefinitely, so
anything that reaches it is effectively permanent.

- Prompts are **never** recorded. `prompt_hash`, `request_hash`, `steering_hash` and `content_hash`
  are SHA-256, and since 1.1 the schemas refuse anything that is not a 64-character lower-case hex
  digest, so a writer that skipped the hashing cannot produce a valid record.
- `workspace_id` is a hash of the git remote URL, or a per-checkout UUID when the workspace has no
  remote. Either way it is not a person identifier and not reversible to one; the schema accepts
  exactly those two shapes.
- The actor records a **kind** — human, agent or system — and the model. Never a name, email or
  git identity.
- `details` is sanitised before write, and the schema enforces the same rule: a key whose segment
  (split on non-alphanumerics and camelCase boundaries) is `authorization`, `content`, `file`,
  `password`, `path`, `payload`, `prompt`, `request`, `secret` or `token` is refused. Values are
  flat scalars. `summary` is capped at 300 characters and `reasoning` at 500. Renaming a sensitive
  field to evade the list defeats the control.

Since 1.2 the evidence schemas also hold the hygiene the reference writer already kept: an audit
`event_type` is lower-case dotted segments with the writer's first segments reserved and a vendor
name for anyone else; `summary` and `reasoning` carry no control character; a `details` value is at
most 200 characters; `schema_version` is `major.minor` everywhere and compared on the major; a
provenance `spec` is a slug; an assessment has exactly six integer-scored dimensions; a sealed config
path is well-formed and names a field the file carries. `actor.runtime` stays open, because the real
journal spells it eleven ways, and `actor.runtime_agent` carries the closed identity. Every one of
the reference deployment's records validates under these rules: 33,608 audit records, 19,231 signals,
995 provenance records and 2 assessments at the 5 October check (`fixtures/evidence/`), and 33,665,
19,287, 4,588 and 2 at the 1.2.1 pin on 6 October (`docs/conformance/cdf-harness.md`).

## The site

Everything above is also served as a site at <https://cognitive-delivery.github.io/contract/>, built by
`tooling/build-site.mjs` on every deploy from the files `npm test` checks, so a page cannot say what
the repository does not: the front page with three ways in (read a schema, implement the contract,
upgrade a writer); the schema reference, one page per schema walked from the schema files with every
property's description, constraints and stability; the SPEC, this README, GOVERNANCE, CONTRIBUTING,
SECURITY and the CHANGELOG as pages; the implementing guide, the upgrading note and the decision index;
the conformance page with the claim rule, the implementation reports and the recorded portability
results; the proposals; and the versions, each frozen copy linked to its release. The schema bytes at
every `$id` and under each `/<version>/` are laid out by the workflow and never touched by the
generator. No page carries a script or reaches another host. `conformance/site-check.mjs` builds the
site in `npm test` and fails on a broken link, a changed schema byte, a script tag or a non-deterministic
build; from the installed package, which carries no `tooling/`, it reports NOT CHECKED.

## Layout

Every entry at the top level and one level down in `conformance/`, `fixtures/` and `tooling/`
is named here, and `npm test` fails when one is added without a line or a line outlives its
file (`conformance/layout-check.mjs`).

```
schemas/                    the JSON Schemas, one file per shape, each self-contained
fixtures/                   the corpus
  valid/                    minimal and fully populated, per shape; every one must validate
  invalid/                  each beside a .reason saying why, and an .expect.json naming where
  invalid-by-rule/          schema-valid leases a SPEC §6 rule refuses; .expect.json names the rule
  SOURCES.md                where the vendor-format fixtures were transcribed from
  evidence/                 recorded checks of real artefacts that allow-list entries cite when no fixture can
conformance/                the reference runner and the vectors; takes an adapter, imports no product
  runner.mjs                the corpus, run against whatever adapter you pass it
  ajv-adapter.mjs           the reference adapter, so the corpus runs here and not only in a product
  run.mjs                   `npm test`
  ids.mjs                   where a schema's $id lives, stated once (the package ships this, not tooling/)
  schema-checks.mjs         strict compile, every inlined copy identical to its source, the version
  inlined-copies.mjs        where a schema carries a copy of another, stated once; the identity check and the inliner read it
  metaschema.json           the conventions every schema is held to: dialect, $id, title, no `format`, a stability $comment on every property
  layout-check.mjs          this block is current
  site-check.mjs            the site, built twice into temporary directories: links, anchors, every page present, $id bytes untouched, no script, the same bytes; reported not checked in the published package
  lease-rules.mjs           SPEC §6 rules L1 to L3, which a schema cannot state; the reference `rules` adapter
  spec-clauses.mjs          extracts every normative clause of the SPEC with a stable id and a drift key
  traceability.json         every clause mapped to the fixture, vector, check or rule that tests it, or excluded with a reason
  traceability-check.mjs    fails `npm test` on an unmapped, stale or edited clause, or a mapping that names nothing
  suite-export.mjs          builds the corpus in the official JSON-Schema-Test-Suite format, and says when the export is stale
  schema-index.mjs          builds schemas/index.json (file, $id, title, dialect, fileMatch) and says when it is stale
  suite/                    that export under `draft7/` (Bowtie reads the dialect from the directory name); what six other validators run
  changelog.mjs             one release's CHANGELOG section, which the GitHub Release's notes come from
  guard-tests.mjs           the additive guard's own scenarios; reported absent in the published package
  canonical-vectors.json    the canonical-bytes vectors of SPEC section 7, in pure ASCII
  jcs/                      RFC 8785's own reference vectors, vendored with their licence
  narrowing-vectors.json    declared and parent, with the grant or the refusal codes narrowing must produce
  signature-vectors.json    lease fixtures signed with the test key, and what must stop verifying
  test-key.txt              the published test key; signs fixtures and nothing else (SECURITY.md)
schemas.lock.json           the recorded shape, and what the additive-only guard compares against
check-additive.mjs          that guard
compat-allowlist.json       the tightenings the guard lets through within 1.x, each with its evidence
generate-schemas-lock.mjs   writes schemas.lock.json from schemas/
generate-contract-types.mjs writes a consumer's TypeScript types from schemas/; `--check` for currency
tooling/                    repository tooling; not in the package
  sync-version.mjs          one version, stated in package.json, written everywhere else from it
  changelog-section.mjs     prints one release's CHANGELOG section; the release workflow's notes
  export-suite.mjs          writes conformance/suite/ from the schemas and fixtures; run by `npm run lock`
  generate-index.mjs        writes schemas/index.json; run by `npm run lock`
  inline-granted-manifest.mjs rewrites every inlined copy of the manifest schema from its source
  regex-portability/        the Go program CI runs to compile every pattern under RE2
  build-site.mjs            builds the GitHub Pages site into a directory from the repository tree; `npm run site`
  site-reference.mjs        the site's schema reference: one page per schema, walked from the schema files; `build-site.mjs` calls it
  site.css                  the site's one stylesheet, copied beside the pages by the generator
SPEC-agent-lease-manifest.md the normative specification
README.md                   this file
CHANGELOG.md                what changed, per release
CONTRIBUTING.md             how to run the checks and tighten a schema within 1.x
GOVERNANCE.md               who decides, what needs a proposal, how a change lands, how a release is cut
docs/                       implementing.md, upgrading-1.0-to-1.2.md, decisions.md, conformance/cdf-harness.md, and proposals/ (one page per semantic change, on TEMPLATE.md, kept as the record)
SECURITY.md                 what counts as a vulnerability here, and where to report one
LICENSE                     Apache-2.0
package.json                the npm package; `files` is the tarball's allow-list
```

## Licence

**Apache-2.0** — the schemas, the fixtures, the conformance runner, all of it. See `LICENSE`.

Permissive on purpose, and Apache rather than MIT for one reason: the patent grant is what makes
an organisation comfortable implementing a format. A format a third party can write to, and
prove conformance against, is what makes the Index citable rather than merely used.

**The corpus is included deliberately.** Schemas without fixtures let someone claim conformance;
schemas with a corpus let them demonstrate it, and let anyone else check the claim.

The implementations remain PolyForm Noncommercial 1.0.0. Reading and writing the format is open;
building a competing governed-delivery product out of this codebase is not.

The decision records that shaped each release live in the harness repository, under that licence.
[docs/decisions.md](docs/decisions.md) indexes them from here, release by release, with the three
reviews, so a CHANGELOG entry can be followed back to its decision without crossing the boundary
unread.
