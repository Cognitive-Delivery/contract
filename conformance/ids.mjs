/**
 * Where a schema's `$id` lives, stated once.
 *
 * This file sits under `conformance/` rather than `tooling/` because the published package
 * carries `conformance/` and not `tooling/`, and `npm test` needs it: the 1.1.0 candidate's (e91afb0) `run.mjs`
 * imported it from `../tooling/sync-version.mjs`, which is not in the tarball, so the package
 * a consumer installed could not run its own test (contract review of 5 October 2026, defect 1).
 * `tooling/sync-version.mjs` re-exports from here so nothing else moves.
 *
 * `$id` carries the MAJOR only, as `1.x`: it is an identifier, and an identifier that changed on
 * every minor release would be a version number with extra steps. A reader resolving it gets the
 * current 1.x schema, which the additive-only rule says is what it wants. The schema-set version a
 * document was written against is its own `schema_version` field, never the `$id`.
 */

export const ID_HOST = 'https://cognitive-delivery.github.io/contract';

export function idFor(major, file) {
  return `${ID_HOST}/${major}.x/${file}`;
}
