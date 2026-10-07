# Conformance report: CDF Harness, the reference implementation

| | |
|---|---|
| **Contract** | 1.2.1, tag v1.2.1 at 3088e44 |
| **Implementation** | CDF Harness, `Cognitive-Delivery/cdf-harness`, branch `harness/v1`, commit 5cd62563 (2026-10-06, "Pin the governance contract to 1.2.1; the lease journal writes the decision record the contract specifies") |
| **Consumed as** | a git submodule at `contract/` (DR-156) |
| **Signature algorithm** | HMAC-SHA256 over the canonical bytes of every lease field but `signature` (SPEC §9, item 6) |
| **Reported by** | the implementation itself, from its own test suite, 2026-10-06 |

SPEC §9 says an implementation should publish the result of running the corpus, so that the claim is
evidence rather than assertion. This is that publication for the reference implementation. It is the
harness's own statement; nobody outside the project has reproduced it, and it says so here rather
than leaving a reader to assume otherwise.

## The adapter

`test/unit/contractConformance.test.ts` imports `runConformance` from the published runner and
supplies seven hooks, each the code that runs in the product rather than a copy written for the
vectors: `validate` (Ajv over the contract's schemas), `roundTrip` (parse and re-emit),
`canonicalise` (`canonicalJson` from `src/ledger/chain`, which `declared_hash`, every signature and
the ledger chain go through), `narrow` (`narrowManifest` from `src/governance/leases/narrow`, its
refusals mapped to R codes), `hash` (`manifestHash`), `verify` (`verifyLeaseSignature`) and `rules`
(`checkLeaseRules` from `src/governance/leases/rules`). It does not expose `lastErrors`, so the
runner does not check rejection paths from that test; the contract's own CI checks them with the
reference Ajv adapter.

## The run

`npx vitest run test/unit/contractConformance.test.ts` at the pin, 2026-10-06:

    contract: 40 valid and 98 invalid fixtures
    ✓ |kernel|  test/unit/contractConformance.test.ts (6 tests)
    ✓ |default| test/unit/contractConformance.test.ts (6 tests)
    Test Files  2 passed (2)
         Tests  12 passed (12)

The first case asserts `report.failures` is empty and `canonicalChecked` is true; with the hooks
above the report also carries `narrowingChecked`, `signaturesChecked` and `rulesChecked` true and
`errorPathsChecked` false. The suite does not print the one-line summary `npm test` prints in the
contract repository. Three further cases prove the runner can fail: a `JSON.stringify`
canonicaliser, a validator that accepts everything and a round trip that drops the unknown field
are each caught. The file runs twice because it is in both vitest projects, `default` and `kernel`;
under `kernel` the `vscode` module is aliased to one that throws on import, so the run also shows
the adapter reaches no editor code.

## Real artefacts

`test/unit/contractRealArtefacts.test.ts` validates the harness's own journals. A zero count fails
for the audit events, CDI signals, provenance records and assessments; an empty or absent lease
journal passes, because a workspace that has never issued a lease has none. At the pin, 2026-10-06: 33,665 audit events, 19,287 CDI signals, 4,588 provenance records,
2 assessments, 6 lease records and 1 config; zero rejected.

## Narrowing vectors

`conformance/narrowing-vectors.json` was generated from this implementation
(`test/unit/contractNarrowingVectors.test.ts` with `CDF_WRITE_NARROWING_VECTORS=1`), and that test
fails when the committed file differs from what the code produces now; it also runs the published
runner with `narrow` supplied by `narrowManifest`. The vectors are this implementation's behaviour,
byte-exact, so a second implementation that disagrees with one has found a defect in one of the two.

## What this report does not show

- The contract's own CI does not check narrowing behaviour: its reference adapter validates only
  and prints `behaviour NOT CHECKED`. The only check of the vectors against running code is the one
  above, in the harness repository.
- Rejection paths are not checked from the harness test (no `lastErrors`); the contract's CI checks
  them with the reference adapter.
- Nothing here was reproduced by a second party. A report from another implementation belongs
  beside this one, in this directory.
