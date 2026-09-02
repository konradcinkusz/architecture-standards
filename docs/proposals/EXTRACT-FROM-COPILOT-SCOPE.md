# Proposal — generic patterns to extract from copilot-scope

> Source: a 2026-08-14 whole-repo review of `copilot-scope` (companion document:
> `copilot-scope/docs/architecture/PRODUCT-REVIEW-2026-08.md`). This is the **reverse**
> direction of the usual review: not "does the repo follow the standards" but "what does
> the repo already do that the standards *don't yet describe* and every other repo in the
> estate would benefit from."
>
> Each candidate below was checked against the constitution (P1–P15) and the headers of
> all fourteen guides in `docs/guides/` to avoid proposing a duplicate. Nothing here is
> merged yet — this is a proposal for the maintainer to accept, defer, or reject.

---

## Why this exists

The constitution was extracted from copilot-scope and the reference SaaS, but the
extraction was principle-shaped: it captured the *architecture* (Aspire, kernel,
per-service DB, tag-driven CI). copilot-scope also solved a set of **operational**
problems that are fully domain-independent and currently live nowhere in the standards —
the same way the eleven operational guides were extracted from the reference SaaS on
2026-08-14. This proposal is the copilot-scope half of that sweep.

Two of these also correct the constitution itself (noted inline): the P10 cloud-analyzer
example describes a mechanism that no longer exists in the code, and P4 appears to forbid
a persistence variant copilot-scope legitimately uses.

