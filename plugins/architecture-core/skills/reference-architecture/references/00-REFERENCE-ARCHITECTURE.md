<!-- Generated copy of docs/architecture/00-REFERENCE-ARCHITECTURE.md — do not edit. Relative links have been rewritten to absolute repository URLs. -->

# The Reference Architecture

> The architectural blueprint extracted from two production .NET Aspire systems, stated
> as a set of rules that any new or modernized service is expected to follow.
>
> This is the canonical, cross-repo copy. Individual repositories are measured against
> it from their own `docs/architecture/`, without restating these principles; they
> reference this file instead.
>
> This document is descriptive first — every principle below is already implemented in at
> least one of the two reference repositories, and the file cited is the working example.
> Where the two repositories disagree, the document says which one wins and why.

## How worked examples are cited

Worked examples come from the systems the standards were extracted from. Public ones are
named and linkable; private ones appear under a stable placeholder, so the structure a
rule came from is still visible without publishing the repository behind it.

| Cited as | What it is |
|---|---|
| `konradcinkusz/copilot-scope` | Public. A .NET observability product; the second reference system |
| `konradcinkusz/authservice` | Public. A standalone identity service, extracted from `<saas>` for reuse across systems |
| `<saas>` | Private. A multi-service .NET Aspire SaaS on Fly.io — the primary reference system, referred to in prose as *the reference SaaS* |
| `<second-app>` | Private. A smaller Fly.io deployment; the second Fly worked example |
| `<consumer>` | Private. A system that consumes `authservice` as its identity provider |
| `<origin-repo>` | Private. Where this document was first authored, before extraction |
| `<earlier-repo>` | Private. An earlier project whose README conventions are cited |

A path such as `<saas>.AuthService/Program.cs` therefore means "the identity service of the
reference SaaS, file `Program.cs`" — the shape is the point, not the repository name.

---

## 0. The shape in one picture

```mermaid
flowchart TB
    subgraph Dev["Development — one command"]
        AH["<b>AppHost</b> (.NET Aspire)<br/>the composition root:<br/>containers · projects · parameters<br/>references · health · wait-for"]
    end

    subgraph Services["Runtime — one container per service"]
        S1["Service A<br/><i>+ ServiceDefaults</i>"]
        S2["Service B<br/><i>+ ServiceDefaults</i>"]
        S3["Frontend<br/><i>Next.js standalone</i>"]
    end

    subgraph Shared["Shared kernel — thin, plumbing only"]
        SD["<b>ServiceDefaults</b><br/>OTel · health · discovery<br/>resilience · JWT · CORS<br/>OpenAPI · DB provider"]
        CT["<b>Contracts</b><br/>DTOs shared across a boundary"]
    end

    subgraph State["State — owned, never shared"]
        DB1[("db_a")]
        DB2[("db_b")]
        OBJ[("object storage")]
    end

    subgraph Platform["Platform"]
        FLY["Fly.io — app per service<br/>6PN private network<br/>scale-to-zero · secrets"]
        CI["GitHub Actions<br/>tag-driven · change detection<br/>matrix build · ordered deploy"]
    end

    AH -.->|"dev only"| Services
    S1 & S2 --> SD
    S1 & S2 --> CT
    S1 --> DB1
    S2 --> DB2
    S2 --> OBJ
    S3 -->|"server-side proxy"| S1 & S2
    CI --> FLY
    FLY --> Services
```

---

## 1. Principles

<a name="p1"></a>

### P1 — The AppHost is the composition root, and it exists for development

One Aspire `AppHost` project declares every resource the system needs — databases,
caches, backing containers, projects, frontends — plus the edges between them
(`WithReference`, `WaitFor`, `WithEnvironment`, `WithHttpHealthCheck`). A developer
clones the repository and runs one command.

> `<saas>.AppHost/AppHost.cs`; `copilot-scope/src/CopilotScope.AppHost/Program.cs`

Two rules that both repositories learned the hard way:

- **Externally-contracted ports do not float.** CopilotScope pins the collector to
  `4318` with `IsProxied = false` because five vendors' exporters are configured against
  that literal. Anything a third party configures by hand gets a fixed port.
- **The AppHost is not the production topology.** Production is described by the
  platform's own configuration (`fly.toml`, workflow env). The AppHost's `IsPublishMode`
  branch is a *manifest generator*, not a second runtime. Treating it as both is what
  produced the drift catalogued in the reference SaaS review §3.5.

<a name="p2"></a>

### P2 — Shared code is a shared *kernel*, not a shared *domain*

There is exactly one shared library on the hot path, and it contains only cross-cutting
plumbing:

