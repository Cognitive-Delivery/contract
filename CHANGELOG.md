# Changelog

What changed in the governance contract, and what it means for anyone reading or writing these
artefacts.

The compatibility promise is in `README.md` and enforced by `check-additive.mjs`: **within a major
version, changes are additive only.** A new optional field or a new member of an open vocabulary is
a minor or patch change. Renaming, removing, narrowing or redefining a field requires a major
version and a documented migration. An entry below that would break a consumer is, by that rule, a
major version — so if you are on 1.x, nothing below this line can break you.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html) over the **schema set**, not over the
tooling in this repository.

## [Unreleased]

### Added

- **The documentation site** at <https://cognitive-delivery.github.io/contract/>, generated on every
  deploy by `tooling/build-site.mjs` from the files `npm test` checks: a front page, the schema
  reference (`tooling/site-reference.mjs`, one page per schema with every property's description,
  constraints and stability), the SPEC, README, GOVERNANCE, CONTRIBUTING, SECURITY and CHANGELOG as
  pages, the guides, conformance, proposals and versions; `conformance/site-check.mjs` in `npm test`
  (links, anchors, schema bytes, no script or external resource, determinism); `marked` 18.1.0 pinned
  as a devDependency; `pages.yml` calls the generator after its unchanged schema layout (harness
  DR-185).
- `docs/implementing.md` (the adapter interface in one place, with a worked example from the installed
  package), `docs/upgrading-1.0-to-1.2.md` (what the allow-listed tightenings refuse and what a 1.2
  writer owes), `docs/decisions.md` (each release to the harness decision records and the three review
  documents), `docs/conformance/cdf-harness.md` (the reference implementation's conformance report),
  and five proposal records under `docs/proposals/` for the 1.2 semantic changes (four accepted, host
  ports rejected for 1.x), written after the fact under harness DR-184.

### Changed

- Every statement current at 1.2.1 (harness DR-184, a read-only audit of 6 October 2026): the 1.1.0
  self-test defect is attributed to the release candidate (`main` at e91afb0) rather than the
  published tarball; "eleven words" is ten in the CHANGELOG and in the `details` descriptions of
  `audit-event` and `cdi-signal` (description text only; the suite export regenerated, the lock and
  the index unchanged); `allow.tool_args` is described as a `$comment` of `stability: development`;
  the 1.1.0 section carries one `Added`, one `Changed` and one `Fixed`; SPEC §9 names schema set 1.2
  and rule L3 (clauses 9-1 and 9-3 re-affirmed in `conformance/traceability.json`, a §13 editorial
  row); CONTRIBUTING lists everything `npm test` checks and which guard findings need which lock
  format; GOVERNANCE's release step says `release.yml` dispatches `pages.yml` on `main`; SECURITY's
  lease-escape surface names `lease-record`; the README names `/1.2.1/`, both development-stability
  fields and rule L3; header comments in `conformance/runner.mjs`, `ids.mjs`, `schema-checks.mjs`,
  `check-additive.mjs`, `generate-schemas-lock.mjs`, `generate-contract-types.mjs` and the two
  workflows say what the code does today.
- **The site carries the cognitivedelivery.co.uk brand** (harness DR-186): the website's design tokens
  in `tooling/site.css` (three `:root` blocks: the website's palette, the hoisted header and footer values, and the dark scheme; no literal colour outside them), Source Sans 3 and
  JetBrains Mono self-hosted as variable woff2 files under the SIL Open Font Licence with its text
  beside them, the teal and white logos and the three favicons under `tooling/site/`, every page's
  header and footer carrying the logo, and `tooling/site/BRAND-NOTICE.md`, rendered at
  `/brand-notice/` and linked from every footer, stating that the name and logo are the owner's marks
  outside the Apache-2.0 licence. `conformance/site-check.mjs` now admits a `<link>` (`stylesheet`,
  `icon` or `apple-touch-icon` only), an `<img src>`, a `<source srcset>` and a stylesheet `url()`
  only when site-internal and resolving to a written file, the one eyebrow-mark data URI by exact
  match, refuses `@import` and any other host, and reports the distinct targets as `assets`.
- **`npm test` checks the numbers the documents state** (harness DR-187, the fourth review of 6
  October 2026). `conformance/claims-check.mjs` holds a declarative list of claims, each a file, a
  pattern capturing the stated value and a function computing the true one from the repository,
  and fails on a difference or on a statement that is no longer there. It covers a new "corpus in
  numbers" paragraph in the README (fixtures valid, invalid and by rule; suite tests and cases;
  canonical, RFC 8785, narrowing and signature vectors; SPEC clauses and exclusions; patterns;
  declared properties and `properties` keys; allow-list entries), the schemas carrying
  `schema_version` in the README and the SPEC, the vector and event counts in the README, the SPEC
  and `docs/`, the guard's counts between v1.1.0 and v1.2.0 in CONTRIBUTING and this file, the
  1.2.0 and 1.2.1 property and clause counts, and the tagged commits in `docs/decisions.md`. A claim
  whose source is not in the package, or that needs the release tags, is reported NOT CHECKED; CI's
  conformance job now checks out full history so the tags are there. `run.mjs` prints
  `Claims: N checked, F failure(s).`; the README's Layout block and CONTRIBUTING describe it.
- **The site reference shows every enumeration in full**: past ten values the count is followed by
  every value inside a `<details>` element (no script), where it used to show three examples
  (`tooling/site-reference.mjs`, with self-test assertions that every hook event and every
  `cdi-signal` event type is on the page). The versions page links a 1.0.x release to its tag,
  labelled "no GitHub Release", because GitHub Releases start at 1.1.0 (a constant in
  `tooling/build-site.mjs` read from this file's 1.1.0 entry, since the build makes no network
  request); the front and versions pages say `/1.x/` serves `main`.

### Fixed

- **Twenty-two statements the fourth review found the artefacts contradicting** (harness DR-187),
  each re-verified against the artefact before it was changed. The upgrading note had the
  compatibility direction backwards (a 1.2 reader reads what a conformant 1.0 writer produced; a
  1.0 reader may reject 1.2 output, and the 1.0.2 schemas reject two current valid fixtures). The
  `details` key filter is described as approximating the reference writer's rule, not mirroring it,
  with the differences listed (case-sensitive; a digit ends a camelCase segment) in the README,
  SECURITY, the 1.1.0 entry below and the `propertyNames` descriptions of `audit-event` and
  `cdi-signal`; a later task tightens it. "110 entries cover the 115 tightenings" is 58 of the 110.
  `schema_version` is carried by seven schemas, not every one (README, SPEC §6.2, the upgrading
  note). The pattern dialect is an ECMA-262 subset that compiles under RE2, applied as an
  unanchored search, not RFC 9485 I-Regexp (SPEC §4.4, the host, path and credential descriptions,
  two proposals, the 1.1.0 entry and two code comments). The `reasonCode` description says an
  issuer MUST NOT mint R7 and above, which the pattern admits. `/1.x/` serves `main`, not the
  1.2.1 tag (the 1.2.1 entry, the site's front and versions pages, the README, the suite export's
  labels). `docs/decisions.md` gives the 1.0.x tagged commits rather than the annotated tag objects,
  DR-182 as Approved, and a summary of each review in place of links to private documents. 666
  `properties` keys are 651 declared properties and 15 condition keys. The corpus runs under "six
  validators", Ajv among them (the CI job keeps its required-check name). Three CDF extensions, not
  two. The CI paragraph says which job runs on which Node version and when. The push baseline is
  the pushed-from commit. The two real-record counts are two provenance populations (front-matter
  blocks and journal lines). From the installed package three lines report a repository-only
  check, not two. The site reference shows every enumeration. The versions page labels the 1.0.x
  links as tags. The harness's real-artefact test passes an empty lease journal. The site
  stylesheet has three `:root` blocks. The SPEC header dates its editorial revisions (a §13 row)
  and the journal carries ten distinct `actor.runtime` values, not eleven. The CI comment says the
  narrowing vectors are checked for shape only. An empty code span in the entry above is `$comment`
  again (lost to shell interpolation). Description text only in the schemas: the guard reports no
  finding, the lock is unchanged, the suite export and the inlined copies regenerated.
- **The Source Sans 3 licence named the wrong copyright holder.** The bundled OFL text said "Google
  Inc."; the font is Adobe's, with the Reserved Font Name "Source". Both font licence texts are now
  the upstream projects' own (`adobe-fonts/source-sans` `LICENSE.md`, `JetBrains/JetBrainsMono`
  `OFL.txt`), and `tooling/site/BRAND-NOTICE.md` records where each came from and what differed.

