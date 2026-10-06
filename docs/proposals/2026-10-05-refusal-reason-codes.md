# Proposal: reserved reason codes for a refusal

| | |
|---|---|
| **Status** | accepted |
| **Author** | Claude Code for the maintainer. Written after the change landed (DR-184, task 2.2) |
| **Date** | 2026-10-05 |
| **Issue** | the second contract review, 5 October 2026; DR-183 D5 ("Refusal reasons: prose, or codes") |
| **Lands in** | PR #17, `task/3.1-lease-record`, merged 2026-10-05, with the record it belongs to; released in 1.2.0 |

## Summary

A refusal's `reasons` are codes in three reserved forms, `R<n>`, `runtime_error:<name>` and
`vendor:<vendor>:<code>`, with the prose in `reason`, so two implementations compare refusals by
code and not by prose.

## Motivation

1.1.0 gave the six refusal conditions of SPEC §5.2 the stable identifiers R1 to R6 for the narrowing
vectors, but a refusal record had nowhere to carry one. The reference journal had never written a
`refused` line, and a reader comparing two implementations' refusals would have been comparing
sentences.

## Design

`lease-record` definition `reasonCode`: `anyOf` of `^R[1-9][0-9]?$`,
`^runtime_error:[a-z0-9_]{1,64}$` and `^vendor:[a-z0-9-]{1,32}:[A-Za-z0-9_.-]{1,64}$`. R7 and above
are reserved for the specification to assign; an issuer must not mint one. `runtime_error:` names a
refusal the issuer could not avoid (no signing key, an unknown parent, a manifest that does not
validate); `vendor:` is namespaced by whoever defines it. The prose goes in `reason`. SPEC §5.2.

## Backward compatibility

Additive: a new vocabulary on a new schema; no 1.1 record carried `reasons`. `stability: stable`.

## Security

A code enters the journal where free text would have, and the prose stays in `reason` under the
same hygiene as the rest of the record. Nothing new reaches a permanent record.

## Alternatives

Prose only: incomparable. A closed enum of R1 to R6: leaves an issuer no honest way to record that
it could not find its signing key, which is a fact the journal must hold.

## Decision

Accepted, 2026-10-05 (DR-183 D5). Shipped in 1.2.0: `schemas/lease-record.schema.json`
(`reasonCode`), SPEC §5.2 and §13, valid fixtures `lease-record.refused` and
`lease-record.refused-runtime-error`, invalid fixtures `lease-record.reason-outside-reserved-forms`
and `lease-record.refused-without-reasons`. No `refused` record existed in the reference deployment
on 2026-10-05 (`fixtures/evidence/2026-10-05-lease-record.md`), so the vocabulary refuses nothing
that was written; at its 1.2.1 pin the harness writes `reasons` as reserved codes with a prose
`reason`.
