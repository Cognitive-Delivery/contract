# Recorded check: signed-bytes timestamps, attestation signatures and budget ceilings (2026-10-05)

Evidence for the allow-list entries of schema set 1.2's one-form rule on `agent-lease.issued_at`
and `expires_at`, the 64-hex `attestation.signature`, and the `budget.depth` and `budget.fan_out`
ceilings (SPEC §4.5, §4.6, §6; CDF spec `contract-batch-two-implement-all` task 2.2, DR-183).
Values only; no journal line is copied here.

## What was checked

- The reference deployment's lease journal (`.cdf/runtime/leases.jsonl`, six records): every
  `issued_at`, `expires_at` and record `at` is UTC with millisecond precision and a `Z` suffix,
  because the reference writer uses `Date.prototype.toISOString()` (`registry.ts`, `nowIso`).
  Every embedded lease validates against the 1.2 `agent-lease` schema: 0 rejected.
- Every lease fixture (`agent-lease.minimal`, `populated`, `root`) and every signature vector
  uses the same form, so no signed fixture's bytes change and every signature still verifies.
- No real lease carries an `attestation.signature`; the one attested manifest carries
  `issuer: bridge` only. The populated fixture's attestation signature is already 64 hex.
- `budget.depth` and `budget.fan_out` across the six real records, the 27 narrowing vectors and
  every fixture: the largest declared `depth` is 5 and the largest `fan_out` is 10; the reference
  root policy is 4 and 8. The ceilings are 16 and 256.
- Rules L1 and L2 against every valid lease fixture and every real lease: no finding.

## Conclusion

No conformant writer has produced a value the 1.2 rules refuse. The refused forms are proved by
`fixtures/invalid/agent-lease.offset-timestamp.json`,
`agent-lease-manifest.attestation-odd-signature.json`, `agent-lease-manifest.depth-above-ceiling.json`
and, for the rules, `fixtures/invalid-by-rule/agent-lease.{Expired,TooEarly,SelfParent}.json`.
