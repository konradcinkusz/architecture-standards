# Initializing a repository from the generic template

You have been given the name of a repository that is empty, and you are going to leave it
holding the estate's default containerized application: an Aspire composition root, a
shared kernel, one service that owns its database, a Next.js product surface, a container
per service, a Fly.io topology, tag-driven CI/CD, and the documentation set — all of it
compliant with [the constitution](../architecture/00-REFERENCE-ARCHITECTURE.md) on the
first commit rather than on a later cleanup pass.

One rule outranks everything below, because breaking it is the most expensive failure mode
in this estate: **read the standards, do not re-derive them.** Every rule here is stated in
shorthand — "the kernel stays a kernel", "one image, N environments" — and each one names
the principle or the guide section it compresses. Scaffolding is where re-derivation is
most tempting and most costly, because a wrong default gets copied into every file the
repository will ever have.

**The argument is the repository name.** Everything else is derived from it (§1) or is a
default this document fixes, so that two repositories initialized a year apart come out the
same shape. What is genuinely a decision — the region, the registry, whether the system has
users — is asked once and recorded as an ADR, never guessed silently.

This is the greenfield entry point. Its siblings: [`PLAYBOOK.md`](../PLAYBOOK.md) is for a
repository that already holds code (REVIEW / MODERNIZE / RECOVER),
[`MASTER-PROMPT.md`](../MASTER-PROMPT.md) is the delivery session that brings a drifted
application back to the standards and leaves it live, and
[`docs/delivery/WORKFLOW.md`](../delivery/WORKFLOW.md) is the per-ticket procedure that
takes over once this repository has its first ticket. **If the repository is not empty,
this procedure is the wrong one** (§2).

**Contents**

