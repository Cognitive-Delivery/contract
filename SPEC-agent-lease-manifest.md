# The Agent Lease Manifest

**Version 1.0 · Schema set 1.0 · 2026-09-19**

A portable way for a software agent to declare what it needs, for a host to answer with a signed
grant that is never wider than what it was given, and for both halves to be recorded so a third
party can check afterwards who acted under whose authority.

**Status.** Implemented and in production use in one harness. Published as a candidate for
discussion, not as an adopted standard. Nothing here has been submitted to a standards body. The
schemas and conformance corpus this document specifies are at
`github.com/Cognitive-Delivery/contract` under Apache-2.0, and on npm as
`@cognitive-delivery/contract`.

---

## 1. Why this exists

An agent that can call tools, write files and reach the network has, in practice, the authority of
whoever started it. Sandboxing addresses what it can *do*; several vendors ship good sandboxes.
What is missing is a record of what it was *permitted* to do, issued before it ran, narrowed as it
delegates, and checkable afterwards by someone who was not there.

The gap is not containment. It is identity and authority: a document that says *this agent, for
this purpose, may use these tools, read these paths, reach these hosts, spend this much* — signed,
chained to its parent, and recorded whether it was granted or refused.

Prior art covers adjacent halves. SPIFFE gives workloads a verifiable identity but says nothing
about what that workload may do. Google's A2A Agent Card describes what an agent *can* do, not what
it *may* do. in-toto attests to what produced an artefact, after the fact. MCP standardises the tool
surface without governing access to it. This document is the authority half, and is designed to sit
beside those rather than replace any of them.

## 2. Conventions

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD
NOT**, **RECOMMENDED**, **MAY** and **OPTIONAL** are to be interpreted as described in RFC 2119 and
RFC 8174, and only when they appear in capitals.

**Roles.**

- **Agent** — the software whose authority is in question.
- **Issuer** — the party that evaluates a manifest and issues or refuses a lease. Called the *kernel*
  in the reference implementation.
- **Presenter** — whoever hands the issuer a manifest. Often the agent; often a bridge or harness on
  its behalf.
- **Parent** — the lease a manifest is presented under, when there is one.

## 3. The model

Authority is a **two-part record with one shape**.

1. The presenter produces an **Agent Lease Manifest**: what the agent declares it needs.
2. The issuer **narrows** that declaration against the parent lease, or against the deployment's root
   policy when there is no parent, and returns an **Agent Lease** whose `manifest` is the *granted*
   half.

Declared and granted have the same schema deliberately, so the difference between what was asked for
and what was allowed is a plain structural comparison rather than a bespoke diff format.

```
presenter ──manifest(declared)──▶ issuer ──narrow──▶ lease{ manifest(granted), declared_hash, signature }
                                     │
                                     └── refusal, recorded
```

**The governing rule.** No manifest, no lease. No lease, no dispatch.

## 4. The manifest

An Agent Lease Manifest is a JSON object conforming to `schemas/agent-lease-manifest.schema.json`.

### 4.1 Required structure

An implementation **MUST** reject a manifest that does not carry all of: `schema_version`, `agent`,
`intent`, `allow`, `deny`, `budget` and `approvals`. `approvals` **MAY** be empty but **MUST** be
present; an absent list and an empty list mean different things and **MUST NOT** be conflated.

`schema_version` **MUST** be a version this specification defines. An implementation that does not
recognise the value **MUST** refuse the manifest rather than interpret it.

### 4.2 Identity

`agent.kind` **MUST** be one of `native`, `delegated-cli`, `plugin`, `external`. It states how the
agent is run, not who wrote it.

`agent.runtime_agent` **MUST** be drawn from the closed runtime vocabulary. `unknown` is a
first-class value meaning the issuer looked and could not tell, which is a more honest statement than
a guess — but it is not universally acceptable:

- For `kind` of `external` or `plugin`, `unknown` **MUST** be accepted. The issuer genuinely may not
  be able to identify what is presenting over a bridge.
- For `kind` of `native` or `delegated-cli`, `unknown` **MUST** be refused. The issuer is running the
  agent itself and therefore knows what it is; `unknown` there is a gap in the presenter, not a fact
  about the world.

