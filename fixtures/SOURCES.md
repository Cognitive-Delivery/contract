# Where vendored fixtures come from

The fixture directories hold `.json`, `.reason` and `.expect.json` files and nothing else, so the
provenance of anything copied from outside lives here.

## plugin-marketplace.claude-code.json

`fixtures/valid/plugin-marketplace.claude-code.json` is `.claude-plugin/marketplace.json` from
https://github.com/anthropics/claude-code at commit 2bfb629dfaff0c8318047a4beb93cf1dc5b58b18
(main, read 2026-10-05): the marketplace Anthropic ships its own plugins from, which is the
strongest available evidence that the contract reads what Claude Code writes.

One change from the upstream file: the `email` field is removed from each plugin entry's
`author` object. This corpus carries no personal data (SECURITY.md), and the shape is unchanged
by the removal because `email` is optional.

## plugin-manifest.claude-code-reference.json

`fixtures/valid/plugin-manifest.claude-code-reference.json` is the example manifest from the Claude
Code plugin manifest reference (https://code.claude.com/docs/en/plugins/manifest-reference, read
2026-10-05), extended with the keys the same page documents but the example leaves out, so that
every documented key is exercised by one valid fixture. One value is changed: the dependency the
example calls `secrets-vault` is `vault-plugin` here, because this corpus is scanned for the word
`secret` and a false positive would hide a real one.