### Security

- **The type generator could be made to write code into a consumer's source tree.** Found by an
  internal security review. `generate-contract-types.mjs` copied schema `description` text into
  `/** ... */` doc comments without escaping the block-comment terminator, and wrote enum values
  between single quotes without escaping them. A description carrying the terminator closed its
  comment, so the rest of the text became a top-level statement in the consumer's
  `src/generated/contractTypes.ts`, which the consumer compiles into its product; `npm test` stayed
  Conformant. A merged schema change could therefore run code in every repository that regenerated
  its types. Now every schema-sourced string leaves the generator through one of three functions:
  description text is flattened to one line with the terminator escaped, enum values are emitted as
  JSON string literals (numbers only when finite), and every type name derived from a definition
  key or a `$ref` is refused unless it is a plain identifier; a `$ref` outside `#/definitions/` and
  a version that is not a semantic version are refused too. `conformance/generator-tests.mjs` renders
  a schema carrying the review's payload at every emission site, and enum values carrying quotes,
  backslashes and line breaks, and reads the output back as code; `conformance/schema-checks.mjs`
  refuses any `description`, `title` or `$comment` containing the terminator, and is seen firing on
  a sample each run. Both run in `npm test`, and each was seen failing with its protection undone.
  **For a consumer:** the generated types for the current schemas are unchanged except that enum
  members are now double-quoted, so regenerate once after updating (`--check` reports the file
  stale until you do). No schema changed.

## [1.2.1] — 2026-10-06

Tooling only; the SPEC's schema set stays 1.2 (no normative change) and `/1.x/` served the 1.2.1
schemas when it was tagged, additive over 1.2.0 by one field (`/1.x/` serves the schemas on `main`,
which may carry description-only changes ahead of the next tag; `/1.2.1/` is the frozen copy); `schemaSetVersion` and `index.json`'s `schema_set`
follow the package version, of which only the major is load-bearing. Found by pinning the
reference implementation to 1.2.0: the type generator, the Pages deploy on a tag, and the narrowing
vectors being the reference's own bytes. One additive field, `capabilities.tool_args` on the plugin
schemas, so `capabilities` stays the lease `allow` shape property for property.

