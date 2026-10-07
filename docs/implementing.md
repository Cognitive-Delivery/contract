# Implementing the contract

What a second implementation, in Go, Java, Python, Rust or anything else, supplies to prove
conformance, and what each answer the runner prints means. The corpus under `fixtures/` and the
vectors under `conformance/` are the artefact; `conformance/runner.mjs` is one reader of them, and
this page is its interface in one place. SPEC §9 is the normative list of what conformance requires;
this page is how the runner checks it.

## The adapter

`runConformance(adapter)` in `conformance/runner.mjs` takes one object, the implementation under
test, and returns a report. It imports nothing from any product. `validate` is the only required
hook; every other hook is optional, and a hook that is absent is reported as not checked, never as
passed. A shape is one of the ten names in `SHAPES`, which are the fixture prefixes and the schema
file names without `.schema.json`: `provenance`, `audit-event`, `cdi-signal`, `cdi-assessment`,
`config-core`, `agent-lease-manifest`, `agent-lease`, `lease-record`, `plugin-manifest`,
`plugin-marketplace`.

| Hook | The runner calls it | It must return | Runner step |
|---|---|---|---|
| `validate(shape, value)` | on every fixture; on every narrowing vector's `declared`, `parent` and `granted` as `agent-lease-manifest`; on every signature vector's lease as `agent-lease`; on every by-rule fixture | `true` or `false` | 1, 2, 3, and the structural half of 5, 6 and 7 |
| `lastErrors` (a property, not a hook) | read after `validate` returns `false` for a fixture under `fixtures/invalid/` | an array of `{ instancePath, keyword }`, Ajv's error shape: `instancePath` is the JSON Pointer of the failing value (`""` at the root, which the runner reads as `/`), `keyword` the schema keyword that failed. Anything that is not an array means the paths are not checked | 2 |
| `roundTrip(shape, value)` | with a valid fixture carrying `a_field_from_a_newer_writer: "kept"` at the top level and inside its first nested object (first by sorted key) | the value as a reader would re-emit it; both planted fields must survive | 3 |
| `canonicalise(value)` | with each of the nine vectors in `canonical-vectors.json`, each of the six inputs under `jcs/input/`, and two values that must fail (`NaN`, `Infinity`) | a string. The runner hashes its UTF-8 bytes with SHA-256 against `vector.sha256`, compares the `jcs/` outputs byte for byte against `jcs/outhex/`, and requires the two must-fail values to throw | 4 |
| `narrow(declared, parent)` | with each vector in `narrowing-vectors.json` that is not `schema_invalid`; `parent` is a granted manifest carrying its remaining budget | `{ granted }` or `{ refusals: ["R2", ...] }`. Refusal sets are compared deduplicated and sorted; a grant is compared by `canonicalise`, so an adapter that offers `narrow` must offer `canonicalise` or the run fails. On a grant, return no `refusals` key at all: an empty array counts as a refusal | 5 |
| `hash(value)` | with the declaration each signature vector names | the lower-case hex SHA-256 of the canonical bytes; it must equal the lease fixture's `declared_hash` | 6 |
| `verify(lease, keyHex)` | with each signed lease fixture and the 64-hex key line of `test-key.txt`; then with one signature byte changed; then with the granted manifest's `purpose` edited | exactly `true` for the fixture, exactly `false` for both tampered copies. `hash` and `verify` are checked together; supply both or neither | 6 |
| `rules(lease, context?)` | with every valid `agent-lease` and `lease-record` fixture and no context, then with each fixture under `fixtures/invalid-by-rule/` and the context below | `[{ rule, path }]`, empty (or nothing) when every rule holds. A by-rule fixture must produce a finding whose `rule` is the one its `.expect.json` names, at the `path` it names | 7 |

`context` for L3 is `{ chainOf(leaseId) }`, returning the ancestors of that lease, oldest first. The
runner builds it from the fixture's `.expect.json` (`context.chain`) and passes `{}` when the fixture
carries none, so a rule that needs the journal applies only when the journal is given. The reference
rules are `conformance/lease-rules.mjs`.

The report is `{ validCount, invalidCount, canonicalChecked, narrowingChecked, signaturesChecked,
rulesChecked, errorPathsChecked, failures }`. `failures` empty means conformant; each `Checked` flag
says whether the corresponding hook ran.

## What sits beside an invalid fixture

Every file under `fixtures/invalid/` has two companions, and the run fails without either:

- `<name>.reason`, prose: what the rejection is for.
- `<name>.expect.json`: `{ "path": "/allow/hosts/0", "keyword": "pattern" }`. `path` is the instance
  path (a JSON Pointer) at which one of your reported errors must sit; `keyword` is the keyword the
  reference validator reports and is informative, because validators name keywords differently.

Under `fixtures/invalid-by-rule/` the fixture is schema-valid, and its `.expect.json` is
`{ "rule": "L1", "path": "/expires_at" }`; the L3 fixture also carries
`"context": { "chain": ["<ancestor lease_id>"] }`, the ancestors of the revoked lease.

## Running the corpus without the runner

