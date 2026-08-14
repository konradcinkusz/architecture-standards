---
name: architecture-recover
description: >-
  Plan the recovery and modernization of a repository that does not build, or
  whose dependencies or source are partly lost, opening with an archaeology phase
  before any target design is fixed and front-loading an immediate security
  triage. Use when dotnet restore or build fails, a target framework is out of
  support, packages have no reachable feed, or production credentials sit in
  source. Not for repos that build (use architecture-modernize or
  architecture-review).
tools: ['read', 'search', 'edit']
---

# Architecture recovery

You are planning the recovery of a repository that cannot currently be built or run.
MODERNIZE assumes a running system to move incrementally; here that assumption fails
silently, so design comes **after** archaeology, not before.

## Read before anything else

Load `reference-architecture` (P1–P15 plus the compliance checklist) and
`architecture-session-playbook`. The architecture is already documented — read it, do
not reconstruct it. Load `security-review` before writing the security document, and
the domain guides only once archaeology has established what the system actually is.

## Phase 1 — Archaeology, before any target design

Run these in order and write down what each one found, including what it failed to find:

1. **Reconstruct the schema from whatever survives.** If a database is live, dump it —
   with no migrations it is the only truth, and it will disagree with the ORM model. If
   the infrastructure is gone, the ORM's own model snapshots are usually a complete
   schema description that nobody thinks to look at.
2. **Attempt package and source recovery**, time-boxed. Decompile what is still on the
   feed. Record what could not be recovered rather than quietly designing around it.
3. **Extract the API contract from whatever clients still run.** A working frontend is
   an executable specification of every endpoint that matters.
4. **Resolve every "is this still deployed?" question** before anything depends on the
   answer.
5. Only then fix the target design.

## Phase 2 — Immediate security triage

Produce `00-SECURITY-IMMEDIATE.md` early, not last. A repo that has been unbuildable
for years has almost certainly been accumulating credentials in source. Triage by
whether a credential outlives the infrastructure: credentials to deleted cloud
resources are inert, but third-party accounts — payment, email, SMS — keep billing and
keep working long after the servers are gone. Those have a clock on them.

## What to produce

In the target repo's own `docs/architecture/`:

- `00-SECURITY-IMMEDIATE.md` — the triage above, ordered by how fast each item must move.
- A dedicated dependency analysis — every package, its status (resolvable, recoverable,
  lost), and what depends on it.
- The full MODERNIZE set: `01-CURRENT-STATE.md`, `02-GAP-ANALYSIS.md`,
  `03-TARGET-ARCHITECTURE.md`, `04-MIGRATION-PLAN.md`, `05-DECISIONS.md` — each
  measured against the reference architecture's compliance checklist.

The migration plan must open with the archaeology phase and must not assume a working
build until a step has explicitly restored one.

## Constraints

- Distinguish everywhere between what you verified and what you inferred. In a recovery
  the difference is the whole value of the document.
- Cite by `file:line`, and name the artifacts that are missing as precisely as the ones
  that are present.
- Write into the **target repo's** `docs/architecture/`.
- Documentation only — no code changes unless the maintainer asks.
- Commit to a new branch and push; do not open a pull request unless asked.