### Fixed

- **The type generator reads `.schema.json` only, names `lease-record`, and says what a type cannot.**
  It tripped over `schemas/index.json` and had no name for the record; and it silently dropped every
  keyword TypeScript has no words for. The generated file's header now lists them, per keyword with a
  count and an example site (`allOf` with `if`/`then`, `propertyNames`, `pattern`, the bounds), so a
  reader of the types knows to validate with the schema as well.
- **`capabilities.tool_args`** on both plugin schemas: the lease `allow` shape, property for property,
  now that `allow` carries `tool_args` (development stability, as there).
- **The narrowing vectors are the reference's bytes.** `tool-args-dropped` was added by hand in 1.2.0;
  the file is now regenerated from the reference implementation (CDF Harness) as the others always
  were, which placed the vector second and gave it the `diff` the generator records.
- A valid lease-record fixture's reason no longer contains the word "secret", which the reference
  deployment's corpus hygiene test bans as a marker.
- **The frozen copy deploys after a release.** The github-pages environment admits `main` only, so
  the tag push that was meant to lay out `/1.2.0/` was refused at the deploy step; `release.yml` now
  dispatches `pages.yml` on `main` after publishing (it fetches every tag), and the tag trigger is
  gone. 1.2.0's copy was deployed by hand the same way and is byte-identical to the tag.

## [1.2.0] — 2026-10-05

Schema set 1.2 (CDF spec `contract-batch-two-implement-all`, DR-183): the second review's fourteen
improvements, from a package that could not run its own test to a corpus that runs under six
validators, Ajv among them. **Additive within 1.x by the contract's own rule, mechanically checked**: against 1.1.0
the guard reports 115 allow-listed tightenings, covered by 58 of the allow-list's 110 entries (an
entry at a definition's path covers every property in its schema that refers to it; the other 52
entries are 1.1.0's), each naming the exact value it
admits and the fixture or recorded check that proves no conformant writer ever produced what it now refuses, and
every real journal in the reference deployment validates with zero rejections (33,608 audit
records, 19,231 CDI signals, 995 provenance front-matter blocks, 2 assessments, the six-line lease journal, the
workspace config). No byte of any existing hash or signature changes. One new schema,
`lease-record`; one field at development stability, `allow.tool_args`; everything else stable.

### Added

- **`lease-record`**, the decision side of the lease (SPEC §6.1). One line of the lease journal:
  nine events (`granted`, `refused`, `narrowed`, `heartbeat`, `attached`, `revoked`, `stopped`,
  `completed`, `expired`) with what each must carry, enforced by conditional requirements; a
  refusal's `reasons` are reserved codes (`R<n>`, `runtime_error:<name>`, `vendor:<vendor>:<code>`)
  with the prose in `reason`; `declared_hash` and `granted_hash` tie a record to the exact bytes
  decided; a `revoked` record names `by` (an ancestor lease or `issuer`) and rule L3 refuses any
  other, given the journal. The schema carries the manifest and the lease inlined, held identical to
  their sources (`conformance/inlined-copies.mjs`). Eleven valid fixtures, five invalid, one by rule.
  The reference deployment's real journal validates unchanged; a 1.1 `granted` record carries no
  `granted_hash` and a reader may compute it.

### Changed

- **Hosts, commands, tools and approvals have one identity rule each**, enforced by the schemas
  (SPEC §4.4). A host is a lower-case DNS name (IPv4 literals and `localhost` included), with at most
  a single leading `*.` label, or `*`; a scheme, a port, a path, whitespace, upper case, a trailing
  dot and an interior wildcard are refused. A command is the executable's basename: no path, no
  arguments, no shell operator. A tool or approval is an identifier of at most 128 characters that
  is never `*` and carries no whitespace. The same rules apply to the plugin schemas' `capabilities`,
  which is the lease `allow` shape. Eighteen invalid fixtures, one per refused form, and one valid
  fixture carrying every admitted form. `agent.name` is capped at 120 characters and described as
  never a person's name; `intent.purpose` at 500. `tooling/inline-granted-manifest.mjs` rewrites the
  inlined copy in `agent-lease.schema.json` from its source, so the identity check has a tool to
  satisfy it.
- **Lease rules L1 and L2, and one timestamp form inside the signed bytes** (SPEC §6). A schema
  cannot say "`expires_at` is after `issued_at`" or "not its own parent", so `conformance/lease-rules.mjs`
  does, the runner applies it to every valid lease and to `fixtures/invalid-by-rule/` (`Expired`,
  `TooEarly`, `SelfParent`, named after the UCAN 1.0 fixture errors where one exists), and an
  adapter proves its own rules through a `rules` hook, reported unchecked when absent.
  `issued_at` and `expires_at` admit only UTC with milliseconds and `Z`, because an offset form
  hashes the same instant to different bytes; every real lease already uses it. `attestation.signature`
  is 64 hex like the lease's own; `budget.depth` ≤ 16 and `budget.fan_out` ≤ 256.
- **An allow-list entry admits one tightening, not every later one at the same path.** Every guard
  finding now carries `after`, the exact value it admits (`pattern=…`, `maximum=16`, `enum=[…]`),
  and an entry must name it. Found while lowering `depth`'s ceiling: batch one's entry for the
  2^53 `maximum` would have covered it silently. Every existing entry gained its `after`; three
  guard scenarios prove the match is exact.
