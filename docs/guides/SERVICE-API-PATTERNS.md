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
([`PAYMENTS-AND-MONETIZATION.md`](PAYMENTS-AND-MONETIZATION.md) §6) meters *business
actions*. Same status code, different systems; do not merge them.

### Anonymous traffic has neither key, and IP alone is not one

A public surface with no accounts has no user id, and behind a platform proxy the client
IP is not what it appears to be: **every TCP peer is the edge proxy**, so a limiter keyed
on the socket address puts the entire internet in one bucket. That is the corporate-NAT
collapse this section opens with, scaled to a whole deployment — and it fails silently,
because the limiter is working perfectly on the key it was given.

Platforms state the real client in a header. Read it, and read it under one rule:

**Trust the forwarded client header only when configuration says a proxy is in front.**
Unconditional trust converts the fix into a worse hole than the bug — with nothing in
front, the header is client-supplied, and every visitor gets a bucket of their choosing
by changing one string. So it is a deployment fact, not an inference: the app trusts it
because its configuration says it is behind that proxy.

**Resolve the client once, in one place, and share it.** The limiter, any per-client
allowance and the endpoints must call the same resolver — two components that resolve the
client differently are two components metering different people, and the discrepancy
surfaces as a limit that fires against the wrong visitor.

Two further rules for an anonymous surface, both learned the same way:

- **Do not queue rejections.** A queued request holds a connection open to say "no" more
  politely later, and on a scale-to-zero machine that is the scarcest thing it has. The
  honest answer to a rate limit is immediate.
- **Stack a process-wide concurrency bound under the per-client window, and exempt the
  health probes.** The window bounds one client's rate; the bound is what stops every
  client together from exhausting a small machine. Exempting probes is not tidiness — a
  probe that gets 429'd takes the machine out of rotation, which is the one outcome worse
  than the burst.

> `agent-eval-bench` — `Demo/DemoClientKey.cs` (one resolver, header trusted only under
> `TrustProxyClientIpHeader`) and `Extensions/ServiceCollectionExtensions.cs` (fixed
> window per client with `QueueLimit = 0`, concurrency limiter beneath it, probes on
> `GetNoLimiter`).

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

### A write that timed out is not a write that failed

A definite failure and an indeterminate one are different answers, and collapsing them
produces one of two bugs: a client told nothing happened when it did, or a retry that
performs the action twice.

**At the transport, separate what you know from what you do not.** A refused connection
is knowledge — nothing was received, so nothing was actioned. A timeout is the absence of
knowledge: the request may have been fully processed and only the response lost. Reporting
a refusal as indeterminate is its own defect; it sends somebody to go and check a system
that has nothing in it.

**Never retry an indeterminate write.** Not once. Read-retry policy does not transfer to
writes, and "one more attempt" on a timeout is how a booking gets made twice.

**The fix is a client-supplied idempotency key**, generated by the caller, attached to the
first attempt, and honoured by the callee so a replay of the same key returns the original
outcome instead of performing a second one. That converts the timeout from a dilemma into
a safe retry, and it is the only thing that does — every other approach is a way of
describing the uncertainty rather than removing it.

**Where the key is unavailable, say so in the contract rather than papering over it.** A
service calling a third party it does not control cannot add a key to that party's API. The
honest fallback is to report the uncertainty to the user in those words — *this may or may
not have been recorded* — which is strictly weaker than resolving it, and should be
written down as weaker so nobody mistakes the wording for a guarantee.

> `agent-eval-bench/docs/SPEC.md` §7.2 and §7.4 — the two-row table separating a `5xx`
> from a timeout, the transport distinction beneath it, and the acknowledged gap: with no
> idempotency key available on the integration target, that spec specifies reporting the
> uncertainty rather than resolving it, and labels itself the weaker answer.

### N plugins, one screen: the report contract

[P10](../architecture/00-REFERENCE-ARCHITECTURE.md#p10) gets you an interface and a DI
registration, and that is the cheap half. What makes "a new algorithm is one class and one
line" actually true is the layer above it — and without that layer, every new
implementation still costs UI work, which is the thing the interface was supposed to buy.

Three parts, and all three are needed:

**A normalized output contract.** Every implementation returns the *same* shape: a name, a
status, an optional headline number, structured rows, human-readable findings. Not each
its own type. The shape is what lets one renderer display all of them, so the contract —
not the interface — is what a new implementation plugs into.

**A generic renderer over that shape.** Written once, against the contract. If adding an
implementation means touching the view, the contract was not general enough and the next
implementation will cost the same again.

**A fail-soft pipeline.** One implementation throwing must not take out the others: catch
per implementation, convert the failure into a well-formed report carrying the error
message, and carry on. A pipeline that propagates is a pipeline where the newest, least
trusted plugin can blank the whole screen.

**Make "nothing to report" a first-class status, not an error.** This is the part most
often collapsed, and it is the one that decides whether the screen can be read. An analyzer
with insufficient input has *not* failed — and if the only statuses are success and error,
it must claim one of them: report a misleading zero, or raise an error that sends somebody
looking for a bug that is not there. A distinct `no-data` status lets the renderer say
"not enough input yet", which is both true and actionable.

The same shape applies anywhere N contributors must land on one surface: validators,
compliance checks, security-scan rules, report sections, health sub-checks.

> `copilot-scope` — `Quality/Insights.cs`: the `InsightReport` record (`Name`, `Algorithm`,
> `Status`, `Score?`, `Metrics`, `Findings`) with `"ok" | "no-data"` stated on the field;
> `InsightPipeline.Analyze` catching per analyzer and substituting a `no-data` report
> carrying the exception message; and a dashboard that renders the shape generically.

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
- [ ] Anonymous surfaces: one shared client resolver; the forwarded client header trusted only when configuration says a proxy is in front; rejections not queued; a process-wide concurrency bound underneath, with health probes exempt
- [ ] Endpoint groups make the three trust levels visible in the composition root; operation names from constants
- [ ] Validation filter (minimal APIs) / logging 400 factory (MVC); client mirrors marked, server authoritative
- [ ] Every list endpoint clamps page/limit; page aggregates in one round trip
- [ ] Service-to-service clients: no auto-redirect, 3xx → 502 + log, bearer forwarded, timeouts by criticality, handler timeouts explicit
- [ ] Writes: a refused connection and a timeout reported differently; no retry of an indeterminate write, ever; a client-supplied idempotency key where the callee supports one, and the weaker fallback labelled as weaker where it does not
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
