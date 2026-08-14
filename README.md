# architecture-standards

Canonical architecture reference for the estate (copilot-scope, AureliusPromptus,
primates, FSE.CORE, and future repos).

- [`docs/architecture/00-REFERENCE-ARCHITECTURE.md`](docs/architecture/00-REFERENCE-ARCHITECTURE.md)
  — the 15-principle blueprint, each principle backed by a working example, plus a
  compliance checklist. This is the constitution: read it, don't re-derive it.
- [`docs/guides/FLY-IO-DEPLOYMENT.md`](docs/guides/FLY-IO-DEPLOYMENT.md) — the
  operational guide behind principles P7 and P12: how to make any app deployable to
  Fly.io, every `fly.toml` field annotated, the tag-driven pipeline, and the failure
  modes each rule exists to prevent.
- [`docs/guides/AZURE-AI-FOUNDRY-AGENTS.md`](docs/guides/AZURE-AI-FOUNDRY-AGENTS.md) —
  the operational guide for provisioning Azure AI Foundry agents: the Hub/Project/
  Connection Bicep pattern, per-service managed identity and RBAC (including the
  two-role gotcha that costs the most time), the agent-as-code + startup-bootstrapper
  pattern, `azd` provisioning, GitHub Actions → Azure authentication, and what's cheap
  versus expensive to re-provision per PR environment.
- [`docs/guides/E2E-ACCEPTANCE-TESTING.md`](docs/guides/E2E-ACCEPTANCE-TESTING.md) — the
  operational guide behind P13's E2E layer: what makes a passing test mean something
  (assertion discipline, locator and waiting conventions), why CI wiring is part of a
  suite's definition of done, and how to audit a suite you inherited — including the tells
  that a bulk-generated suite was never fact-checked. Extracted from a full audit of
  AureliusPromptus's 447-test suite that found ~45% of it silently asserted nothing.
- [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md) — how to start a Claude Code session against
  any repo to either review it against this architecture or modernize it toward it,
  including the ready-to-use session prompt template and which repos to attach.

## Origin

The blueprint was extracted from two systems that already follow it — `copilot-scope`
and `AureliusPromptus` — and was originally kept inside `FSE.CORE/docs/architecture/`
while that repo was being modernized against it. It moved here so it has one stable,
neutral home instead of living inside the repo it was also being used to judge.