`agent.model`, when present, **MUST** carry `vendor` and `family`. It **MUST NOT** carry a prompt, a
key, or any credential. An implementation **MUST NOT** place model input or output in a manifest.

### 4.3 Intent

`intent.purpose` **MUST** be present and non-empty. A manifest without a stated purpose **MUST** be
refused.

`purpose` is recorded in an audit trail, so it **MUST NOT** contain prompt text, file content, or
personal data. It is one sentence of intent, not a transcript.

### 4.4 Scope

`allow` **MUST** carry all five lists — `tools`, `read_paths`, `write_paths`, `hosts`, `commands` —
each of which **MAY** be empty.

`deny` **MUST** carry `commands`, `paths` and `hosts`, each of which **MAY** be empty.

Paths **MUST** be workspace-relative POSIX globs. An implementation **MUST** reject any path that is
absolute or contains a `..` segment, and **MUST** re-check the resolved path against the workspace
root rather than relying on the pattern alone. Rejecting the pattern is not sufficient: a symbolic
link can carry a conforming relative path outside the root, so the check **MUST** be performed on the
resolved path at use time.

Hosts are hostnames, optionally with a single leading wildcard label. `*.example.com` **MUST** match
`api.example.com` and **MUST NOT** match `example.com`; matching a bare parent domain requires
listing it.

### 4.5 Budget

Every field of `budget` is **OPTIONAL** and **MUST** be non-negative when present.

An absent field means **the parent's remaining ceiling applies** — it is not a request for more. A
child that declares nothing inherits its parent's remainder and **MUST NOT** thereby exceed it. Only
at the root, where no parent ceiling exists and the deployment's root policy sets none either, does
an absent field mean unbounded. An implementation **MUST NOT** treat an absent child budget as
unbounded.

`depth` is how many further generations of lease may be issued beneath this one. `fan_out` is how
many children may be live at once.

### 4.6 Attestation

`attestation` is **OPTIONAL**, because an agent presenting its own manifest may have nothing to sign
with. When present, `issuer` **MUST** name which party produced the declaration.

`key_fingerprint`, when present, **MUST** identify the key without revealing it. An implementation
**MUST NOT** place key material in a manifest or a lease.

## 5. Narrowing

This is the heart of the specification. An issuer **MUST** compute the granted manifest from the
declared manifest and the parent's granted manifest by the following algebra, and **MUST NOT**
produce a grant by any other means.

| Field | Rule |
|---|---|
| `allow.tools` | Intersection with the parent's, by **exact name** |
| `allow.commands` | Intersection with the parent's, by **exact executable name** |
| `allow.read_paths`, `allow.write_paths` | A declared glob is kept only when some parent glob **contains** it (§5.1) |
| `allow.hosts` | A declared host is kept only when some parent host **contains** it |
| `deny.*` | **Union** with the parent's. A child can never shed a parent's refusal |
| `approvals` | **Union** with the parent's |
| `budget.*` | `min(declared, parent remaining)` when declared, else the parent's remaining. An absent ceiling at the root means unbounded |
| `budget.depth` | `parent.depth − 1`, further clamped by any declared value |
| `budget.fan_out` | Bounded by the parent's **remaining** fan-out, with live children already subtracted |
| `attestation` | Preserved as declared. The issuer does not rewrite who vouched for the declaration |

Note the asymmetry: tools and commands intersect by exact name, while paths and hosts intersect by
**containment**. A child declaring `src/**` under a parent granted `**` keeps `src/**`; exact
intersection would have dropped it, which would make delegation useless.

### 5.1 Path and host containment

Containment is deliberately conservative. An implementation **MUST** implement at least these cases
and **MUST** treat anything else as not contained:

| Parent | Contains |
|---|---|
| `**` | every workspace-relative path or glob |
| `dir/**` | `dir`, `dir/anything`, `dir/sub/**`, `dir/*.ts` — anything whose leading segments are `dir/` |
| a literal path, no glob | only the identical path |
| any other glob | only the identical glob |

