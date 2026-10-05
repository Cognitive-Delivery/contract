---
name: Defect
about: A schema, fixture, vector, rule or document says something wrong, or the checks disagree with an implementation
title: ''
labels: defect
assignees: ''
---

## What is wrong

<!-- One paragraph. Name the file and the path: `schemas/agent-lease.schema.json#/properties/expires_at`,
     `SPEC §6 L1`, `fixtures/invalid/....json`, `conformance/narrowing-vectors.json#R3-...`. -->

## What the contract says, and what you observed

<!-- Quote the clause, description or fixture, then what an implementation or a real artefact did.
     If a real artefact is rejected, say which schema and at which path; do not paste the artefact if it
     holds anything from a prompt, a key or a person. -->

## Which half is wrong

- [ ] The SPEC (the schema and corpus are right)
- [ ] The schema or corpus (the SPEC is right)
- [ ] An implementation (the contract is right; this is a note for its maintainers)
- [ ] I cannot tell

## Version

<!-- `@cognitive-delivery/contract` version, or the commit on `main`. -->

<!-- A security problem goes to SECURITY.md, not here. -->
