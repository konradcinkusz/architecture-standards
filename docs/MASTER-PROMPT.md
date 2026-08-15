# The master delivery prompt

The generic, fill-in prompt for a **delivery session**: a session against one
application repo that must end with the repo aligned to the reference architecture
**and** live as a workable product. Run it against a repo that has drifted, as a
periodic checkpoint, or whenever this repo or
[`konradcinkusz/authservice`](https://github.com/konradcinkusz/authservice) has moved
since the target was last aligned.

## Why this exists

[`PLAYBOOK.md`](PLAYBOOK.md) covers the documentation sessions: REVIEW, MODERNIZE and
RECOVER each produce documents and deliberately stop short of code. But the estate also
has a recurring *delivery* job — "review the whole app against my standards, adopt the
external auth service, bring the frontend in line, document the UI/UX, and leave the
product running on Fly.io" — and until now that job description was rewritten by hand
for each repo, with the repo name hardcoded into the prompt. This is the one generic
version: fill in the target block, attach the three repos, run it.

A delivery session does not replace the playbook modes — its first phase *is* one of
them. Everything the playbook says about choosing REVIEW vs MODERNIZE vs RECOVER still
applies.

## The prompt

Copy this into a new session, fill in the target block, and attach the repos listed
under "What to attach" below.

```
I maintain one established reference architecture across my repos (.NET Aspire +
Fly.io, container-per-service, one shared "ServiceDefaults" kernel per system,
database-per-service, JWT/JWKS auth, tag-driven CI/CD to GHCR). It is fully
documented and must NOT be re-derived from scratch — read these first:

  architecture-standards/docs/architecture/00-REFERENCE-ARCHITECTURE.md
    — 15 principles (P1–P15) plus the compliance checklist that every gap
      named below is measured against.
  architecture-standards/docs/PLAYBOOK.md
    — the REVIEW / MODERNIZE / RECOVER decision and what each mode produces.
  architecture-standards/docs/guides/
    — the operational guides. Load the guide for every domain you touch
      instead of reconstructing its patterns: FLY-IO-DEPLOYMENT before
      anything that ends in "deploy it", IDENTITY-AND-ACCOUNTS for auth,
      FRONTEND-BFF for the web app, SERVICE-API-PATTERNS for service
      plumbing, TESTING-STRATEGY and E2E-ACCEPTANCE-TESTING for the test
      bar, SECURITY-REVIEW before anything is exposed publicly, and
      AZURE-OPERATIONS (plus AZURE-AI-FOUNDRY-AGENTS if LLM agents are
      involved) for the Azure track.

Identity across the estate is my external open-source identity service,
konradcinkusz/authservice (attached read-only): a standalone microservice
that issues JWTs and publishes JWKS + OIDC discovery endpoints.
IDENTITY-AND-ACCOUNTS is the guide; authservice is its running
implementation. Product services trust tokens it issues; they do not keep
their own user store and do not mint their own tokens.

── Target for this session ──────────────────────────────────────────────
Repo:      <TARGET_REPO>
Context:   <1–2 sentences: what it is, live/legacy/greenfield, and why now —
            e.g. periodic checkpoint, standards moved, authservice moved>
Frontend:  Next.js — the estate default (FRONTEND-BFF) — unless overridden: <override?>
Azure:     <yes — prepare the provisioning job in parallel | no — skip 6>
──────────────────────────────────────────────────────────────────────────

The job, in phases. Do not start a phase until the previous one is verified
(builds, tests green; for phase 5, a live smoke test).

1. ASSESS — what do you think of this repo? Recommend the playbook mode it
   needs (REVIEW / MODERNIZE / RECOVER) after a first look, and produce that
   mode's document set in <TARGET_REPO>/docs/architecture/, measured against
   the compliance checklist. This is the gap analysis between what has been
   developed and the standards; every later phase traces back to a gap or
   decision recorded here.

2. ADOPT AUTHSERVICE — make authservice the system's only identity
   provider. Remove or retire any in-repo user store, login flow or token
   minting; services validate RS256 tokens via authservice's OIDC
   discovery / JWKS endpoints. Run authservice from its published container
   image as its own app in this system's topology — its configuration and
   fly.toml live in <TARGET_REPO>'s infrastructure, its source is never
   modified.

3. FRONTEND — bring the web application inside the standards: one Next.js
   app is the product surface, consuming the system's services per
   FRONTEND-BFF — HttpOnly cookie sessions, runtime config via
   `/api/config` (never `NEXT_PUBLIC_*` for addresses), one catch-all proxy
   route resolving each backend through the candidate ladder, and edge
   middleware that verifies the JWT signature against authservice's JWKS
   rather than only decoding it. If this system has more than one frontend
   app, they share one pnpm workspace and one `@<org>/web-kit` package for
   the BFF routes, auth/session context and UI primitives — the frontend
   ServiceDefaults (§7). If the current frontend is not Next.js, plan the
   migration in phase 1's documents and execute it here.

4. UI/UX DOCUMENTATION — write <TARGET_REPO>/docs/ux/UI-UX.md: the
   inventory of screens and user flows as they exist after phase 3, what
   this session changed and why, and a ranked backlog of what remains —
   every item tied to the gap or principle it serves. Comprehensive enough
   that the next session picks up the backlog instead of re-deriving it.

5. SHIP ON FLY.IO — the definition of done is a fully workable product,
   live on Fly.io: every service deployed per FLY-IO-DEPLOYMENT (an
   annotated fly.toml per app, secrets through the platform, tag-driven
   CI/CD with change detection), and one end-to-end journey — register,
   log in, use the core feature — demonstrated against the public URL.

6. AZURE (only if the target block says yes) — in parallel with phase 5,
   prepare the provisioning job that could stand this system up on Azure
   per AZURE-OPERATIONS: IaC plus a workflow job, validated at least by a
   what-if / dry run in CI. Fly.io remains the product deployment; this is
   the portability track, not a second live environment.

Ground rules:
- Work ONLY in <TARGET_REPO>. architecture-standards and authservice are
  read-only references in this session — do not modify, fork or vendor
  either one. Friction with a standard or with authservice is recorded as
  a decision or deviation in phase 1's documents, not patched around
  silently.
- Read the standards; do not re-derive them from whatever code you see.
- Every phase lands as an independently shippable, verified change: commit
  to a branch and push as you go, one PR per phase unless I say otherwise.
- Deviations you keep are decisions with reasons. Gaps you cannot close in
  this session are recorded — architecture gaps in the phase-1 documents,
  UI/UX gaps in the phase-4 backlog — never left silent.
```

## Fill-in reference

| Field | What to put there |
|---|---|
| `<TARGET_REPO>` | The one repository this session may modify |
| `Context` | What the repo is and why it is being looked at now: periodic checkpoint, standards moved, authservice moved, repo drifted |
| `Frontend` | Leave as Next.js unless this system has a deliberate reason to differ — and then the override is recorded as a decision in phase 1, not made by omission |
| `Azure` | `yes` to prepare the parallel Azure provisioning job, `no` to skip phase 6 |

## What to attach to the session

- **The target repo** — the only repo the session writes to.
- **`architecture-standards`** (this repo) — the constitution, the playbook and the
  guides. Without it the agent re-derives principles from whatever code it happens to
  see, which is the failure mode this repository exists to prevent.
- **`konradcinkusz/authservice`** — read-only. Phase 2 consumes it as an external
  service (published container image, JWKS/OIDC discovery); attaching the source lets
  the agent read the real integration surface — endpoints, DTOs, configuration keys —
  instead of guessing it. A delivery session never modifies it: friction with
  authservice becomes a recorded decision in the target repo, or an issue on
  authservice itself.

## What a finished session leaves behind

All of it in the target repo:

1. `docs/architecture/` — the chosen playbook mode's document set: the gap analysis
   that every later phase traces back to.
2. authservice as the only identity provider — no parallel user store, no locally
   minted tokens.
3. One Next.js web application as the product surface, following FRONTEND-BFF.
4. `docs/ux/UI-UX.md` — screens and flows as built, what changed, and the ranked
   backlog of what remains.
5. A live deployment on Fly.io with one end-to-end user journey demonstrated against
   the public URL.
6. If requested: the Azure provisioning job, dry-run-validated in CI.

## A note on the frontend framework

[`FRONTEND-BFF.md`](guides/FRONTEND-BFF.md) is not framework-agnostic — it opens by
stating the estate's frontends are Next.js apps, and its rules are written at that
level of detail: `NEXT_PUBLIC_*` variables are baked at build time so runtime config
goes through a dynamic `/api/config` route instead, the shared kernel is a pnpm
workspace package, and the reference Dockerfile is Next.js's `deps → builder → runner`
staged build producing a `standalone` output (`FLY-IO-DEPLOYMENT.md` §5). Phase 3
targets Next.js because that is the documented, evidenced standard, not a default
picked for this prompt. The `Frontend` field exists for the rare target with a
deliberate reason to differ — recorded as a decision in phase 1, same as any other
deviation — not as a menu of equally supported options.
