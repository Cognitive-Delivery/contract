# The Agent Lease Manifest

**Version 1.1 · Schema set 1.1 · 2026-10-05**

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

`agent.name` is a display label of at most 120 characters (schema set 1.2): the worker role, the
session, the plugin. It is not an identity and **MUST NOT** be a person's name, email address or git
identity, because a lease is recorded in an audit journal that is retained indefinitely.

### 4.3 Intent

`intent.purpose` **MUST** be present and non-empty. A manifest without a stated purpose **MUST** be
refused.

`purpose` is recorded in an audit trail, so it **MUST NOT** contain prompt text, file content, or
personal data. It is one sentence of intent, not a transcript, and the schemas cap it at 500
characters (schema set 1.2): a long purpose is where a prompt would be smuggled.

### 4.4 Scope

`allow` **MUST** carry all five lists — `tools`, `read_paths`, `write_paths`, `hosts`, `commands` —
each of which **MAY** be empty.

`deny` **MUST** carry `commands`, `paths` and `hosts`, each of which **MAY** be empty.

Paths **MUST** be workspace-relative POSIX globs. An implementation **MUST** reject an `allow` path
that has any of these five forms, and the published schemas reject them too:

| Form | Example | Why |
|---|---|---|
| a leading `/` | `/etc/passwd` | absolute |
| any `..` segment | `../x`, `src/../x`, `a/..` | traversal |
| a leading `~` | `~/x`, `~` | home-relative, outside the workspace |
| a drive-letter prefix | `C:/Users/x` | absolute on Windows, invisible to a slash-only check |
| any backslash | `..\x`, `C:\Users\x` | never a separator in a POSIX glob; refused rather than normalised |

The schema expresses the rule as `allOf` of `not`/`pattern` clauses, each in the RFC 9485 I-Regexp
subset, with no lookahead. That is deliberate: Go's `regexp` and every validator built on it reject
lookahead, and a schema set a Go implementation cannot load is not portable whatever its README
says. The contract's CI compiles every pattern under RE2. A `.` segment (`./x`, `src/./x`) and a
percent-encoded sequence (`%2e%2e/x`) are **not** refused by pattern: a glob is not a URL, and the
resolved-path check below is the control for anything a pattern cannot see.

A `deny` path **MAY** be home-relative (`~/.ssh/**`), because refusing to touch a path outside the
workspace is meaningful even though no `allow` could grant it; a leading `/`, any `..` segment and
any backslash are refused in `deny` as well.

An implementation **MUST** also re-check the resolved path against the workspace root at use time
rather than relying on the pattern alone. Rejecting the pattern is not sufficient: a symbolic link
can carry a conforming relative path outside the root.

**Identity of a host, a command and a tool** (schema set 1.2). Two conforming implementations
**MUST NOT** disagree about what an entry names, so each list has one identity rule, enforced by
the schemas as a pattern in the I-Regexp subset:

| List | An entry is | Refused |
|---|---|---|
| `allow.hosts`, `deny.hosts` | a lower-case DNS name of one or more labels, which includes an IPv4 literal and `localhost`; optionally a single leading `*.` label; or the bare `*` | a scheme, a port, a path, whitespace, upper case, a trailing dot, a wildcard anywhere but the first label; more than 253 characters |
| `allow.commands`, `deny.commands` | the basename of the executable: letters, digits, `.`, `_`, `+`, `-`, at most 128 characters | a path separator, whitespace, a shell operator |
| `allow.tools`, `approvals` | an identifier of letters, digits, `_`, `.`, `:`, `/`, `-`, at most 128 characters, so a `cdf_` name and a `<server>/<tool>` pair both fit | `*`, whitespace |

A host entry **MUST** be compared lower-case and **MUST NOT** carry a port: the egress proxy
matches hostnames, and a `host:port` form is reserved for a version in which something enforces
it. IPv4 literals are admitted because a local model provider lives at `127.0.0.1` and a root
policy derives its hosts from provider URLs. `*.example.com` **MUST** match `api.example.com` and
**MUST NOT** match `example.com`; matching a bare parent domain requires listing it. A command's
identity is the basename of the resolved executable, so `/usr/bin/git` and `git status` are
refused: the first would let the same program at another path escape the rule, and the second
authorises an invocation rather than a program. `*` is refused as a tool name because a lease that
names every tool has named none, which §5.2 R2 already refuses from the other side.

`allow.tool_args` (schema set 1.2, **development stability**) is an optional map from tool name to a
JSON Schema the agent proposes for its own calls to that tool. It is a declaration and not a grant:
an issuer **MAY** omit it from the granted manifest and **MUST NOT** treat it as granted authority,
because the reference gate does not yet evaluate argument schemas, and a narrowing rule without an
enforcing gate is a claim the corpus cannot test. The narrowing vector `tool-args-dropped` shows the
reference issuer dropping it. It becomes a rule, with a containment relation between a child's and a
parent's schemas, when a gate enforces it; until then its stability marker says so.

