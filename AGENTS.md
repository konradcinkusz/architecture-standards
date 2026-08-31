# AGENTS.md

This repository is the estate's architecture constitution and its operational guides,
packaged so an agent can install them rather than be handed them.

Two ways to use it, depending on why you are here.

## A. You are working on another repo and this one is attached

Read the standards; do not re-derive them. The single most expensive failure mode in this
estate is an agent reconstructing architectural rules from whatever code it happens to
see, instead of reading the rules that already exist.

1. **Start with the constitution** — `docs/architecture/00-REFERENCE-ARCHITECTURE.md`.
   Fifteen principles (P1–P15), each with a working example, plus a compliance checklist.
2. **Pick a mode** — `docs/PLAYBOOK.md` decides between REVIEW, MODERNIZE and RECOVER and
   states which documents each mode must produce.
3. **Load the guide for the domain you are touching**, rather than reinventing its
   patterns. `docs/guides/` holds seventeen of them; `catalog/marketplace.catalog.json`
   lists every one with a "use when…" description, which is the fastest way to route.

Findings, reviews and migration plans are written into **the target repo's** own
`docs/architecture/`. This repo accumulates no per-system content.

## B. You want the standards installed as skills

The same documents ship as five plugins under `plugins/`, following the
[Agent Plugins 1.0.0](https://agent-plugins.org/) format, so Copilot, Claude Code, VS
Code and any other compatible client can install them.

```sh
copilot plugin marketplace add konradcinkusz/architecture-standards
copilot plugin install architecture-core@architecture-standards
```

See [`MARKETPLACE.md`](MARKETPLACE.md) for the other clients, the plugin list, and how
access control works.

## C. You are changing this repository

The packaging layer is **generated**. Nothing under `plugins/`, `.github/plugin/`,
`.claude-plugin/` or `.github/agents/` is written by hand.

| To change | Edit | Then |
|---|---|---|
| A standard's content | the document under `docs/` | re-run the generator |
| A skill's routing description, or which plugin it belongs to | `catalog/marketplace.catalog.json` | re-run the generator |
| A custom agent | `catalog/agents/<name>.agent.md` | re-run the generator |
| The generator itself | `scripts/build-marketplace.mjs` | re-run it |

```sh
node scripts/build-marketplace.mjs            # write the generated tree
node scripts/build-marketplace.mjs --check     # what CI runs; fails if stale
```

CI runs `--check` on every push and pull request. A change to a document that is not
accompanied by regenerated output fails the build — that is the point of it.

Two further rules apply to any change here, both enforced rather than remembered:

- **A content change needs a version decision.** The build refuses a plugin whose
  content moved while its version stood still. What each level means — and why the
  number is set by hand rather than derived — is in
  [`MARKETPLACE.md`](MARKETPLACE.md#versioning).
- **Committing runs a secret scan.** `./scripts/setup.sh` installs the hook; it refuses
  to commit when no scanner is available, which is deliberate rather than a bug.

How this repository measures against the baseline it publishes — including the items
that are genuinely N/A, with the reasons, and the one thing still open — is worked
through in [`docs/BASELINE-COMPLIANCE.md`](docs/BASELINE-COMPLIANCE.md).

### House conventions for the documents themselves

- Guides are repo-agnostic: rules plus the reasons, with worked examples cited at the
  end. The reasons are the part that transfers.
- The established guide shape is intro → `**Contents**` → numbered `## N.` sections →
  `## N. Failure modes` (a `| Symptom | Cause |` table) → `## N. Checklist` (`- [ ]`
  items) → a trailing `Worked examples:` line. The generator lifts the failure-mode
  table and the checklist into the skill body, so keeping that shape is what makes a new
  guide package itself.
- A guide is added to the marketplace by adding one entry to
  `catalog/marketplace.catalog.json`. A guide with no catalog entry ships as
  documentation only.
