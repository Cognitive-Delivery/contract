# Decisions behind each release

The contract is Apache-2.0 and lives in `Cognitive-Delivery/contract`. The decisions that shaped it
were taken in the reference implementation's repository, `Cognitive-Delivery/cdf-harness` (PolyForm
Noncommercial 1.0.0), as decision records under `docs/governance/decisions/`, and the three reviews
that drove 1.1 and 1.2 are the maintainer's private working documents, which a reader here cannot
open; this page summarises what each found instead of linking to it. A reader here cannot follow a CHANGELOG entry back to
its decision without crossing that licence boundary, so this page is the bridge: every release from
1.0.0 to 1.2.1, the records and reviews behind it, and one line on what each decided. Proposals
accepted or rejected since 1.2.0 are recorded in [`docs/proposals/`](proposals/).

## Releases

| Release | Date | Tagged commit | Shaped by | What was decided |
|---|---|---|---|---|
| 1.0.0, 1.0.1 and 1.0.2 | 2026-09-19 | f575139, df0b1f8, 54c134b (annotated tags 3ad8832, 3150336, e26142f) | DR-146, DR-156 | The schema set extracted from the harness under Apache-2.0 with the additive rule and the lock (first); the SPEC and the canonical-bytes vectors (second); the lock's version checked after the second tarball shipped it stale (third) |
| 1.1.0 | 2026-10-05 | c04f53c | DR-182; the first review | Five of the first review's ten improvements: the guard sees tightenings, the allow-list, narrowing and signature vectors, `.expect.json` paths, RFC 8785 named, every `$id` served, the privacy properties enforced by shape |
| 1.2.0 | 2026-10-05 | 8cd038d | DR-183; the second review | All fourteen of the second review's improvements: identity rules, lease rules and `lease-record`, evidence hygiene, typed plugin components, `tool_args`, traceability, the suite under six validators, stability markers, governance written down, every release frozen at its URL |
| 1.2.1 | 2026-10-06 | 3088e44 | DR-183 (its closing tasks); the third review; DR-184 | Found by pinning the reference implementation to 1.2.0: the type generator, the Pages deploy on a tag, the narrowing vectors as the reference's own bytes, and `capabilities.tool_args`. The third review's findings are parked for batch three; DR-184 re-based every document on 1.2.1 |

## The decision records

| Record | Date | Decided |
|---|---|---|
| DR-146, "The governance contract has a second home, and phases are not in it" | 2026-07-25 | The contract is extracted into its own repository under Apache-2.0; within a major, changes are additive only; lifecycle phases are an open string the contract does not define |
| DR-156, "The harness consumes the contract as a submodule, not from npm" | 2026-09-19 | The reference implementation pins the contract as a git submodule at `contract/` and runs the published runner against itself |
| DR-182, "Contract fix batch one, and what the evidence changed" | 2026-10-04 | The five improvements taken from the first review into 1.1.0, and where real journals changed the design (Approved) |
| DR-183, "Contract batch two, and where the evidence overruled the review" | 2026-10-05 | All fourteen of the second review's improvements into 1.2.0, with eight decisions D1 to D8 where the evidence overruled the review: among them D2 (IP literals admitted as hosts; no port form in 1.x), D5 (refusal reasons as codes), D6 (`tool_args` a declaration) and D7 (lease cross-field rules in the runner, not the schema) |
| DR-184, "Every document that describes the contract reflects 1.2.1" | 2026-10-06 | Every document is re-based on one fact sheet at 1.2.1, with a gate that fails on a stale statement; this page and the proposals directory come from it |

## The reviews

Each review is a private working document of the maintainer's; the summaries below are the record
here.

| Review | Date | What it found | Outcome |
|---|---|---|---|
| First | 2026-10-04 | The design sound and four headline promises false: privacy enforced by shape, a reader in any language needing nothing else, a strict superset of Claude Code's plugin format, and the Index computed from the closed signal vocabulary; also path forms the SPEC refuses accepted by the schema, no narrowing or signature vectors, and an additive guard blind to a tightened pattern | Ten improvements; five taken in 1.1.0 (DR-182) |
| Second | 2026-10-05 | At `main` e91afb0: the published package unable to run its own test, the lease vocabulary under-specified, the decision side of the lease unspecified, and the repository short of the practices an implementing organisation looks for first | Fourteen improvements, all taken in 1.2.0 (DR-183) |
| Third | 2026-10-06 | At 1.2.1: further keywords the lock does not record, pattern semantics that differ between regular-expression engines, and statements in the documents to make precise | Twenty-four findings, none pre-empted by the 1.2.1 fact sheet; parked for batch three (Linear COGDEV-271) |
| Fourth | 2026-10-06 | Twenty-two statements the artefacts contradicted, a font licence naming the wrong copyright holder, the reference implementation signing different bytes from the ones the contract verifies, a lease journal any governed agent can append a revocation to, and attestations re-signed without verification | Six recommendations, all taken in batch three (DR-187); the statements and the licence corrected first |
