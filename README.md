# The Cognitive Delivery governance contract

The artefact shapes any Cognitive Delivery implementation must read and write identically, plus
a conformance corpus that proves it does.

Version **1.0.1**, versioned independently of any product that implements it.

## Why this exists

Two products will read and write `.cdf/` artefacts in the same customer repository, and both
contribute to one Cognitive Delivery Index. If they record governance differently, the Index
stops being an index and becomes two unrelated numbers.

A TypeScript interface is a definition only while every consumer is the same codebase. This is
the definition when they are not.

**The corpus is the portable artefact. The runner is a reference implementation.** A product
written in another language reuses `fixtures/` unchanged and writes its own runner.

## What is in the contract

| Schema | Covers |
|---|---|
| `provenance` | What produced a governed artefact |
| `audit-event` | One line of the append-only governance journal |
| `cdi-signal` | One line of the Index signal log |
| `cdi-assessment` | A recorded human assessment against the six dimensions |
| `config-core` | The part of `.cdf/config.yaml` every implementation must understand |
| `agent-lease-manifest` | What an agent declares it needs before the harness lets it run. Specified normatively in [SPEC-agent-lease-manifest.md](SPEC-agent-lease-manifest.md) |
| `agent-lease` | The signed grant the kernel answers with; the only key that opens anything |
| `plugin-manifest` | A plugin's `plugin.json`: every Claude Code key, plus the additive `cdf` block |
| `plugin-marketplace` | A marketplace's `marketplace.json`: every Claude Code key and all seven source forms, plus a per-entry declared digest |

## What is deliberately not in it

- **Lifecycle phases.** `phase` is an **open string** everywhere it appears. The phase
  vocabulary belongs to the domain: software delivery has requirements, design, tasks and
  implementation, and another domain will not. A reader must tolerate an unrecognised phase —
  not throw, not coerce it to a known value, not drop it.
- **Product-specific config.** Deployment assurance, security centre and template settings are
  one product's business. `additionalProperties` is `true` at the config root so a product
  carries its own sections without failing the shared contract.
- **Implementation.** This is data and generated types. There is no logic here and no
  dependency on any product.

## A superset is a compatibility promise, not a courtesy

`plugin-manifest` and `plugin-marketplace` are strict supersets of Claude Code's two formats.
Every key Claude Code defines is honoured with the same meaning, so a plugin written for Claude
Code validates here unchanged, and a plugin written for CDF remains a valid Claude Code plugin.
The only addition is an optional `cdf` block.

Two consequences follow, and both are deliberate:

- **All seven source forms are declared, including three the harness cannot fetch.** `npm`,
  `archive` and `command` validate and are *reported* as an unsupported source form. A reader
  that threw on them would refuse an entire marketplace over one entry nobody asked to install.
- **`name` is the only required key in a manifest.** That is Claude Code's rule, and adopting it
  is what makes "validates unchanged" true rather than nearly true.

## Two closed vocabularies, and why

Almost everything here is open. Two things are not:

- **`cdi-signal.event_type`** is a closed enum of 127 values. The Index is computed from this
  vocabulary, so a product adding a value changes what the Index measures. That should be a
  contract change, and this makes it one. Governed by ADR-013.
- **The six CDI dimension ids.** They are the instrument.

By contrast `audit-event.event_type` is **open**: the journal records what happened, and a
product may record its own kinds of event without changing what anything measures.

## Sealing is part of the contract

`config-core.sealed` lists fields an upper layer has fixed. An implementation that ignores it
fails conformance. A lower layer may match a sealed value or make it stricter, never looser.
Ignoring this would let a workspace quietly undo a control its organisation set.

## Compatibility, within 1.x

**Additive only.** New optional fields are allowed.

Renaming a field, removing a field, narrowing a type, or changing the meaning of an existing
field requires **2.0.0** and a documented migration. Customers have these files in their
repositories and older readers will still be reading them.

This is not a promise in a README. `schemas.lock.json` holds a normalised digest of required
fields and property types, and a check fails the build when the rule is broken without a major
version change.

The comparison is against the shape *before* the change, not against the lock sitting beside the
schemas: a lock regenerated in the same commit agrees with whatever broke it. On a pull request
the baseline is the branch being merged into; on a push it is the previous commit.

Every artefact carries `schema_version`. One without it is read as `1.0.0`.

## Installing

```
npm install @cognitive-delivery/contract
```

Releases are published from CI through npm trusted publishing, so each one carries a provenance
attestation linking the package on the registry to the commit and the workflow that built it.
A contract that asks other people to record what produced an artefact should be able to show
what produced its own.

You can also use it straight from this repository, as a submodule or a clone pinned to a tag.
`schemas/` and `fixtures/` are plain files and an implementation in another language needs
nothing else.

## A worked example

A child agent asks for less than its parent holds, and gets less again than it asked for.

The **parent** lease grants a broad scope:

```json
{ "allow": { "tools": ["cdf_read_steering", "cdf_write_artefact"],
             "read_paths": ["**"], "write_paths": ["src/**"],
             "hosts": ["*.anthropic.com"], "commands": [] },
  "deny":  { "commands": ["sudo"], "paths": [".cdf/runtime/**"], "hosts": [] },
  "budget": { "tokens": 200000, "depth": 2, "fan_out": 4 } }
```

