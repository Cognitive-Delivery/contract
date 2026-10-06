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
  never recorded; `prompt_hash`, `request_hash`, `steering_hash` and `content_hash` are SHA-256
  and the schemas refuse any other shape; `workspace_id` is a hash of the git remote URL or a
  per-checkout UUID; `details` keys whose segment is one of `authorization`, `content`, `file`,
  `password`, `path`, `payload`, `prompt`, `request`, `secret` or `token` are refused by the
  schema; `summary` and `reasoning` are capped. The actor records a kind and a model, never a
  name, email or git identity.
  A shape that lets identifying data into a permanent record is a security issue, not a style
  one.
- **A sealing bypass.** `config-core.sealed` lists fields an upper layer has fixed. A lower
  layer may match a sealed value or make it stricter, never looser. A schema that permits
  loosening would let a workspace quietly undo a control its organisation set.
- **A lease escape.** `agent-lease-manifest`, `agent-lease` and `lease-record` describe what an
  agent may reach and what was decided about it. A shape that would let a manifest declare, or a
  lease grant, more than the harness intends, or let a `revoked` record name a `by` outside the
  chain, or a `granted` record carry a `granted_hash` that is not its lease's, is in scope.
- **A path in the corpus or runner that executes fixture content** rather than reading it as
  data.
- **The published test key.** `conformance/test-key.txt` is public on purpose: the signature
  vectors are signed with it so any implementation can check them. It signs fixtures and nothing
  else. A real lease, record or attestation that verifies under it is a vulnerability in whatever
  issued it, and a verifier that accepts it outside a conformance run is in scope here.
- **The allow-list.** `compat-allowlist.json` is the one way a tightening passes the additive
  guard within a major. An entry that waves through a narrowing with no evidence, or the guard
  accepting an entry whose evidence file does not exist, is in scope: the allow-list is a control
  and a hole in it is a hole in the compatibility promise.

## What is not in scope

- A product that implements this contract badly. Report that to the product.
- A missing feature, an unrecognised phase value, or a source form the reader reports as
  unsupported. Those are documented behaviour.
- Anything requiring a fork of this repository to be published under this name; see
  [the licence](LICENSE).

## Versions

The `1.x` schema set is supported. Within it, changes are additive only, and the additive-only
guard runs on every change.