> **Both fixed, 2026-09-01** (#34), against the code rather than against this document —
> and one of the two was described imprecisely here. P4 does not *forbid* the jsonb
> snapshot: the collector has no Entity Framework at all, so the migrate-never-ensure rule
> never reached it. The defect was that the rule never said what it governed, which let a
> reader take a hand-written `CREATE TABLE IF NOT EXISTS` for a P4 violation on the strength
> of a method name. P10's defect was as described and worse than stated: the sentence was
> simply false against `Program.cs:23-27`.

---

## Verdicts — 2026-08-31, all shipped 2026-09-01

All five ranked candidates were **accepted**, and the six "worth a paragraph each"
items with them. Nothing below is rejected that was not already in the rejected list.

**Every one of them has since landed**, which is what this column now says. A proposal
whose accepted items all shipped, still reading "accepted, tracked in #NN", asks the
next reader to open six closed issues to find out whether anything happened — and the
honest answer is available here for the cost of a column.

| # | Candidate | Verdict | Landed in |
|---|---|---|---|
| 1 | Prometheus exposition discipline → `METRICS-EXPOSITION.md` | **Accept** | #46 → [PR #58](https://github.com/konradcinkusz/architecture-standards/pull/58) |
| 2 | Write-behind snapshot persistence → `STATE-SNAPSHOT-PERSISTENCE.md` | **Accept** | #47 → [PR #59](https://github.com/konradcinkusz/architecture-standards/pull/59) |
| 3 | Demo-data discipline → `DEMO-DATA-AND-SEEDING.md` | **Accept** | #48 → [PR #60](https://github.com/konradcinkusz/architecture-standards/pull/60) |
| 4 | Metric ethics / anti-Goodhart → `METRIC-ETHICS.md` | **Accept** (short guide) | #49 → [PR #61](https://github.com/konradcinkusz/architecture-standards/pull/61) |
| 5 | Pluggable report contract → section in `SERVICE-API-PATTERNS.md` | **Accept** | #50 → [PR #62](https://github.com/konradcinkusz/architecture-standards/pull/62) |
| — | The six "worth a paragraph each" items | **Accept**, batched | #51 → [PR #63](https://github.com/konradcinkusz/architecture-standards/pull/63) |

**Five of the six changed on the way**, because every cited line range was re-verified
against `copilot-scope` at `3d780df` rather than trusted from this document — which is
dated 2026-08-14, and which the "Corrections" section below already showed could go
stale. The corrections are recorded in each candidate's own section; the short version
is that P10's worked example described a mechanism that no longer exists, P4's
prohibition was a scope defect rather than a permission one, the demo-data prefix rule
is enforced server-side with whole-batch refusal, the anti-Goodhart counter-metric is
blended into the same component rather than merely reported beside it, and the
fire-and-forget relay differs from the sketch here. Writing any of them from this
document's summary would have produced a guide asserting something nobody checked.

The two constitution corrections this document raises — P10's worked example describing a
mechanism that no longer exists, and P4's prohibition reading wider than its own extraction
source — are **not** waiting on these guides. They are defects in a published document, and
they are fixed in #34.

**What acceptance does not mean.** A verdict is a decision to write, not the writing. Every
guide above is an *extraction*: the house rule is that it generalizes something a repository
already does, with the worked example cited. Each candidate's evidence is a set of file and
line citations into `copilot-scope` recorded on 2026-08-14, and #34 exists precisely because
two citations from that same sweep had already gone stale by the time anyone checked. So each
issue above carries the same precondition: attach the repository and re-verify the citations
against current code before writing a word. A guide asserting what nobody re-read is the
failure this corpus exists to prevent, and it would be a bad one to commit in the corpus that
prevents it.

---

## Ranked candidates

### 1. Prometheus exposition discipline — NEW GUIDE `METRICS-EXPOSITION.md`

**Verdict: accepted 2026-08-31. Landed 2026-09-01** — #46, [PR #58](https://github.com/konradcinkusz/architecture-standards/pull/58), as `docs/guides/METRICS-EXPOSITION.md`.

**Where:** `src/CopilotScope.Collector/Api/PrometheusExporter.cs` — `PerSession` off by
default with a documented reason (`:12-29`), `MaxSessionSeries`/`MaxErrorTypes` caps, a
`_series_limit` and `_series_dropped` counter so the operator *sees* truncation
(`:343-371`), top-N capping of the `type` label (`:326-341`), `_sum`/`_count` pairs
instead of pre-averaged gauges (`:41-43,179-195`), "quantiles of quantiles don't compose"
(`:298-301`), locale-safe formatting with distinct label vs HELP escaping (`:397-418`),
and `/metrics` inheriting the ingest key because it "must not be more open than the data
it summarizes" (`Program.cs:274-293`).

**Why generic:** P15 makes observability mandatory, so every repo will eventually expose
`/metrics` — and hit the same traps: cardinality explosion from per-entity labels,
averaged gauges that break rollups, locale breaking the text format. Zero of it is
domain-specific.

**Coverage today:** none. P15 is emitter-side only; no guide mentions Prometheus or
cardinality.

**Draft outline:** (1) cardinality is a budget — unbounded-domain labels are opt-in,
capped, and the cap + dropped counter are themselves metrics; (2) export `_sum`/`_count`,
never pre-averaged gauges; label percentile-of-percentiles as aggregates; (3) `/metrics`
must be no more open than the data it summarizes; (4) text-format hygiene (InvariantCulture,
label-escaping ≠ HELP-escaping, contiguous metric families); (5) scrape config +
provisioned datasource + dashboard JSON live in-repo beside the exporter.

---

### 2. Write-behind snapshot persistence — NEW GUIDE `STATE-SNAPSHOT-PERSISTENCE.md` (+ P4 amendment)

**Verdict: accepted 2026-08-31. Landed 2026-09-01** — #47, [PR #59](https://github.com/konradcinkusz/architecture-standards/pull/59), as `docs/guides/STATE-SNAPSHOT-PERSISTENCE.md`, with the P4 amendment.

**Where:** `src/CopilotScope.Collector/Persistence/PersistenceWriter.cs` — the whole
contract in one doc-comment (`:6-13`): dirty-flag on ingest, flush ≤1 s, schema bootstrap
+ rehydrate on start, degrade to in-memory without blocking ingest. `MarkDirty` under lock
(`:23-26`), debounce (`:49`), failed ids re-queued to the next tick (`:60-74`), rehydrate
capped at 200 with a logged error instead of a crash (`:28-43`).
`SessionRepository.cs:16-32` is a single-table jsonb snapshot with a plain `ON CONFLICT`
upsert, deliberately without EF. `Program.cs:141-148` deletes ghost sessions from Postgres
when they're merged in memory, so rehydrate doesn't resurrect them.

**Why generic:** any service holding a hot in-RAM aggregate (collector, rate limiter,
game sessions, counter cache) needs exactly this machinery: bursts must not become write
storms, restart must not lose state, a dead DB must not stop the hot path. It's an
alternative to P4's EF+migrations that is currently undescribed as a legal option.

**Coverage today:** trace-level only. P8 lists it as one degradation-table row; P4 forbids
"ensure" in favor of migrations without noting that for a jsonb snapshot,
`EnsureSchemaAsync` is a legitimate exception. The mechanics (dirty-set, debounce,
re-queue, ghost-delete, rehydrate cap) are uncovered.

**Also fixes:** the constitution's P4 table classifies copilot-scope as "not applicable
(jsonb snapshot)" in one column and "MigrateAsync always" in the next — internally
inconsistent. This guide + a one-line P4 amendment resolves it.

> **Fixed 2026-09-01** (#34). The amendment states P4's scope — the rule governs an
> ORM-managed relational schema — so the snapshot store reads as outside it rather than as
> a tolerated exception, and the §2 row now says the two were never in conflict. P4 points
> forward to this guide for the rules the snapshot pattern does carry, so #47 must land the
> guide the constitution now cites.

---

### 3. Demo-data discipline — NEW GUIDE `DEMO-DATA-AND-SEEDING.md`

**Verdict: accepted 2026-08-31. Landed 2026-09-01** — #48, [PR #60](https://github.com/konradcinkusz/architecture-standards/pull/60), as `docs/guides/DEMO-DATA-AND-SEEDING.md`.

**Where:** `Program.cs:221-261` — `/api/admin/seed` seeds everything under a `seed-`
prefix, reset clears **only** that prefix in memory *and* Postgres, with explicit
trust-boundary reasoning in the comment. `tools/CopilotScope.Seeder/Program.cs` seeds
through the running service's API (no DB access, no restart), deterministic RNG (`--seed`,
default 42), idempotent. `tools/CopilotScope.Seeder/Personas.cs` — each persona "maps to a
recognizable story on the dashboard." `tools/CopilotScope.TelemetryGen/Program.cs` — a
second, lower tier that plays the *real* protocol (hand-encoded OTLP/HTTP protobuf, gzip),
reused as a smoke test in `scripts/setup.sh`.

**Why generic:** every repo with a dashboard/demo needs showcase data, and every one
without rules ends up INSERT-ing beside the running app, mixing seed with real data, and a
"reset" that wipes everything. The split into a *protocol-true generator* (tests the whole
pipeline) and an *API seeder* (builds rich state fast) is a reusable taxonomy.

**Coverage today:** `SERVICE-API-PATTERNS` §8 "Seeded definitions" is a different thing
(behaviour-as-data); `TESTING-STRATEGY` §4 covers infra tiers, not data tiers. Real gap.

**Draft outline:** (1) seed through the API, never beside it — same validation, same
scoring, no drift; (2) namespace-prefix as ownership — reset only your own prefix, in
every store; (3) seed-endpoint auth = trust-boundary reasoning written into the comment;
(4) personas over noise — deterministic RNG by default; (5) two generator tiers and when
to use which.

---

### 4. Metric ethics / anti-Goodhart — SHORT NEW GUIDE `METRIC-ETHICS.md`

**Verdict: accepted 2026-08-31. Landed 2026-09-01** — #49, [PR #61](https://github.com/konradcinkusz/architecture-standards/pull/61), as `docs/guides/METRIC-ETHICS.md`.

**Where:** `README.md:57-76` §"How not to use CopilotScope" — not for performance reviews
(enforced by a deliberate **absence of a per-developer view in the architecture**, not
just policy), acceptance paired with edit-survival as a counter-metric, confidence
exported beside every score, frustration report-only and excluded from the composite. It's
backed in code, not just prose: confidence computed and exported
(`PrometheusExporter.cs:191-194`), frustration as a separate analyzer outside
`QualityEngine`, edit survival as a component.

**Why generic:** every future metric product in the estate (productivity dashboards, SLAs,
agent quality) faces these same decisions — and the estate already has a *second* product
that scores work (JudgeAgent). "A counter-metric for every pressurable metric" and
"confidence beside every score" are design decisions, not PR copy.

**Coverage today:** P14 cites this README section as an example of *documenting anti-goals*
— good writing, not a rule set. The rules exist nowhere.

**Draft outline:** (1) anti-goals belong in the README above the features — and backed by
architecture, not just declaration; (2) every pressurable metric gets a counter-metric in
the same composite; (3) no number leaves the system without confidence; (4) human-state
heuristics are report-only; (5) the unit of evaluation is the session/artifact, never the
person.

---

### 5. Pluggable report contract — SECTION in `SERVICE-API-PATTERNS.md` (+ P10 fix)

**Verdict: accepted 2026-08-31. Landed 2026-09-01** — #50, [PR #62](https://github.com/konradcinkusz/architecture-standards/pull/62), as `SERVICE-API-PATTERNS.md`'s report-contract section, with the P10 fix.

**Where:** `Quality/Insights.cs:14-20` — `InsightReport(Name, Algorithm, Status, Score?,
Metrics, Findings)`, a universal result shape the dashboard renders generically
(`Home.razor:462-481`). `InsightPipeline` is fail-soft: an analyzer exception becomes a
`no-data` report, never killing the others (`:28-46`). `no-data` is a first-class status,
not an error (`:17`).

**Why generic:** P10 describes the *mechanics* (interface + DI), but the value that makes
"a new algorithm = zero UI work" is the **normalized output contract** + generic renderer
+ fail-soft pipeline. The same applies to validators, compliance checks, security-scan
rules, report sections — anywhere N plugins must land on one screen.

**Coverage today:** P10 cites this file but only for registration. The report contract,
statuses, and fail-soft are uncovered.

**Also fixes:** P10's text says cloud analyzers "register conditionally" as
`IInsightAnalyzer` — but the cloud judge is now a **separate service** (`JudgeAgent`), not
a conditional registration. The constitution's example needs updating (or the code
realigning).

