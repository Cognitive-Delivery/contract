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

[Unreleased]: https://github.com/Cognitive-Delivery/contract/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Cognitive-Delivery/contract/releases/tag/v1.0.0
