# Recorded check: plugin component shapes against real manifests (2026-10-05)

Evidence for schema set 1.2's typed inline `hooks` and `mcpServers`, the credential refusals in
hook headers, MCP `env` and `headers` and marketplace `headers`, the `authorization` key refusal
on marketplace `headers`, and the loopback-only `http://` rule on a contributed provider's
`baseUrl` (CDF spec `contract-batch-two-implement-all` task 4.1, DR-183 D3). Values only.

## What was checked

- Anthropic's bundled-plugin manifest as transcribed in
  `fixtures/valid/plugin-manifest.claude-code-reference.json` (inline hooks with a `command`
  handler, inline MCP server keyed by name, `.mcpb` and `https://` bundle references) and
  Anthropic's marketplace in `fixtures/valid/plugin-marketplace.claude-code.json`: both validate
  unchanged.
- The reference deployment's own manifests: `test/fixtures/claude-code-plugin/.claude-plugin/plugin.json`,
  `resources/codex-plugin/cdf-governance/.claude-plugin/plugin.json` and the repository's
  `.claude-plugin/marketplace.json`: all three validate.
- No manifest or marketplace in any of the above carries an `authorization` header, a
  credential-shaped `env` or `headers` value, or a plain-`http://` remote provider. The ten
  built-in providers are `https://` or `http://127.0.0.1`.
- Every new pattern compiles under RE2 (211 patterns in 10 schemas).

## Conclusion

No conformant writer has produced a value the 1.2 rules refuse. The refused forms are proved by
the nine `plugin-manifest.*` and one `plugin-marketplace.headers-authorization` invalid fixtures;
the admitted forms by `fixtures/valid/plugin-manifest.inline-components.json`.
