# Proposal — packaging the standards as an agent marketplace

Source: issue #3, "czy to jest dobre repo żeby było internalowym marketplace?" — is this
a good repository to serve as an internal marketplace attachable to GitHub Copilot or
any other agent, what would have to be added, and how deeply would the repo change.

## Why this exists

The packaging layer described below is **implemented** on this branch: `catalog/`,
`scripts/`, `plugins/`, the two marketplace manifests, `.github/agents/`, `AGENTS.md`
and [`MARKETPLACE.md`](../../MARKETPLACE.md). This document records why it has that
shape, and — in the last section — the decisions it deliberately left to the maintainer.

Nothing under `docs/`, `README.md` or `.gitignore` was modified. The whole layer is
additive by construction, which is itself one of the design decisions below.

## The answer to the question

**Yes — and for a reason that is easy to miss.** The usual blocker for turning a
documentation repository into a skill marketplace is that the documents are essays:
they explain, they narrate, and an agent cannot act on them. These are not. Fourteen of
the seventeen guides already close with a `| Symptom | Cause |` failure-mode table and a
`- [ ]` checklist, are explicitly repo-agnostic, and state rules with their reasons. That
is a skill body. The expensive half of the work was already done, before anyone asked
the question.

What was missing was entirely mechanical:

| Gap | Evidence |
|---|---|
| No machine-readable metadata anywhere | Zero files carried YAML front-matter; every `---` in the repo was a horizontal rule |
| No packaging or automation | No `.github/` directory at all — no workflows, no CI, no link checking, no CODEOWNERS |
| Principles not addressable | P1–P15 are H3 prose headings; ~100 inbound references are the bare token `P7`, greppable but not navigable. `P2a` is cited at `00-REFERENCE-ARCHITECTURE.md:551` with no matching heading |
| No agent entry point | No `AGENTS.md`, no `.github/copilot-instructions.md`, no `.github/agents/`, no skills, no manifest, no mention of MCP |
| Consumption was manual | `PLAYBOOK.md` expects a human to copy a fenced prompt, fill a target block by hand, and attach repos |

So the depth of change is **shallow on prose, medium on structure**: no guide was
rewritten, and none needed to be.

## Decisions taken

### 1. The metadata lives beside the documents, not inside them

The obvious design is YAML front-matter in each guide. It was rejected: it would modify
all seventeen guides, and routing metadata is not part of a standard's content — it is
part of how the standard is distributed. Instead
[`catalog/marketplace.catalog.json`](../../catalog/marketplace.catalog.json) carries the
description, plugin grouping, principle links and bundled assets for every document.

This also has a practical consequence worth stating: the guides stay readable as plain
documents on GitHub, with no metadata block at the top of every file.

### 2. The packaging layer is generated, never hand-written

`scripts/build-marketplace.mjs` reads `docs/` plus the catalog and writes `plugins/`,
both marketplace manifests, and `.github/agents/`. `--check` fails when the committed
tree does not match its sources, and CI runs it on every push.

The alternative — hand-authored skills that condense the guides — would mean two copies
of every rule, drifting apart. `README-BADGES.md` already makes "no copy-paste drift" a
rule for badge blocks; a marketplace is where that failure would cost the most, because
the drifted copy is the one the agent actually reads.

The generator lifts each guide's failure-mode table and checklist into the skill body
mechanically. That is only possible because the guides share a shape — which turns the
house template from a stylistic preference into a packaging contract. A new guide that
follows it packages itself; one that does not still ships, just with a thinner skill.

### 3. Skills are routers; the standard ships underneath them

Each `SKILL.md` is short — when the skill applies, its failure modes, its checklist —
and carries the full document in `references/`. A 4,700-word constitution cannot be an
always-loaded skill, and a truncated one would be worse than none. Progressive
disclosure means twenty standards cost nothing until one of them fires.

Relative links inside a copied reference are rewritten to absolute repository URLs,
because a skill installed into someone else's machine has no sibling guides to link to.

### 4. Five plugins, along the groupings the README already uses

`architecture-core`, `deployment-and-platform`, `services-and-clients`,
`quality-and-process`, `research-standards`. This is not a new taxonomy — it is the
grouping `README.md` has used since the guides existed. One plugin per guide was
rejected as seventeen manifests and a noisy browse list; a single plugin was rejected as
making the browse list uninformative.

### 5. Two manifests, one tree

`.github/plugin/marketplace.json` for Copilot CLI and VS Code,
`.claude-plugin/marketplace.json` for Claude Code. Copilot CLI reads both paths, so the
second file costs one generated copy and buys a second client. The plugin format itself
is Agent Plugins 1.0.0, which is what makes "or any agent" true rather than aspirational.

### 6. The playbook's three modes became three agents

`PLAYBOOK.md`'s REVIEW, MODERNIZE and RECOVER were a fenced prompt for a human to copy.
They are now `catalog/agents/*.agent.md`, generated into both `.github/agents/` (where
Copilot reads them in-repo, and from where they can be copied into an org's `.github`
repo) and into `architecture-core` (where they install with the plugin). Their tool
lists are read-plus-edit, per `REPO-BASELINE.md` §6's rule that a tool allowlist is a
safety boundary rather than a convention.

## Still open — maintainer decisions

These were deliberately not taken. Each is a judgement call, not an oversight.

1. **No `LICENSE` was added.** Choosing a licence is the owner's call, and
   `README-BADGES.md:82` already specifies a licence badge pointing at
   `blob/BRANCH/LICENSE` that currently resolves to nothing. If the repo stays internal,
   a licence is optional; if it ever goes public, `OPEN-SOURCE-RELEASE.md` is the gate
   and it says to have one from the first commit.
2. **The baseline debt is untouched.** `REPO-BASELINE.md:26-42` mandates CODEOWNERS,
   `.editorconfig`, `.gitattributes`, PR and issue templates, dependency automation,
   secret scanning in pre-commit *and* CI, and SAST. This repo has none of them. Adding
   them is straightforward and would make the standards repo pass its own baseline — but
   it is a separate change from packaging, and mixing the two would make both harder to
   review.
3. ~~**P1–P15 still have no stable anchors.**~~ **Resolved 2026-08-31.** Each principle
   now carries an explicit `<a name="pN">` anchor, so a skill can link `P7` and not merely
   cite it. One correction to this item as originally written: `P2a` was never a dangling
   reference. It is *defined* at `00-REFERENCE-ARCHITECTURE.md` as a substantive corollary
   to P2 — every service calls `AddServiceDefaults()` — and the `:551` line number had
   already gone stale. What it lacked was a heading, and therefore an anchor; it now has
   one (`#p2a`) on the same footing as the principles.
4. ~~**`docs/proposals/` remains unlinked from `README.md`.**~~ **Resolved 2026-08-31.**
   The README now carries a `## Proposals` section listing all four with their standings.
5. **Versioning policy is not written down.** Every plugin is `1.0.0` today. What
   constitutes a breaking change to a *standard* — a new checklist item? a reversed
   rule? — needs deciding before the second version, not after.
6. **No MCP server.** Serving the corpus over MCP would let an agent search across all
   twenty standards rather than loading one skill at a time. It is the only option in
   this space that needs hosting and auth, so it is worth doing only if search across
   the corpus turns out to be the bottleneck. Nothing here forecloses it: a plugin can
   declare an `mcp.json` later without changing anything else.
