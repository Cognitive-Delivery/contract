# Proposal: `allow.tool_args` as a declaration at development stability

| | |
|---|---|
| **Status** | accepted |
| **Author** | Claude Code for the maintainer. Written after the change landed (DR-184, task 2.2) |
| **Date** | 2026-10-05 |
| **Issue** | the second contract review, 5 October 2026; DR-183 D6 ("Tool argument schemas: a narrowing rule, or a declaration") |
| **Lands in** | PR #20, `task/6.1-tool-args`, merged 2026-10-05, released in 1.2.0; `capabilities.tool_args` on the plugin schemas in PR #34, released in 1.2.1 |

## Summary

An optional map from tool name to a JSON Schema the agent proposes for its own calls to that tool.
A declaration, not a grant: an issuer may omit it from the granted manifest and must not treat it
as authority. The first field at `stability: development`.

## Motivation

The second review asked for per-tool argument constraints, after Progent's argument-schema policies
(SPEC §11). The reference gate does not evaluate argument schemas, so a narrowing rule for them (a
containment relation between a child's and a parent's schemas) would be a claim the corpus could not
test and no vector could pin.

## Design

`allow.tool_args` on the manifest (SPEC §4.4): an object whose keys are tool names under the tool
identity rule (`propertyNames`) and whose values are objects, not validated as schemas because
draft-07 cannot validate a schema as data without a meta-schema `$ref`. Its `$comment` begins
`stability: development`. Narrowing vector `tool-args-dropped`: the reference issuer drops it from
the grant. Invalid fixtures `agent-lease-manifest.tool-args-bad-key` and `tool-args-not-object`.
1.2.1 adds `capabilities.tool_args` on both plugin schemas so `capabilities` stays the lease `allow`
shape property for property. The marker is a draft-07 `$comment`, not a custom keyword:
Bowtie showed a strict validator in another harness refusing `x-stability` as a custom keyword,
and a schema only this repository can compile is not portable.

## Backward compatibility

Additive: a new optional field. `development` means it may be tightened or removed within 1.x without
an allow-list entry, and becomes a rule, promoted to `stable`, when a gate enforces it (CONTRIBUTING,
"Stability and deprecation").

## Security

Nothing new enters a record or leaves a lease: the field is dropped at grant, so no lease carries
authority it names. The risk the stability marker guards is the opposite one, a reader treating a
declaration as a grant; SPEC §4.4 says MUST NOT.

## Alternatives

A narrowing rule now: untestable without a gate. No field: then the declaration an agent can make has
nowhere to live and a later rule has no history. A custom keyword for stability: rejected, above.

## Decision

Accepted, 2026-10-05 (DR-183 D6). Shipped: SPEC §4.4, §11 and §13; the manifest schema and its
inlined copies; the vector; the two fixtures; `conformance/metaschema.json`, which requires a
stability comment on every declared property (at 1.2.1, 666 `properties` keys carry one: the 651
declared properties the site reference lists and 15 keys inside `if` and `contains` conditions). At its 1.2.1 pin the harness's
`CapabilityLists` excludes `tool_args`: a declaration, never a grant.
