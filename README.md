# The Cognitive Delivery governance contract

The artefact shapes any Cognitive Delivery implementation must read and write identically, plus
a conformance corpus that proves it does.

Version **1.0.0**, versioned independently of any product that implements it.

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
| `agent-lease-manifest` | What an agent declares it needs before the harness lets it run |
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
fields and property types, and a test fails the build when the rule is broken without a major
version change.

Every artefact carries `schema_version`. One without it is read as `1.0.0`.

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
schemas/          the JSON Schemas, one file per shape, each self-contained
fixtures/valid/   minimal and fully populated, per shape
fixtures/invalid/ each beside a .reason file saying why it must be rejected
conformance/      the reference runner; takes an adapter, imports no product
schemas.lock.json the additive-only guard
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

This package is still unpublished. The licence question is settled; publishing is a separate
decision about when the schema set is stable enough to promise 1.x compatibility to strangers.
