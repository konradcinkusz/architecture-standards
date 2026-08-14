<!-- Generated copy of docs/guides/REPO-BASELINE.md — do not edit. Relative links have been rewritten to absolute repository URLs. -->

# Repository baseline and developer tooling

What every repository in the estate carries before its first feature: the hygiene
files, the automation that keeps humans honest, the onboarding script, and the
conventions for operational scripts. None of this is glamorous; all of it was motivated
by a real failure in the estate — most sharply, live credentials committed in a tracked
helper script that no pre-commit hook existed to catch.

It is deliberately repo-agnostic. The worked example is the reference SaaS — partly as
a model (its setup script, runbook scripts, `.dockerignore`) and partly as the
cautionary tale (its missing baseline).

**Contents**

1. [The baseline](#1-the-baseline)
2. [Secret hygiene](#2-secret-hygiene)
3. [One-command onboarding](#3-one-command-onboarding)
4. [Operational scripts](#4-operational-scripts)
5. [Workflow lifecycle](#5-workflow-lifecycle)
6. [AI agent definitions live in the repo](#6-ai-agent-definitions-live-in-the-repo)
7. [Documentation staleness](#7-documentation-staleness)
8. [Checklist](#8-checklist)

---

## 1. The baseline

| Item | The failure it prevents |
|---|---|
| `CODEOWNERS` | Security-relevant paths merged without the right reviewer |
| Dependency update automation (Dependabot/Renovate) | Vulnerable pins nobody owns; the "we'll update later" that never comes |
| `.editorconfig` | Per-IDE formatting wars across a multi-project solution |
| `Directory.Build.props` + `Directory.Packages.props` | Ten `.csproj` files each pinning their own package versions; upgrading one library means ten diffs and version skew inside one solution |
| PR + issue templates | Reviews and reports without repro/impact; templates are the cheapest process you can install |
| Real `.gitattributes` | The stock template with every rule commented out is decoration, not configuration |
| `.dockerignore`, exclusion-based for a monorepo | Every backend image build shipping the frontends, `tests/`, and the infra tree as build context |
| Secret scanning: pre-commit **and** CI | §2 |
| CodeQL / SAST + dependency audit in CI | Static analysis exists only when a human remembers to run it |
| CI runs the linters and tests the repo claims | The committed-but-never-executed config problem ([`TESTING-STRATEGY.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/TESTING-STRATEGY.md) §9) |

P5 already makes the secret scanner mandatory. The rest of this table is the same
logic applied one ring out: **anything enforced only by human recall is not enforced.**

## 2. Secret hygiene

The estate's recorded failure mode: a script that mirrors a CI job for local debugging
— genuinely a good pattern (§4) — committed with live credentials pasted in, because
inline literals were the path of least resistance and nothing said no.

- Pre-commit hook (gitleaks or equivalent) **and** a CI job. The hook catches the
  mistake before it becomes history; the CI job catches contributors without hooks.
- Local scripts read secrets **only from a gitignored `.env`** (with a committed
  `secrets.env.example` documenting every variable, its tier — always required /
  required in CI / optional — and where its value comes from). A script that needs a
  secret takes it from the environment or refuses to run, listing what is missing by
  name.
- When a secret does land in history: rotate first, clean history second. The commit
  is public the moment it is pushed; scrubbing without rotating is theater.

## 3. One-command onboarding

One interactive setup script per repo, structured as numbered steps:

1. Check prerequisites (runtimes, container engine) and fail with install pointers.
2. Initialize the local secret store (`dotnet user-secrets` or equivalent) — never
   files in the working tree.
3. Generate the **single mandatory secret** (e.g. the JWT dev secret) rather than
   asking the developer to invent one.
4. Offer each third-party integration as a clearly labeled **optional** step —
   `(optional — needed for <feature>)` — so skipping is informed: the developer learns
   exactly which feature degrades (P8), and a fresh clone with every option skipped
   still runs.

Pair it with a troubleshooting table **keyed on the literal exception text** the
developer will see (`IDX10703: … key length is zero` → the secret is empty → run the
setup script or set the variable). Error-text-keyed tables get found by paste-search;
symptom prose does not. And document the secret's journey once — local store →
orchestrator parameter → environment variable → config key — so "where does this value
come from" has one answer.

## 4. Operational scripts

Conventions extracted from the runbook directory that ops actually used:

- **Numbered runbook, descriptive implementations.** `0-setup-first-time`, `1-build-push`,
  `2-deploy-dev`, `3-destroy-dev` are thin aliases delegating to descriptively named
  scripts. The numeric prefix *is* the documentation of order; the descriptive name is
  what you grep for.
- **Hand-off tokens over memory.** The build script writes the pushed image tag to a
  small file (`.last-image-tag`); the deploy script resolves the tag as explicit
  parameter → hand-off file → `latest`, in that documented order. No "which tag did I
  just build?".
- **Each script self-sufficient**: shared helpers (resource-group resolution,
  credential checks) are duplicated or sourced so any script runs alone; a required-
  variables loop fails fast naming each missing variable.
- **A README beside the scripts** listing every environment variable by tier, plus
  worked recipes for the common partial operations ("reprovision one thing without a
  full redeploy").
- **Local mirrors of CI jobs** — a script that reproduces a CI job 1:1 so the job can
  be debugged without pushing a tag — with secrets from the gitignored `.env` (§2),
  never inline.
- **Destroy scripts carry historical names.** After a rename, teardown lists include
  the legacy aliases, or the old resources outlive every cleanup and bill forever.
- Bulk history/cleanup scripts (e.g. deleting Actions runs) paginate correctly and
  treat individual failures as skips, not aborts.

## 5. Workflow lifecycle

**Archive, don't delete — and don't comment out.** A retired workflow moves to
`.github/workflows-archive/` with a README line saying why: it disappears from the
Actions UI (a directory move de-registers it) while staying diffable and restorable.
The anti-pattern seen in the wild: a workflow "disabled" by commenting out its
triggers and leaving a stub `workflow_dispatch` — it still shows in the UI, still
invites a manual run, and its real trigger intent now lives in a comment.

## 6. AI agent definitions live in the repo

Assistant/agent configurations (Claude Code subagents, Copilot agents) are
version-controlled next to the code they operate on, reviewed like code. The rules
that make them work:

- **Tool allowlists are a safety boundary**: an analysis/documentation agent gets
  read-only tools by construction, not by convention.
- **The description is the router.** Automatic delegation works when the description
  embeds worked invocation examples; a one-line description does not route.
- Persistent agent memory, if used, is project-scoped, committed, and governed by an
  explicit save/don't-save policy.
- **Repo-relative paths only.** An absolute path in an agent definition (a real
  finding: a hardcoded `C:\Repos\…`) breaks every other machine and CI.

A skills/competency inventory derived from the infrastructure — each skill mapped to
the file that demonstrates it — doubles as an onboarding curriculum and a bus-factor
audit; cheap to generate, worth keeping current.

## 7. Documentation staleness

**A stale README is a review finding, not a cosmetic issue.** The estate's worked
example documented a different framework version, a dead technology choice and three
services that no longer existed — "a reader learns nothing true about the current
system", which is strictly worse than no README. Two rules:

- The README's claims (stack, services, how to run) are part of every review's scope
  (P14's corollary).
- **One source of truth per environment variable.** When the same topology is defined
  in multiple places (dev composition, publish manifest, platform config), name which
  one is authoritative per variable — the worked example's drift was found exactly
  there, a variable present in the dev branch of the composition root and missing in
  the publish branch.

## 8. Checklist

- [ ] `CODEOWNERS`, dependency-update automation, `.editorconfig`, central package management, PR/issue templates, real `.gitattributes`, exclusion-based `.dockerignore`
- [ ] Secret scanning pre-commit + CI; local scripts read secrets from gitignored `.env` with a committed example file; rotation before history-scrubbing
- [ ] One-command interactive setup: prerequisites, secret store init, generated mandatory secret, labeled optional integrations; error-text-keyed troubleshooting table; secret-flow documented
- [ ] Runbook scripts numbered + delegating; hand-off token files with documented resolution order; self-sufficient scripts; scripts README with variable tiers; CI jobs mirrored locally; destroy lists carry legacy names
- [ ] Retired workflows archived to `workflows-archive/`, never comment-disabled
- [ ] AI agent definitions in-repo: allowlisted tools, example-bearing descriptions, committed memory policy, repo-relative paths
- [ ] README claims verified in review; one named source of truth per environment variable

---

Worked examples: `<saas>/setup.ps1` (onboarding), `<saas>/flyio/*.ps1`
(numbered runbook, `.last-image-tag`, legacy-alias teardown),
`<saas>/scripts/` (self-sufficiency, script README),
`.github/workflows-archive/` (archive convention), `.claude/agents/` +
`.github/agents/` (agent definitions) — and the absences catalogued in this guide's
§1 table as the anti-example.