> **Fixed 2026-09-01** (#34), by updating the example: `Program.cs:23-27` registers five
> local analyzers unconditionally and `src/CopilotScope.JudgeAgent/` is its own service, so
> no conditional cloud registration exists to describe. P10 now carries why, which is the
> part worth keeping — an interface is the right seam for a new algorithm and the wrong one
> for a new dependency.

---

## Worth a paragraph each (not a full guide)

**Verdict: accepted 2026-08-31. Landed 2026-09-01** — #51, [PR #63](https://github.com/konradcinkusz/architecture-standards/pull/63), as one batch. Each item names below where it went; the arrows were the plan and are now the record.

- **Fire-and-forget forwarding** (`Forwarding/OtlpForwarder.cs`) — bounded channel with an
  explicit drop-oldest policy, relay raw bytes not re-serialized, enable-by-config-presence,
  capped retry then deliberate drop. "Upstream data loss beats hot-path backpressure" is
  counter-intuitive and worth recording. → section in `SERVICE-API-PATTERNS.md`.
- **Client-enablement scripts** (`scripts/Enable-*Otel.*`, `scripts/setup.sh`) — the script
  documents the vendor's dialect (including a variable that *doesn't exist and silently does
  nothing*), `--disable` cleans up artifacts of *older versions of itself*, and setup ends
  with a real-traffic smoke test. A different audience than REPO-BASELINE §3 (repo-developer
  onboarding): here the onboarded party is the *product's user*. → section in `REPO-BASELINE.md` §4.
