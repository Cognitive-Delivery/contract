# Proposal: ports in `allow.hosts` (`host:port`)

| | |
|---|---|
| **Status** | rejected |
| **Author** | Claude Code for the maintainer. The proposal came from the harness documentation set of 28 September 2026; recorded here after the decision (DR-184, task 2.2) |
| **Date** | 2026-10-05 |
| **Issue** | DR-183 D2 in the harness repository ("Hosts: refuse IP literals, or admit them"), which decided the host rule and this with it |
| **Lands in** | nothing. The fixture that refuses the form, `fixtures/invalid/agent-lease-manifest.host-port.json`, landed in PR #15 |

## Summary

Admit `host:port` entries so a lease can confine an agent to one port of a host. Rejected for 1.x.

## Motivation

A host entry that names `api.example.com` opens every port on it. The harness documentation set of
28 September 2026 proposed `api.example.com:443` as a narrower grant.

## Design

Not adopted. The host identity rule of SPEC §4.4 refuses a port, and the SPEC reserves the form: a
`host:port` form is reserved for a version in which something enforces it.

## Backward compatibility

Would have been additive to the host pattern, and that is not the ground for refusing it. A field
nothing enforces is a claim the corpus cannot test.

## Security

Admitting the form would let a lease state a confinement no gate applied: a reader would believe a
port was closed that was open. That is the kind of record this contract exists to refuse.

## Alternatives

A separate `host_ports` list: the same objection. Enforce ports in the egress proxy first and admit
the form afterwards: the path the decision leaves open.

## Decision

Rejected for 1.x, 2026-10-05, by the maintainer in DR-183 D2: "No `host_ports` form in 1.x: the
egress proxy matches hostnames, and a field nothing enforces is a claim." SPEC §4.4 carries the
reservation. Evidence that nothing written is refused: the ten built-in providers' hosts carry no
port (`fixtures/evidence/2026-10-05-lease-identity.md`), and the fixture refuses
`api.example.com:443` at `/allow/hosts/0`.
