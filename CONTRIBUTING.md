# Contributing

The quickest way to understand what this repository will and will not accept is to read the
compatibility section of the [README](README.md). Everything below follows from it.

## Running the checks

```
npm ci
npm test                 # the conformance corpus against the reference adapter
npm run check:additive   # the lock is current, and this change is additive
```

`npm test` runs every valid fixture, every rejection and its written reason, and a round trip
that must not lose an unknown field. `npm run check:additive` compares the schema set against
the shape it had before your change; in CI the baseline is the branch you are merging into.

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