- **Public GHCR + one-curl-compose delivery** (`docker-compose.ghcr.yml`,
  `build-containers.yml`) — a fifth delivery shape beside the four in
  `PRIVATE-CLOUD-DELIVERY.md`: public, zero-friction, with universal gotchas (tag `V` vs
  `v`, GHCR packages private-by-default on first push, partial-publish under
  `fail-fast:false`). → section in `PRIVATE-CLOUD-DELIVERY.md`.
- **Dependency budget** (`Otlp/ProtoReader.cs` + the README project table's "NuGet deps"
  column) — a decision rule for hand-roll-vs-SDK (small/stable/versioned protocol subset +
  high dependency cost ⇒ own decoder with forward-compat) and a cheap anti-drift mechanism
  (per-project deps as a public, reviewable declaration). → section in `REPO-BASELINE.md`.
- **Research artifacts in-repo** (`research/`, `build-research-pdf.yml`) — a reference
  notebook per implemented algorithm, thesis proposals with three mandatory fields (impl
  status, acceptance criterion, code entry point), shared numbering across README ↔
  proposals ↔ `.tex`, PDFs built in CI and versioned with the release. → section in
  `REPO-BASELINE.md`.
- **Health endpoint as a capability manifest** (`Program.cs:263-271`) — `/api/health`
  returns the state of every optional integration; the startup banner prints the same list.
  P8 requires degradation but not that it be *visible*. → one sentence in P8 + a checklist item.

---

## Rejected candidates (one line each)

- Dialect normalization (`Domain/Sem.cs`, `Domain/ClaudeCode.cs`) — literally P11 with this
  file as the cited example; duplicate.
- Interface + DI registration as the extension mechanism — covered by P10; only the report
  contract layer is new (→ candidate 5).
- Conditional persistence/integration registration — a P8 table row; duplicate.
- AppHost + pinned port 4318 — covered by P1, including "externally-contracted ports do not
  float."
- Modular monolith justified by data cohesion — covered explicitly in P3.
- `fail-fast: false` in the build matrix — already cited in P12; only the public variant is
  new (→ candidate under "public GHCR delivery").
- JudgeAgent (G-Eval/SPUR/RAGAS) — provisioning is covered by `AZURE-AI-FOUNDRY-AGENTS`;
  the judge rubrics are domain-specific, not estate-generic.
- The `/docs` in-app documentation page — a nice product decision, not a pattern; one
  sentence in P14, not a section.
- Grafana provisioning-as-code — too small for its own item; folded into candidate 1.
