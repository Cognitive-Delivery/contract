# Proposal: <title>

| | |
|---|---|
| **Status** | draft / accepted / rejected / superseded by `<file>` |
| **Author** | |
| **Date** | YYYY-MM-DD |
| **Issue** | link to the discussion, if there was one |
| **Lands in** | the pull request, once there is one |

One page. A proposal that needs more than a page is two proposals. `GOVERNANCE.md` says which
changes need one: a new schema, a field whose meaning is not obvious from its name, a narrowing
rule or refusal code, a reserved vocabulary, a change to what the corpus checks, and anything that
touches canonical bytes or signatures (which is a major version).

## Summary

What changes, in two sentences.

## Motivation

What cannot be expressed, checked or agreed today. Name the artefact, journal line or
implementation that shows it; the contract changes because of evidence, not because a field
would be nice.

## Design

The shape, rule or check, concretely: a field with its type and constraints; a rule with its
code and the fixture that would refuse it; a vector with the grant or refusal it must produce.
Patterns are RFC 9485 I-Regexp without lookahead, and must read the same under Python's `re`, RE2
and ECMAScript (the corpus runs under six validators).

## Backward compatibility

Answer the additive rule: a new optional field or vocabulary member (additive), a tightening (with
the evidence that no conformant writer ever produced what it refuses, and the allow-list entry
that will name it), or a 2.0 change (with the migration). Say which stability the field carries,
`stable` or `development`, and why.

## Security

What this lets into a permanent record (audit, signals, provenance, the lease journal), or out of
a lease, that could not get there before. "Nothing" is an acceptable answer when it is true and
the reason is given.

## Alternatives

What else was considered and why not, including doing nothing.

## Decision

Filled by the maintainer: accepted, rejected or superseded, with the reason, and the date.
