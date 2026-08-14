# Copilot instructions

This repository holds the estate's architecture standards and packages them as
installable agent plugins. It is documentation and a small generator — there is no
application code here.

## The one rule

The architecture is **already documented**. Read it; do not re-derive it. When a
question about how something should be built comes up, the answer is in
`docs/architecture/00-REFERENCE-ARCHITECTURE.md` (principles P1–P15) or in the matching
guide under `docs/guides/` — not in first principles, and not in whatever another repo
happens to do.

## Layout

| Path | What it is |
|---|---|
| `docs/architecture/` | The constitution: 15 principles plus the compliance checklist |
| `docs/guides/` | Seventeen repo-agnostic operational guides |
| `docs/research/` | The research-documentation standard and its templates |
| `docs/proposals/` | Unmerged proposals — explicitly not yet standards |
| `catalog/` | Hand-authored metadata: skill descriptions, plugin grouping, agent definitions |
| `scripts/build-marketplace.mjs` | The generator |
| `plugins/`, `.github/plugin/`, `.claude-plugin/`, `.github/agents/` | **Generated — never edit by hand** |

## Working here

- Never hand-edit generated output. Change `docs/` or `catalog/`, then run
  `node scripts/build-marketplace.mjs`. CI runs the same command with `--check` and
  fails if the committed tree does not match.
- Adding a guide is two steps: write the document under `docs/guides/`, then add its
  entry to `catalog/marketplace.catalog.json`. The generator does the rest.
- A skill's `description` is its router — automatic delegation only fires when the
  description says *when to use it* in concrete terms. `REPO-BASELINE.md` §6 states this
  rule; catalog entries follow it.
- Guides are repo-agnostic. Nothing in a guide should name a product, a price, or a
  customer; worked examples are cited at the end, not woven through the rules.
- Documents record reasoning, not just steps (P14). A rule without its reason does not
  survive contact with the next situation.

## Style

Match the surrounding prose: British-leaning spelling, sentence-case headings, tables
for anything with two axes, and `- [ ]` checkboxes for checklists. Guides close with a
failure-mode table and a checklist because the generator lifts both into the packaged
skill.
