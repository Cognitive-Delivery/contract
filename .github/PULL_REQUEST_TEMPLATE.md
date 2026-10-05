<!-- What changes, and why, in a paragraph a stranger to the product can follow. Name the SPEC
     section or schema path. If this lands a proposal, link it. -->

## Checks that are not automated

- [ ] `CHANGELOG.md` has an entry under `[Unreleased]` (or the release section being prepared)
- [ ] `SPEC-agent-lease-manifest.md` §13 has a row, if the SPEC changed
- [ ] `README.md` says what is true after this change (surfaces, claims, the Layout block)
- [ ] Every tightening the guard reports is allow-listed in `compat-allowlist.json` with its `after`
      value and an evidence file (a fixture, or a recorded check under `fixtures/evidence/`)
- [ ] A semantic change has its proposal under `docs/proposals/` (GOVERNANCE.md says which changes)
- [ ] Every commit is signed off (`git commit -s`); the `DCO` check will say

## Proof

<!-- What was seen to fail without the change: a mutation, a fixture rejected at the right path, a
     real-artefact count. "Tests pass" is not proof that a test bites. -->
