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
  job is expected to fail until the path patterns are rewritten without lookahead in the next
  change, and is made a required check then.

### Added

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

- **The README no longer claims the plugin schemas contain every key Claude Code defines.** The
  sentence was true at 1.0.0 and stopped being true as Claude Code grew; a standing superlative
  about a moving target is the kind of sentence this contract exists to refuse. The README now says
  what is modelled and as of which date, names the two CDF extensions (`cdf`; the `local` source
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
  reference writer's eleven words (`authorization`, `content`, `file`, `password`, `path`, `payload`,
  `prompt`, `request`, `secret`, `token`), split on non-alphanumerics and camelCase boundaries
  exactly as the writer does; `summary` is capped at 300 characters and `reasoning` at 500, the
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
  rule is now `allOf` of `not`/`pattern` clauses in the RFC 9485 I-Regexp subset. Go's `regexp`
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

[Unreleased]: https://github.com/Cognitive-Delivery/contract/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/Cognitive-Delivery/contract/releases/tag/v1.0.2
[1.0.1]: https://github.com/Cognitive-Delivery/contract/releases/tag/v1.0.1
[1.0.0]: https://github.com/Cognitive-Delivery/contract/releases/tag/v1.0.0