| Concern | Shape |
|---|---|
| Telemetry | `ConfigureOpenTelemetry` — ASP.NET Core, HttpClient, runtime instrumentation; OTLP exporter when `OTEL_EXPORTER_OTLP_ENDPOINT` is set |
| Health | `AddDefaultHealthChecks` + `MapDefaultEndpoints` → `/health` (readiness) and `/alive` (liveness, `live`-tagged only) |
| Discovery | `AddServiceDiscovery` + `ConfigureHttpClientDefaults` |
| Resilience | `AddStandardResilienceHandler` on every `HttpClient` by default |
| AuthN | `AddJwtAuthentication(configuration)` — one token contract for the estate |
| CORS | `AddCorsPolicy(configuration, policyName)` — one named policy |
| OpenAPI | `AddSwaggerWithJwt(title, version, description)` |
| Persistence | `AddDatabaseContext<TContext>(...)` — provider selection, retry policy, connection-string normalization |

> `<saas>.ServiceDefaults/` — `Extensions.cs`, `AuthenticationExtensions.cs`,
> `DatabaseProviderExtensions.cs`, `ApplicationBuilderExtensions.cs`

Everything in that list is an **extension method over `IHostApplicationBuilder`,
`IServiceCollection` or `WebApplication`**. There are no base classes, no inheritance
chains, no `ModuleBase` to derive from. A service opts in line by line:

```csharp
builder.AddServiceDefaults();
builder.Services.AddJwtAuthentication(builder.Configuration);
builder.Services.AddCorsPolicy(builder.Configuration, CorsPolicies.Frontend);
builder.Services.AddDatabaseContext<MyDbContext>(builder.Configuration, "mydb", "MyDbInMemory");
```

**What must not go in the shared kernel:** business entities, business rules, pricing
tables, user-facing strings, seed datasets, repository implementations for a specific
aggregate. Those belong to the service that owns them.

**The ceiling is mechanical, not advisory.** ~800 lines, checked in CI, plus an
architecture test asserting the kernel references no entity type. Stating the limit in
prose has already failed twice in this estate:

- the legacy monorepo's `CORE` began as shared plumbing and ended as a shared *domain* — advert
  entities, points pricing, Polish category names, `CloudinaryDotNet` and `Ninject` in
  its innermost project. Every consumer was coupled to every change; version skew
  across consumers followed; the source was eventually lost while the packages stayed
  in production.
  > `<legacy-monorepo>/docs/architecture/02-DEPENDENCY-ANALYSIS.md`
- `<saas>.ServiceDefaults` was 700 lines across six files when this document
  was written. It is now 1,365 across nine, of which 607 are `KonradPromptSeeds.cs` —
  50 seeded domain prompts — plus `SeedingConstants.cs` and a `QuotaConsumptionService`.
  The stated reason is *"single source of truth consumed by both PromptTemplatesService
  and MarketplaceService"*, which is the same reasoning that produced the legacy monorepo's CORE.

**Where two services need the same domain data**, it goes in a `Contracts` project or is
owned by one service and served over HTTP. It does not go in the kernel, however
identical the two copies need to be.

The catalogue of plumbing a kernel *should* offer beyond the table above — rate
limiting, validation filters, hardened cross-service HTTP, the migration completion
signal — is in [`docs/guides/SERVICE-API-PATTERNS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/SERVICE-API-PATTERNS.md);
its frontend counterpart (the shared web-kit workspace package) is in
[`docs/guides/FRONTEND-BFF.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/FRONTEND-BFF.md) §7.

<a name="p2a"></a>

**Corollary (P2a):** *every* service calls `AddServiceDefaults()`. The reference SaaS's
AuthService does not, and it is precisely the service with no traces when its quota
endpoint misbehaves. A service that opts out of the kernel opts out of being operable.

<a name="p3"></a>

### P3 — Service per bounded context; database per service

A service owns its schema. No second service opens a connection to it. Cross-context
reads go over HTTP against a published contract.

> the reference SaaS: `authdb`, `prompttemplatesdb`, `agenticdb`, `marketplacedb` — four
> databases, four owners; `AgenticService` calls `PromptTemplatesService` to create a
> template rather than writing its tables.

Physical co-location is a cost decision and is allowed: on Fly.io all four databases live
in one Postgres instance created by one init script. The *logical* boundary is what must
not be crossed.

**Where the monolith is correct:** CopilotScope's Collector holds OTLP decoding, session
aggregation, scoring, the insight pipeline, persistence and the REST API in one process,
because they share a hot in-memory aggregate and splitting them would mean shipping that
aggregate over a wire on every batch. Bounded contexts are drawn around *data cohesion*,
not around nouns.

<a name="p4"></a>

### P4 — Persistence is provider-portable and its schema is migrated, never "ensured"

The provider is a configuration switch, not a compile-time decision:

```
DATABASE_PROVIDER = PostgreSQL | SqlServer      → falls back to InMemory with no connection string
```

