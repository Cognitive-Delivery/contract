# Recorded check: evidence hygiene against every real record (2026-10-05)

Evidence for schema set 1.2's evidence-hygiene rules (SPEC §6.2; CDF spec
`contract-batch-two-implement-all` task 5.1, DR-183 D1, D4). Counts only; no record is copied here.

## What was checked, with the reference Ajv adapter against the 1.2 schemas

| Evidence | Records | Rejected |
|---|---|---|
| Audit journal (`.cdf/audit/governance*.jsonl`, three files) | 33,608 | 0 |
| CDI signal log (`.cdf/cdi/signals*.jsonl`, two files) | 19,231 | 0 |
| Provenance front matter (every `.md` under `.cdf/specs/*/`) | 995 | 0 |
| CDI assessments (`.cdf/cdi/assessments/*.yaml`) | 2 | 0 |
| Workspace config (`.cdf/config.yaml`) | 1 | 0 |

- Every `event_type` is two or more lower-case dotted segments; the 36 first segments are listed
  in the schema and SPEC §6.2. Every `schema_version` is `1.0`. No `summary` or `reasoning` carries
  a control character (the writer strips them). The longest `details` string is exactly 200.
- `actor.runtime` carries eleven distinct values across the journal (`vscode`, `claude-code`,
  `codex-cli`, `codex`, `claude`, `GitHub Copilot`, `github-copilot`, `vscode-copilot-chat`,
  `copilot-chat`, `VS Code Chat`, absent), which is why it stays open and `runtime_agent` is added.
- Every provenance `spec` is a slug (263 spec directories, all conforming). Both assessments carry
  six dimensions, each id once, with whole-number scores. The config's `sealed` is empty.
- Every pattern compiles under RE2 (226 patterns in 10 schemas).

## Conclusion

No conformant writer has produced a value the 1.2 rules refuse. The refused forms are proved by ten
invalid fixtures (`audit-event.{empty-event-type,uppercase-event-type,control-char-summary,details-value-too-long,schema-version-major-only,unknown-runtime-agent}`,
`provenance.spec-traversal`, `cdi-assessment.{five-dimensions,fractional-score}`,
`config-core.sealed-bad-path`).