- **Inline plugin hooks and MCP servers are typed, and a manifest cannot carry a credential.**
  An inline `hooks` object validates as the event map (thirty-three events, five handler types
  with their required fields, after the Claude Code settings schema of 2026-10-05) and an inline
  `mcpServers` object as a map of server configs (`stdio` requires `command`; `http`, `sse`, `ws`
  and `streamable-http` require `url`). A value in a hook header, an MCP `env` or an MCP `headers`
  that matches one of seven credential shapes is refused; a marketplace entry's `headers` refuses
  an `authorization` key in any case; a contributed provider's `baseUrl` is `https://` or
  `http://` to loopback only. Nine invalid fixtures, one valid fixture with every admitted inline
  form; Anthropic's bundled-plugin manifest and the reference deployment's own manifests validate
  unchanged.
- **The lock follows local `$ref`s** (lock format 4). A property re-pointed from one definition to a
  stricter one used to change only its `ref` string, which the guard never compared, so the typed
  hook and MCP shapes above would have landed unseen; and a value that became a `$ref` lost its
  recorded type and read as `TYPE_CHANGED`. The referenced definition is now digested at the
  referring path, with `ref` recorded beside it; a cycle stops at its second visit.
- **Evidence hygiene** (SPEC §6.2). `audit-event.event_type` is two or more lower-case dotted segments,
  with the reference writer's first segments reserved and a vendor name for anyone else; `summary`
  and `reasoning` refuse any control character; a `details` string value is at most 200 characters;
  `actor.runtime_agent` (optional, the closed vocabulary) is added while `actor.runtime` stays open,
  because the real journal carries ten distinct values of it; `schema_version` is `major.minor` on
  every schema that carries it (the lease schemas widen from the literal `1.0`); `provenance.spec` is a slug; a CDI assessment has
  exactly six dimensions, each id once, with integer scores; a sealed config path is dotted lower-case
  and the runner checks it names a field the fixture carries. Ten invalid fixtures, one valid. Every
  real audit record, signal, provenance record and assessment in the reference deployment validates.
- **`allow.tool_args`** (SPEC §4.4), a per-tool argument-schema declaration at development
  stability (a `$comment` of `stability: development`): an issuer MAY omit it from the grant and MUST NOT treat it as authority, because
  the reference gate does not yet evaluate argument schemas and a rule without an enforcing gate is
  a claim the corpus cannot test. The vector `tool-args-dropped` shows the reference dropping it.
  The stability marker is a `$comment` (draft-07 defines it): Bowtie showed Ajv's strict mode in
  another harness refusing a custom `x-stability` keyword, and a schema only this repository can
  compile is not portable. Python's `re` likewise rejected `\p{Cc}`, so the control-character
  class is written as literal characters, which every engine reads the same way.
- **Every normative clause of the SPEC has a named test** (`conformance/traceability.json`,
  checked by `npm test`). `conformance/spec-clauses.mjs` extracts the 87 clauses with stable ids
  and a drift key; each is mapped to the fixtures, vectors, checks or rules that test it, or
  excluded with a reason (16 are: runtime behaviour, SHOULDs, definitions). Seven fixtures were
  added where a clause had nothing to point at: a manifest with a bare-major `schema_version`, a
  `runtime_agent` outside the vocabulary, a model without `family`, an `allow` or `deny` missing a
  list, an attestation with an unknown issuer, and a valid home-relative deny path.
- **The corpus runs under six validators.** `conformance/suite/draft7/` is the corpus in the official
  JSON-Schema-Test-Suite format (one file per schema, every fixture a test, written by
  `npm run lock` and checked current by `npm test`), and CI runs it through Bowtie against
  `go-jsonschema`, `rust-jsonschema`, `python-jsonschema`, `java-json-schema`,
  `dotnet-jsonschema-net` and `js-ajv`, failing on any disagreement. A case is kept under 60 KB as one line, chunking a schema's tests across cases where needed, because a harness that reads a case as a line (the Go one) errors above 64 KiB. A second job runs
  Sourcemeta's `jsonschema metaschema` and `lint` (six style rules excluded by name, each with
  its reason in the workflow). Two orphan `componentSource` definitions the typed hook and MCP
  shapes had left behind are removed, and the marketplace's empty `relevance.signals` schema
  gained a description, both found by that lint.
- **Every property says what it promises.** All 664 `properties` keys (666 at 1.2.1, with
  `capabilities.tool_args` on both plugin schemas), which are 649 declared properties (651 at 1.2.1)
  and 15 keys inside `if` and `contains` conditions, carry a `$comment` of `stability: stable` or
  `stability: development` (only `allow.tool_args` is development), with
  `; deprecated: <replacement>` for retiring a field. `conformance/metaschema.json` holds that and
  the other conventions (dialect, `$id`, title, description, no `format`) and `npm test` validates
  every schema against it. Lock format 5 records `stability`, `deprecated` and the names an
  `allOf` `if`/`then` makes required (the lease record's per-event requirements were invisible to
  earlier formats); the guard reports `STABILITY_LOWERED` and `CONDITIONAL_REQUIRED_ADDED` as
  breaking and treats deprecation as additive. Two new guard scenarios.
- **Governance written down.** `GOVERNANCE.md`: one maintainer (`@datajace`, the sole CODEOWNER,
  stated rather than padded), a proposal under `docs/proposals/` before any semantic change, how a
  change lands and how a release is cut. A repository-owned `DCO` check refuses a pull request with
  an unsigned commit (the third-party app was not used because a suspended app's check disappears
  silently). Issue templates for a defect and a proposal, a pull-request template with the checks
  the automation cannot see, Dependabot for npm and Actions weekly, and the proposal template with
  Backward compatibility and Security sections and a status lifecycle.
