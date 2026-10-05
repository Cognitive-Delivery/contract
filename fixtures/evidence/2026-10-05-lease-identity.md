# Recorded check: lease identity rules against real artefacts (2026-10-05)

Evidence for the allow-list entries of schema set 1.2's host, command, tool and approval identity
rules and the `agent.name` and `intent.purpose` caps (SPEC §4.2 to §4.4, CDF spec
`contract-batch-two-implement-all` task 2.1, DR-183). Values only; no journal line is copied here.

## What was checked

- The reference deployment's lease journal (`.cdf/runtime/leases.jsonl`, six records: three
  `granted`, three `narrowed`): every embedded lease and declared manifest validates against the
  1.2 `agent-lease` and `agent-lease-manifest` schemas with the reference Ajv adapter. 4 validated,
  0 rejected. Their `allow.hosts` and `allow.commands` are empty; their tools are `cdf_` names;
  the longest `agent.name` is 22 characters and the longest `purpose` 29.
- The root policy's hosts are derived from the configured providers' base URLs. The ten built-in
  providers resolve to `127.0.0.1` (twice: Ollama and LM Studio), `api.openai.com`,
  `api.anthropic.com`, `api.deepseek.com`, `openrouter.ai`, `generativelanguage.googleapis.com`,
  `api.mistral.ai`, `dashscope-intl.aliyuncs.com` and `api.x.ai`. All ten match the host rule;
  the IPv4 literal is why the rule admits one.
- The root policy's default deny commands are eight bare names: `sudo`, `su`, `docker`, `ssh`,
  `curl`, `wget`, `launchctl`, `systemctl`. All match the command rule.
- Every host, command, tool and approval value across the 27 narrowing vectors and the valid
  fixtures: hosts `*`, `*.anthropic.com`, `*.internal.example`, `127.0.0.1`, `anthropic.com`,
  `api.anthropic.com`, `api.example.com`, `api.openai.com`, `evil.example`, `example.com`,
  `github.com`; commands `claude`, `curl`, `docker`, `launchctl`, `node`, `ssh`, `su`, `sudo`,
  `systemctl`, `wget`; tools eight `cdf_` names; approvals `external.write`, `phase.advance`;
  longest name 22, longest purpose 79. All match; longest host 20 characters.
- Every pattern compiles under RE2 (`tooling/regex-portability`: 139 patterns in 9 schemas).

## Conclusion

No conformant writer has produced a value the 1.2 rules refuse. The refused forms are proved by
eighteen invalid fixtures (`agent-lease-manifest.host-*`, `command-*`, `tool-*`, `approval-star`,
`deny-host-scheme`, `deny-command-path`, `purpose-too-long`, `name-too-long`) and the admitted
forms by `fixtures/valid/agent-lease-manifest.identity-forms.json`.
