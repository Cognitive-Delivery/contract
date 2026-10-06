# Governance

How decisions about this contract are made, who makes them, and how a release is cut. Short on
purpose: a governance document nobody reads governs nothing.

## Who decides

The contract has one maintainer, **Jason Cruz Falzon** (`@datajace`), who is the sole entry in
[CODEOWNERS](.github/CODEOWNERS). That is a statement of fact, not a policy: there is no second
owner, and a second name in CODEOWNERS that reviewed nothing would be a false record in a
repository whose purpose is true records. A second maintainer is added by the first, by a pull
request that changes this section and CODEOWNERS together, when there is someone who has reviewed
contract changes for long enough to be held to them.

The maintainer decides. There is no committee and no vote. Anyone may propose; the maintainer
accepts or declines, in writing, on the proposal or the pull request, with the reason.

## What needs a proposal

A **semantic change** needs a proposal under [`docs/proposals/`](docs/proposals/) before its pull
request: a new schema, a new field whose meaning is not obvious from its name, a new narrowing rule
or refusal code, a change to canonical bytes or signatures (which is a major version), a new
reserved vocabulary, or a change to what the conformance corpus checks. The proposal is one page
on the [template](docs/proposals/TEMPLATE.md), with a *Backward compatibility* section the additive
rule is answered in and a *Security* section that says what the change lets into a permanent record
or out of a lease. It carries a status: `draft`, `accepted`, `rejected` or `superseded`, and the
accepted ones stay in the directory as the record of why the contract is shaped as it is.

A **mechanical change** does not: a fixture, a tightening with its evidence and allow-list entry, a
description, a tooling fix, a dependency bump. It goes straight to a pull request.

## How a change lands

1. A pull request against `main`, with every commit signed off (`git commit -s`, the
   [Developer Certificate of Origin](https://developercertificate.org/)); the `DCO` check refuses
   one that is not.
2. The checks the README names, all required: the corpus on two Node versions, the additive guard
   against `main`, the published-package self-test, the RE2 compile, line endings, the corpus under
   six other validators, and Sourcemeta's meta-schema and lint.
3. The pull-request template's boxes: CHANGELOG entry, SPEC §13 row where the SPEC changes, README
   current, every tightening allow-listed with its evidence.
4. Review by the maintainer. A pull request from the maintainer is reviewed by the checks and the
   maintainer's own stated reasoning in the description; that is weaker than a second reader and
   the first section says why it is what there is.
5. Merge with a merge commit, so each task's commit survives on `main`.

## How a release is cut

A release is a version of the **schema set**, and semantic versioning applies to that, not to the
tooling: within a major, changes are additive only, and the guard enforces it.

1. The `CHANGELOG.md` section for the version is complete, `package.json` carries the version, and
   `npm run lock` has written it everywhere else (`npm test` fails otherwise).
2. The maintainer tags `vX.Y.Z` on `main`. Only the maintainer tags; the tag is the decision.
3. `release.yml` runs the corpus and the guard again, publishes to npm through trusted publishing
   with provenance, creates the GitHub Release with the CHANGELOG section and the tarball, and
   checks that every `$id` serves the tagged bytes.
4. `release.yml` then dispatches `pages.yml` on `main` (a tag push cannot deploy: the github-pages
   environment admits `main` only), which lays out `/X.Y.Z/` for every `v1.*` tag beside the
   `/X.x/` alias, frozen, and the release job checks the frozen copy serves the tagged bytes.

A release cannot be unpublished from npm after 72 hours and is never rewritten on Pages; a
mistake is corrected by the next version.

## Changing this document

By pull request, like anything else; the maintainer decides. The sections above describe what is,
not what is hoped for, and are corrected when the facts change.
