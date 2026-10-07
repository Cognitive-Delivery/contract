# Proposal: one identity rule each for hosts, commands, tools and approvals

| | |
|---|---|
| **Status** | accepted |
| **Author** | Claude Code for the maintainer. Written after the change landed (DR-184, task 2.2) |
| **Date** | 2026-10-05 |
| **Issue** | the second contract review, 5 October 2026; DR-183 D2 ("Hosts: refuse IP literals, or admit them") |
| **Lands in** | PR #15, `task/2.1-lease-identity`, merged 2026-10-05; released in 1.2.0 |

## Summary

A host, a command, a tool and an approval each get one pattern, enforced by the schemas, with caps
on `agent.name` (120 characters) and `intent.purpose` (500), so two implementations cannot disagree
about what an entry names.

## Motivation

Before 1.2 the schemas stated no identity rule for these lists. `https://api.example.com`,
`API.EXAMPLE.COM`, `api.example.com.` and `api.example.com:443` could all be written, and whether a
parent's `*.example.com` contained each was an implementation's choice; a command could be
`/usr/bin/git` or `git status`, which authorise different things. The reference egress proxy matches
hostnames and the governor compares executable basenames, so the schemas said less than the code did.

## Design

SPEC §4.4: a host is `^(\*|(\*\.)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*)$`
of at most 253 characters, which admits IPv4 literals and `localhost`; a command is
`^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$`; a tool or approval is `^[A-Za-z0-9_][A-Za-z0-9_.:/-]{0,127}$`,
never `*`. Applied to `allow` and `deny`, to the inlined copies in `agent-lease` and `lease-record`,
and to the plugin schemas' `capabilities`. `agent.name` is capped at 120 and described as never a
person's name; `intent.purpose` at 500. Every pattern is an ECMA-262 regular expression without
lookaround or backreferences, applied as an unanchored search, and compiles under RE2 in CI.

## Backward compatibility

A tightening, allow-listed entry by entry with the exact `after` value. Evidence
`fixtures/evidence/2026-10-05-lease-identity.md`: every lease and declared manifest in the reference
journal validates (4 validated, 0 rejected; hosts and commands empty, tools `cdf_` names, longest
name 22 characters, longest purpose 29); the ten built-in providers' hosts and the eight default
deny commands all match. Eighteen invalid fixtures, one valid
(`agent-lease-manifest.identity-forms.json`). `stability: stable`.

## Security

Tighter: a host with a scheme or a port, a command with arguments, a wildcard tool can no longer be
granted by a conformant issuer. Nothing new enters a record.

## Alternatives

DNS names only, refusing IP literals: rejected in DR-183 D2, because two built-in providers sit at
`127.0.0.1` and the root policy derives its hosts from provider URLs. A `host:port` form: a separate
proposal, rejected (`2026-10-05-host-ports.md`).

## Decision

Accepted, 2026-10-05, by the maintainer in DR-183 (D2 for the host rule). Shipped in 1.2.0: SPEC
§4.2 to §4.4 and §13; `schemas/agent-lease-manifest.schema.json`, its inlined copies in
`agent-lease` and `lease-record`, and `capabilities` in `plugin-manifest` and `plugin-marketplace`;
`tooling/inline-granted-manifest.mjs`; the allow-list entries dated 2026-10-05; the fixtures above.
