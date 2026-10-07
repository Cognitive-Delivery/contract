# Upgrading a reader or writer from 1.0 to 1.2

For an implementation built against schema set 1.0 (contract 1.0.0, 1.0.1 and 1.0.2, all of
2026-09-19). Every change from 1.0.2 to 1.2.1 is additive within 1.x by the contract's own rule, and
mechanically checked in one direction: a 1.2 reader reads every artefact a conformant 1.0 writer
produced. The other direction does not hold. A 1.0 reader validating with the 1.0.2 schemas may
reject what a 1.2 writer produces: a `lease-record` line (no 1.0 schema describes it), a
`schema_version` of `"1.2"` on the lease schemas (1.0 required the literal `1.0`), and plugin forms
1.0 did not admit, such as `commands` as an object map in a plugin manifest (1.0 typed it as a path
or a list of paths) or a marketplace source form 1.0 did not list. The corpus shows it: the 1.0.2
schemas reject the valid fixtures `plugin-manifest.claude-code-reference` (at `/commands`) and
`plugin-marketplace.populated` (at `/plugins/3/source`). Beyond those additions, what changed is
the set of values the schemas refuse. Each tightening is allow-listed in `compat-allowlist.json`
with the fixture or recorded check proving no conformant writer produced what it refuses, and the
reference deployment's journals validate under 1.2 with zero rejections. Each item below cites its
CHANGELOG entry.

## Part A: what the schemas now refuse

| Now refused | Where | Admitted form | CHANGELOG |
|---|---|---|---|
| A hash that is not 64 lower-case hex characters | `audit-event.request_hash`; `cdi-signal.prompt_hash`; `provenance` `prompt_hash`, `steering_hash` and `content_hash`; `attestation.signature`, like the lease's own | `^[0-9a-f]{64}$` | 1.1.0 "The privacy properties are enforced by shape, not prose"; 1.2.0 "Lease rules L1 and L2, and one timestamp form inside the signed bytes" for `attestation.signature` |
| A `workspace_id` that is neither a SHA-256 digest nor a lower-case UUID | `cdi-signal` | the digest of the git remote URL, or the per-checkout UUID written when there is no remote | 1.1.0 "`workspace_id` is widened, and its description corrected" |
| Five path forms on an `allow` path: a leading `/`, any `..` segment, a leading `~`, a drive-letter prefix, any backslash | `allow.read_paths`, `allow.write_paths`, the plugin `capabilities` paths, `check.worker`, `docPacks`, a `git-subdir` `path`. `deny.paths` refuses the first, second and fifth and may be `~`-rooted | workspace-relative POSIX globs | 1.1.0 "Path rules are written without lookahead, and refuse three forms they used to accept" |
| A host with a scheme, a port, a path, whitespace, upper case, a trailing dot or an interior wildcard, or over 253 characters | `allow.hosts`, `deny.hosts`, `capabilities.hosts` | `^(\*\|(\*\.)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*)$` | 1.2.0 "Hosts, commands, tools and approvals have one identity rule each" |
| A command with a path, arguments or a shell operator | `allow.commands`, `deny.commands`, `capabilities.commands` | `^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$` | same |
| A tool or approval that is `*` or carries whitespace | `allow.tools`, `approvals`, `capabilities.tools` | `^[A-Za-z0-9_][A-Za-z0-9_.:/-]{0,127}$` | same |
| `agent.name` over 120 characters; `intent.purpose` over 500 | the manifest and its inlined copies | | same |
| A lease timestamp in any form but UTC with milliseconds and `Z` | `agent-lease` `issued_at` and `expires_at` | `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$` | 1.2.0 "Lease rules L1 and L2, and one timestamp form inside the signed bytes" |
| `budget.depth` above 16; `budget.fan_out` above 256; any integer above 2^53 - 1 | the manifest and its inlined copies; every integer field | | 1.2.0, the same entry; 1.1.0 "Canonical bytes are declared to be RFC 8785" for the 2^53 bound |
| A `schema_version` that is not `major.minor` | the seven schemas that carry it (all but `config-core` and the two plugin schemas); the lease schemas widen from the literal `1.0` | `^\d+\.\d+$` | 1.2.0 "Evidence hygiene" |
| A control character in `summary` or `reasoning` | `audit-event` | | same |
| A `details` string value over 200 characters; `summary` over 300; `reasoning` over 500 | `audit-event` | | 1.2.0 "Evidence hygiene" for the value cap; 1.1.0 "The privacy properties are enforced by shape, not prose" for the two caps |
| A `details` key with a sensitive segment | `audit-event.details`, `cdi-signal.details` | by `propertyNames`, approximating the writer's rule: a key is refused when a lower-case segment (split on non-alphanumerics) or a camelCase segment is `authorization`, `content`, `file`, `password`, `path`, `payload`, `prompt`, `request`, `secret` or `token` | 1.1.0 "The privacy properties are enforced by shape, not prose" |
| An `event_type` that is not two or more lower-case dotted segments, or over 120 characters | `audit-event` | `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`; the reference writer's first segments are reserved and any other writer leads with its vendor name (SPEC §6.2) | 1.2.0 "Evidence hygiene" |
| A `spec` that is not a slug of at most 80 characters; an assessment without exactly six integer-scored dimensions; a `sealed` path that is not dotted lower-case | `provenance`, `cdi-assessment`, `config-core` | | same |
| A plugin name outside Claude Code's rule; a `command` source `mode` other than `copy` or `link`, or a `timeout` outside 1 to 600; a credential-shaped value in a hook header, an MCP `env` or MCP `headers`; an `authorization` key in a marketplace entry's `headers`; a provider at plain `http://` off loopback | `plugin-manifest`, `plugin-marketplace` | | 1.1.0 "Every key the Claude Code plugin and marketplace references document"; 1.2.0 "Inline plugin hooks and MCP servers are typed, and a manifest cannot carry a credential" |

