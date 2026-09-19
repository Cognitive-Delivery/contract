# Contributing

The quickest way to understand what this repository will and will not accept is to read the
compatibility section of the [README](README.md). Everything below follows from it.

## Running the checks

```
npm ci
npm test                 # the conformance corpus against the reference adapter
npm run check:additive   # the lock is current, and this change is additive
```

`npm test` runs four things: every valid fixture, every rejection and its written reason, a
round trip that must not lose an unknown field, and the canonical-bytes vectors of
[SPEC-agent-lease-manifest.md](SPEC-agent-lease-manifest.md) §7. It also checks that the version
in `package.json` matches the one stated in the README, the CHANGELOG and `schemas.lock.json` —
added because the lock silently kept the previous version through a release.

`npm run check:additive` compares the schema set against the shape it had before your change; in
CI the baseline is the branch you are merging into. Note what it does **not** do: it compares
schema shapes only, and will report "Lock is current" on a lock whose version field is stale.
That check lives in `npm test`.

## Changing the specification

`SPEC-agent-lease-manifest.md` is normative, in RFC 2119 language, and the schemas are not free
to disagree with it. If a change makes the two say different things, one of them is wrong and
the pull request has to say which.

Section 7 — canonical bytes — is the part to be most careful with. Every hash in this contract
is taken over those bytes, so a change there silently invalidates every signature anyone has
ever produced. Any change to it needs a matching change to `conformance/canonical-vectors.json`
and, realistically, a major version.

## Changing a schema

1. Change the schema.
2. Add or update fixtures. A new optional field belongs in the `populated` fixture for that
   shape, not the `minimal` one.
3. Run `npm run lock` and commit `schemas.lock.json`. The lock is the record of the shape
   before the next change; a schema change without it leaves nothing to compare against.
4. Run the checks.

## What will be refused

**Anything that is not additive, within `1.x`.** A new required field, a removed field, a
narrowed type, a closed enum where there was none, or an enum that lost a value. Customers have
these files in their repositories and older readers are still reading them. These need `2.0.0`
and a documented migration.

**A new value in `cdi-signal.event_type`, or a change to the six CDI dimension ids, as an
ordinary change.** The Index is computed from that vocabulary, so adding to it changes what the
Index measures. That is a contract change and is governed by ADR-013.

**A reader that throws on something it does not recognise.** `phase` is an open string, unknown
source forms are reported rather than rejected, and unknown fields survive a round trip.

**A fixture under `invalid/` with no `.reason` file beside it.** "This should fail" with no
reason is untestable folklore, and the runner fails the build for it.

**Anything that widens what may reach a permanent record.** See [SECURITY.md](SECURITY.md).

## Reporting a problem

Open an issue. For a security problem, follow [SECURITY.md](SECURITY.md) instead.
