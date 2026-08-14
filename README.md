# architecture-standards

Canonical architecture reference for the estate (copilot-scope, AureliusPromptus,
primates, FSE.CORE, and future repos).

## The constitution

- [`docs/architecture/00-REFERENCE-ARCHITECTURE.md`](docs/architecture/00-REFERENCE-ARCHITECTURE.md)
  — the 15-principle blueprint, each principle backed by a working example, plus a
  compliance checklist. This is the constitution: read it, don't re-derive it.

## Operational guides

Each guide is repo-agnostic: rules plus the reasons, with worked examples cited from
the estate. Starting a new project — or adding a capability to an existing one — begin
with the constitution, then pull in the guides the work touches.

**Deployment and platform**

- [`docs/guides/FLY-IO-DEPLOYMENT.md`](docs/guides/FLY-IO-DEPLOYMENT.md) — the
  operational guide behind principles P7 and P12: how to make any app deployable to
  Fly.io, every `fly.toml` field annotated, the tag-driven pipeline, and the failure
  modes each rule exists to prevent.
- [`docs/guides/AZURE-AI-FOUNDRY-AGENTS.md`](docs/guides/AZURE-AI-FOUNDRY-AGENTS.md) —
  provisioning Azure AI Foundry agents: the Hub/Project/Connection Bicep pattern,
  per-service managed identity and RBAC (including the two-role gotcha), agent-as-code
  provisioned by a run-and-exit job, `azd` versus `az deployment` in CI, GitHub Actions →
  Azure authentication, and PR-environment cost classification.
- [`docs/guides/AZURE-OPERATIONS.md`](docs/guides/AZURE-OPERATIONS.md) — the rest of
  Azure: passwordless SQL end to end, provision-vs-deploy staleness, the permission
  matrix document, CI credential preflight and soft-delete recovery, Container Apps
  manifest idioms and job escape hatches.
- [`docs/guides/PR-PREVIEW-ENVIRONMENTS.md`](docs/guides/PR-PREVIEW-ENVIRONMENTS.md) —
  ephemeral per-PR environments: naming as isolation, shared-vs-per-PR classification,
  sticky status comments, and teardown that actually tears down.
- [`docs/guides/PRIVATE-CLOUD-DELIVERY.md`](docs/guides/PRIVATE-CLOUD-DELIVERY.md) —
  selling the SaaS as self-hosted: the vendor-pushes-images / customer-runs-everything
  split, the per-client registry, the IaC you hand over, and the one-flag product
  switch.

**Building services and clients**

- [`docs/guides/SERVICE-API-PATTERNS.md`](docs/guides/SERVICE-API-PATTERNS.md) —
  recurring in-service patterns: rate limiting, endpoint organization, validation,
  pagination, hardened cross-service HTTP, queue-less background jobs, and the
  migration completion signal.
- [`docs/guides/IDENTITY-AND-ACCOUNTS.md`](docs/guides/IDENTITY-AND-ACCOUNTS.md) —
  the identity service beyond token signing: refresh rotation, OAuth callbacks and
  account linking, enumeration safety, lockout, deletion, versioned legal consent.
- [`docs/guides/PAYMENTS-AND-MONETIZATION.md`](docs/guides/PAYMENTS-AND-MONETIZATION.md)
  — merchant-of-record reasoning, mock-first payment integration, webhook discipline,
  the subscription lifecycle, quota/metering with deliberate fail-open, and the
  SaaS-to-self-hosted tenant switch.
- [`docs/guides/FRONTEND-BFF.md`](docs/guides/FRONTEND-BFF.md) — browser talks only to
  its own origin: runtime configuration, HttpOnly cookie sessions, verifying edge
  middleware, the catch-all proxy with a candidate ladder, and the shared web kernel.
- [`docs/guides/BROWSER-EXTENSIONS.md`](docs/guides/BROWSER-EXTENSIONS.md) — the
  fourth client: MV3 patterns, web-to-extension session handoff, per-site adapters,
  CI packaging per environment, store submission, and self-distribution with release
  channels.

**Quality and process**

- [`docs/guides/TESTING-STRATEGY.md`](docs/guides/TESTING-STRATEGY.md) — the strategy
  above P13: the E2E charter, three layers with budgets, the when-to-run matrix,
  the per-test quality bar, what only a human can test, and how test configs rot.
- [`docs/guides/E2E-ACCEPTANCE-TESTING.md`](docs/guides/E2E-ACCEPTANCE-TESTING.md) — the
  operational guide behind P13's E2E layer: what makes a passing test mean something
  (assertion discipline, locator and waiting conventions), why CI wiring is part of a
  suite's definition of done, and how to audit a suite you inherited — including the
  tells that a bulk-generated suite was never fact-checked.
- [`docs/guides/SECURITY-REVIEW.md`](docs/guides/SECURITY-REVIEW.md) — the repeatable
  review method (justified N/A, the finding format, the readiness ledger) plus the
  recurring rule sets: browser tokens, CSPRNG, path validation, rendering, and
  authorization structure.
- [`docs/guides/REPO-BASELINE.md`](docs/guides/REPO-BASELINE.md) — what every repo
  carries before its first feature: hygiene files, secret scanning, one-command
  onboarding, operational script conventions, workflow lifecycle, and in-repo AI
  agent definitions.
- [`docs/guides/README-BADGES.md`](docs/guides/README-BADGES.md) — the README badge
  standard: the header metadata row and footer social block, which badge service is
  used for what, and the rules (every badge a titled link, no copy-paste drift,
  don't badge what you don't have) that keep a badge row honest.

## Research standards

- [`docs/research/00-RESEARCH-DOCUMENTATION.md`](docs/research/00-RESEARCH-DOCUMENTATION.md)
  — how a repo documents scientific research: the `docs/research/` layout, the
  study document shape, and the evidence rules (every number traceable,
  reproduction as a command, validate the instrument before trusting its
  readings, negative results get written up).
- [`docs/research/TEMPLATE.md`](docs/research/TEMPLATE.md) — the copy-paste
  skeleton for starting a new study.

## The playbook

- [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md) — how to start a Claude Code session against
  any repo to either review it against this architecture or modernize it toward it,
  including the ready-to-use session prompt template and which repos to attach.

## Origin

The blueprint was extracted from two systems that already follow it — `copilot-scope`
and `AureliusPromptus` — and was originally kept inside `FSE.CORE/docs/architecture/`
while that repo was being modernized against it. It moved here so it has one stable,
neutral home instead of living inside the repo it was also being used to judge. The
operational guides were extracted the same way: each generalizes something a repo in
the estate already does (or demonstrably failed to do), with the worked example cited
at the end of the guide.
