## What changes, and why

<!-- The rule or section that changed, and the failure it prevents. A guide in this
     corpus states rules with their reasons; a PR that changes one should too. -->

## Evidence

<!-- Guides here are extracted from systems that already run, not written from first
     principles. If this adds or changes a rule, cite the worked example behind it —
     a public repo by name, a private one under its placeholder. If there is no
     worked example yet, say so: that is what docs/proposals/ is for. -->

## Versioning

<!-- MARKETPLACE.md "Versioning". Delete the lines that do not apply. -->

- [ ] **major** — a rule is reversed or withdrawn
- [ ] **minor** — guidance is added (new guide, section, checklist item)
- [ ] **patch** — nothing required changes (clarification, worked example, links)
- [ ] No plugin content changed, so no bump is needed

## Checks

- [ ] `node scripts/build-marketplace.mjs` re-run and the regenerated tree committed
- [ ] `node scripts/build-marketplace.mjs --check` passes
- [ ] Links resolve, and any principle reference points at its anchor
