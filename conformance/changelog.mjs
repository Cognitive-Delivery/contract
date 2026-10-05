/**
 * One release's section of CHANGELOG.md: the body under `## [<version>]` up to the next
 * `## [` heading, without the heading. Lives under `conformance/` so `npm test` can import it
 * from the published package (nothing in `conformance/` may import from `tooling/`, which does
 * not ship; see ids.mjs). `tooling/changelog-section.mjs` is the command-line wrapper the
 * release workflow calls.
 */
export function changelogSection(changelog, version) {
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start === -1) return null;
  let end = lines.findIndex((line, index) => index > start && line.startsWith('## ['));
  if (end === -1) end = lines.length;
  // Link definitions at the foot of the file are not part of any section.
  return lines.slice(start + 1, end).join('\n').replace(/\n+$/, '').replace(/^\n+/, '');
}
