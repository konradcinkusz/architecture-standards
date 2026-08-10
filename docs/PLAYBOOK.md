# Architecture Session Playbook

How to start a Claude Code session against any repo in the estate to either **review**
it against the reference architecture or **modernize** it toward that architecture.

## Why this exists

[`docs/architecture/00-REFERENCE-ARCHITECTURE.md`](architecture/00-REFERENCE-ARCHITECTURE.md)
in this repo is the one architectural constitution for the estate: 15 principles, each
backed by a working example in copilot-scope or AureliusPromptus, plus a compliance
checklist. It must not be re-derived from scratch in every session — an agent should
read it, not reconstruct it from first principles each time.

Two systems already broadly follow it, with known deviations catalogued:
- `copilot-scope/docs/architecture/ARCHITECTURE_REVIEW.md`
- `AureliusPromptus/docs/architecture/ARCHITECTURE_REVIEW.md`

FSE.CORE predates the architecture and is being modernized toward it; its
`docs/architecture/` directory (`01-CURRENT-STATE.md` … `05-DECISIONS.md`) is the worked
example of what a MODERNIZE session produces.

## Session prompt template

Copy this into a new session, fill in the target block, and attach the repos listed
under "What to attach" below.

```
I maintain one established reference architecture across my repos (.NET Aspire +
Fly.io, container-per-service, one shared "ServiceDefaults" kernel per system,
database-per-service, JWT/JWKS auth, tag-driven CI/CD to GHCR). It is fully
documented and must NOT be re-derived from scratch — read this first:

  architecture-standards/docs/architecture/00-REFERENCE-ARCHITECTURE.md
    — 15 principles, each with a working example, plus a compliance checklist.

Two systems that already broadly follow it, with known deviations catalogued:
  copilot-scope/docs/architecture/ARCHITECTURE_REVIEW.md
  AureliusPromptus/docs/architecture/ARCHITECTURE_REVIEW.md

── Target for this session ──────────────────────────────────────────────
Repo:     <REPO_NAME>
Context:  <1-2 sentences: what it is, how old, live/legacy/greenfield, why
           it's being looked at now>

Mode (pick one, or let the agent recommend one after a first look):
  REVIEW     — repo is expected to already roughly follow the architecture.
               Produce one docs/architecture/ARCHITECTURE_REVIEW.md, in the
               SAME style as the two examples above: strengths, findings
               ranked by severity with concrete failure scenarios, an
               alignment-actions table. No migration plan.
  MODERNIZE  — repo predates the architecture and needs restructuring.
               Produce the 5-document set in docs/architecture/, mirroring
               FSE.CORE's: 01-CURRENT-STATE, 02-GAP-ANALYSIS,
               03-TARGET-ARCHITECTURE, 04-MIGRATION-PLAN, 05-DECISIONS —
               each measured against the 00-REFERENCE-ARCHITECTURE.md
               checklist, not against copilot-scope/AureliusPromptus
               directly.
──────────────────────────────────────────────────────────────────────────

Docs only for now, no code changes, unless I say otherwise. Commit to a new
branch and push when done; don't open a PR unless I ask.
```

## What to attach to the session

- **Always:** the target repo + `architecture-standards` (this repo) — without the
  latter the agent has no reference point and will re-derive principles from
  copilot-scope/AureliusPromptus instead of reading them.
- **Optional — `copilot-scope` / `AureliusPromptus`:** attach only for MODERNIZE mode,
  when you want the agent to copy real code (e.g. `ServiceDefaults`, the `fly.toml`
  pattern), the way it was done for the FSE.CORE plan. For REVIEW alone they aren't
  needed — the whole pattern is already described in the blueprint.

## Choosing REVIEW vs MODERNIZE

| Signal | Mode |
|---|---|
| Repo already uses Aspire, a ServiceDefaults-equivalent, per-service DB | REVIEW |
| Repo predates the architecture (custom DI container, monolith host, no shared kernel) | MODERNIZE |
| Unsure | Let the agent look first and recommend one |

## Output conventions

Both modes write into the target repo's own `docs/architecture/`, not into
`architecture-standards`. This repo only holds the shared reference and this playbook —
it accumulates no per-system review or migration content of its own.