That last row has a consequence implementers find surprising and **MUST** honour: a parent granted
`src/*.ts` does **not** contain a child declaring `src/a.ts`. The child must declare the same glob.
Being conservative here fails closed; being clever here fails open.

For hosts, `*` contains everything and `*.example.com` contains `api.example.com`, per §4.4.

Consequences an implementation **MUST** preserve:

- A child **MUST NOT** hold any capability its parent lacks.
- A child **MUST NOT** shed a denial its parent carries. `deny` beats `allow` at every level.
- A manifest presented with no parent **MUST** be narrowed against the deployment's root policy. An
  implementation **MUST NOT** treat the absence of a parent as the absence of a ceiling.
- Where `depth` reaches zero, the issuer **MUST** refuse to issue further children.

### 5.2 Refusal

An issuer **MUST** refuse, rather than issue a lease, in each of these cases:

1. `intent.purpose` is absent or empty.
2. Narrowing leaves `allow.tools` empty. A lease that opens nothing is indistinguishable in later
   evidence from a lease that was never used, and those are different facts.
3. Any declared `allow` path escapes the workspace — absolute, `~`-rooted, or containing `..`. The
   escaping path **MUST** refuse the whole manifest rather than being silently dropped from it.
   Dropping it would grant a narrower lease than was asked for without saying so.
4. `agent.runtime_agent` is `unknown` for a `native` or `delegated-cli` agent (§4.2).
5. The parent's `depth` is already zero.
6. The parent's remaining `fan_out` is zero.

Every refusal **MUST** be recorded with the same weight as a grant. An implementation that records
grants but discards refusals does not conform: "the agent was not permitted to do that" is a fact,
not the absence of one.

## 6. The lease

An Agent Lease is a JSON object conforming to `schemas/agent-lease.schema.json`. It **MUST** carry
`schema_version`, `lease_id`, `manifest`, `declared_hash`, `issued_at`, `expires_at`,
`issuer_session_id`, `key_fingerprint` and `signature`.

`lease_id` **MUST** be the only key that opens anything. An implementation **MUST NOT** grant access
on the basis of any other property of the agent — not its name, not its process id, not its runtime.

`manifest` **MUST** be the *granted* manifest. `declared_hash` **MUST** be the SHA-256 of the
canonical bytes of the manifest as *declared*, so that the narrowing diff can be reconstructed from
the pair without storing the declaration twice.

`expires_at` **MUST** be honoured. After that instant the lease **MUST** open nothing, whatever its
recorded status.

## 7. Canonical bytes

Normative, and the part on which interoperability depends. `declared_hash` and every signature are
computed over **canonical bytes**, defined as follows.

A value is serialised to UTF-8 with no insignificant whitespace, by these rules:

1. `null` serialises as `null`.
2. A boolean serialises as `true` or `false`.
3. A string serialises as a JSON string per RFC 8259, escaped **exactly** as follows, because RFC
   8259 permits several escapings of the same string and a hash cannot tolerate a choice:
   - `"` becomes `\"` and `\` becomes `\\`;
   - U+0008, U+0009, U+000A, U+000C and U+000D become `\b`, `\t`, `\n`, `\f` and `\r`;
   - any other character in U+0000–U+001F becomes `\u` followed by four **lower-case** hexadecimal
     digits;
   - an unpaired surrogate becomes `\u` followed by four lower-case hexadecimal digits;
   - **every other character is emitted literally as UTF-8**, including U+007F and every character
     above U+007F. An implementation **MUST NOT** escape a character this list does not name.

   These are the escaping rules of [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) (JSON
   Canonicalization Scheme) §3.2.2.2 and of ECMA-262 `JSON.stringify`, so an implementation on a
   JavaScript runtime gets them for free and one elsewhere has a second specification to check
   against.
4. A number **MUST** be finite. A non-finite number **MUST** cause serialisation to fail rather than
   produce a placeholder. Finite numbers serialise in the shortest round-tripping form defined by
   ECMA-262 `Number::toString`.
5. An array serialises as `[`, its elements in order separated by `,`, then `]`. Element order is
   significant and **MUST** be preserved.
6. An object serialises as `{`, then each retained member as its key (a JSON string) followed by `:`
   and its serialised value, separated by `,`, then `}`. Members whose value is absent **MUST** be
   omitted entirely, not serialised as `null`. **Members MUST be ordered by their key, ascending, by
   UTF-16 code unit.**

Key ordering is by UTF-16 code unit rather than by Unicode code point, which differ for characters
outside the Basic Multilingual Plane. Implementations **SHOULD** restrict member names to ASCII,
where the two orderings coincide and the question does not arise.

`signature` **MUST** be computed over the canonical bytes of every field of the object *except*
`signature` itself. Signatures are lower-case hexadecimal.

The reference implementation uses HMAC-SHA256 with a per-deployment key. This specification does
**not** require a particular algorithm, but an implementation **MUST** state which it uses, and
**MUST NOT** accept a lease whose algorithm it cannot verify.

> **Known limitation.** A symmetric signature proves the lease was issued by a holder of the key,
> which is the issuer itself. It does not let a third party verify a lease without being given that
> key. An asymmetric scheme, with the public half published, is the obvious improvement and is not
> yet implemented. Any claim of third-party verifiability should be read against this paragraph.

### 7.1 Test vectors

Everything above is executable. `conformance/canonical-vectors.json` carries nine vectors — member
ordering, recursion, absent versus null, empty containers, the escape set, the literal set,
unpaired surrogates, number forms, and UTF-16 versus code-point key order — each with its expected
byte string and the SHA-256 of those bytes, plus two cases that **MUST** fail to serialise. An
implementation runs them by supplying a `canonicalise(value) => string` to `conformance/runner.mjs`;
one that does not offer it is reported as unchecked rather than as passing. The file is written in
pure ASCII, with every character above U+007E escaped, so nothing in it depends on an editor or a
transfer preserving bytes it might not.

An implementation that issues, signs or hashes an artefact is **not conformant** without passing
these. Schema agreement is not interoperability: two implementations can accept and reject exactly
the same artefacts and still be unable to verify a single one of each other's signatures.

## 8. Threat model

What this specification defends against, and what it does not.

| Threat | Treatment |
|---|---|
| An agent acting beyond what it was granted | The lease id is the only key; the gate refuses anything outside the granted manifest |
| A subagent acquiring authority its parent lacked | Structural: intersection on allow, union on deny, clamped budgets. Not a review step |
| Authority widening silently over a long delegation chain | `depth` and `fan_out` bound the chain; both decrement |
| A grant edited after issue | The signature covers every field but itself |
| A declaration swapped for a narrower one to hide what was asked for | `declared_hash` commits to the declaration |
| A refusal quietly dropped from the record | Refusals are required to be recorded with the weight of grants |
| Path escape via `..` or an absolute path | Rejected in the schema **and** re-checked on the resolved path |
| Path escape via a symbolic link | Not caught by the pattern; the resolved-path check at use time is the control |
| Credentials leaking through the record | Manifests and leases **MUST NOT** carry keys, prompts or content |

**Explicitly not defended against.**

- **A compromised issuer.** Everything here assumes the issuer is honest. An issuer that signs a
  lease it should have refused produces a perfectly valid record of an illegitimate grant.
- **What the agent does with what it was granted.** A lease says an agent may write `src/**`. It says
  nothing about whether the change was a good one.
- **Anything outside the issuer's dispatch.** A process a person starts by hand is not governed by a
  document it never presented.
- **Third-party verification**, while signatures are symmetric. See §7.

## 9. Conformance

An implementation claiming conformance with schema set 1.0 **MUST**:

1. Validate every manifest and lease against the published schemas, and refuse what does not validate.
2. Implement the narrowing algebra of §5 exactly, including refusal of an empty grant.
3. Record every issue, narrowing and refusal.
4. Produce canonical bytes per §7 such that its `declared_hash` for a given declaration matches the
   value another conforming implementation produces, and pass every vector in
   `conformance/canonical-vectors.json` (§7.1). An implementation that only *reads* artefacts and
   never issues, signs or hashes one is exempt from this clause and **MUST** say so when it claims
   conformance, because the runner reports it as unchecked rather than as passed.
5. Pass the published conformance corpus: accept every fixture under `fixtures/valid/` and reject
   every fixture under `fixtures/invalid/`, each of which carries a `.reason` file stating what the
   rejection is for.
6. State which signature algorithm it uses.

An implementation **SHOULD** publish the result of running the corpus, so that the claim is evidence
rather than assertion.

The corpus is the conformance test. A schema alone is not: two implementations can both validate
against the same schema and still disagree about what they refuse, which is the disagreement that
matters.

**Schema agreement is not interoperability.** Two implementations can accept and reject exactly the
same artefacts and still produce different bytes for the same declaration, and therefore be unable
to verify a single one of each other's signatures. §7.1 is the half of the corpus that catches this,
and it is the half an implementation is most likely to skip, because everything looks correct
until somebody else's hash arrives.

**The corpus tests schema validity, not issuance.** These are different questions and an implementer
**MUST NOT** conflate them. A fixture under `fixtures/valid/` is a well-formed manifest; it is not a
manifest that must be granted a lease. `agent-lease-manifest.minimal.json` is the clearest case: it
validates, and an issuer **MUST** refuse it, because it declares `kind: "native"` with
`runtime_agent: "unknown"` (§4.2) and because narrowing leaves `allow.tools` empty (§5.2). Both
statements are true at once.

Conformance therefore has three halves, which is one more than the phrase allows and exactly the
point: validate as the schemas say, canonicalise as §7 says, and issue or refuse as §4 and §5 say.
The corpus checks the first two. The third is checked by the implementation's own tests, and a
claim of conformance **SHOULD** say where those are.

## 10. Compatibility

Within a major version, changes are **additive only**: new optional fields **MAY** be added, and new
members **MAY** be added to an open vocabulary. Renaming, removing, narrowing or redefining a field
requires a major version and a documented migration.

`schemas.lock.json` records the shape of every schema, and `check-additive.mjs` enforces the promise
in CI against a baseline. The promise is mechanically checked, not merely stated.

Two vocabularies are deliberately **closed** — `agent.kind` and `agent.runtime_agent` — because a
value nobody recognises is worse than an explicit `unknown`. Adding a member to a closed vocabulary
is an additive change; removing or redefining one is not.

## 11. Relationship to other work

| Work | Relationship |
|---|---|
| **SPIFFE / SPIFFE ID** | Complementary. SPIFFE answers *who this workload is*; this answers *what it may do*. A SPIFFE ID would be a reasonable value for an identity field in a future version |
| **A2A Agent Card** | Complementary. The card describes capability; this describes permission. A card says an agent *can* read files; a lease says *which* |
| **in-toto** | Complementary and already used alongside. in-toto attests to what produced an artefact; a lease says under what authority. The reference implementation anchors lease-journal digests into an in-toto bundle |
| **MCP** | Complementary. MCP standardises the tool surface; this governs access to it. `allow.tools` names tools an MCP server may expose |
| **OWASP agentic risks** | This addresses excessive agency, tool misuse and control hijacking. It does not address prompt injection, memory poisoning or model-level risks |
| **NIST agent identity and authorisation work** | This is offered as a running implementation to test ideas against |

## 12. Deliberately out of scope

- **Runtime enforcement.** This specifies the document and the algebra. How a host enforces a grant —
  a sandbox, a proxy, a supervisor — is an implementation concern, and a good implementation is not
  made conformant by this document alone.
- **Transport.** How a manifest reaches an issuer is unspecified.
- **Discovery.** How an agent learns what to ask for is unspecified.
- **Revocation propagation.** The reference implementation kills a lease's process group; this
  document does not require a particular mechanism.
- **Delivery-time provenance.** The reference implementation links a runtime lease back to an approved
  requirement. That is valuable and is not part of this specification.

## 13. Changes

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-09-19 | First published specification of schema set 1.0. Canonical bytes (§7) specified normatively for the first time — the schemas had referred to "canonical bytes" in six descriptions without defining them anywhere — down to the closed escape set and UTF-16 key ordering, with executable test vectors at §7.1 |