### 4.5 Budget

Every field of `budget` is **OPTIONAL** and **MUST** be non-negative when present.

An absent field means **the parent's remaining ceiling applies** — it is not a request for more. A
child that declares nothing inherits its parent's remainder and **MUST NOT** thereby exceed it. Only
at the root, where no parent ceiling exists and the deployment's root policy sets none either, does
an absent field mean unbounded. An implementation **MUST NOT** treat an absent child budget as
unbounded.

`depth` is how many further generations of lease may be issued beneath this one. `fan_out` is how
many children may be live at once.

`budget.depth` **MUST NOT** exceed 16 and `budget.fan_out` **MUST NOT** exceed 256 (schema set 1.2).
The reference root policy allows 4 and 8; a declaration above the ceiling is refused by the schema
rather than clamped, because it is not a request the narrowing algebra has a meaning for.

### 4.6 Attestation

`attestation` is **OPTIONAL**, because an agent presenting its own manifest may have nothing to sign
with. When present, `issuer` **MUST** name which party produced the declaration.

`key_fingerprint`, when present, **MUST** identify the key without revealing it. An implementation
**MUST NOT** place key material in a manifest or a lease.

When `attestation.signature` is present it **MUST** be 64 lower-case hexadecimal characters (schema
set 1.2): HMAC-SHA256 over the canonical bytes of the manifest, like the lease's own signature.

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

An issuer **MUST** refuse, rather than issue a lease, in each of these cases. Each carries a stable
identifier, R1 to R6, which is what a refusal record and the conformance vectors name.

1. **R1.** `intent.purpose` is absent or empty.
2. **R2.** Narrowing leaves `allow.tools` empty. A lease that opens nothing is indistinguishable in later
   evidence from a lease that was never used, and those are different facts.
3. **R3.** Any declared `allow` path escapes the workspace: a leading `/`, a `..` segment, a leading
   `~`, a drive-letter prefix, or a backslash (§4.4). The escaping path **MUST** refuse the whole manifest
   rather than being silently dropped from it. Dropping it would grant a narrower lease than was
   asked for without saying so.
4. **R4.** `agent.runtime_agent` is `unknown` for a `native` or `delegated-cli` agent (§4.2).
5. **R5.** The parent's `depth` is already zero.
6. **R6.** The parent's remaining `fan_out` is zero.

A refusal record's `reasons` **MUST** be codes in one of three reserved forms (schema set 1.2), so
two implementations compare refusals by code and not by prose: `R<n>` for the conditions above (R7
and above are reserved for this specification to assign; an issuer **MUST NOT** mint one),
`runtime_error:<name>` for a refusal the issuer could not avoid (no signing key, an unknown parent,
a manifest that does not validate), and `vendor:<vendor>:<code>` for anything else. The prose goes
in the record's `reason`.

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

Two rules a schema cannot state (schema set 1.2), checked by the conformance runner and by every
conforming issuer. Each carries a stable identifier, as the refusals of §5.2 do:

1. **L1.** `expires_at` **MUST** be after `issued_at`. Equal is refused: a lease valid for zero
   milliseconds was never valid.
2. **L2.** `parent_lease_id`, when present, **MUST NOT** equal `lease_id`.

`issued_at` and `expires_at` are inside the signed bytes, so they **MUST** be written in one form:
UTC with millisecond precision and a `Z` suffix (`2026-10-05T06:00:00.000Z`). An offset form names
the same instant in different bytes, and two implementations would then disagree about one
signature. The evidence schemas (audit, signal, provenance, assessment) keep their offset-tolerant
form; nothing there is signed.

### 6.1 The record

Every decision about a lease is one line of the lease journal, conforming to
`schemas/lease-record.schema.json` (schema set 1.2). The journal is append-only; a reader folds every
lease's status from its lines and **MUST NOT** rewrite one. Nine events, with what each **MUST**
carry beyond `schema_version`, `at`, `event` and `lease_id`:

| Event | Carries | Meaning |
|---|---|---|
| `granted` | `lease`; a 1.2 writer also `declared` and `granted_hash` | The signed lease. `at` is its `issued_at` |
| `refused` | `reasons` (reserved codes), `declared_hash`; `reason` for the prose | No lease; `lease_id` is a fresh id naming the refusal |
| `narrowed` | `reason` (the narrowing summary) | What the grant took away, beside its `granted` line |
| `heartbeat` | nothing further | Liveness. Never extends `expires_at` |
| `attached` | `containment`, `platform` | How the governor contained the process: `enforced` or `advisory`, never implied |
| `revoked` | `by`, `reason`; optionally `signature` | From this `at` the lease opens nothing |
| `stopped` | `reason` | Closed by an operator |
| `completed` | optionally `usage` | Closed by the agent finishing |
| `expired` | nothing further | `expires_at` passed |