- **Every release frozen at its own URL, and an index.** `pages.yml` now lays out `/<version>/`
  for every `v1.*` tag beside the `/1.x/` alias, byte for byte as tagged and never rewritten, and
  runs on the tag push so the frozen copy appears with the release (1.2.1: the tag trigger is gone;
  `release.yml` dispatches `pages.yml` on `main`); `release.yml` checks it serves
  the tagged bytes (patiently, and reported rather than failed while the deploy is still landing).
  `schemas/index.json`, written by `npm run lock` and validated by `npm test`, lists every schema
  with `file`, `$id`, `title`, `dialect` and `fileMatch`; it is served beside the schemas. A
  SchemaStore catalogue entry is proposed for `**/.cdf/config.yaml`, pointing at the served
  `config-core` schema.

## [1.1.0] — 2026-10-05

The first release after the review of 4 October 2026 (CDF spec `contract-fix-batch-one-4`,
DR-182). Five of the review's ten improvements, in the order the guard first so every tightening
that follows is classified and allow-listed by name. **Additive within 1.x by the contract's own
rule, mechanically checked**: against 1.0.2 the guard reports 46 allow-listed tightenings, each
with the fixture or real-data count that proves no conformant writer ever produced what it now
refuses, and every real journal in the reference deployment (33,557 audit records, 5,652 signals,
4,535 provenance lines) validates with zero rejections. No existing hash or signature changes.

### Added

- **The additive-only guard sees tightenings** (`schemas.lock.json` is now lock format 3). The lock
  records, per property path, `pattern`, the `allOf[].not.pattern` set, `minLength`, `maxLength`,
  `minimum`, `maximum`, `additionalProperties` and the number of `anyOf` branches, and per schema
  whether its root is open or closed; enum values keep their JSON type instead of being
  stringified. `check-additive.mjs` reports named findings (`PATTERN_TIGHTENED`,
  `BOUND_TIGHTENED`, `CONTENT_MODEL_CLOSED`, `UNION_CHANGED` beside the four it already knew) and
  says plainly when a baseline predates the format and those four cannot be compared. A
  `--baseline-ref` baseline is digested from the schemas as they were at that ref with the current
  generator, so two lock formats are never compared; the committed lock stays the drift record for
  its own commit. Format 3 records a union's branch types and patterns on the parent entry, and
  `propertyNames` refusals, both of which format 2 lost.

  Until now a pattern could be tightened inside 1.x and the guard would print "additive only",
  which is the class of change the 4 October 2026 review found it blind to. Nothing in the
  schemas changed in this entry; the guard learned to see.

- **`compat-allowlist.json`**: the one way a tightening passes within a major. Each entry names
  the finding, the schema, the path, a reason, a date and an existing evidence file; the guard
  refuses an entry with no evidence and refuses a change that drops an entry the baseline had.
  Documented in CONTRIBUTING.

- **The guard's own tests** run in `npm test` (`conformance/guard-tests.mjs`): 27 scenarios in
  which every finding is seen to fire, every additive change is seen to pass, and the allow-list is
  seen to refuse an entry without evidence.

- **Three checks the contract's own CI now holds** (`conformance/schema-checks.mjs`, in `npm test`):
  every schema compiles under Ajv strict mode; the granted manifest inlined in
  `agent-lease.schema.json` is byte-for-byte the manifest schema dereferenced (this check used to
  live only in the consuming harness, so the contract could not fail on its own drift); and
  `package.json`'s `cdfContract.schemaSetVersion` matches the package version.

- **A regex-portability job.** `tooling/regex-portability` compiles every `pattern` in every schema
  with Go's `regexp` (RE2: no lookahead, no backreferences), because Go validators use it
  unconditionally and a pattern RE2 rejects is a schema set a Go implementation cannot load. The
  job failed until the path patterns were rewritten without lookahead later in this release (see
  Changed below), and is now a required check.

- **Narrowing vectors** (`conformance/narrowing-vectors.json`). SPEC §9 called narrowing "the heart
  of the specification" and left it to each implementation's own tests. The corpus now carries
  declared-and-parent pairs with the granted manifest or the refusal codes narrowing must produce:
  every row of the §5 table, every containment row of §5.1 (including `src/*.ts` not containing
  `src/a.ts`), every refusal of §5.2, `unknown` accepted for `external` and refused for `native`, an
  escaping path refusing the whole manifest, and a root manifest narrowed against a root policy.
  The vectors were generated from the reference implementation's `narrowManifest` and committed. An
  adapter supplies `narrow(declared, parent)` and the runner compares granted manifests by canonical
  bytes and refusal sets exactly; one that does not is reported as not checked. Every adapter has
  the vectors checked for shape. §5.2's six conditions gain stable identifiers R1 to R6.

- **A published test key, verifiable signed fixtures and signature vectors**
  (`conformance/test-key.txt`, `conformance/signature-vectors.json`). The lease fixtures carried
  `cccc…` and `dddd…` for `declared_hash` and `signature`, so no verifier could be tested against the
  corpus. They are re-signed under a public test key (which a verifier must refuse outside a
  conformance run), a root lease fixture is added, and an adapter offering `hash` and `verify` is
  checked for matching `declared_hash`, acceptance, and refusal when one byte of the signature or
  of the granted manifest changes. The reference adapter implements the reference HMAC-SHA256.

