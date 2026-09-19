# Security policy

## Reporting

Report a vulnerability privately to **jason@cognitivedelivery.co.uk**, or through
[GitHub's private advisory form](https://github.com/Cognitive-Delivery/contract/security/advisories/new).

Please do not open a public issue for a security problem. You will get an acknowledgement within
five working days.

## What is in scope

This repository holds JSON Schemas, a fixture corpus and a conformance runner. There is no
service here and nothing that handles a credential, so the interesting failures are ones where
the contract itself permits something it should not:

- **A privacy property the schemas fail to enforce.** Audit and Index evidence is append-only
  and retained indefinitely, so anything that reaches it is effectively permanent. Prompts are
  never recorded; `prompt_hash` and `request_hash` are SHA-256; `workspace_id` is a hash of the
  git remote URL; the actor records a kind and a model, never a name, email or git identity.
  A shape that lets identifying data into a permanent record is a security issue, not a style
  one.
- **A sealing bypass.** `config-core.sealed` lists fields an upper layer has fixed. A lower
  layer may match a sealed value or make it stricter, never looser. A schema that permits
  loosening would let a workspace quietly undo a control its organisation set.
- **A lease escape.** `agent-lease-manifest` and `agent-lease` describe what an agent may reach.
  A shape that would let a manifest declare, or a lease grant, more than the harness intends
  is in scope.
- **A path in the corpus or runner that executes fixture content** rather than reading it as
  data.

## What is not in scope

- A product that implements this contract badly. Report that to the product.
- A missing feature, an unrecognised phase value, or a source form the reader reports as
  unsupported. Those are documented behaviour.
- Anything requiring a fork of this repository to be published under this name; see
  [the licence](LICENSE).

## Versions

The `1.x` schema set is supported. Within it, changes are additive only, and the additive-only
guard runs on every change.