`declared_hash` is the SHA-256 of the canonical bytes of the manifest as declared and
`granted_hash` of the manifest as granted (`lease.manifest`), so a record ties to the exact bytes
decided on both sides. A reader meeting a `granted` record from a 1.1 writer, without
`granted_hash`, **MAY** compute it from `lease.manifest`.

**Revocation.** A `revoked` record **MUST** name `by`: the `lease_id` of an ancestor of the revoked
lease, or `issuer`. From the record's `at` the lease **MUST** open nothing. A reader meeting a `by`
that is neither **MUST** treat the record as invalid; this is rule **L3**, and it needs the journal
to check, so a reader with one record and no journal cannot check it and **MUST NOT** claim to have.

### 6.2 Reading evidence

Every schema in the set carries `schema_version` as `major.minor` (schema set 1.2). A reader
**MUST** compare the major only: within a major every change is additive, so a minor the reader has
not met is a record with fields it may ignore, never one it may refuse.

An audit event's `event_type` is two or more lower-case dotted segments. The reference writer's
first segments are reserved for its vocabulary (`agent`, `architecture`, `artefact`, `audit`,
`break_glass`, `cdi`, `chat`, `codex`, `config`, `decision`, `deploy`, `enforcement`, `evidence`,
`execution`, `fg`, `governance`, `integration`, `lease`, `memory`, `mode`, `phase`, `provenance`,
`report`, `responsible_ai`, `review`, `roadmap`, `security`, `session`, `spec`, `steering`, `task`,
`tool`, `ux`, `work`, `workbench`, `workspace`); any other writer **MUST** use its vendor name as the
first segment, so two writers in one journal cannot collide. An audit event **MAY** carry
`actor.runtime_agent` from the closed vocabulary of §4.2; `actor.runtime` is a label and stays open,
because the real journal carries eleven spellings of it and a reader keys identity on
`runtime_agent`.


## 7. Canonical bytes

Normative, and the part on which interoperability depends. `declared_hash` and every signature are
computed over **canonical bytes**.

**Canonical bytes are the [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) (JSON Canonicalization
Scheme) serialisation of the value, after removing every member whose value is absent.** The
removal is the one step outside RFC 8785, because JSON has no absent value and RFC 8785 therefore
has nothing to say about one; an implementation whose data model has `undefined`, `None` or `nil`
drops those members first and then canonicalises. An implementation **MAY** use any RFC 8785
library for the second step, and the contract's corpus carries RFC 8785's own reference vectors
(`conformance/jcs/`) beside its nine, so a library's conformance is checked rather than assumed.
RFC 8785 presumes I-JSON (RFC 7493): every integer field in the schema set is bounded at
2^53 − 1 so that a number can never canonicalise differently in two correct parsers.

The rules below restate RFC 8785 for the reader who implements by hand, and name the two places
implementations are known to diverge. Where this restatement and RFC 8785 could be read to differ,
RFC 8785 governs.

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

The corpus publishes a **test key** (`conformance/test-key.txt`) and lease fixtures signed with it
(`conformance/signature-vectors.json`), so that `declared_hash` and signature verification can be
checked across implementations rather than asserted. The key is public by design. A verifier
**MUST** refuse any lease signed with it outside a conformance run; the reference implementation
holds its own per-deployment key and refuses every other.

> **Known limitation.** A symmetric signature proves the lease was issued by a holder of the key,
> which is the issuer itself. It does not let a third party verify a lease without being given that
> key. An asymmetric scheme, with the public half published, is the obvious improvement and is not
> yet implemented. Any claim of third-party verifiability should be read against this paragraph.

### 7.1 Test vectors