- **Every invalid fixture carries an `.expect.json`** naming the instance path the rejection must be
  reported at, and the runner checks it when the adapter reports its errors. Adding them found two
  fixtures (`cdi-signal.bad-outcome`, `cdi-signal.unknown-event`) that this release's `workspace_id`
  shape had started rejecting first for the wrong reason; both now carry a digest-shaped
  `workspace_id` so they fail only for the reason their `.reason` states. The unknown-field round
  trip now plants the field inside the first nested object as well as at the top level.

- **Every key the Claude Code plugin and marketplace references document** (read 2026-10-05) is
  modelled: `$schema`, `icon`, `documentationUrl`, `supportUrl`, `privacyPolicyUrl`,
  `termsOfServiceUrl`, `dependencies` (string, `name@marketplace` or object), `settings`,
  `userConfig` (strict options: `type`, `title`, `description` required; `required`, `default`,
  `options`, `multiple`, `sensitive`, `min`, `max`), `types`, `channels` (strict), `commands` as an
  object map of `source`-or-`content` entries, `hooks`/`mcpServers`/`lspServers` as path, inline or a
  mixed array (with `.mcpb`, `.dxt` and `https://` bundles), strict `lspServers` entries with
  `command` and `extensionToLanguage` required, `outputStyles`, `workflows`, top-level `themes`
  (deprecated, still loaded) and `experimental` (`themes`, `monitors` as strict entries, `evals`);
  marketplace `forceRemoveDeletedPlugins`, entry `relevance` and `dependencies` and every
  manifest field an entry may carry; `command` source `timeout` (1 to 600) and `mode` (`copy` or
  `link`); `archive` `sha256` in either case; and the if/then rule that `headersHelper` requires
  `"strict": false`. Names follow Claude Code's rule (letters, digits, `.`, `_`, `-`, leading
  alphanumeric) instead of kebab-case only. Where Claude Code's object is strict the contract's is
  too, because honouring a key "with the same meaning" there means refusing an unknown one.

  Two fixtures carry the evidence: the manifest reference's own example manifest, and Anthropic's
  marketplace for its bundled plugins (`anthropics/claude-code` at a pinned commit, author emails
  removed). Four invalid fixtures pin the strict shapes. The `local` source form and plugin-level
  `category` stay as CDF extensions, named as such in the schema descriptions and, in the next
  change, the README.

### Changed

- **The README no longer claims the plugin schemas contain every key Claude Code has.** The
  sentence was true at 1.0.0 and stopped being true as Claude Code grew; a standing superlative
  about a moving target is the kind of sentence this contract exists to refuse. The README now says
  what is modelled and as of which date, names the three CDF extensions (`cdf`; the `local` source
  form; plugin-level `category`) so nobody mistakes them for Claude Code's, and the old wording is
  a banned claim in the reference implementation's documentation gate.

- **Canonical bytes are declared to be RFC 8785.** SPEC §7 now says normatively that canonical bytes
  are the RFC 8785 (JSON Canonicalization Scheme) serialisation after removing absent members, with
  the field-by-field rules kept as an informative restatement. The restatement was already RFC 8785
  (the reference canonicaliser passes RFC 8785's own vectors unchanged), so no existing hash or
  signature changes; what changes is that an implementer in Go, Java, Python, Rust or .NET can use
  an existing JCS library and check it against the corpus, which now carries RFC 8785's six
  reference vectors (`conformance/jcs/`, vendored at a pinned commit under Apache-2.0 with its
  source recorded) beside the contract's nine. Every `integer` field is bounded at 2^53 − 1 because
  RFC 8785 presumes I-JSON; the ten `BOUND_TIGHTENED` findings are allow-listed with a fixture.

- **The privacy properties are enforced by shape, not prose.** `request_hash`, `prompt_hash`,
  `steering_hash` and `content_hash` require a 64-character lower-case hex digest; `details` on the
  audit event and the CDI signal refuses by `propertyNames` any key whose segment is one of the
  reference writer's ten words (`authorization`, `content`, `file`, `password`, `path`, `payload`,
  `prompt`, `request`, `secret`, `token`), split on non-alphanumerics and camelCase boundaries,
  which approximates the writer's rule (the schema is case-sensitive where the writer is not; see
  the `propertyNames` descriptions for the differences); `summary` is capped at 300 characters and `reasoning` at 500, the
  writer's own caps. Before this a raw prompt in `request_hash` validated, which SECURITY.md itself
  calls a security issue. Each tightening is allow-listed with its fixture; the check against the
  reference deployment's journals (33,538 audit records, 5,634 signals, 4,535 provenance lines) rejects
  nothing.

- **`workspace_id` is widened, and its description corrected.** It accepts a SHA-256 digest or a
  lower-case UUID, because the collector writes a per-checkout UUID when the workspace has no git
  remote and 4,910 of the reference deployment's 5,634 signals carry one. The description said
  "SHA-256 of the git remote URL" and was false against real artefacts.

- **`schema_version` stays required and the prose stops saying otherwise.** The README and the
  provenance description said an absent value "is read as 1.0"; the schemas required it, and zero
  real records lack it. A writer always writes it; a reader may read a pre-contract artefact as 1.0.

