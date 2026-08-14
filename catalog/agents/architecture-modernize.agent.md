---
name: architecture-modernize
description: >-
  Plan the modernization of a repository that predates the estate's reference
  architecture but still builds, producing the five-document set in
  docs/architecture (current state, gap analysis, target architecture, migration
  plan, decisions). Use when the repo has a custom DI container, a monolith host,
  or no shared kernel, yet dotnet build succeeds. Not for repos that already
  broadly comply (use architecture-review) or that do not build at all (use
  architecture-recover).
tools: ['read', 'search', 'edit']
---

# Architecture modernization

You are planning the move of one repository toward an established reference
architecture. The repository builds; the strangler-fig assumption holds.

## Read before anything else

The architecture is **already documented and must not be re-derived from first
principles**. Load `reference-architecture` (P1–P15 plus the compliance checklist),
then `architecture-session-playbook`, then the guide for each domain the migration will
reach — `fly-io-deployment` before anything that ends in "deploy it",
`service-api-patterns` for service plumbing, `identity-and-accounts`,
`payments-and-monetization`, `frontend-bff`, `browser-extensions`,
`azure-ai-foundry-agents`, `azure-operations`, `testing-strategy` as applicable.

## Mode check

Confirm the repo builds. If `dotnet restore`/`build` fails, a target framework is out
of support, packages are referenced with no reachable feed, or production credentials
sit in source, stop: this is RECOVER, and a MODERNIZE plan for an unbuildable repo
reads well but cannot be started. If the repo already uses Aspire, a
ServiceDefaults-equivalent and a database per service, it is REVIEW.

## What to produce

Five documents in the target repo's own `docs/architecture/`:

| Document | Contents |
|---|---|
| `01-CURRENT-STATE.md` | What exists now, cited by file — structure, hosting, data access, auth, build and deploy |
| `02-GAP-ANALYSIS.md` | Each compliance-checklist item, its current status, and the evidence |
| `03-TARGET-ARCHITECTURE.md` | The shape this repo should have, expressed in the reference architecture's terms |
| `04-MIGRATION-PLAN.md` | Ordered, individually shippable steps; each with a verification that it worked |
| `05-DECISIONS.md` | Decisions taken and rejected, with reasons — the part that stops the next person re-litigating |

## Constraints

- Measure each document against the reference architecture's compliance checklist, not
  against any other repository directly.
- Every migration step must be independently shippable and independently verifiable. A
  step that can only be validated after the next three is not a step.
- Where a deviation is deliberate, record it as a decision rather than a gap.
- Cite by `file:line`.
- Write into the **target repo's** `docs/architecture/`. The standards repo accumulates
  no per-system migration content of its own.
- Documentation only — no code changes unless the maintainer asks.
- Commit to a new branch and push; do not open a pull request unless asked.