0. [The standards have to be in front of you](#0-the-standards-have-to-be-in-front-of-you)
1. [The argument, and the names derived from it](#1-the-argument)
2. [Preflight: the repository has to be empty](#2-preflight)
3. [The tree this creates](#3-the-tree-this-creates)
4. [The repository baseline](#4-the-repository-baseline)
5. [The solution: AppHost, kernel, contracts, one service](#5-the-solution)
6. [The product surface: Next.js and the BFF](#6-the-product-surface)
7. [Containers and the Fly.io topology](#7-containers-and-the-flyio-topology)
8. [CI/CD](#8-cicd)
9. [Documentation, including the PDF track](#9-documentation)
10. [Verification: the gates before the first commit](#10-verification)
11. [Commit, push, and the first deploy](#11-commit-push-and-the-first-deploy)
12. [Scope, defaults and stop conditions](#12-scope-defaults-and-stop-conditions)
13. [Failure modes](#13-failure-modes)
14. [Checklist](#14-checklist)

---

## 0. The standards have to be in front of you

Confirm, before creating the first file, that you can actually open
[`00-REFERENCE-ARCHITECTURE.md`](../architecture/00-REFERENCE-ARCHITECTURE.md) and the
guides under [`docs/guides/`](../guides/) — because
`architecture-core@architecture-standards` is installed, or because this repository is
attached to the session. **If you cannot, stop and say so.**

The guides this procedure leans on directly, and which section owns which decision:

| Domain | Guide | What it decides here |
|---|---|---|
| Hygiene, onboarding, scripts | [`REPO-BASELINE.md`](../guides/REPO-BASELINE.md) | Everything in §4 |
| Deployment | [`FLY-IO-DEPLOYMENT.md`](../guides/FLY-IO-DEPLOYMENT.md) | §7 and §8 |
| Frontend | [`FRONTEND-BFF.md`](../guides/FRONTEND-BFF.md) | §6 |
| Service plumbing | [`SERVICE-API-PATTERNS.md`](../guides/SERVICE-API-PATTERNS.md) | §5's endpoint and HTTP-client rules |
| Identity | [`IDENTITY-AND-ACCOUNTS.md`](../guides/IDENTITY-AND-ACCOUNTS.md) | §5's auth wiring, §7's authservice app |
| Tests | [`TESTING-STRATEGY.md`](../guides/TESTING-STRATEGY.md) | §5's test project, §10's gates |
| README and badges | [`README-BADGES.md`](../guides/README-BADGES.md) | §9's header row |
| PDFs and diagrams | [`00-RESEARCH-DOCUMENTATION.md`](../research/00-RESEARCH-DOCUMENTATION.md) | §9's LaTeX track |

Load the guide for a layer before you write that layer's files, and say which ones you
loaded. A scaffold is twenty small decisions taken at once; the guides are where nineteen
of them are already made.

## 1. The argument

`/init-generic-template <repo-name>` — the repository this run initializes, as its GitHub
name: lowercase, hyphen-separated, matching `^[a-z][a-z0-9-]*$`.

**Without an argument, fall back to the repository you are already in** — its `origin`
remote, or the working directory's name — and echo that name back before touching
anything. If there is no such repository, stop and ask for the name. Do not invent one
from the conversation's subject: every name below is derived from this string, and a
plausible-but-wrong system name is baked into a Fly app that has to be destroyed to be
renamed.

Everything else is derived, mechanically. Echo this table back as your first output, filled
in, so a wrong derivation is caught before it is written into forty files:

| Derived | Rule | Example, from `zoo-companion` |
|---|---|---|
| System slug | the argument, unchanged | `zoo-companion` |
| .NET root namespace and solution | PascalCase of the slug, hyphens dropped | `ZooCompanion` |
| Projects | `<Pascal>.AppHost`, `.ServiceDefaults`, `.Contracts`, `.Api`, plus `.Api.Tests` | `ZooCompanion.AppHost` |
| Frontend workspace | `web/`, npm scope `@<slug>` | `@zoo-companion/web-kit` |
| Fly apps | `<slug>-<service>-<env>` — globally unique across all of Fly, not just your org ([`FLY-IO-DEPLOYMENT.md`](../guides/FLY-IO-DEPLOYMENT.md) §4) | `zoo-companion-api-dev` |
| Fly Postgres app | `<slug>-postgres` — one instance, no environment suffix, databases inside it per service (P3, Fly §8) | `zoo-companion-postgres` |
| Databases | `<service>db` inside that instance | `apidb` |
| Container images | `ghcr.io/<owner>/<slug>-<service>` | `ghcr.io/konradcinkusz/zoo-companion-api` |
| Config prefix | the PascalCase namespace, for options sections | `ZooCompanion__…` |

Three things are decisions rather than derivations, and each one is asked once and recorded
as an ADR under §9 — never defaulted silently:

- **`primary_region`.** Pick the region nearest the users. The guides' examples show both
  `waw` and `fra`; neither is a default, and a region is expensive to change once volumes
  exist (Fly §8).
- **The registry.** The constitution's §2 disagreement table settles this as **GHCR** —
  portable and free at this scale — while the Fly guide's pipeline (§10) is written against
  `registry.fly.io`. Take GHCR, deploy with `flyctl deploy --image ghcr.io/…`, and note in
  the ADR that a private GHCR image needs a pull credential set as a Fly secret. Choosing
  `registry.fly.io` instead is allowed and is the same one-line ADR.
- **Whether the system has users.** If it does, identity is
  [`konradcinkusz/authservice`](https://github.com/konradcinkusz/authservice) adopted as an
  external service (§7); no user store and no token minting is ever written into this
  template (P5). If it does not, say so in the ADR and skip every auth step — a login page
  for a system with no accounts is scaffolding nobody asked for.

## 2. Preflight

**The repository has to be empty.** Empty means: nothing tracked beyond what a fresh GitHub
repository creates for itself — `.git/`, `README.md`, `LICENSE`, `.gitignore`. Anything
else — a solution, a `package.json`, a workflow, a `src/` — means this repository already
has a shape, and dropping a template on top of it silently overwrites decisions somebody
made.

**If it is not empty, stop and say so**, and name the procedure that fits instead:
[`PLAYBOOK.md`](../PLAYBOOK.md) for a review or a modernization, or
[`MASTER-PROMPT.md`](../MASTER-PROMPT.md) for a delivery session that aligns a working
application and leaves it live. Do not "merge" the template into an existing tree.

Then check the toolchain and report it, because §10's gates are only as good as what you
can actually run:

| Tool | Needed for | If absent |
|---|---|---|
| .NET SDK | build, test, the AppHost | Blocking — the solution cannot be verified |
| Node + pnpm | the frontend build | Blocking for §6's gate only |
| A container engine | the image gates in §10 | Record the gate as not run; do not claim it passed |
| `flyctl` | nothing in this procedure | Not needed — §11 provisions from CI, never from a laptop (Fly §11) |
| `gitleaks` | §10's secret scan | Record it; the CI job in §8 still runs |

Confirm the branch you are on and that it is not the default branch, and create one if
needed. Every file below lands in one branch and one pull request.

## 3. The tree this creates

One system, five projects, one frontend, three Fly apps. This is deliberately the *smallest*
system that exercises every principle — not a demonstration of every guide at once (§12).

```
<repo>/
├─ .claude/settings.json            declares the marketplace + architecture-core (REPO-BASELINE §7)
├─ .editorconfig · .gitattributes · .gitignore · .dockerignore
├─ .gitleaks.toml · secrets.env.example
├─ CODEOWNERS (in .github/) · LICENSE · README.md · AGENTS.md
├─ global.json                      pinned SDK band + Aspire SDK
├─ Directory.Build.props            TFM, nullable, warnings-as-errors, metadata
├─ Directory.Packages.props         central package management — one version per package
├─ <Pascal>.sln
├─ src/
│  ├─ <Pascal>.AppHost/             P1 — the composition root, development only
│  ├─ <Pascal>.ServiceDefaults/     P2 — the shared kernel: plumbing, nothing else
│  ├─ <Pascal>.Contracts/           DTOs that cross a service boundary
│  └─ <Pascal>.Api/                 the one service: owns apidb, exposes /health + /alive
│     └─ Dockerfile                 P6 — multi-stage, :8080, non-root
├─ web/                             one pnpm workspace (FRONTEND-BFF §7)
│  └─ app/                          the Next.js product surface + Dockerfile
├─ tests/
│  ├─ <Pascal>.Api.Tests/           xUnit, InMemory provider — P13's logic-bearing layer
│  └─ e2e/                          Playwright, wired to CI from the first commit
├─ flyio/
│  ├─ api.fly.toml · web.fly.toml · postgres.fly.toml · authservice.fly.toml
│  ├─ SECRETS.md                    what is secret, where it lives, how to set it
│  └─ INFRASTRUCTURE-ANALYSIS.md    topology, sizing, cost — Fly §13's four questions
├─ scripts/
│  ├─ setup.sh · setup.ps1          one-command onboarding, numbered steps
│  ├─ hooks/pre-commit · scan-secrets.sh
│  └─ README.md                     every variable by tier
├─ docs/
│  ├─ architecture/00-ARCHITECTURE.md   references the constitution; carries the deviation register
│  ├─ adr/0000-template.md + 0001…      the decisions §1 and §7 took
│  ├─ ux/UI-UX.md                       screens, flows, ranked backlog
│  ├─ diagrams/*.mmd                    one diagram per file, one source (RESEARCH §"Diagrams in a PDF")
│  └─ papers/<slug>-overview.tex        house style, explicitly not a research paper
└─ .github/
   ├─ CODEOWNERS · dependabot.yml · pull_request_template.md · ISSUE_TEMPLATE/
   ├─ agents/                           in-repo agent definitions, allowlisted tools
   └─ workflows/  ci.yml · secret-scan.yml · codeql.yml
                  flyio.yml · flyio-scale.yml · flyio-destroy.yml
                  build-overview-pdf.yml
```

Create it in the order of §4 → §9. The baseline first is not arbitrary: the secret scanner
and `.gitignore` have to exist before the first file that could carry a credential does.

## 4. The repository baseline

This is [`REPO-BASELINE.md`](../guides/REPO-BASELINE.md) applied at t=0, and it is the
section most likely to be skipped as "not the interesting part". Every item in its §1 table
exists because something in the estate was lost to its absence.

- **Hygiene files** (§1): `CODEOWNERS`, `dependabot.yml` covering every ecosystem the repo
  actually has (nuget, npm, github-actions, docker), a real `.editorconfig`, a real
  `.gitattributes` — not the stock template with every rule commented out — and an
  **exclusion-based `.dockerignore`**, so a backend image build does not ship `web/`,
  `tests/` and `docs/` as build context.
- **Central package management** (§1): `Directory.Build.props` for everything that is not a
  version (TFM, `Nullable`, warnings-as-errors, package metadata) and
  `Directory.Packages.props` for every version, exactly once. Projects reference packages by
  name with no `Version` attribute. Pin the SDK band in `global.json`.
- **Secret hygiene** (§2, P5): `.gitleaks.toml`, the pre-commit hook, and the CI job — both,
  because the hook catches the mistake before it becomes history and the job catches
  contributors without hooks. `.env` is gitignored; `secrets.env.example` is committed and
  documents **every** variable with its tier (always / mode / secret / ci / tuning) and a
  line saying what degrades without it (P8).
- **One-command onboarding** (§3): `scripts/setup.sh` (and `setup.ps1` — a generation
  instruction that only works on one platform fails at step one of onboarding,
  [`IDENTITY-AND-ACCOUNTS.md`](../guides/IDENTITY-AND-ACCOUNTS.md) §10), structured as
  numbered steps: prerequisites with install pointers, initialize `dotnet user-secrets`,
  **generate** the one mandatory secret rather than asking for one, then each optional
  integration as a labelled optional step. Pair it with a troubleshooting table keyed on
  the literal exception text, and document the secret's journey once: local store →
  AppHost parameter → environment variable → config key.
- **Scripts** (§4): a `scripts/README.md` listing every variable by tier. The numbered
  runbook convention matters when there is a runbook; at t=0 there is `setup` and the
  scanner, and the convention is what the next script joins.
- **Standards adoption declared, not remembered** (§7): commit `.claude/settings.json`.

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

- **Agent definitions in-repo** (§6): under `.github/agents/`, with allowlisted tools as a
  safety boundary, descriptions carrying worked invocation examples — the description is
  the router — and **repo-relative paths only**.

## 5. The solution

**The AppHost is the composition root, and it exists for development** (P1). One command —
`dotnet run --project src/<Pascal>.AppHost` — brings the system up. Declare Postgres, the
API and the frontend with `WithReference`, `WaitFor` and `WithHttpHealthCheck`, and nothing
else: the AppHost is not the production topology, and its publish branch is a manifest
generator, not a second runtime. No secret is ever a literal here; parameters come from
`dotnet user-secrets` via `builder.AddParameter(..., secret: true)` (P5).

**The kernel is a kernel** (P2). `<Pascal>.ServiceDefaults` carries exactly the eight
concerns in P2's table — telemetry, health, discovery, resilience, JWT, CORS, OpenAPI,
database provider — as extension methods over `IHostApplicationBuilder`,
`IServiceCollection` or `WebApplication`. No base classes, no `ModuleBase`. A service opts
in line by line:

```csharp
builder.AddServiceDefaults();
builder.Services.AddJwtAuthentication(builder.Configuration);
builder.Services.AddCorsPolicy(builder.Configuration, CorsPolicies.Frontend);
builder.Services.AddDatabaseContext<ApiDbContext>(builder.Configuration, "apidb", "ApiInMemory");
```

**Install the ceiling now, not after the second violation.** P2's limit is mechanical
because prose has already failed twice in this estate: a CI step that fails when the kernel
exceeds ~800 lines, and an architecture test asserting the kernel references no entity type.
Both cost ten minutes at t=0 and are the only thing standing between the kernel and a
`Seeds.cs`.

**One service, and it owns its database** (P3, P4). `<Pascal>.Api`:

- `Program.cs` is a manifest (P9): each block one call into the service's own
  `ServiceCollectionExtensions`, transport thin — bind, authorize, delegate.
- Persistence is provider-portable: `DATABASE_PROVIDER` selects PostgreSQL or SqlServer and
  falls back to InMemory with no connection string, so tests and a fresh clone need no
  container.
- **Schema moves by `MigrateAsync` from provider-specific migrations, applied by a hosted
  service after Kestrel starts** — never `EnsureCreated` outside the InMemory path, and
  never blocking the listener, so probes answer while schema work is in flight. Reference
  data is seeded separately, never through `HasData`.
- `/health` and `/alive` via `MapDefaultEndpoints()`, and `/health` reports the state of
  every optional integration while the startup banner prints the same list (P8) — from the
  first commit, because the list is what makes a degraded deployment diagnosable in one
  request.
- Endpoints follow [`SERVICE-API-PATTERNS.md`](../guides/SERVICE-API-PATTERNS.md): an
  endpoint group at the right trust level, the validation filter, every list clamped, one
  uniform error shape. Outbound `HttpClient`s carry the standard resilience handler with
  explicit timeouts.
- Auth is validation only: RS256 tokens verified against authservice's JWKS. **Exactly one
  service in the estate holds a signing key, and it is not this one** (P5).
- Observability is part of the scaffold, not a follow-up (P15): OTLP traces, metrics and
  logs, with health-check requests filtered out of traces.

**One test project** (P13), `tests/<Pascal>.Api.Tests`, mirroring the source tree, isolated
by constructor with a fresh InMemory database per test. Give it one real test — the
health endpoint's degraded-integration report is a good first one — rather than a
placeholder: a suite of `Assert.True(true)` is worse than an empty folder, because it
counts. `tests/e2e` gets one Playwright journey **and its CI wiring in the same commit**;
a suite no job runs is documentation that lies
([`E2E-ACCEPTANCE-TESTING.md`](../guides/E2E-ACCEPTANCE-TESTING.md)).

## 6. The product surface

Next.js, per [`FRONTEND-BFF.md`](../guides/FRONTEND-BFF.md) — the estate's documented,
evidenced standard, not a default picked for this template. The browser talks only to its
own origin; everything else follows from that.

- **One pnpm workspace from the first commit**, even with one app in it (§7). The workspace
  is cheap now and is what makes the second app a move rather than a rewrite; the
  `@<slug>/web-kit` package is created when that second app arrives, and the guide's
  anti-example is four apps that each hand-copied their BFF routes.
- **Runtime configuration** (§2): a dynamic `GET /api/config` route reading the environment
  per request, with a short `Cache-Control`. No `NEXT_PUBLIC_*` for anything
  environment-specific — those are baked at build time and cost you one image per
  environment, which breaks build-once-deploy-many (P12).
- **Sessions** (§3): tokens go from the auth callback to the app's *own* BFF route, which
  sets them `httpOnly`, `secure`, `sameSite: strict`; a `GET /api/auth/session` route
  rehydrates client state; logout deletes with the same attributes it set.
- **Middleware verifies, not decodes** (§4): `jwtVerify` against authservice's JWKS with
  issuer and audience, an explicit public-route list, `?redirect=` preserved, and carve-outs
  so OAuth callbacks keep their query strings. Middleware is UX; the API is the boundary.
- **One catch-all proxy** (§5), `/api/proxy/[...path]`: prefix → backend routing, each
  backend resolved through the candidate ladder (explicit env var → service-discovery
  variables → internal DNS → localhost), bearer injected server-side from the cookie,
  binaries streamed with a timeout sized for a scale-to-zero cold start (P7).
- The Dockerfile is the three-stage `deps → builder → runner` pattern with `standalone`
  output and a non-root `nextjs` user (P6).

## 7. Containers and the Fly.io topology

**One container per service, multi-stage** (P6): project files copied and restored before
source, runtime image major equal to the TFM major — roll-forward does not cross a major
and getting it wrong is a startup failure, not a warning — `ASPNETCORE_URLS=http://+:8080`,
`EXPOSE 8080`, `LABEL org.opencontainers.image.source`, non-root where the base image
allows, and any native dependency declared rather than assumed.

Four Fly apps, three shapes, all from [`FLY-IO-DEPLOYMENT.md`](../guides/FLY-IO-DEPLOYMENT.md)
§4–§5. Write each `fly.toml` with both `[build] dockerfile` **and** `context` declared —
the omitted `context` is the field that makes a build work locally and break in CI:

| App | Shape | `min_machines_running` | Why |
|---|---|---|---|
| `<slug>-postgres` | database | n/a | No `[http_service]`, no public listener, ever. Reached at `<app>.internal:5432` over 6PN. `[[mounts]]` with `initial_size`, `PGDATA` at a **subdirectory** of the mount, `--ha=false` |
| `<slug>-authservice-<env>` | HTTP service | **1** | Every validator fetches its JWKS in-request, and re-fetches when the cache expires — Fly §7's named case for pinning. Runs the published image; its source is never vendored or modified |
| `<slug>-api-<env>` | HTTP service | **1** | The frontend's server side calls it in-request. Pin the machine, or the caller's timeout must comfortably exceed the cold start — the second option is written down far more often than it is configured |
| `<slug>-web-<env>` | frontend | 0 | Entered only from a browser: a cold start there is a slow first page, not a failed call |

Service-to-service HTTP uses the **public URL**, not `.internal` — the proxy starts a
stopped machine and `.internal` does not — and the issuer URL is forced public regardless,
because it is stamped into `iss` and every validator fetches JWKS from it. `[env]` holds
only what may be public; connection strings, signing keys and API keys are Fly secrets, set
from the pipeline with `--stage`.

Write `flyio/SECRETS.md` (what is a secret, where it lives, how to set it) and
`flyio/INFRASTRUCTURE-ANALYSIS.md` answering Fly §13's four questions — what runs when
nothing is happening, which services pin a machine and which synchronous call forces it,
what the cheaper option actually costs, and what is off the table. "Could be optimised" is
not an answer; a decision someone can take is.

## 8. CI/CD

Seven workflows, and every one of them wired on the first commit — a workflow added later
is a workflow that was never a gate.

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | PR + push to the default branch | Build, test, lint, the kernel size check and the architecture test from §5, the E2E suite |
| `secret-scan.yml` | PR + push | The scanner CI half (P5) |
| `codeql.yml` | PR + schedule | SAST plus the dependency audit |
| `flyio.yml` | tag `v*` | test → detect-changes → build once → ordered deploy |
| `flyio-scale.yml` | `workflow_dispatch` | Normalize machine counts; stateful apps excluded |
| `flyio-destroy.yml` | `workflow_dispatch` | Teardown behind a typed confirmation, reverse dependency order, volume kept by default |
| `build-overview-pdf.yml` | `workflow_dispatch` only | §9's PDF, as a run artifact |

The deploy workflow is the one with rules that are easy to get subtly wrong (Fly §10):

- **Trigger on a tag, not a branch push.** A deploy is an act; the tag is its record.
- **Change detection compares against the previous tag**, not the previous commit, and a
  change to the kernel or the contracts project invalidates every image that compiles them.
- **A service whose Fly app does not exist is always selected.** This is the rule that lets
  a cold estate come up from a single tag with no manual `fly launch`, and it is the one
  most often missing — at t=0 *nothing* exists, so without it the first tag deploys nothing.
- **Build once, deploy many**: one image per changed service, then `flyctl deploy --image`.
  `fail-fast: false` on the matrix.
- **Order: postgres → authservice → api → web**, and every gate accepts
  `success || skipped` from upstream. Without the `|| skipped`, change detection and
  ordering fight each other and any unchanged service blocks everything behind it.
- **Gate the database separately** — redeploying Postgres restarts it.
- **App and volume creation are idempotent and live in the workflow**, never in someone's
  shell history (Fly §11).
- **One post-deploy assertion the health check cannot make**: that the JWKS endpoint
  returns a **non-empty** key set. A missing key selects the symmetric path and publishes a
  syntactically valid, empty JWKS — nothing reports unhealthy, the deploy goes green, and
  every consumer rejects every token.

The one-time human setup is three lines and is written into `flyio/SECRETS.md`:
`fly tokens create org` stored as `FLY_API_TOKEN` in a GitHub **environment**, the root
secrets that environment needs, and nothing else.

## 9. Documentation

P14: documentation lives in the repository and records reasoning, not just steps. At t=0
that means four things, and a fifth if the system will ever hand somebody a PDF.

- **`README.md` written for a stranger**: what the system is, how to run it in one command,
  the project table, and the badge header row per
  [`README-BADGES.md`](../guides/README-BADGES.md) — every badge a titled link, and nothing
  badged that does not exist. Do not describe a service the template did not create: a
  stale README is a review finding on the day it is written, not months later.
- **`AGENTS.md`**: how an agent should work in this repository, pointing at the standards
  rather than restating them.
- **`docs/architecture/00-ARCHITECTURE.md`**: this repository measured against the
  constitution, **referencing** it rather than copying it, plus the deviation register
  (§3a) — created empty, with the rule that every row carries a date and a reason. An
  acknowledged deviation is a decision; an unacknowledged one is drift.
- **`docs/adr/`**: `0000-template.md`, `0001-record-architecture-decisions.md`, and one ADR
  for each decision §1 and §7 actually took — the region, the registry, whether the system
  has users, and anything you defaulted that a reader might otherwise think was inevitable.
- **`docs/ux/UI-UX.md`**: the screens and flows as scaffolded, and a ranked backlog, so the
  first delivery session picks the backlog up instead of re-deriving it.

**The PDF track**, per [`00-RESEARCH-DOCUMENTATION.md`](../research/00-RESEARCH-DOCUMENTATION.md):
a project overview is *not* research, and the standard is explicit about the difference. If
you create one, it goes in `docs/papers/` — not `docs/research/papers/` — its `.tex` header
comment states plainly that it is not a research paper under that standard, it introduces no
fact its markdown source does not carry, and its workflow is `workflow_dispatch`-only,
because a document with no release cadence should not pretend to have one. Diagrams have one
source (`docs/diagrams/<slug>.mmd`, one per file) rendered for the PDF, never redrawn in
TikZ. **Only the `.tex` is committed**: `.gitignore` covers `*.aux`, `*.log`, `*.out`,
`*.toc` and the PDF itself, because a checked-in PDF disagrees with its source the first
time the source changes.

## 10. Verification

Nothing is committed until these have been run. **A gate you could not run is reported as
not run** — never implied to have passed, and never quietly dropped.

1. `dotnet build` clean, with warnings as errors.
2. `dotnet test` green, and the test it ran actually asserts something.
3. **P8's literal test**: `dotnet run --project src/<Pascal>.AppHost` with an empty `.env`
   and zero cloud credentials produces a working system with reduced features. `/health`
   answers 200 and lists which integrations are degraded; the startup banner says the same.
   If it needs a credential to start, an integration was registered unconditionally.
4. Each image builds, and the container answers `/health` on `:8080` — the port
   `internal_port` claims.
5. The frontend builds to `standalone` output, and `/api/config` returns addresses read at
   request time rather than baked in.
6. The secret scanner runs clean over the tree.
7. Workflow syntax checked (`actionlint` where available), and every relative link in the
   README and the docs resolves.
8. `scripts/setup.sh --check` runs on a machine that has nothing installed and reports what
   is missing by name, with install pointers.

Report the results as a short table. The three that people skip are 3, 4 and 8, and each
one is a promise the repository is now making to every future contributor.

## 11. Commit, push, and the first deploy

Commit in a small ordered series — baseline, solution, frontend, infrastructure, docs — so
the pull request is reviewable, and push to the branch from §2. Follow the repository's own
PR template if it has one; you created it in §4, so it does.

**The first tag is what provisions the estate.** With §8's "missing app ⇒ always selected"
rule in place, pushing `v0.1.0` creates every Fly app and every volume from cold, in order,
with no `fly launch` and nothing configured by hand. Before tagging, confirm the GitHub
environment holds `FLY_API_TOKEN` and the root secrets; without them the deploy fails at
the first `flyctl` call, which is the correct place to fail.

**The definition of done is the public URL.** Not a green workflow: `https://<slug>-web-<env>.fly.dev`
serves the app, `https://<slug>-api-<env>.fly.dev/health` answers with its integration list,
and — if the system has users — one end-to-end journey works: register, log in, use the one
feature the template shipped. Report what is live, what degraded and why, and what the next
session should pick up from `docs/ux/UI-UX.md`.

If the deploy is out of scope for this run, say so explicitly and leave the repository at
"builds, tests green, images build, nothing deployed" rather than implying a live system.

## 12. Scope, defaults and stop conditions

What this template deliberately does **not** create, straight from the constitution's §4
non-goals — so that scope creep has something to fail against:

- **No second service.** One bounded context, one database. A second service is a design
  decision with a reason, not a scaffolding default (P3).
- **No event bus, no service mesh, no sidecars.** Synchronous HTTP against a published
  contract, plus per-service JWT, is the whole model at this size. Introducing a broker is
  an explicit, recorded decision.
- **No custom DI container**, no abstraction over the platform. `fly.toml` is written
  directly.
- **No user store and no token minting** anywhere in this repository (P5).
- **No sample domain model.** The template ships the mechanism and one thin vertical slice;
  inventing entities for a product you have not been told about produces code the first
  ticket deletes.

**Stop, say what the problem is, and ask — before creating files — when:**

- the repository is not empty (§2);
- the name does not match `^[a-z][a-z0-9-]*$`, or no name can be resolved (§1);
- you are asked for a framework other than the ones the standards evidence — Next.js and
  .NET Aspire are the documented standard, and a different choice is a recorded decision in
  `docs/adr/`, not a silent substitution;
- a standard and the request genuinely conflict. Record it as a deviation with its reason;
  a deviation you keep is a decision, and one you leave silent is a finding somebody else
  will file.

## 13. Failure modes

| Symptom | Cause |
|---|---|
| The template lands on top of an application somebody already wrote | §2's emptiness check skipped; this procedure is for an empty repository, a drifted one needs [`MASTER-PROMPT.md`](../MASTER-PROMPT.md) |
| A fresh clone will not start without a cloud credential | An optional integration was registered unconditionally — P8's test in §10 catches this and was not run |
| The first tag deploys nothing at all | Change detection has no "missing Fly app ⇒ always selected" rule, so at t=0 every service looks unchanged (Fly §10) |
| `fly deploy` fails: app name already taken | `app` not namespaced with system and environment; the name is globally unique across all of Fly (Fly §4) |
| The build works locally and breaks in CI | `[build] context` not declared, so the context depended on where `flyctl` was invoked |
| `initdb: directory not empty` on the first Postgres boot | `PGDATA` points at the mount root, where `lost+found` lives; use a subdirectory (Fly §8) |
| The second database machine comes up empty | A volume app was deployed without `--ha=false` — a second machine gets a second empty volume, not a replica |
| Staging frontend calls the production API | Addresses baked via `NEXT_PUBLIC_*` at build time instead of the runtime `/api/config` route (FRONTEND-BFF §2) |
| A forged token is accepted at the edge | Middleware decoded the JWT instead of verifying its signature against JWKS |
| Deploy is green and every token is rejected | The signing key was missing, so the symmetric path was selected and an empty JWKS published; §8's post-deploy assertion exists for exactly this |
| The schema freezes at first-boot state | `EnsureCreated` on a real provider instead of `MigrateAsync` from migrations (P4) |
| The kernel carries domain by month two | The size check and the architecture test were left for later; prose has already failed twice in this estate (P2) |
| The README is already untrue at the first pull request | It was written from the plan rather than from the tree (P14) |
| A credential is committed in week one | The scanner and `.gitignore` were added after the code rather than before it (§4) |
| The E2E suite exists and has never run | It was committed without its CI wiring; wiring is part of a suite's definition of done |

## 14. Checklist

- [ ] Constitution and guides confirmed readable before the first file; stopped and said so if not
- [ ] Repository name resolved from the argument (or the current repository) and echoed back; derived-names table echoed before anything was created
- [ ] Region, registry and whether the system has users decided explicitly and recorded as ADRs
- [ ] Repository confirmed empty; a non-empty one sent to the playbook or the master prompt instead
- [ ] Toolchain checked and reported; every gate in §10 either run or reported as not run
- [ ] Baseline first: hygiene files, central package management, `.gitleaks.toml` + hook + CI job, gitignored `.env` with a committed `secrets.env.example` carrying tiers and degrade lines
- [ ] One-command setup on both platforms: prerequisites, secret store, the mandatory secret generated, optional integrations labelled, troubleshooting keyed on exception text
- [ ] `.claude/settings.json` declares the marketplace and enables `architecture-core`
- [ ] AppHost declares every resource with `WithReference`, `WaitFor` and `WithHttpHealthCheck`; no secret literal; publish branch treated as a manifest generator
- [ ] Kernel holds only P2's eight plumbing concerns; the size check and the no-entity architecture test are in CI from the first commit
- [ ] The service owns its database; provider-portable; `MigrateAsync` in a hosted service after the listener; no `EnsureCreated` outside InMemory
- [ ] `/health` and `/alive`; the health endpoint and the startup banner both report every optional integration
- [ ] `Program.cs` is a manifest; endpoints carry the validation filter, clamped lists and the uniform error shape; outbound clients carry resilience and explicit timeouts
- [ ] Auth is validation-only against authservice's JWKS; no user store, no token minting in this repository
- [ ] OTLP traces, metrics and logs from the first commit; health probes filtered out of traces
- [ ] One real test at the logic-bearing layer, plus one E2E journey **and its CI wiring** in the same commit
- [ ] Next.js in one pnpm workspace; runtime `/api/config`; HttpOnly cookie session routes; middleware verifies signature, issuer and audience; catch-all proxy with the candidate ladder
- [ ] Multi-stage Dockerfiles; runtime major = TFM major; `:8080`; non-root; exclusion-based `.dockerignore`
- [ ] Four Fly apps with `dockerfile` **and** `context` declared; database has no public listener, `initial_size`, `PGDATA` subdirectory; `min_machines_running` justified per app with the synchronous call named
- [ ] `flyio/SECRETS.md` and `flyio/INFRASTRUCTURE-ANALYSIS.md` written, the latter answering Fly §13's four questions
- [ ] Seven workflows committed together; tag-driven deploy with missing-app-always-selected, build once, ordered deploy, `success || skipped` gates, database gated separately, and the non-empty-JWKS post-deploy assertion
- [ ] Destroy workflow behind a typed confirmation; stateful apps excluded from scaling
- [ ] README true of the tree that exists, with the badge header row; `AGENTS.md`; `docs/architecture/00-ARCHITECTURE.md` referencing the constitution and opening an empty deviation register; ADRs; `docs/ux/UI-UX.md`
- [ ] If a PDF document was created: it lives in `docs/papers/`, says in its header what it is not, has a manual-only workflow, single-sourced diagrams, and only the `.tex` is committed
- [ ] Verification gates run and reported as a table, including P8's zero-credential run and the container health check
- [ ] Committed in an ordered series on a branch, pull request opened; the first tag's outcome reported against the public URL, or the absence of a deploy stated explicitly
- [ ] Nothing created beyond §12's scope; every deviation recorded with its reason