- **Path rules are written without lookahead, and refuse three forms they used to accept.** Every
  `read_paths`, `write_paths`, `deny.paths`, plugin `worker`, `docPacks` and `git-subdir` `path`
  rule is now `allOf` of `not`/`pattern` clauses written without lookahead in the ECMA-262 subset RE2 also compiles. Go's `regexp`
  (RE2) and the validators built on it could not load the old `(?!…)` rule at all, so the README's
  "an implementation in another language needs nothing else" was false for Go; the new
  `regex portability (RE2)` CI job now passes and is required. An `allow` path additionally refuses
  a leading `~`, a drive-letter prefix and any backslash, which SPEC §5.2 already required and the
  reference implementation already did; six new invalid fixtures prove each form. A `deny` path may
  be home-relative (`~/.ssh/**`), because the reference implementation's own root policy denies
  exactly that and refusing a path outside the workspace is meaningful. Each tightening is
  allow-listed with its fixture as evidence; no real lease in the reference deployment carried a
  refused `allow` form.

- **The push baseline is the pushed-from commit.** The additive guard compared a push against
  `HEAD^`, so a three-commit push whose first commit broke the rule was compared only against its
  own second commit and passed. It now compares against `github.event.before`, falling back to the
  merge base with `main` on a brand-new branch. Pull requests still compare against the base branch.

### Fixed

- **Every `$id` resolves.** The schemas named `https://cognitivedelivery.co.uk/contract/1.0.0/…`,
  which redirected to `www` and returned 404 for the life of 1.0.x: a dangling identifier in a
  contract about recording things verifiably. Each `$id` is now
  `https://cognitive-delivery.github.io/contract/1.x/<file>`, served by GitHub Pages from the
  `schemas/` directory at the deployed commit (`pages.yml`; no copy is committed, so nothing can
  drift) and checked byte for byte against the tag on every release. `1.x`, not `1.0.3`: an
  identifier that changed on every minor release would be a version number with extra steps, and
  the version a document was written against is its own `schema_version`. Nothing resolved the old
  URL, so the change costs no reader anything. Pages must be enabled on the repository (source
  "GitHub Actions") for the URLs to serve; until then the release job warns rather than fails.

- **One version source.** `tooling/sync-version.mjs` writes the version from `package.json` into
  `cdfContract.schemaSetVersion`, the README's version line, every schema's `$id` major and any
  fixture's `$schema`; `npm run lock` runs it first, and `npm test` checks all of them plus the
  CHANGELOG, the lock and the SPEC header, and refuses any remaining reference to the old host.

- **`package.json` said `schemaSetVersion` 1.0.0.** It had been stale since 1.0.1, and the version
  currency check added in 1.0.2 did not read it. It now reads it.

- **The published package runs its own `npm test`.** The 1.1.0 release candidate (e91afb0, before
  the tag) could not: `conformance/run.mjs`
  imported `idFor` from `tooling/sync-version.mjs` and `guard-tests.mjs` imported
  `check-additive.mjs`, and neither is in `files`, so the installed package failed with
  ERR_MODULE_NOT_FOUND before validating a single fixture (review of 5 October 2026, defect 1).
  `idFor` now lives in `conformance/ids.mjs`, which ships; the guard is loaded dynamically and
  reported **not present** from the tarball rather than passed; and a CI job packs the tarball,
  installs it into an empty directory with `ajv`, and runs the installed package's test on Node 20
  and 22, because no check run from a clone can see what the clone has and the tarball lacks.
- **`exports` exposes every file under `conformance/` and `schemas.lock.json`**, so
  `@cognitive-delivery/contract/conformance/narrowing-vectors.json` resolves from a consumer; the
  two explicit module entries stay as they were.
- **The README's Layout block is checked** (`conformance/layout-check.mjs`, in `npm test`): every
  entry at the top level and under `conformance/`, `fixtures/` and `tooling/` must have a line, and
  every line a file. It had fallen eleven files behind. **SECURITY.md** now names the published test
  key and the allow-list as in-scope surfaces.
- **A GitHub Release for every tag.** Until now no release had been cut on GitHub: the tags and
  the npm versions existed and the repository's Releases page said none. `release.yml` now creates
  (or, on a re-run, edits) the release for the tag with this CHANGELOG section as its notes
  (`tooling/changelog-section.mjs`, whose extraction `npm test` also checks is non-empty), the
  `npm pack` tarball attached, and links to the npm version page and how to verify its provenance.
- **A daily `$id` watch** (`.github/workflows/id-watch.yml`). The release workflow checks every
  `$id` once, at the tag; this fetches each one every day and fails when it is not 200 or serves
  bytes other than the file on `main`. A red run is the notification; it changes nothing.

## [1.0.2] — 2026-09-19

### Fixed

- **The published 1.0.1 tarball shipped a stale `schemas.lock.json`.** It recorded
  `schemaSetVersion: "1.0.0"` because the correction landed after the tag, so the artefact on npm
  disagreed with the repository. Only `major` is load-bearing — the additive-only rule is scoped
  to it, and it read `1` throughout — so nothing downstream was at risk, but a governance contract
  publishing a record of itself that is out of date is the wrong thing to leave standing.

  Both of this repository's gates had said it was fine: `check:additive` compares schema *shapes*
  and never looks at the version field, so it printed "Lock is current" over a stale one. It took
  a **downstream consumer's** test to notice. `npm test` now checks the lock's version alongside
  the README's and the CHANGELOG's.

### Changed

