# The architecture-standards marketplace

The documents in `docs/` are also published as installable agent plugins, so a session
can *have* the standards instead of being handed them. The packaging follows
[Agent Plugins 1.0.0](https://agent-plugins.org/) — the vendor-neutral format behind
GitHub Copilot, VS Code, Claude Code, Cursor and Codex — so one tree serves every client.

## What is in it

| Plugin | Skills | Covers |
|---|---|---|
| `architecture-core` | 3 | The constitution (P1–P15), the REVIEW/MODERNIZE/RECOVER playbook, the repository baseline. Also ships the three custom agents. Install this first. |
| `deployment-and-platform` | 5 | Fly.io, Azure AI Foundry agents, Azure operations, per-PR preview environments, private-cloud delivery |
| `services-and-clients` | 5 | Service and API patterns, identity and accounts, payments and metering, Next.js frontends and BFFs, browser extensions |
| `quality-and-process` | 6 | LLM evaluation, testing strategy, E2E acceptance suites, security review, open-source release, README badges |
| `research-standards` | 1 | The research-documentation standard, with the study and LaTeX paper templates as bundled assets |

Each skill is a short router — when it applies, its failure modes, its checklist — with
the **full standard bundled underneath it** in `references/`. Agents load the reference
only when the skill actually fires, so twenty standards cost nothing until one is needed.

## Installing it

**GitHub Copilot CLI**

```sh
copilot plugin marketplace add konradcinkusz/architecture-standards
copilot plugin install architecture-core@architecture-standards
```

**VS Code** — add the repository to `chat.plugins.marketplaces`:

```json
{
  "chat.plugins.marketplaces": [
    "konradcinkusz/architecture-standards"
  ]
}
```

Then browse with `@agentPlugins` in the Extensions view, or run **Chat: Plugins** from
the Command Palette.

**Claude Code**

```sh
/plugin marketplace add konradcinkusz/architecture-standards
/plugin install architecture-core@architecture-standards
```

**Any other agent** — attach the repo as a sibling checkout and point it at
[`AGENTS.md`](AGENTS.md). No install step, no client support required.

## Where this can be served

Ordered by how much setup each costs. The first three need nothing but this repository.

| Surface | Mechanism | Who can reach it |
|---|---|---|
| **This repo, Copilot CLI / VS Code** | `.github/plugin/marketplace.json` | Anyone who can read the repo |
| **This repo, Claude Code** | `.claude-plugin/marketplace.json` (Copilot CLI reads this path too) | Anyone who can read the repo |
| **Sibling checkout** | `AGENTS.md` | Anyone with a clone |
| **Consuming repos** | Commit `.github/copilot/settings.json` in a target repo to recommend these plugins to everyone who clones it | That repo's readers |
| **Org-wide agents** | Copy `.github/agents/*.agent.md` into the org's `.github` repo under `/agents/` — available in every repo with no `marketplace add` step | Org members |
| **Enterprise-managed** | `.github-private/.github/copilot/settings.json` with `extraKnownMarketplaces` and `enabledPlugins` to auto-install on auth; add `strictKnownMarketplaces` to allow *only* approved marketplaces. Applies to Copilot CLI, VS Code and the Copilot app | Enterprise members; needs Copilot Business/Enterprise |
| **Individual skills** | `gh skills install konradcinkusz/architecture-standards <skill>` into a repo's `.github/skills/` | That repo's readers |

**Access control is repository visibility.** Copilot installs plugins by cloning or
referencing the repo, so `internal` makes the marketplace readable by the whole
enterprise and invisible outside it, and `private` restricts it to explicit grants.
`copilot plugin marketplace add` fails for anyone without read access. There is no
separate permission model to configure — and nothing here needs a server, an app
installation, or an admin.

Not covered: `copilot plugin marketplace add <org>/<repo>` is GitHub shorthand, so a
marketplace hosted on Azure DevOps or GitLab is reachable from VS Code's setting (which
accepts arbitrary git URLs) but not from that CLI command.

## Keeping it honest

The whole tree under `plugins/`, `.github/plugin/`, `.claude-plugin/` and
`.github/agents/` is generated from `docs/` plus `catalog/marketplace.catalog.json`.

```sh
node scripts/build-marketplace.mjs            # regenerate
node scripts/build-marketplace.mjs --check     # CI: fail if stale
```

CI runs `--check` on every push and pull request, so a standard cannot drift from the
skill that ships it. That constraint is the repo's own rule applied to itself —
`README-BADGES.md` calls it out as "no copy-paste drift", and a marketplace is exactly
where copy-paste drift would do the most damage.
