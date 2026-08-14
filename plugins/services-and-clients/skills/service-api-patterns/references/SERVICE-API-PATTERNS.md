<!-- Generated copy of docs/guides/SERVICE-API-PATTERNS.md — do not edit. Relative links have been rewritten to absolute repository URLs. -->

# Recurring service and API patterns

Patterns every HTTP service in the estate ends up needing, extracted from the places
that already needed them. P9 says how a service is *wired*; this guide says what the
wiring should include. Most of these are one extension method — which is exactly why
they belong in the shared kernel (P2) instead of being copy-pasted per service, the way
the worked example currently copy-pastes its rate limiter four times.

**Contents**

1. [Rate limiting](#1-rate-limiting)
2. [Endpoint organization](#2-endpoint-organization)
3. [Validation](#3-validation)
4. [Pagination and list queries](#4-pagination-and-list-queries)
5. [Cross-service HTTP calls](#5-cross-service-http-calls)
6. [Long-running work without a queue](#6-long-running-work-without-a-queue)
7. [Background services vs migrations](#7-background-services-vs-migrations)
8. [Seeded definitions: files propose, the database disposes](#8-seeded-definitions)
9. [Product mechanics worth reusing](#9-product-mechanics-worth-reusing)
10. [Checklist](#10-checklist)

---

## 1. Rate limiting

**Partition by authenticated user id, falling back to client IP.** The failure that
taught this: a non-partitioned fixed-window limiter creates *one shared bucket for the
whole deployment*, and the first team behind a corporate NAT gets collectively 429'd.
The partition key is the point; the algorithm is a detail.

The standard policy set:

| Policy | Applied to | Shape |
|---|---|---|
| `auth` | login, register, refresh, forgot/reset password | strict — these endpoints are the brute-force surface |
| `api` | normal authenticated endpoints | generous fixed window per user |
| global fallback | everything else | catches endpoints nobody remembered to tag |

Rejections are uniform: 429 with `{ error, retryAfter }`, `retryAfter` sourced from the
limiter's metadata, so every client learns one shape. Ship the whole thing as
`AddStandardRateLimiting()` in the kernel — rate limiting is plumbing, and four
hand-copied variants is how the policies drift apart.

Note the layering: rate limiting protects *endpoints* from abuse; quota
([`PAYMENTS-AND-MONETIZATION.md`](https://github.com/konradcinkusz/architecture-standards/blob/main/docs/guides/PAYMENTS-AND-MONETIZATION.md) §6) meters *business
actions*. Same status code, different systems; do not merge them.

## 2. Endpoint organization

**The authorization triad, visible in the composition root:**

```csharp
var publicApi = app.MapGroup("/api/<area>");
var authApi   = app.MapGroup("/api/<area>").RequireAuthorization();
var adminApi  = app.MapGroup("/api/<area>/admin")
                   .RequireAuthorization(p => p.RequireRole("Admin", "SuperAdmin"));
```

Three groups, three trust levels, greppable in one file — instead of attributes
scattered across controllers where a missing one is invisible in review. Endpoints get
`.WithName(...)` from a constants file: stable operation ids for generated clients, and
the constant file doubles as the contract another service compiles against.

Controllers get one thin base class for claim extraction — user id
(`NameIdentifier` → `sub` fallback), display name, workspace claim — plus an explicit
`GetCurrentUserIdOrSystem()` for seeded/system writes. Every service re-derives this
per action otherwise, each with a different fallback order.

## 3. Validation

- Minimal APIs: one generic endpoint filter that runs DataAnnotations and returns
  `Results.ValidationProblem` grouped by member — the kernel owns it.
- MVC: keep the automatic 400, but set an `InvalidModelStateResponseFactory` that
  **logs** the failure before returning it. The auto-400 is the least debuggable
  response in ASP.NET — the log line is the difference between a bug report and a
  mystery.
- Client-side copies of validation limits are duplicated **deliberately**, marked as
  mirrors, with the server authoritative. Undocumented duplication becomes drift.

## 4. Pagination and list queries

- **Clamp inputs at every list endpoint**: `page = max(1, page)`,
  `limit = clamp(limit, 1, 100)`. This is a DoS control, not a nicety — an unclamped
  `limit=2000000` is a one-line outage.
- **Aggregates in one round trip**: group the filtered base query and project all the
  page's counts (`total`, per-status counts) in a single SQL query, computed from the
  Include-free base — not one `Count()` per statistic.
- Dynamic OR filters (multi-value tag search) are built as expression trees so they
  stay in SQL; materializing to filter in memory is the quiet version of the unclamped
  limit.

## 5. Cross-service HTTP calls

The kernel's resilience handler (P2) is necessary, not sufficient:

- **`AllowAutoRedirect = false` on service-to-service clients.** The recorded failure:
  an http→https 301 silently converts POST to GET, and a create request "succeeds"
  against the list endpoint. Detect 3xx explicitly and turn it into a 502 with a log
  line naming both URLs — a redirect between services is always a configuration bug.
- **Forward the inbound bearer token**; the callee enforces authorization, not the
  caller's good intentions.
- **Timeouts by criticality**, set where the client is registered: short (~5 s) for
  advisory calls (metering), longer (~30 s) for functional ones. And remember
  `HttpClient.Timeout` *caps* the resilience handler's total budget rather than
  extending it — configure the handler's attempt/total timeouts explicitly.
- The cold-start rule from P7 applies to every callee: pin a machine or out-wait the
  boot; a 5 s advisory timeout against a scaled-to-zero callee is a guaranteed
  fail-open.

## 6. Long-running work without a queue

The in-process pattern, for estates that have not yet earned a broker (per the
blueprint's non-goals):

1. Persist a job row (`Status = Processing`), return **202** with the job id.
2. `Task.Run` the work with its **own DI scope** — never the request's — and **capture
   all inputs before launching**; request objects are not thread-safe and are disposed
   under you.
3. Wrap *everything*, scope creation included, in a try/catch that writes `Failed` +
   the error message. An unobserved background exception is a job stuck in
   `Processing` forever.
4. Update a human-readable `StatusMessage` ("extracting 3/12…") as phases advance; the
   client polls and renders it. A cross-page "N jobs running" indicator client-side
   completes the loop.

State the caveats where the pattern is defined: no durability across restarts, no
retries, no backpressure. When any of those becomes a requirement, that is the recorded
trigger to introduce a queue — not "we might need one".

For multi-phase AI/LLM work, add per-phase degradation: a failed item-extraction drops
that item and continues on partial data; a failed synthesis substitutes a placeholder
rather than aborting the run; cheap requests route to a single call and skip the
pipeline entirely. Partial output with a note beats an all-or-nothing failure after
eight model calls.

## 7. Background services vs migrations

P4 runs migrations in a hosted service after Kestrel starts. Corollary: **every other
hosted service must wait for it.** A singleton completion signal (a
`TaskCompletionSource` the migration service completes; `await signal.WaitAsync(ct)` at
the top of every other background service) — or the first reaper/seeder/expiry sweep
races the schema and dies on a missing table, once, at 3 a.m., unreproducibly.

## 8. Seeded definitions

Where behaviour is data (flow definitions, agent definitions, wizard questions), files
in the repo are the *seed* and the database is the *authority*: seed by slug, insert if
missing, **never overwrite an existing row** — admin runtime edits win over the file.
The file answers "what does a fresh environment get"; the row answers "what runs here".
This is the same reconciliation discipline the Azure agents guide applies to agent
definitions (version-bump to change), stated for the general case.

## 9. Product mechanics worth reusing

Solved-once shapes; reach for these before inventing:

- **Content versioning**: snapshot the current row into a version table on every
  update; "restore v3" itself snapshots first — history is never destroyed. Add
  approval states (Draft → PendingReview → Approved → Deprecated, with reviewer +
  notes) when there is an editorial step.
- **Publish-as-snapshot**: publishing to a shared space copies content and keeps
  lineage (source id, workspace, version); the published copy does not change when the
  source does. Dedupe copy-back by name+content, and expose a copy-status check.
- **Derived notifications**: compute the feed from domain state at read time with
  synthetic stable ids (`invitation-{id}`), and persist only *dismissals* (optionally
  expiring so a still-true condition resurfaces). No fanout table, nothing to keep
  consistent.
- **Polymorphic favorites**: one table, `EntityType` + `EntityId`, consumed as a
  `favoritesFirst` sort — not a table per favoritable thing.
- **Ratings**: one review per user enforced by upsert; aggregates recomputed on write;
  any "trending" formula is a named, tunable expression in one place, not folklore in a
  query.
- **Internal share links**: type-prefixed base62 of the numeric id — fine when the
  share page re-checks membership; wrong for public links, because sequential ids
  enumerate. Public sharing needs a random token.

## 10. Checklist

- [ ] Rate limiting from the kernel: user-partitioned with IP fallback, `auth`/`api`/global policies, uniform 429 body
- [ ] Endpoint groups make the three trust levels visible in the composition root; operation names from constants
- [ ] Validation filter (minimal APIs) / logging 400 factory (MVC); client mirrors marked, server authoritative
- [ ] Every list endpoint clamps page/limit; page aggregates in one round trip
- [ ] Service-to-service clients: no auto-redirect, 3xx → 502 + log, bearer forwarded, timeouts by criticality, handler timeouts explicit
- [ ] 202 jobs: own scope, inputs captured, catch-all → Failed, progress message; caveats and the queue trigger written down
- [ ] Background services await the migration completion signal
- [ ] Seeded definitions: insert-if-missing by slug, never overwrite
- [ ] Product mechanics above reused, not reinvented

---

Worked example: `<saas>.AgenticService` (rate-limiting extension, 202
orchestrators, flow seeder), `<saas>.MarketplaceService/Program.cs` (endpoint
triad, clamping, hardened HTTP), `<saas>.PromptTemplatesService`
(versioning/approval, single-round-trip counts),
`<saas>.AuthService/Extensions/MigrationCompletionSignal.cs`.
