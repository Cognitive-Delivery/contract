# Proposal: `lease-record`, the decision side of the lease

| | |
|---|---|
| **Status** | accepted |
| **Author** | Claude Code for the maintainer. Written after the change landed: DR-184 (task 2.2) found the record GOVERNANCE.md promises missing and filled it from the pull request, the SPEC and the evidence file |
| **Date** | 2026-10-05 |
| **Issue** | the second contract review, 5 October 2026 (DR-183 in the harness repository) |
| **Lands in** | PR #17, `task/3.1-lease-record`, merged 2026-10-05; released in 1.2.0 |

## Summary

A tenth schema, `lease-record`: one line of the lease journal, nine events with what each must
carry, and the declared and granted hashes as the two identities of a decision. SPEC §6.1
specifies it.

## Motivation

The contract specified the manifest and the lease but not the journal the reference implementation
writes (`.cdf/runtime/leases.jsonl`). A second implementation could issue a conformant lease and
record the decision in any shape at all, and a refusal, which SPEC §5.2 says must be recorded with
the same weight as a grant, had no shape to be recorded in. The reference journal held six lines
(three `granted`, three `narrowed`) in a shape nothing checked.

## Design

`schemas/lease-record.schema.json`. Required: `schema_version`, `at`, `event`, `lease_id`. `event`
is one of `granted`, `refused`, `narrowed`, `heartbeat`, `attached`, `revoked`, `stopped`,
`completed`, `expired`; an `allOf` of `if`/`then` clauses makes each event's fields required
(`refused`: `reasons` and `declared_hash`; `granted`: `lease`; `narrowed`, `revoked` and `stopped`:
`reason`; `revoked`: `by`; `attached`: `containment` and `platform`). `declared_hash` and
`granted_hash` are SHA-256 over the canonical bytes of the declared and the granted manifest. `by` is
an ancestor `lease_id` or `issuer`; rule L3 (`conformance/lease-rules.mjs`) refuses any other when
the journal is given. The manifest and lease schemas are inlined and held identical to their sources
by `conformance/inlined-copies.mjs`. The reason codes a `refused` line carries are a separate
proposal, `2026-10-05-refusal-reason-codes.md`.

## Backward compatibility

Additive: a new schema. `granted_hash` is optional because the six 1.1 `granted` lines carry none;
SPEC §6.1 lets a reader compute it from `lease.manifest`. Every field is `stability: stable`. Lock
format 5 records the conditional requirements, so adding one later is `CONDITIONAL_REQUIRED_ADDED`.

## Security

A journal line now carries hashes, codes, a containment verdict and a `by`. `reason` is prose and its
description says never prompt text. Nothing enters a permanent record that the reference journal did
not already hold; what changes is that a refusal and a revocation have a shape a reader can check.

## Alternatives

Leave the journal to each implementation: then a refusal is unrecordable in a comparable shape and
L3 has nothing to apply to. Fold the record into `agent-lease`: a refusal has no lease.

## Decision

Accepted, 2026-10-05, by the maintainer in DR-183 (harness repository). Shipped in 1.2.0:
`schemas/lease-record.schema.json`, SPEC §6.1 and §13, `conformance/lease-rules.mjs` (L3),
`conformance/inlined-copies.mjs`, eleven valid fixtures (`fixtures/valid/lease-record.*`), five
invalid (`attached-without-containment`, `reason-outside-reserved-forms`, `refused-without-reasons`,
`revoked-without-by`, `unknown-event`) and one by rule (`lease-record.RevokedByStranger`). Evidence:
`fixtures/evidence/2026-10-05-lease-record.md`, the reference journal's 6 records validating with 0
rejected; at the harness pin to 1.2.1 (commit 5cd62563, 2026-10-06) 6 lease records, zero rejected,
with the harness writing `granted_hash` on grant.
