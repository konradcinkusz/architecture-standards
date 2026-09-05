# The architecture-standards marketplace

The documents in `docs/` are also published as installable agent plugins, so a session
can *have* the standards instead of being handed them. The packaging follows
[Agent Plugins 1.0.0](https://agent-plugins.org/) — the vendor-neutral format behind
GitHub Copilot, VS Code, Claude Code, Cursor and Codex — so one tree serves every client.

## What is in it

| Plugin | Skills | Covers |
|---|---|---|
| `architecture-core` | 4 | The constitution (P1–P15), the REVIEW/MODERNIZE/RECOVER playbook, the master delivery prompt, the repository baseline. Also ships the three custom agents. Install this first. |
| `deployment-and-platform` | 7 | Fly.io, Azure AI Foundry agents, Azure operations, per-PR preview environments, private-cloud delivery, shared-service reuse, metrics exposition |
| `services-and-clients` | 6 | Service and API patterns, identity and accounts, payments and metering, Next.js frontends and BFFs, browser extensions, state and snapshot persistence |
| `quality-and-process` | 8 | LLM evaluation, testing strategy, E2E acceptance suites, security review, open-source release, README badges, metric ethics, demo data and seeding |
| `research-standards` | 1 | The research-documentation standard, with the study and LaTeX paper templates as bundled assets |
| `ticket-delivery` | 7 | The per-ticket procedure: ticket analysis against a document you refine run by run, the master prompt generated from it, the implementation phase, two optional API verification passes (local and deployed), the review of a pull request against its ticket, and the feedback edge that closes every loop |

Most skills here are short routers — when it applies, its failure modes, its checklist —
with the **full standard bundled underneath it** in `references/`. Agents load the
reference only when the skill actually fires, so twenty-six standards cost nothing until
one is needed.

`ticket-delivery` is the exception, and deliberately so. Its seven skills are
**procedures you invoke** rather than standards you consult, so each one carries its
document as its body instead of pointing at a copy: `/implementation-phase` has to *be*
the checklist to be worth typing. They cite the guides rather than restating them, so the
constitution stays the single source for every rule they enforce.

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

**Claude Code** — in a session:

```
/plugin marketplace add konradcinkusz/architecture-standards
/plugin install architecture-core@architecture-standards
```

or from a shell, which is the same thing:

```sh
claude plugin marketplace add konradcinkusz/architecture-standards
claude plugin install architecture-core@architecture-standards
claude plugin details architecture-core     # skills, agents, token cost
```

Both read the repository's **default branch**, so a plugin change is only installable
once it is merged. To try a branch first, add the marketplace by absolute path
(`claude plugin marketplace add /path/to/architecture-standards`) and
`claude plugin marketplace update architecture-standards` after each rebuild.

**A whole team, without anyone running a command** — commit this to a consuming repo's
`.claude/settings.json`, and every clone gets the standards:

```json
{
  "extraKnownMarketplaces": {
    "architecture-standards": {
      "source": { "source": "github", "repo": "konradcinkusz/architecture-standards" }
    }
  },
  "enabledPlugins": {
    "architecture-core@architecture-standards": true
  }
}
```

The key under `extraKnownMarketplaces` is the `name` from `marketplace.json`, which is
what `@architecture-standards` refers to — not the repository name. The two happen to
match here; they do not have to.

Every example above installs `architecture-core`, which is the one to install first.
Add any other plugin the same way — `ticket-delivery` is the one that changes how a
session is *driven* rather than what it knows, so it is worth naming explicitly:

```sh
claude plugin install ticket-delivery@architecture-standards
```

It ships `/ticket-analysis`, `/implementation-phase`, `/pr-review` and the two optional
verification passes `/test-on-localhost` and `/cloud-test`, and its skills cite
the constitution and the guides throughout — so install it alongside `architecture-core`
rather than on its own. How the three fit together, when to break the sequence, and what a
client without slash commands does and does not give you are in
[`docs/delivery/WORKFLOW.md`](docs/delivery/WORKFLOW.md).

**Any other agent** — attach the repo as a sibling checkout and point it at
[`AGENTS.md`](AGENTS.md). No install step, no client support required.

## Attaching versus installing

Both work, and they are for different situations.

| | Attach the repo to the session | Install the plugins |
|---|---|---|
| The agent sees | Every document in `docs/`, in full | Twenty skill descriptions; a standard loads only when its skill fires |
| Good for | Working *on* the standards; a deep review where you want the whole corpus present | Working on *any other* repo, without a checkout of this one |
| Costs | A repo in the workspace | ~155–990 tokens per plugin, per session |
| Entry point | [`AGENTS.md`](AGENTS.md) | The skill descriptions |

Attaching stays the right answer for editing the standards themselves. Installing is
what makes them available in the twenty repos that should be obeying them.

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

## Cost

Skills are loaded on demand, so a plugin's standing cost is only its skill descriptions.
Measured with `claude plugin details`:

| Plugin | Always-on |
|---|---|
| `architecture-core` | ~990 tokens |
| `deployment-and-platform` | ~820 |
| `quality-and-process` | ~850 |
| `services-and-clients` | ~670 |
| `research-standards` | ~155 |
| `ticket-delivery` | ~1,350 (estimated) |

All six is roughly 4.8k tokens per session. Installing only the ones a repo actually needs
is the reason the standards are split into six plugins rather than shipped as one.

The `ticket-delivery` figure is estimated from its skill descriptions rather than
measured, because it has not been installed anywhere yet; replace it with the measured
number on first install.

## Two clients, one tree

The clients disagree on two details, so the generator emits both spellings:

- **Plugin manifest** — Copilot and the Agent Plugins format read `plugin.json` at the
  plugin root; Claude Code reads `.claude-plugin/plugin.json`. Both are written, and the
  validator fails if they diverge.
- **Agent filenames** — in `.github/agents/` Copilot requires the `.agent.md` extension;
  inside a plugin, Claude Code derives the agent's name from the filename, so a
  `.agent.md` suffix would surface it as `architecture-review.agent`. Plugins therefore
  carry plain `.md`.

Marketplace `source` paths are written as `./plugins/<name>`: Claude Code rejects a bare
relative path, and Copilot resolves both spellings identically.

## Versioning

Every plugin here is versioned, and the number is meant to answer one question for
somebody who already installed it: **what does upgrading cost me?**

| Bump | When | What it costs the consumer |
|---|---|---|
| **major** | A rule is **reversed or withdrawn** — guidance that said X now says not-X, or a requirement is gone | Work already done to the old rule has to be undone or redone. Re-audit the repos that followed it |
| **minor** | Guidance is **added** — a new guide, a new section, a new checklist item, a new failure-mode row | Nothing you built is now wrong; there is simply more to be compliant with |
| **patch** | What is required **does not change** — a clarification, a refreshed or re-pointed worked example, a corrected line number, formatting, link fixes | Nothing. Read it if you like |

That answers the two cases this policy was written for. **A new checklist item is a
minor**, not a major: a repo that passed yesterday is now incompletely compliant rather
than wrongly built, and those are different bills. **A reversed rule is a major** even
when the diff is one sentence, because the cost lands in the consumer's repository
rather than in this one.

The marketplace's own `version` in `catalog/marketplace.catalog.json` is separate, and
tracks the *packaging* — the manifest shape, the set of plugins, how skills are laid out
— not the standards inside it.

### The number is set by hand, and the build refuses to let you forget it

A plugin's version is hand-written in `catalog/marketplace.catalog.json`. It is
deliberately **not** derived from the bundled documents, because the significance of an
edit is not computable from its diff: only a person can say whether a rewritten paragraph
reverses a rule, adds one, or just explains the same rule better. A tool that guessed
would eventually publish a major as a patch, which is worse than not versioning at all.

So the generator does not decide the number. It enforces that somebody decided:

```sh
node scripts/build-marketplace.mjs
# Plugin content changed without a version bump:
#   deployment-and-platform: content changed but version is still 1.0.0.
#   Bump it in catalog/marketplace.catalog.json per MARKETPLACE.md "Versioning".
```

`catalog/versions.lock.json` records the content digest each version shipped. When a
plugin's generated content differs from what its current version last shipped, the build
fails until the version moves — in a plain run as well as under `--check`, so a
regeneration cannot quietly launder the change into the lock. Bumping the version is what
accepts the new content, and the lock then records the pair.

Bumping with no content change is allowed and does nothing but re-release; the gate only
ever fires in one direction.

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