- **`CONTRIBUTING.md` says what `npm test` actually runs** — four checks now, including the
  canonical-bytes vectors — and what `check:additive` deliberately does not. It also has a section
  on changing the specification, because §7 cannot be edited casually: every hash in this contract
  is taken over those bytes, so a change there invalidates every signature anyone has produced.

## [1.0.1] — 2026-09-19

The first release published from CI, and therefore **the first carrying a provenance
attestation** — 1.0.0 went out by hand because npm trusted publishing must be configured on a
package that already exists. A contract that asks other people to record what produced an
artefact should be able to show what produced its own; from here it can.

No schema changed. This release is the specification, the vectors and the tooling around them.
The published tarball is 91 files.

### Added

- **A normative specification for the Agent Lease Manifest** (`SPEC-agent-lease-manifest.md`). The
  schemas said what an artefact looks like; they did not say what an implementation must *do*. The
  specification states the narrowing algebra, the six conditions that require a refusal, the threat
  model, and what an implementation must satisfy to claim conformance.

  **It closes one gap that made independent implementation impossible.** `declared_hash` and every
  `signature` are computed over "canonical bytes", and that phrase appeared in six schema
  descriptions without ever being defined. Two implementations could both validate against these
  schemas and still produce different hashes for the same declaration. §7 now specifies
  canonicalisation exactly: UTF-8, no insignificant whitespace, members ordered by key ascending by
  UTF-16 code unit, absent members omitted rather than serialised as `null`, and non-finite numbers
  a serialisation failure rather than a placeholder.

  The specification also records two limitations plainly rather than leaving them to be discovered:
  signatures are symmetric, so a third party cannot verify a lease without the issuer's key; and
  path containment is deliberately conservative, so a parent granted `src/*.ts` does **not** contain
  a child declaring `src/a.ts`.

- **Canonicalisation test vectors** (`conformance/canonical-vectors.json`), and a fourth check in
  the conformance runner that executes them. Nine vectors — member ordering, recursion, absent
  versus null, empty containers, the escape set, the literal set, unpaired surrogates, number forms,
  and the UTF-16 versus code-point key ordering that is the one most likely to diverge — each with
  its expected byte string and the SHA-256 of those bytes, plus two values that must *fail* to
  serialise rather than produce a placeholder.

  Supply a `canonicalise(value)` on your adapter and the runner checks them. Omit it and the run
  reports **NOT CHECKED** rather than passing quietly, because a silent skip on the one check that
  decides whether two implementations can verify each other's signatures is worse than no check.
  The file is pure ASCII, every character above U+007E escaped, so nothing in it depends on an
  editor or a transfer preserving bytes it might not.

  The reference canonicaliser now lives in `conformance/ajv-adapter.mjs` as an exported function,
  so the repository demonstrates the rules rather than only describing them.

### Fixed

- **`publishConfig.provenance: true` made the first release impossible to publish.** It requires a CI
  provider, so a publish from a workstation fails with `Automatic provenance generation not
  supported for provider: null` — but npm trusted publishing is configured per package and needs the
  package to exist, so CI cannot create it either. The two settings contradicted each other.
  `--provenance` now sits on the release workflow's publish step, so CI still attests every release
  and a manual publish works when it has to.

## [1.0.0] — 2026-09-19

First published release. Nine schemas, a conformance corpus of 20 valid and 26 invalid fixtures, and
the additive-only lock.

### Added

- **Schemas** for the nine governed artefact shapes: `agent-lease-manifest`, `agent-lease`,
  `audit-event`, `cdi-assessment`, `cdi-signal`, `config-core`, `plugin-manifest`,
  `plugin-marketplace`, `provenance`.
- **A conformance corpus.** Every invalid fixture carries a `.reason` file stating what the rejection
  is for, so a second implementation can check that it refuses the same things for the same reasons.
  A schema alone is not a conformance test: two implementations can both validate against it and
  still disagree about what they refuse, and that disagreement is the one that matters.
- **`schemas.lock.json` and `check-additive.mjs`**, which enforce the compatibility promise in CI
  against a baseline rather than merely stating it in prose.
- **Two deliberately closed vocabularies**, `agent.kind` and `agent.runtime_agent`, because a value
  nobody recognises is worse than an explicit `unknown`.
- **Public CI** — the conformance corpus on Node 20 and 22, the additive-only guard, and a line-ending
  check.

### Notes on this release

- **1.0.0 carries no provenance attestation.** It was published by hand because npm trusted
  publishing must be configured on a package that already exists. Releases from 1.0.1 onward are
  published from CI and attested.
- The published tarball is 88 files. `package.json`'s `files` field is the authority on what ships;
  the generators and the CI configuration stay in the repository and are not published.

[Unreleased]: https://github.com/Cognitive-Delivery/contract/compare/v1.2.1...HEAD
[1.2.1]: https://github.com/Cognitive-Delivery/contract/releases/tag/v1.2.1
[1.2.0]: https://github.com/Cognitive-Delivery/contract/releases/tag/v1.2.0
[1.1.0]: https://github.com/Cognitive-Delivery/contract/releases/tag/v1.1.0
[1.0.2]: https://github.com/Cognitive-Delivery/contract/releases/tag/v1.0.2
[1.0.1]: https://github.com/Cognitive-Delivery/contract/releases/tag/v1.0.1
[1.0.0]: https://github.com/Cognitive-Delivery/contract/releases/tag/v1.0.0