## Part B: what a 1.2 writer owes

- **The lease journal is `lease-record`** (SPEC §6.1): one line per decision, nine events, each
  carrying what the table there lists beyond `schema_version`, `at`, `event` and `lease_id`. A
  `granted` line carries `lease`, `declared` and `granted_hash`; an `attached` line carries
  `containment` (`enforced` or `advisory`) and `platform`. CHANGELOG 1.2.0 "`lease-record`".
- **`granted_hash`** on `granted`: the SHA-256 of the canonical bytes of `lease.manifest`. A reader
  meeting a 1.1 `granted` line without it may compute it. The same entry.
- **Reserved reason codes.** A `refused` line carries `reasons`, one or more codes in the forms `R<n>`
  (R1 to R6 today; an issuer never mints R7 or above), `runtime_error:<name>` or
  `vendor:<vendor>:<code>`, with the prose in `reason`. SPEC §5.2; the same entry.
- **`by` on `revoked`**: the `lease_id` of an ancestor or `issuer`, with `reason`. Anything else is
  rule L3, and a reader with the journal treats the record as invalid. The same entry.
- **`actor.runtime_agent`** on audit events: the closed vocabulary (`codex-cli`, `claude-code`,
  `gemini-code-assist`, `github-copilot`, `cdf-native`, `unknown`), beside `actor.runtime`, which
  stays an open label. Optional in the schema; a 1.2 writer records it. CHANGELOG 1.2.0 "Evidence
  hygiene".
- **`schema_version` as `major.minor`** wherever it is carried, compared on the major. The same entry.
- **One timestamp form** in `issued_at` and `expires_at`, and L1 and L2 held before signing.
  CHANGELOG 1.2.0 "Lease rules L1 and L2, and one timestamp form inside the signed bytes".
- **`allow.tool_args`** may be declared; an issuer may omit it from the grant and must not treat it
  as authority. Development stability: it may change within 1.x. CHANGELOG 1.2.0
  "`allow.tool_args`".

## Part C: what did not change

- **The additive rule.** `schemas.lock.json` and `check-additive.mjs` compare each change against the
  shape before it; a tightening passes only with an allow-list entry naming its evidence, and an
  entry can never be dropped. CONTRIBUTING, "Tightening a schema within 1.x".
- **Unknown fields pass through.** A reader must not strip what a newer writer adds; the runner
  plants one at the top level and inside a nested object and checks both survive. CHANGELOG 1.1.0
  "Every invalid fixture carries an `.expect.json`" (the nested half); SPEC §10.
- **A reader may still read a pre-contract artefact as 1.0.** `schema_version` was always required of
  a writer; a reader meeting an artefact without it may read it as 1.0 and must not emit one.
  CHANGELOG 1.1.0 "`schema_version` stays required and the prose stops saying otherwise".
- **No existing hash or signature changes.** The canonical bytes of §7 were RFC 8785 from the start;
  1.1.0 says so normatively and adds RFC 8785's own vectors. CHANGELOG 1.1.0 "Canonical bytes are
  declared to be RFC 8785".
- **The closed vocabularies**: `cdi-signal.event_type` and the six dimension ids. `phase` stays open.
- **`$id`.** The 1.0 identifiers never resolved; since 1.1.0 each is
  `https://cognitive-delivery.github.io/contract/1.x/<file>`, and every `v1.*` tag, 1.0.0 included,
  is also frozen at `/<version>/`. A reader that resolved by `$id` lost nothing it had. CHANGELOG 1.1.0
  "Every `$id` resolves".