A **worker declares** what it wants — note it asks for one tool the parent does not hold, a host the
parent does not allow, and more tokens than remain:

```json
{ "schema_version": "1.0",
  "agent":  { "name": "implementer", "kind": "delegated-cli", "runtime_agent": "claude-code" },
  "intent": { "purpose": "Implement task 1.1 within its file scope.", "spec_slug": "phase-9", "task_id": "1.1" },
  "allow":  { "tools": ["cdf_write_artefact", "cdf_break_glass_advance"],
              "read_paths": ["src/**"], "write_paths": ["src/projects/**"],
              "hosts": ["api.anthropic.com", "example.com"], "commands": [] },
  "deny":   { "commands": [], "paths": [], "hosts": [] },
  "budget": { "tokens": 500000 },
  "approvals": [] }
```

The issuer **grants**:

```json
{ "allow": { "tools": ["cdf_write_artefact"],
             "read_paths": ["src/**"], "write_paths": ["src/projects/**"],
             "hosts": ["api.anthropic.com"], "commands": [] },
  "deny":  { "commands": ["sudo"], "paths": [".cdf/runtime/**"], "hosts": [] },
  "budget": { "tokens": 200000, "depth": 1, "fan_out": 4 } }
```

Reading the difference:

- `cdf_break_glass_advance` is **gone** — tools intersect by exact name, and the parent never held it.
- `example.com` is **gone** — the parent's `*.anthropic.com` does not contain it.
- `api.anthropic.com` **survives** — the parent's wildcard contains it.
- `src/projects/**` **survives** — the parent's `src/**` contains it, so containment keeps a genuine
  narrowing rather than dropping it as an exact-match miss would.
- `tokens` is **clamped** to what the parent had left, not what the child asked for.
- `depth` is **decremented**: this worker may issue one further generation, not two.
- The parent's `deny` entries are **inherited** although the child declared none. A child cannot shed
  a refusal.

Nothing about the child's identity opens anything. The lease id does.

The full rules, including the six conditions that require a refusal, are in
[SPEC-agent-lease-manifest.md](SPEC-agent-lease-manifest.md).

## Running the checks

```
npm ci
npm test                 # the corpus, against the reference adapter
npm run check:additive   # the lock is current, and this change is additive
```

Both run in CI on every push and pull request, against Node 20 and 22. The point of a corpus is
that a third party can check the claim, so the check has to be runnable by someone who has never
seen the product.

### Canonical bytes

`npm test` also runs the canonicalisation vectors, and this is the part worth reading before
you write an implementation in another language.

Every hash in this contract — `declared_hash`, every signature, the ledger chain — is taken over
**canonical bytes**. Schema agreement is not interoperability: two implementations can accept and
reject exactly the same artefacts and still produce different bytes for the same declaration, and
therefore be unable to verify a single one of each other's signatures. Everything looks correct
right up until somebody else's hash arrives.

`conformance/canonical-vectors.json` holds nine vectors with their expected byte strings and
SHA-256 digests, plus two values that must *fail* to serialise. Supply a `canonicalise(value)`
on your adapter and the runner checks them; omit it and the run reports **NOT CHECKED** rather
than passing quietly. The rules themselves are section 7 of
[SPEC-agent-lease-manifest.md](SPEC-agent-lease-manifest.md) — the escape set is closed, keys sort
by UTF-16 code unit, and an absent member is omitted rather than nulled.

## Privacy properties that must not be lost

These are not stylistic. Audit and Index evidence is append-only and retained indefinitely, so
anything that reaches it is effectively permanent.

- Prompts are **never** recorded. `prompt_hash` and `request_hash` are SHA-256.
- `workspace_id` is a hash of the git remote URL, not a person identifier.
- The actor records a **kind** — human, agent or system — and the model. Never a name, email or
  git identity.
- `details` is sanitised before write: keys matching token, secret, password, authorization,
  prompt, content, file or path are dropped. Renaming a sensitive field to evade that check
  defeats the control.

## Layout

```
schemas/           the JSON Schemas, one file per shape, each self-contained
fixtures/valid/    minimal and fully populated, per shape
fixtures/invalid/  each beside a .reason file saying why it must be rejected
conformance/       the reference runner; takes an adapter, imports no product
  runner.mjs       the corpus, run against whatever adapter you pass it
  ajv-adapter.mjs  the reference adapter, so the corpus runs here and not only in a product
  canonical-vectors.json  the canonical-bytes vectors of SPEC section 7, in pure ASCII
  run.mjs          `npm test`
schemas.lock.json  the recorded shape, and what the additive-only guard compares against
check-additive.mjs that guard
```

## Licence

**Apache-2.0** — the schemas, the fixtures, the conformance runner, all of it. See `LICENSE`.

Permissive on purpose, and Apache rather than MIT for one reason: the patent grant is what makes
an organisation comfortable implementing a format. A format a third party can write to, and
prove conformance against, is what makes the Index citable rather than merely used.

**The corpus is included deliberately.** Schemas without fixtures let someone claim conformance;
schemas with a corpus let them demonstrate it, and let anyone else check the claim.

The implementations remain PolyForm Noncommercial 1.0.0. Reading and writing the format is open;
building a competing governed-delivery product out of this codebase is not.
