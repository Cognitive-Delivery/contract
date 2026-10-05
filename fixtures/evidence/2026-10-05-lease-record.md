# Recorded check: the lease journal against lease-record (2026-10-05)

Evidence for schema set 1.2's `lease-record` schema (SPEC §6.1; CDF spec `contract-batch-two-implement-all`
task 3.1, DR-183). Values only; no journal line is copied here.

- The reference deployment's lease journal (`.cdf/runtime/leases.jsonl`): 6 records, {"granted":3,"narrowed":3},
  every one validates against the new schema with the reference Ajv adapter: 0 rejected.
- Those `granted` records were written by a 1.1 writer and carry no `granted_hash`; the schema makes it
  optional and SPEC §6.1 says a reader may compute it from `lease.manifest`. Their `at` equals the
  lease's `issued_at` and is in the single Z-millisecond form.
- No `refused`, `revoked`, `stopped`, `attached`, `completed` or `expired` record exists in the
  reference deployment yet, so the reserved reason codes and `by` refuse nothing that was written;
  the harness writer adopts both at the 1.2 pin (task 8.3).