`conformance/suite/draft7/` carries the same fixtures in the official JSON-Schema-Test-Suite format:
one file per schema, each a JSON array of cases `{ description, schema, tests: [{ description, data,
valid }] }`, every `$ref` local, each case under 60,000 bytes serialised so a harness that reads a
case as one line can load it. By-rule fixtures appear with `valid: true` and a description naming the
rule, because the schema accepts them. `npm test` fails when the export is stale, so it is always the
corpus the runner ran. The contract's CI runs it through Bowtie, and so can any validator:

    bowtie suite -i go-jsonschema -i rust-jsonschema -i python-jsonschema \
      -i java-json-schema -i dotnet-jsonschema-net -i js-ajv conformance/suite/draft7 > bowtie.jsonl
    bowtie summary --format markdown --show failures bowtie.jsonl

That proves schema validity only. Canonical bytes, narrowing, signatures and the lease rules need an
adapter.

## Reading a NOT CHECKED line

`npm test` (`conformance/run.mjs`) prints one line for the corpus. Each clause below names the report
field behind it and the absence that produces it.

| Printed | Field | Cause |
|---|---|---|
| `canonical bytes NOT CHECKED (adapter offers no canonicalise)` | `canonicalChecked: false` | no `canonicalise` |
| `narrowing vectors well-formed, behaviour NOT CHECKED (the reference adapter validates only; the reference implementation runs them in its own suite)` | `narrowingChecked: false` | no `narrow`; the vectors' shape is still checked |
| `signatures NOT CHECKED (adapter offers no hash/verify)` | `signaturesChecked: false` | no `hash`, or no `verify` |
| `lease rules by-rule fixtures schema-valid, rules NOT CHECKED (adapter offers no rules)` | `rulesChecked: false` | no `rules`; the by-rule fixtures are still checked to validate |
| `rejection paths NOT CHECKED (adapter reports no errors)` | `errorPathsChecked: false` | `lastErrors` is not an array after a rejection |

An absent `roundTrip` prints nothing and has no field: the planted fixture is still validated, but
nothing checks that the field survives. Three further lines from the installed package are about
the tarball, not the adapter: `Additive guard: NOT PRESENT in this package`, `Layout: NOT CHECKED
(published package; the repository check runs from a clone)` and `Site: NOT CHECKED (tooling/ is not
in the package)`, because `check-additive.mjs`, the repository layout and the site generator ship
with the repository only. The claims line, `Claims: N checked, F failure(s).`, is printed from the
package too, with each claim whose source is not in the package (CONTRIBUTING, `docs/`, the
allow-list, the git history) listed as NOT CHECKED rather than passed.

The reference adapter (`conformance/ajv-adapter.mjs`) offers every hook but `narrow`, so the
contract's own CI prints `behaviour NOT CHECKED` for narrowing; the reference implementation runs
the vectors in its own suite ([docs/conformance/cdf-harness.md](conformance/cdf-harness.md)).

## What the package exports

`package.json` `exports`: `./schemas/*`, `./fixtures/*`, `./conformance/runner.mjs`,
`./conformance/ajv-adapter.mjs`, `./conformance/*` (every vector, the test key, the suite,
`lease-rules.mjs`) and `./schemas.lock.json`. `ajv` is an optional peer dependency, needed only by the
reference adapter. The tarball carries `schemas`, `fixtures`, `conformance`, `schemas.lock.json`, the
README, the SPEC and the CHANGELOG; `check-additive.mjs` and `tooling/` stay in the repository.

## A worked example

From the repository at 1.2.1 (3088e44), packed and installed into an empty directory beside the
tarball, run on 2026-10-06:

    npm pack --pack-destination ../pack          # cognitive-delivery-contract-1.2.1.tgz
    mkdir ../consumer && cd ../consumer && npm init -y
    npm install ../pack/cognitive-delivery-contract-1.2.1.tgz ajv
    cat > run-corpus.mjs <<'EOF'
    import { runConformance } from '@cognitive-delivery/contract/conformance/runner.mjs';
    import { createAjvAdapter } from '@cognitive-delivery/contract/conformance/ajv-adapter.mjs';
    const report = await runConformance(await createAjvAdapter());
    console.log(JSON.stringify({ ...report, failures: report.failures.length }));
    process.exit(report.failures.length === 0 ? 0 : 1);
    EOF
    node run-corpus.mjs

printed

    {"validCount":40,"invalidCount":98,"canonicalChecked":true,"narrowingChecked":false,
     "signaturesChecked":true,"rulesChecked":true,"errorPathsChecked":true,"failures":0}

and exited 0. `narrowingChecked` is false because the reference adapter has no `narrow`. Replace
`createAjvAdapter()` with your own adapter object and every flag you supply a hook for turns true;
`report.failures` lists, by fixture or vector name, everything that did not.

The package's own `npm test` also runs from the tarball:
`node node_modules/@cognitive-delivery/contract/conformance/run.mjs` printed `Conformant.` on the
same day, with the guard reported not present and the Layout not checked, as the previous section
says.
