# What `/init-generic-template` creates

`/init-generic-template` turns an empty repository into the estate's default containerized
application, compliant with [the constitution](../architecture/00-REFERENCE-ARCHITECTURE.md)
on the first commit rather than on a later cleanup pass.

**It is not a `dotnet new` template.** There is no `.template.config`, no template package,
no scaffolding script — nothing here to install with the SDK or expand from a command line.
It is a procedure, [`INIT-GENERIC-TEMPLATE.md`](INIT-GENERIC-TEMPLATE.md), written for the
agent that executes it: the agent reads the standards and *writes* the files. That is why
there are no version symbols or feature flags in what follows. There is one argument, three
questions, and a fixed shape.

This page is the short answer to "what will this leave me with, and what is guaranteed",
for someone deciding whether to run it. [`INIT-GENERIC-TEMPLATE.md`](INIT-GENERIC-TEMPLATE.md)
is the authority; everything below cites the section that owns the rule, and restates none of
them.

## The one command, and the one argument

```
/init-generic-template <repo-name>
```

The argument is the repository's GitHub name — lowercase, hyphen-separated, matching
`^[a-z][a-z0-9-]*$`. Without one, the procedure falls back to the repository you are already
in (its `origin` remote, or the working directory's name) and echoes that name back before
touching anything; if it cannot resolve one, it stops and asks rather than inventing a name
from the conversation (§1).

Everything else is derived mechanically, and echoed back as a table before the first file is
written, so a wrong derivation is caught once instead of in forty files (§1):

| Derived | Rule | From `zoo-companion` |
|---|---|---|
| System slug | the argument, unchanged | `zoo-companion` |
| Root namespace and solution | PascalCase, hyphens dropped | `ZooCompanion` |
| Projects | `<Pascal>.AppHost`, `.ServiceDefaults`, `.Contracts`, `.Api`, `.Api.Tests` | `ZooCompanion.AppHost` |
| Frontend workspace | `web/`, npm scope `@<slug>` | `@zoo-companion/web-kit` |
| Fly apps | `<slug>-<service>-<env>` | `zoo-companion-api-dev` |
| Databases | `<service>db`, inside one `<slug>-postgres` instance | `apidb` |

§1 carries the full table, including container image names and the config prefix.

## .NET Aspire is not optional

**Every run writes `<Pascal>.AppHost` and `<Pascal>.ServiceDefaults`.** There is no flag,
no symbol and no conditional that omits them: the AppHost is
[P1](../architecture/00-REFERENCE-ARCHITECTURE.md) of the constitution and the shared kernel
is P2, they are named in §1's derivation table, they are in §3's tree, and §5 is the section
that writes them.

§12 states the same guarantee from the other side. Being asked for a framework other than
.NET Aspire and Next.js is one of the procedure's four **stop conditions**: it stops, says
what the problem is, and asks — before creating files — and a different choice becomes a
recorded ADR under `docs/adr/`, never a silent substitution.

The three things that genuinely are decisions — the region, the registry, and whether the
system has users — are listed under [What it asks you](#what-it-asks-you). The framework is
not among them.

## The AppHost orchestrates development; Fly.io runs production

This is the part most likely to surprise, and it is P1's second half.

- **Locally**, one command brings the whole system up:
  `dotnet run --project src/<Pascal>.AppHost`. The AppHost declares Postgres, the API and
  the frontend with `WithReference`, `WaitFor` and `WithHttpHealthCheck`, and nothing else
  (§5).
- **In production**, the topology is one `fly.toml` per service, deployed by a tag-driven
  workflow (§7, §8). The AppHost's publish branch is a *manifest generator*, not a second
  runtime — it is never the thing running your production estate.

What bridges the two without a per-environment code path is service discovery's candidate
ladder, from [`FRONTEND-BFF.md`](../guides/FRONTEND-BFF.md): each backend resolves through
explicit environment variable → orchestrator service-discovery variables
(`services__<name>__https__0`) → internal DNS name → localhost. One code path works on a
laptop, under Aspire, and on the platform.

So "orchestrated in .NET Aspire" is true of development, and of the composition model the
whole solution is written against. It is not a claim that Aspire deploys or supervises
production.

## What the Aspire pieces contain

**`<Pascal>.AppHost`** — the composition root, and development only (P1). Every resource and
every edge between them declared in one place. No secret is ever a literal: parameters come
from `dotnet user-secrets` via `builder.AddParameter(..., secret: true)` (P5).

**`<Pascal>.ServiceDefaults`** — the shared kernel, and *only* plumbing (P2). Exactly eight
concerns: telemetry, health, discovery, resilience, JWT, CORS, OpenAPI, database provider —
as extension methods over `IHostApplicationBuilder`, `IServiceCollection` or
`WebApplication`. No base classes, no `ModuleBase`. A service opts in line by line (§5):

```csharp
builder.AddServiceDefaults();
builder.Services.AddJwtAuthentication(builder.Configuration);
builder.Services.AddCorsPolicy(builder.Configuration, CorsPolicies.Frontend);
builder.Services.AddDatabaseContext<ApiDbContext>(builder.Configuration, "apidb", "ApiInMemory");
```

The ceiling on the kernel is installed at t=0 rather than after the second violation: a CI
step that fails when it exceeds ~800 lines, and an architecture test asserting it references
no entity type. Prose has already failed twice in this estate at keeping domain out of a
kernel (§5).

## What it creates

The smallest system that exercises every principle — deliberately not a demonstration of
every guide at once (§3).

| | What |
|---|---|
| **5 projects** | `.AppHost`, `.ServiceDefaults`, `.Contracts`, `.Api`, and `tests/<Pascal>.Api.Tests` |
| **1 frontend** | a pnpm workspace under `web/` with one Next.js app, per [`FRONTEND-BFF.md`](../guides/FRONTEND-BFF.md) |
| **1 service, 1 database** | `.Api` owns `apidb`; provider-portable, schema by `MigrateAsync` from a hosted service after Kestrel starts (P3, P4) |
| **4 Fly apps** | `<slug>-postgres`, `-authservice-<env>`, `-api-<env>`, `-web-<env>`, each with its pinning decision justified (§7) |
| **7 workflows** | `ci`, `secret-scan`, `codeql`, `flyio`, `flyio-scale`, `flyio-destroy`, `build-overview-pdf` — all wired on the first commit (§8) |
| **The baseline** | hygiene files, central package management, secret scanning as hook *and* CI job, one-command setup on both platforms, `.claude/settings.json` ([`REPO-BASELINE.md`](../guides/REPO-BASELINE.md), §4) |
| **The docs set** | `README.md`, `AGENTS.md`, `docs/architecture/00-ARCHITECTURE.md` with an opened deviation register, ADRs, `docs/ux/UI-UX.md`, and the LaTeX/PDF track (§9) |

§3 has the full tree, annotated file by file.

Two properties worth knowing before you run it: `/health` and `/alive` report the state of
every optional integration from the first commit (P8), and OTLP traces, metrics and logs are
part of the scaffold rather than a follow-up (P15).

## What it asks you

Three things, each asked once and recorded as an ADR — never defaulted silently (§1):

- **The region.** No default. The guides' examples show both `waw` and `fra`; a region is
  expensive to change once volumes exist.
- **The registry.** GHCR is the soft default, from the constitution's §2 disagreement table.
  Choosing `registry.fly.io` instead is allowed and is the same one-line ADR.
- **Whether the system has users.** If yes, identity is
  [`konradcinkusz/authservice`](https://github.com/konradcinkusz/authservice) adopted as an
  external service, and this repository only ever *validates* tokens. If no, every auth step
  is skipped.

## What it never creates

Straight from the constitution's non-goals, so scope creep has something to fail against
(§12):

- **No second service.** One bounded context, one database. A second service is a design
  decision with a reason, not a scaffolding default (P3).
- **No event bus, no service mesh, no sidecars.** Synchronous HTTP against a published
  contract plus per-service JWT is the whole model at this size.
- **No custom DI container**, and no abstraction over the platform — `fly.toml` is written
  directly.
- **No user store and no token minting**, anywhere in the repository (P5).
- **No sample domain model.** The mechanism and one thin vertical slice; inventing entities
  for a product nobody described produces code the first ticket deletes.

## When it refuses

**The repository has to be empty** — nothing tracked beyond what a fresh GitHub repository
creates for itself (`.git/`, `README.md`, `LICENSE`, `.gitignore`). Anything else means the
repository already has a shape, and the procedure stops rather than dropping a template over
decisions somebody made (§2). It will name the procedure that fits instead:

- [`PLAYBOOK.md`](../PLAYBOOK.md) — a repository that already holds code: REVIEW, MODERNIZE
  or RECOVER.
- [`MASTER-PROMPT.md`](../MASTER-PROMPT.md) — a delivery session that brings a drifted
  application back to the standards and leaves it live.
- [`delivery/WORKFLOW.md`](../delivery/WORKFLOW.md) — the per-ticket procedure, once this
  repository has its first ticket.

It also stops when the name cannot be resolved or does not match `^[a-z][a-z0-9-]*$`, when a
framework other than the documented standard is requested, and when a standard and the
request genuinely conflict — the last one recorded as a deviation with its reason (§12).

## The details

[`INIT-GENERIC-TEMPLATE.md`](INIT-GENERIC-TEMPLATE.md) — the procedure itself: the tree file
by file, the verification gates that run before the first commit (including the
zero-credential run), the failure-mode table, and the checklist it is measured against.

Installing it: [`MARKETPLACE.md`](../../MARKETPLACE.md). It ships in the
`architecture-core` plugin.