Everything above is executable. `conformance/jcs/` carries RFC 8785's own six reference vectors
(input and expected bytes, from the specification author's test suite at a pinned commit), and
`conformance/canonical-vectors.json` carries nine vectors — member
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
2. Implement the narrowing algebra of §5 exactly, including refusal of an empty grant, and pass
   every vector in `conformance/narrowing-vectors.json` by supplying `narrow` on its adapter.
3. Record every issue, narrowing and refusal.
4. Produce canonical bytes per §7 such that its `declared_hash` for a given declaration matches the
   value another conforming implementation produces, pass every vector in
   `conformance/canonical-vectors.json` and `conformance/jcs/` (§7.1), and, when it verifies
   signatures, pass `conformance/signature-vectors.json` by supplying `hash` and `verify` on its
   adapter: the fixtures verify under the published test key and stop verifying when one byte of
   the signature or of the granted manifest changes. An implementation that only *reads* artefacts and
   never issues, signs or hashes one is exempt from this clause and **MUST** say so when it claims
   conformance, because the runner reports it as unchecked rather than as passed.
5. Pass the published conformance corpus: accept every fixture under `fixtures/valid/` and reject
   every fixture under `fixtures/invalid/` **at the place its `.expect.json` names**. Each invalid
   fixture carries a `.reason` file stating what the rejection is for and an `.expect.json` naming
   the instance path the rejection must be reported at; an implementation that rejects a fixture
   somewhere else has rejected it for the wrong reason, which is not conformance. The runner checks
   the path when the adapter reports its errors, and says so when it cannot.
6. State which signature algorithm it uses.
7. Apply the lease rules of §6 (L1, L2) and pass every fixture under `fixtures/invalid-by-rule/` by
   supplying `rules(lease)` on its adapter: each such fixture is schema-valid and **MUST** be refused
   at the rule its `.expect.json` names. An implementation that supplies no `rules` is reported as
   unchecked, not as passing.

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
The corpus checks all three. `conformance/narrowing-vectors.json` carries declared-and-parent pairs
with the granted manifest or the refusal codes narrowing **MUST** produce, covering every row of the
§5 table, every containment row of §5.1 and every refusal of §5.2; an implementation runs them by
supplying `narrow(declared, parent)` on its adapter, and one that does not is reported as unchecked
rather than as passing. The vectors were generated from the reference implementation and committed,
so the reference implementation is the oracle and the file is the contract: a second implementation
that disagrees with a vector has found either its own defect or the reference's, and either is a
finding the contract wants.

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

- **Progent** (JSON-Schema argument policies for tool calls, with a narrowing proof): the direction `allow.tool_args` points in once a gate evaluates argument schemas.

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
| 1.2 | 2026-10-05 | §4.4 adds `allow.tool_args`, a per-tool argument-schema declaration with development stability that an issuer MAY omit from the grant and MUST NOT treat as authority; the vector `tool-args-dropped` shows the reference dropping it; §11 cites Progent |
| 1.2 | 2026-10-05 | §6.2 states that `schema_version` is `major.minor` everywhere and compared on the major only; reserves the reference writer's audit `event_type` first segments and gives other writers the vendor-name rule; adds `actor.runtime_agent` to the audit event while `actor.runtime` stays open |
| 1.2 | 2026-10-05 | §6.1 specifies the lease record: nine events with what each carries, `declared_hash` and `granted_hash` as the two identities of a decision, revocation by an ancestor or the issuer (rule L3), and §5.2 the three reserved forms a refusal reason takes |
| 1.2 | 2026-10-05 | §6 states rules L1 (`expires_at` after `issued_at`) and L2 (no self-parent) with stable identifiers and one timestamp form inside the signed bytes; §4.5 caps `depth` at 16 and `fan_out` at 256; §4.6 fixes `attestation.signature` at 64 hex; §9 adds the by-rule fixtures and the `rules` adapter hook, reported unchecked when absent |
| 1.2 | 2026-10-05 | §4.4 gives hosts, commands, tools and approvals one identity rule each, enforced by the schemas: hosts are lower-case DNS names (IPv4 literals and `localhost` included) with at most a single leading wildcard label and never a scheme, port or path; commands are executable basenames; tools and approvals are identifiers that are never `*`. §4.2 caps `agent.name` at 120 characters and says it is never a person's name; §4.3 caps `purpose` at 500. Every real lease in the reference deployment still validates |
| 1.1 | 2026-10-05 | §7 publishes a test key and signed fixtures so verification is checked across implementations; §9 requires a rejection to be reported at the place each invalid fixture's `.expect.json` names, and extends the round trip to a nested unknown field |
| 1.1 | 2026-10-05 | §5.2 gives the six refusal conditions stable identifiers R1 to R6; §9 adds the narrowing vectors to the corpus, so the third half of conformance is checked by the corpus rather than left to each implementation's own tests |
| 1.1 | 2026-10-05 | §7 states normatively that canonical bytes are RFC 8785 after undefined-removal, so existing JCS libraries and RFC 8785's own test vectors (now in the corpus) apply; the field-by-field rules become an informative restatement. Every integer field is bounded at 2^53 − 1 for I-JSON. No byte of any existing hash changes: the restatement was already RFC 8785, which is the point of saying so |
| 1.1 | 2026-10-05 | §4.4 names the five refused `allow` path forms (adding a leading `~`, a drive-letter prefix and any backslash to the absolute and `..` forms) and permits a home-relative `deny` path; the schemas express the rule without lookahead so RE2 validators can load it. The reference implementation already refused all five; the schema and the text now agree with it |
| 1.0 | 2026-09-19 | First published specification of schema set 1.0. Canonical bytes (§7) specified normatively for the first time — the schemas had referred to "canonical bytes" in six descriptions without defining them anywhere — down to the closed escape set and UTF-16 key ordering, with executable test vectors at §7.1 |
