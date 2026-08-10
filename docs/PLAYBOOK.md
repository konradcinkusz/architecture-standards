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

FSE predates the architecture and is being modernized toward it; its
`docs/architecture/` directory (`00-SECURITY-IMMEDIATE.md` … `07-STANDARDS-FEEDBACK.md`)
is the worked example of what a RECOVER session produces.

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
  MODERNIZE  — repo predates the architecture and needs restructuring,
               but still builds. Produce the 5-document set in
               docs/architecture/: 01-CURRENT-STATE, 02-GAP-ANALYSIS,
               03-TARGET-ARCHITECTURE, 04-MIGRATION-PLAN, 05-DECISIONS —
               each measured against the 00-REFERENCE-ARCHITECTURE.md
               checklist, not against copilot-scope/AureliusPromptus
               directly.
  RECOVER    — repo does not build, or its dependencies/source are partly
               lost. Produce the MODERNIZE set plus 00-SECURITY-IMMEDIATE
               and a dedicated dependency analysis, and open the plan with
               an archaeology phase before any target design is fixed.
               FSE is the worked example.
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
| Repo predates the architecture (custom DI container, monolith host, no shared kernel) but builds | MODERNIZE |
| `dotnet restore`/`build` fails · TFM out of support · packages referenced with no reachable feed · production credentials in source | **RECOVER** |
| Unsure | Let the agent look first and recommend one |

### Why RECOVER is its own mode

MODERNIZE assumes a running system to move incrementally — the strangler-fig
assumption. When the repo does not build, that assumption fails silently and the
resulting plan reads well but cannot be started. FSE made this concrete: no
`nuget.config` for six private packages, 19 namespaces imported from source that exists
nowhere, and two out-of-support target frameworks. There was no "make a small change and
verify it" entry point at all.

A RECOVER plan therefore begins with **archaeology, not design**:

1. Reconstruct the schema from whatever survives. If a database is live, dump it — with
   no migrations it is the only truth and it will disagree with the ORM model. If the
   infrastructure is gone, the ORM's own model snapshots are usually a complete schema
   description that nobody thinks to look at: FSE's `PrimatesContextModelSnapshot.cs`
   turned out to specify 42 entities, 23 of which exist in no surviving source file.
2. Attempt package/source recovery (decompile what is still on the feed), time-boxed.
3. Extract the API contract from whatever clients still run — a working frontend is an
   executable specification of every endpoint that matters.
4. Resolve every "is this still deployed?" question **before** anything depends on the
   answer.
5. Only then fix the target design.

It also front-loads `00-SECURITY-IMMEDIATE.md`: a repo that has been unbuildable for
years has almost certainly been accumulating credentials in source. Triage them by
whether they outlive the infrastructure — credentials to deleted cloud resources are
inert, but third-party accounts (payment, email, SMS) keep billing and keep working long
after the servers are gone, and those are the ones with a clock on them.

## Output conventions

Both modes write into the target repo's own `docs/architecture/`, not into
`architecture-standards`. This repo only holds the shared reference and this playbook —
it accumulates no per-system review or migration content of its own.
