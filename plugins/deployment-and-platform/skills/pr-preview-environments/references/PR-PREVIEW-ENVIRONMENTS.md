<!-- Generated copy of docs/guides/PR-PREVIEW-ENVIRONMENTS.md — do not edit. Relative links have been rewritten to absolute repository URLs. -->

# Ephemeral PR preview environments

Every pull request can get its own running copy of the estate — deployed on PR events,
linked from a comment, destroyed on close. The Fly.io guide (§10–§12) covers the
static environments; this guide covers what changes when environments are born and die
with a PR. The two hard problems are not deployment: they are **deciding what is
shared** and **guaranteeing teardown**.

It is deliberately repo-agnostic. The worked example is
`AureliusPromptus/.github/workflows/flyio-pr-env-deploy.yml` and its two destroy
companions, with the Azure cost half in the Foundry guide §10.

**Contents**

1. [The model in one paragraph](#1-the-model-in-one-paragraph)
2. [Naming is the isolation mechanism](#2-naming-is-the-isolation-mechanism)
3. [Shared vs per-PR: decide before the bill does](#3-shared-vs-per-pr)
4. [The deploy workflow](#4-the-deploy-workflow)
5. [Teardown](#5-teardown)
6. [Cost posture](#6-cost-posture)
7. [Failure modes](#7-failure-modes)
8. [Checklist](#8-checklist)

---

## 1. The model in one paragraph

A preview environment is the estate's app set suffixed `-pr-{number}`, deployed by a
workflow keyed to PR events, sharing the expensive substrate (database server, AI
accounts) while owning everything cheap (apps, databases, config), announced through a
single sticky PR comment, and destroyed — idempotently — when the PR closes. It exists
to run smoke E2E against a real deployment
([`TESTING-STRATEGY.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/TESTING-STRATEGY.md) §4) and to let a reviewer click the
thing.

## 2. Naming is the isolation mechanism

- **Fly-style platforms**: every app name gets the `-pr-{number}` suffix; URLs are
  derivable from the PR number alone, so the workflow computes them once as env vars
  and every later step (deploy, comment, smoke test) reads the same values.
- **Azure/Bicep**: when the resource group is `rg-${environmentName}` and every
  resource name derives from `uniqueString(resourceGroup().id)`, a per-PR
  `environmentName` yields a fully disjoint resource set with **zero further work** —
  that is the payoff of the deterministic-naming rule in the Foundry guide §4.
- Client artifacts built per PR (a browser extension, an installer) are pinned to
  their environment by an **artifact label** (`pr-123`) in the distribution channel
  ([`BROWSER-EXTENSIONS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/BROWSER-EXTENSIONS.md) §7), so the preview never serves
  a build from another branch.

## 3. Shared vs per-PR

Naming makes full isolation *free to express* — and expensive to run. Classify every
resource before wiring the workflow, in a committed doc, with each row citing the
`file:line` that creates the resource (the citation is what keeps the doc true):

- **Per-PR**: apps/containers, per-PR *databases* on the shared server (created
  idempotently at deploy — the same "missing ⇒ create" guard as the Fly bootstrap),
  config, managed identities.
- **Shared**: the database *server*, AI/LLM accounts and model deployments (quota-
  limited, slow, expensive — the Foundry guide §10 trap), anything needing manual
  verification (domains, certificates).
- **State the negative findings too**: "nothing else is shared" is information; an
  implicit answer is how every PR silently re-provisions an OpenAI account.

Thread shared resources in as parameters; the default of "the template creates
everything it names" is the expensive default.

## 4. The deploy workflow

- Trigger on PR events, with a **draft guard**: draft PRs skip deployment. Put the
  guard in a job **without an `environment:` binding** — a guard job bound to a
  protected environment stalls every draft PR on an approval prompt nobody will
  answer.
- `concurrency: pr-env-{number}` so a force-push mid-deploy queues rather than
  interleaves.
- Reuse the tag pipeline's discipline (build once, deploy ordered, missing-app ⇒
  create); the difference is only *which* names.
- **One sticky comment, edited in place** — created on first deploy, updated on
  redeploy with the URLs and image tag, rewritten to "environment destroyed" by
  teardown. A comment per deploy turns the PR into a log; the sticky comment is the
  environment's status page.

## 5. Teardown

Teardown is the half that erodes, so it gets three layers:

1. **Automatic**: on PR close (merged or not), destroy every `-pr-{number}` resource
   **idempotently** — a missing app is a skip, not a failure, because half-destroyed
   environments must be re-destroyable.
2. **Manual escape hatch**: a `workflow_dispatch` twin taking a PR number, for
   orphans left by a workflow bug or a renamed app.
3. **Legacy aliases**: the destroy list carries historical app-name prefixes from
   before any rename ([`REPO-BASELINE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/REPO-BASELINE.md) §4) — teardown that only
   knows current names strands the old ones forever.

Destroy the per-PR databases with the apps; the shared server stays.

## 6. Cost posture

Preview apps scale to zero aggressively (`min_machines_running = 0` everywhere — the
cold-start exception for synchronous paths does not apply to previews; a slow first
click is fine). The real cost lever is §3: at more than a few concurrent PRs, what you
share dominates what you run. If previews still cost too much, the next lever is
deploying previews on demand (a label or a comment command) instead of on every PR.

## 7. Failure modes

| Symptom | Cause |
|---|---|
| Draft PRs stuck "waiting for approval" | The draft-guard job is bound to a protected `environment:` |
| Two deploys interleave after a force-push | No per-PR concurrency group |
| Preview calls another branch's services | URLs hand-built in one step instead of computed once from the PR number |
| Every PR provisions a new AI account | Shared resources not threaded as parameters; classification doc missing or ignored |
| Teardown fails on half-destroyed environments | Destroy treats a missing resource as an error; make it a skip |
| Orphaned environments after a rename | Destroy list lacks legacy aliases |
| PR thread unreadable | Comment per deploy instead of one sticky comment edited in place |
| Preview extension/installer from the wrong branch | Artifact not pinned by PR label in the distribution channel |

## 8. Checklist

- [ ] `-pr-{number}` suffix everywhere; URLs computed once from the PR number
- [ ] Shared-vs-per-PR classification committed, rows citing creating `file:line`, negatives stated
- [ ] Per-PR databases created idempotently on the shared server; shared resources passed as parameters
- [ ] Draft guard without an environment binding; per-PR concurrency group
- [ ] Sticky comment created/updated on deploy, rewritten on destroy
- [ ] Close-triggered idempotent teardown + manual escape hatch + legacy aliases
- [ ] Preview artifacts pinned by PR label
- [ ] Everything scales to zero; on-demand previews as the next cost lever

---

Worked example: `AureliusPromptus/.github/workflows/flyio-pr-env-deploy.yml`,
`flyio-pr-env-destroy.yml`, `flyio-pr-env-destroy-manual.yml`, and
`AureliusPromptus/docs/PR_DEPLOYMENT_RESOURCE_CLASSIFICATION.md` (the evidence-cited
classification).