with provider-appropriate retry (`EnableRetryOnFailure`, 10 attempts, 30 s cap, 60 s
command timeout) and connection-string normalization for the target platform — including
Fly's `.flycast` → `.internal` rewrite and raised cold-start timeouts.

> `<saas>.ServiceDefaults/DatabaseProviderExtensions.cs`

**The one correction this blueprint makes to its own sources:** `EnsureCreated` is
permitted *only* for the InMemory/test path. Every real provider uses `MigrateAsync`
against provider-specific migrations. The reference SaaS currently uses `EnsureCreated` on
PostgreSQL, which is why its live Fly schema is frozen at first-boot state (see that
repo's review §3.1). Do not copy that.

**Migrations run as a hosted service, after Kestrel starts**, so health probes answer
while schema work is in flight and a slow migration is not read as a failed deploy.

**What this rule governs, and what it does not.** The migrate-never-ensure rule is about an
**ORM-managed relational schema**: an entity model, a migrations history, and a provider that
applies it. A store with no entity model is a different shape and is not an exception being
grudgingly allowed — it is outside the rule. `copilot-scope`'s collector persists one jsonb
snapshot per session through raw Npgsql with idempotent `CREATE TABLE IF NOT EXISTS` DDL
(`Persistence/SessionRepository.cs`) and has no Entity Framework anywhere; calling that a P4
violation would be reading the rule by the name of a method rather than by what it protects
against, which is an unversioned entity model drifting away from its database. The snapshot
pattern has its own rules — bounded rehydrate, write-behind debounce, degrade to memory
without blocking ingest — and they live in `STATE-SNAPSHOT-PERSISTENCE.md`.

**Migrations describe schema; reference data is seeded separately** — by a versioned
script or a seeding service run once per environment. `HasData` in `OnModelCreating`
embeds the whole dataset in every migration snapshot: the legacy monorepo seeds its category taxonomy
this way and pays for it with six Designer files of ~18,000 lines each, which means its
schema changes ship unreviewed because the diffs are unreadable.

> `<saas>.AuthService/Extensions/MigrationBackgroundService.cs`

<a name="p5"></a>

### P5 — Configuration through the environment; secrets through the platform

One configuration model, three delivery mechanisms:

| Layer | Mechanism |
|---|---|
| Shape | Hierarchical keys — `Jwt:SecretKey`, `AzureOpenAI:Endpoint` — bound to options classes |
| Transport | Environment variables with `__` as the separator: `Jwt__SecretKey` |
| Local dev | `dotnet user-secrets` behind Aspire parameters: `builder.AddParameter("jwt-secret", secret: true)` |
| Cloud | Platform secret store — `fly secrets set`, Key Vault via Bicep, GitHub Environment secrets |

> `<saas>.AppHost/AppHost.cs` (parameters), `flyio/SECRETS.md`,
> `<saas>.AppHost/infra/*.tmpl.yaml`

No secret is ever a literal in a `csproj`, an `appsettings.json` committed to the repo, a
source comment, or an XML doc comment. Optional secrets are read with
`Configuration["Parameters:x"] ?? ""` so a missing value degrades a feature rather than
failing startup (P8).

**This is enforced by a scanner, not by review.** A secret scanner runs as a pre-commit
hook and as a CI job; a repository without one is assumed to contain credentials until
proven otherwise. Every clause of the sentence above has been violated in a real repo
audited against this principle — and the violations were not in obvious places: property
literals, committed `appsettings.json`, and, most easily missed of all, XML doc comments
written to document what each property's value *is*. Review does not catch that. A
scanner does.

**Exactly one service holds a signing key.** Every other service validates tokens against
that service's published JWKS endpoint and holds no key material of its own. A symmetric
secret shared between services means verify = mint: any holder can forge a token for any
user. This is the estate's most reliably recurring mistake — the reference SaaS distributes
one HS256 secret to six services and two frontends, and the legacy monorepo arrived at the same shape
independently, with `<second-app>.API` shipping a `GenerateTokens` implementation it never
calls and has no business owning. Asymmetric signing makes the mistake structurally
impossible rather than merely discouraged.

Everything the identity service must get right *beyond* signing — refresh rotation,
OAuth callbacks and account linking, enumeration safety, deletion, versioned consent —
is in [`docs/guides/IDENTITY-AND-ACCOUNTS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/IDENTITY-AND-ACCOUNTS.md).
Where the system charges money, the billing counterpart is
[`docs/guides/PAYMENTS-AND-MONETIZATION.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/PAYMENTS-AND-MONETIZATION.md).
The bar this principle implies for a repo's *history*, not just its current tree, before
that repo is ever made public, is in
[`docs/guides/OPEN-SOURCE-RELEASE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/OPEN-SOURCE-RELEASE.md).

<a name="p6"></a>

### P6 — One container per service, built from a multi-stage Dockerfile

The contract every service container satisfies:

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:<N> AS build     # restore csproj first, then copy source
FROM mcr.microsoft.com/dotnet/aspnet:<N> AS final  # same major version as the TFM
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
LABEL org.opencontainers.image.source=<repo url>
ENTRYPOINT ["dotnet", "<Service>.dll"]
```

- **Project files are copied and restored before the source**, so a code change does not
  invalidate the restore layer.
- **The runtime image major version equals the TFM major version.** Default roll-forward
  does not cross a major; CopilotScope currently violates this (review §3.1) and it is a
  startup failure, not a warning.
- **Node frontends** use the three-stage `deps → builder → runner` pattern with Next.js
  `standalone` output and a non-root `nextjs` user.
  > `<saas>.Web.Portal/Dockerfile`
- **Native dependencies are declared, not assumed** — e.g. `libfontconfig1` for QuestPDF
  in `<saas>.AgenticService/Dockerfile`.

<a name="p7"></a>

### P7 — Fly.io is the deployment target, and the topology is cost-shaped

Per service, one Fly app, one `fly.toml`:

```toml
app = "<system>-<service>-<env>"
primary_region = "fra"

[build]
  dockerfile = "../<Service>/Dockerfile"

[env]                     # non-secret configuration only
  ASPNETCORE_URLS = "http://+:8080"
  DATABASE_PROVIDER = "PostgreSQL"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0      # 1 for anything on a synchronous request path

[[http_service.checks]]
  path = "/health"
  grace_period = "60s"          # covers .NET cold start + schema init

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

> `<saas>/flyio/*.fly.toml`

Rules that carry:

- **Stateful services get no public listener.** Postgres has no `[http_service]` and no
  `[[services]]` block at all; it is reached only over Fly's private 6PN network at
  `<app>.internal:5432`. No public port, no proxy smoke checks.
  > `flyio/postgres.fly.toml`
- **Scale to zero by default, except on a synchronous path.** `min_machines_running = 0`
  is the default; a service another service calls in-request needs `1`, or the caller's
  timeout must cover a cold boot (the reference SaaS review §3.4). The diagnostic is
  mechanical: for every in-request call A→B, either B pins a machine or A's timeout
  exceeds B's cold start — and in practice the second option is written down far more
  often than it is actually configured, so prefer the first.
- **Volumes are declared with an initial size and a `PGDATA` subdirectory**, because
  initdb requires an empty data directory and the volume root carries `lost+found`.
- **Cost is reasoned about explicitly**, per service, in the repository.
  > `flyio/INFRASTRUCTURE-ANALYSIS.md`

The operational detail this principle implies — what a service must satisfy to be
deployable at all, every `fly.toml` field annotated, the four app shapes, private
networking, volumes, and the failure modes each rule exists to prevent — is in
[`docs/guides/FLY-IO-DEPLOYMENT.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/FLY-IO-DEPLOYMENT.md). A fifth,
customer-hosted shape — the vendor pushes images, the customer runs everything — is in
[`docs/guides/PRIVATE-CLOUD-DELIVERY.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/PRIVATE-CLOUD-DELIVERY.md).

<a name="p8"></a>

### P8 — Optional dependencies degrade; they do not fail startup

Every external integration is registered conditionally on its configuration being
present, with a working fallback:

| Integration | Present | Absent |
|---|---|---|
| SendGrid | `SendGridEmailService` | `NoOpEmailService` that logs |
| Google / GitHub OAuth | provider registered | provider absent, password login still works |
| Azure AI Foundry | `HybridPromptGenerationService` routing per operation | direct Azure OpenAI |
| Blob storage | real ZIP from the container | stub ZIP |
| Postgres (CopilotScope) | `PersistenceWriter` + rehydrate | in-memory only |
| Judge / AgentForge | cloud analyzers register | analyzers report `no-data`, not an error |

> `<saas>.AuthService/Program.cs`;
> `<saas>.AgenticService/Infrastructure/ServiceCollectionExtensions.cs`;
> `copilot-scope/src/CopilotScope.Collector/Program.cs`

How the Azure AI Foundry side of that table gets provisioned in the first place — the
Hub/Project/Connection Bicep, per-service managed identity and RBAC, and the
agent-as-code job that turns a JSON file into a running agent — is in
[`docs/guides/AZURE-AI-FOUNDRY-AGENTS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/AZURE-AI-FOUNDRY-AGENTS.md). That
guide is orthogonal to P7: the agents it describes can back a service running on Fly.io
or on Azure Container Apps.

The test: `git clone && dotnet run` with zero cloud credentials must produce a working
system with reduced features.

**Degradation must be visible, not merely correct.** A health endpoint that returns the
state of every optional integration — and a startup banner printing the same list — turns
"which features are live in this deployment?" into one request instead of an inspection of
configuration. A service can degrade perfectly and still waste an afternoon, if the only
way to discover what degraded is to read the config that was not set.

> `copilot-scope/src/CopilotScope.Collector/Program.cs` — `/api/health` returns
> `persistence`, `forwarding` and `prometheus` alongside `status`, and the startup log
> prints the same set.

<a name="p9"></a>

### P9 — Program.cs is a manifest; wiring lives in extension methods

`Program.cs` reads as a list of capabilities, not as configuration code. Each block is one
call into a `ServiceCollectionExtensions` in the owning service.

> `<saas>.AgenticService/Program.cs` — 130 lines for a service with four
> orchestrators, a flow engine, a step pipeline, two AI backends, rate limiting and a job
> mode. `<saas>.AuthService/Program.cs` — 399 lines doing the same job inline,
> and it is the harder file to change.

Within a service, the layering is:

```
Controllers / minimal-API endpoints    → transport only: bind, authorize, delegate
  Orchestrators                        → use-case coordination across services
    Pipeline steps / domain services   → one responsibility each, chainable
      Repositories / DbContext         → data access
```

> `<saas>.AgenticService/Services/Orchestration/` — orchestrators plus a
> chain-of-responsibility step pipeline (`ConversationValidationStep` →
> `LanguageDetectionStep` → `PromptExtractionStep`).

<a name="p10"></a>

### P10 — Extensibility through interface + registration, not inheritance

A new algorithm, provider or step is a class implementing an interface and one DI line.
No base class to derive from, no framework to satisfy.

> `copilot-scope/src/CopilotScope.Collector/Quality/Insights.cs` — `IInsightAnalyzer`;
> five implementations registered unconditionally in `Program.cs:23-27`, consumed via
> `InsightPipeline`.

Where the cloud judge went, and why it is the more useful half of this example: it is **not**
a sixth analyzer registered conditionally. It is a separate service —
`copilot-scope/src/CopilotScope.JudgeAgent/` — because it carries a model credential, a
calibration protocol and a failure mode none of the five local analyzers have. The interface
is the right seam for a new algorithm; it is the wrong seam for a new *dependency*. When an
implementation would drag a credential and an availability risk in behind it, P3 wins over
P10 and it becomes a service.

This is the pattern that replaces the "core library base class" idea entirely. A `.Core`
library in this estate exports *interfaces and extension methods*; it does not export
things you inherit from.

<a name="p11"></a>

### P11 — Anti-corruption at the edge

External dialects are normalized into one internal model at the boundary, once. Nothing
downstream knows there was more than one dialect.

> `copilot-scope/src/CopilotScope.Collector/Domain/Sem.cs` and `Domain/ClaudeCode.cs` map
> `gen_ai.*`, `github.copilot.*` and `claude_code.*` onto a single session model. Adding a
> fifth assistant cost a mapping file.

The same rule applies to payment providers, mail providers, SMS providers and map
providers: one internal abstraction, one adapter per vendor, no vendor type crossing the
boundary.

<a name="p12"></a>

### P12 — Tag-driven CI/CD with change detection and ordered deploy

```
push tag v*
  ├── detect-changed-services      (path filters → matrix)
  ├── build                        (matrix, GHA layer cache, push to registry)
  └── deploy in dependency order   (data → auth → domain services → jobs → frontends)
```

> `<saas>/.github/workflows/flyio.yml` — the job graph is documented as ASCII
> art in the file header; `copilot-scope/.github/workflows/build-containers.yml` — matrix
> with `fail-fast: false` so one broken image does not cancel the others mid-push.

Additional rules both repositories arrived at:

- **PR environments** are provisioned and destroyed by workflow
  (`flyio-pr-env-deploy.yml` / `-destroy.yml`) — the full pattern, including the
  shared-vs-per-PR classification and teardown discipline, is in
  [`docs/guides/PR-PREVIEW-ENVIRONMENTS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/PR-PREVIEW-ENVIRONMENTS.md).
- **One-shot jobs run as ephemeral machines** that run and exit — Fly `machine run`, not a
  long-lived app. The reference SaaS's agent provisioner is the worked example, including
  flushing stdout and sleeping before exit so the log forwarder captures output.
- **Build once, deploy many.** Where a repository targets two platforms, the same image
  digest should reach both. The reference SaaS builds twice and documents the cost of it;
  do not repeat that.
- **A service whose Fly app does not exist is always selected**, whatever the diff says.
  This is the rule that lets a cold estate come up from a single tag with no manual
  `fly launch`, and it is the one most often missing.
- **Deploy gates accept `success || skipped` from upstream jobs.** Without it, change
  detection and ordering fight each other and any unchanged service in the middle of the
  chain blocks everything behind it.

The workflow in full — change detection against the previous tag, the build matrix,
per-job gating, bootstrapping, and the scale/destroy companions — is in
[`docs/guides/FLY-IO-DEPLOYMENT.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/FLY-IO-DEPLOYMENT.md) §10–§12.

<a name="p13"></a>

### P13 — Test at the layer that has the logic

| Layer | Tooling | What it covers |
|---|---|---|
| Unit | xUnit, one project per service | Parsers, scoring, prompt builders, validators, orchestrator flow |
| Integration | xUnit + InMemory or a real container | Persistence round-trips, migration application |
| E2E | Playwright | Cross-app user journeys |

> `copilot-scope/tests/CopilotScope.Tests/` — 16 files against decoders, quality engine,
> judge parsing, persona provisioning, persistence round-trip.
> `<saas>/tests/` — five service test projects plus `playwright.config.ts`.

The InMemory fallback in `AddDatabaseContext` exists partly so tests need no container.

The strategy above this principle — what each tier is for, when each runs, the per-test
quality bar, and what only a human can test — is in
[`docs/guides/TESTING-STRATEGY.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/TESTING-STRATEGY.md).

**A green E2E run is only evidence if the suite is verified and wired to CI — neither is
optional.** A 2026-08-14 audit of `<saas>.AcceptanceTests` (447 Playwright
tests) found roughly 45% were placeholders or guarded-away from ever asserting anything,
the suite had never been wired into CI in either repo, and it duplicated itself across a
retired frontend and its replacement with no record of which was current. None of this
was visible from the test count or the folder structure — only from reading the test
bodies. The operational rules this produced — the assertion discipline that makes a
passing test mean something, the locator and waiting conventions, and why CI wiring is
part of a suite's definition of done, not a follow-up — are in
[`docs/guides/E2E-ACCEPTANCE-TESTING.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/E2E-ACCEPTANCE-TESTING.md).

<a name="p14"></a>

### P14 — Documentation lives in the repository and records reasoning, not just steps

Both repositories keep decision records next to the code, and both are better for it:

- `copilot-scope/docs/STRATEGY.md` — why the project exists, what already exists, what it
  deliberately will not do. Written when the repo had no users.
- `copilot-scope/README.md` §"How *not* to use CopilotScope" — the anti-goals stated before
  the features.
- `<saas>/flyio/INFRASTRUCTURE-ANALYSIS.md` — argues *against* a change (GHCR)
  on switching-cost grounds, with numbers.
- `<saas>/docs/diagrams/*.puml` — nine PlantUML diagrams kept current.

A document that says "we considered X and rejected it because Y" is worth more than a
document that lists commands.

**Corollary: a stale README is a review finding.** Documentation that describes a
system that no longer exists is worse than none. The hygiene that keeps a repository's
claims true — and everything else a repo carries before its first feature — is in
[`docs/guides/REPO-BASELINE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/REPO-BASELINE.md); the review method that
audits it is in [`docs/guides/SECURITY-REVIEW.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/SECURITY-REVIEW.md); the
additional bar a repo clears once, before its first public release, is in
[`docs/guides/OPEN-SOURCE-RELEASE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/OPEN-SOURCE-RELEASE.md).

<a name="p15"></a>

### P15 — Observability is a build-time decision, not an afterthought

OTLP first: traces, metrics and logs exported to whatever endpoint
`OTEL_EXPORTER_OTLP_ENDPOINT` names, with Azure Monitor added when
`APPLICATIONINSIGHTS_CONNECTION_STRING` is present. Health-check requests are filtered out
of traces so probe noise does not dominate.

> `<saas>.ServiceDefaults/Extensions.cs`

**Corollary:** CopilotScope — an observability product — currently emits no telemetry
about itself and has no ServiceDefaults at all (review §3.5). The blueprint takes
the reference SaaS's side here without qualification.

---

## 2. Where the two repositories disagree, and who wins

| Question | copilot-scope | the reference SaaS | Blueprint |
|---|---|---|---|
| Shared kernel | none | `ServiceDefaults` | **The reference SaaS** — P2 |
| Self-instrumentation | none | OTel everywhere but AuthService | **The reference SaaS** — P15 |
| Cloud target | Azure Container Apps (partial Bicep) | Fly.io primary, ACA in parallel | **Fly.io** — P7 |
| Registry | GHCR, public images | `registry.fly.io`, private | **GHCR** — P12, portable and free at this scale |
| Schema management | not applicable (jsonb snapshot, no ORM) | `MigrateAsync` on SQL Server, `EnsureCreated` on Postgres | **`MigrateAsync` always for an ORM-managed schema** — P4. The two are not in conflict: a snapshot store with no entity model is outside that rule, not an exception to it |
| API auth | one shared ingest key, read API open | JWT everywhere | **JWT / OIDC** — P5 |
| Token signing | n/a | HS256 shared secret | **Asymmetric + JWKS** — P5; required, not aspirational. The legacy monorepo implements it first (ADR-007) |
| Endpoint style | minimal API | MVC controllers | either, per service; keep transport thin — P9 |
| Program.cs size | ~280 lines (Collector, justified — it *is* the API) | 130 (Agentic) vs 399 (Auth) | **Agentic's shape** — P9 |
| Docs language | mixed EN/PL | mixed EN/PL | **English for anything needed to build or deploy** |

---

## 3. Compliance checklist

Any service claiming to follow this blueprint answers yes to all of these:

- [ ] Declared in the AppHost with `WithReference`, `WaitFor` and `WithHttpHealthCheck`
- [ ] Calls `AddServiceDefaults()` and `MapDefaultEndpoints()`
- [ ] Exposes `/health` and `/alive`; the platform health check points at `/health`
- [ ] Emits OTLP traces, metrics and logs
- [ ] Owns its database; no other service connects to it
- [ ] Schema applied by `MigrateAsync` from provider-specific migrations, in a hosted service
- [ ] All configuration from environment variables; no secret in source, config file, or comment, with a secret scanner in CI
- [ ] Exactly one service holds a signing key; all others validate against its JWKS endpoint
- [ ] The shared kernel holds no entity, DTO, enum, seed dataset, pricing constant or user-facing string — asserted by an architecture test and a CI size check
- [ ] Every optional integration has a working no-op or fallback
- [ ] The health endpoint reports the state of every optional integration, and the startup banner prints the same list
- [ ] Multi-stage Dockerfile; runtime image major version equals the TFM major version; listens on `:8080`; non-root where the base image allows
- [ ] One `fly.toml`; `min_machines_running = 1` if another service calls it in-request
- [ ] Outbound `HttpClient`s carry the standard resilience handler with explicit timeouts
- [ ] `Program.cs` is a manifest; wiring is in `ServiceCollectionExtensions`
- [ ] Extension points are interfaces registered in DI, not base classes
- [ ] Has a test project; the logic-bearing layer is covered. When behaviour is being *migrated*, its characterisation tests are written before the move, not after
- [ ] Built by the tag-driven workflow with path-based change detection
- [ ] Its architectural decisions are recorded in `docs/`

---

## 3a. Known open deviations

A principle whose named violation stays open indefinitely reads as optional, so each
reference system keeps a register of the deviations this document calls out that are
**still unfixed**: the repo, the deviation, the principle it breaks, and since when.
When one is fixed, its row is deleted. When one is accepted deliberately, it is recorded
with the reasoning — an acknowledged deviation is a decision; an unacknowledged one is
drift.

**That register is not kept here.** A list of unfixed weaknesses in running systems,
with the file paths to find them at, is operational security detail rather than a
standard, and it does not belong in a public document. Each repo carries its own under
`docs/architecture/`, and private systems' registers stay private. What generalizes —
the obligation to keep one, and to date every row — is the rule above.

## 4. Deliberate non-goals of this blueprint

Stated so that scope creep has something to fail against:

- **No service mesh, no sidecars.** Fly's 6PN private network plus per-service JWT is the
  whole network security model. Both reference systems run fewer than a dozen services.
- **No shared database and no shared ORM entities across services.** A shared DTO contract
  is permitted; a shared `DbContext` is not.
- **No event bus until there is a use case that needs one.** All current cross-service
  communication is synchronous HTTP against a published contract, and both systems are
  small enough that this is honest rather than naive. Introducing a broker is an explicit,
  recorded decision, not a default.
- **No custom DI container.** `Microsoft.Extensions.DependencyInjection` only. This
  matters most for the legacy monorepo, which is built on Ninject — see
  `<legacy-monorepo>/docs/architecture/03-GAP-ANALYSIS.md` G-3. The asymmetry is the argument: the
  removal cost is small (Ninject touches 7 files there, and each `Bind<I>().To<C>()`
  maps one-to-one onto `services.AddTransient<I, C>()`), while the blocking cost is
  total — every capability in this blueprint is an extension method over
  `IServiceCollection`, and none of them are reachable from inside a Ninject module.
- **No abstraction over the platform.** `fly.toml` is written directly. A hand-rolled
  deployment abstraction over Fly, ACA and Kubernetes costs more than it saves at this
  size.

---

## Provenance

This document was originally authored inside `<origin-repo>/docs/architecture/` (the legacy monorepo) while that repo was itself being modernized against it — a workable but logically awkward home for
a constitution meant to govern the whole estate. It now lives here, in
`architecture-standards`, a neutral repo with no modernization work of its own, so every
other repo's review or modernization session can point at one stable path instead of a
moving target.

**Amendment history.**

- *2026-08-10* — amendments driven by the legacy monorepo's analysis
  (`<legacy-monorepo>/docs/architecture/07-STANDARDS-FEEDBACK.md`): P2's kernel ceiling made
  mechanical after a second occurrence of domain-in-kernel drift; P4 given a rule on
  seed data; P5 extended with scanner enforcement and promoted asymmetric signing from
  aspiration to requirement; P7 given the cold-start diagnostic; three checklist items
  added; §3a "Known open deviations" introduced; RECOVER mode added to the playbook.
- *2026-08-12* — P8 cross-referenced to the new
  [`docs/guides/AZURE-AI-FOUNDRY-AGENTS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/AZURE-AI-FOUNDRY-AGENTS.md) guide,
  covering how the Azure AI Foundry integration it lists as an optional dependency is
  actually provisioned (Bicep Hub/Project/Connection, per-service RBAC, agent-as-code).
- *2026-08-14* — P13 cross-referenced to the new
  [`docs/guides/E2E-ACCEPTANCE-TESTING.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/E2E-ACCEPTANCE-TESTING.md) guide,
  extracted from a full audit of the reference SaaS's 447-test E2E suite; that audit's
  CI-wiring and assertion-discipline findings were recorded as a deviation against it.
- *2026-08-14* — eleven operational guides added, extracted from a full sweep of
  the reference SaaS (docs, code, infra/CI) for generic knowledge the standards lacked:
  `PAYMENTS-AND-MONETIZATION`, `IDENTITY-AND-ACCOUNTS`, `SERVICE-API-PATTERNS`,
  `FRONTEND-BFF`, `BROWSER-EXTENSIONS`, `TESTING-STRATEGY`, `SECURITY-REVIEW`,
  `REPO-BASELINE`, `PR-PREVIEW-ENVIRONMENTS`, `PRIVATE-CLOUD-DELIVERY`,
  `AZURE-OPERATIONS`. Cross-references added from P2, P5, P7, P12, P13 and P14; P14
  given the stale-README corollary; three deviations recorded in the reference SaaS's
  own deviation register (§3a).
- *2026-08-14* — [`docs/guides/AZURE-AI-FOUNDRY-AGENTS.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/AZURE-AI-FOUNDRY-AGENTS.md)
  re-verified line by line against the reference SaaS and corrected where it had drifted.
  The Bicep and RBAC sections held exactly; four things had not. Agent provisioning is a
  run-and-exit job (`RunAsJob`) on an ephemeral machine, not the startup `IHostedService`
  the guide taught — that path is now the implementation's own development-only fallback.
  Superseded agents are deleted and orphans swept, reversing the guide's "never delete
  old versions" rule, which had been stranding an agent per version bump; the in-flight
  conversation cost that rule was protecting is now stated as an accepted consequence
  with a per-request agent-resolution mitigation. CI provisions with `az deployment sub
  create`, not `azd`, which survives only for local and greenfield use. The tracking
  table is scoped by logical agent environment, deliberately separate from
  `ASPNETCORE_ENVIRONMENT`. §11 and §12 updated to match.
- *2026-08-14* — `konradcinkusz/authservice` (an extraction of `<saas>.AuthService`)
  was adopted by `<consumer>` as an identity provider — the estate's first
  case of one system running its own independent instance of another system's extracted
  service. New guide [`docs/guides/OPEN-SOURCE-RELEASE.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/OPEN-SOURCE-RELEASE.md)
  added and cross-referenced from P5 and P14, covering the history-audit and release
  checklist neither principle stated on its own. A Postgres image gotcha (Fly's managed
  `postgres-flex` failing against a plain `flyctl deploy`) added to
  `FLY-IO-DEPLOYMENT.md`'s failure-mode table. Two deviations were recorded against the
  repos involved, one of them a deliberate, logged P5 exception. The general pattern this raises — a service built for reuse *across*
  systems, not just within one — is proposed but not yet merged, in
  `docs/proposals/EXTRACT-SHARED-SERVICE-PATTERN.md`.
- *2026-08-15* — `IDENTITY-AND-ACCOUNTS.md` gained §10 "Key material", covering what P5
  leaves out once asymmetric signing is no longer aspirational: how a keypair is produced,
  handed over and rotated. Prompted by the first estate consumer to adopt an extracted
  identity service as a verify-only downstream, and by two failures that surfaced doing it.
  The first was a runbook that offered `openssl` and nothing else, which is not a command on
  Windows and so fails at step one of onboarding — a generation instruction carries a
  platform assumption, and repos should ship a script rather than a Unix one-liner. The
  second is subtler and is now a checklist item: where the signing algorithm is *inferred*
  from what was configured, a missing key selects the symmetric path and publishes a
  syntactically valid, **empty** JWKS. Nothing reports unhealthy, the deploy goes green, and
  every consumer rejects every token — so a deploy must assert the key set is non-empty.
  Five failure-mode rows and five checklist items added with it.
