# Payments, subscriptions and metering

Any service in the estate that charges money follows the rules below. They were
extracted from a working merchant-of-record integration with a full subscription
lifecycle, quota metering and a self-hosted tenant mode; the reasons are the part that
transfers.

It is deliberately repo-agnostic: nothing here names a product, a plan or a price. The
worked example is `<saas>.AuthService` (payment controller, subscription
services, quota services) and `<saas>/docs/quota-plan.md`.

**Contents**

1. [The model in one paragraph](#1-the-model-in-one-paragraph)
2. [Merchant of record vs payment gateway](#2-merchant-of-record-vs-payment-gateway)
3. [Mock-first: the integration is testable before the vendor exists](#3-mock-first)
4. [Webhooks](#4-webhooks)
5. [Subscription lifecycle](#5-subscription-lifecycle)
6. [Quota and metering](#6-quota-and-metering)
7. [Entitlement enforcement is layered](#7-entitlement-enforcement-is-layered)
8. [Tenant mode: one flag turns SaaS into self-hosted](#8-tenant-mode)
9. [Introducing paid tiers to an existing user base](#9-introducing-paid-tiers-to-an-existing-user-base)
10. [Failure modes](#10-failure-modes)
11. [Checklist](#11-checklist)

---

## 1. The model in one paragraph

The payment provider owns the checkout, the card data and (if it is a merchant of
record) the tax; **your system owns entitlements**. The only trustworthy input your
system receives is the **webhook** — signed, replayed, and possibly out of order.
Everything else (the success redirect, the client's belief that it paid, the order row
you wrote before checkout) is a hint, not a fact. Design the whole integration around
one idea: the webhook handler is the single place where money becomes entitlement, and
it must be idempotent, signature-checked, and runnable without the vendor.

## 2. Merchant of record vs payment gateway

A **gateway** (Stripe-style) processes payments; you remain the seller, and EU VAT,
GST/HST, US sales tax registration, chargeback representment and PCI scope are yours. A
**merchant of record** resells your product: the provider is the legal seller and owns
all of that — at the price of a larger fee and less checkout control.

Rules that carry:

- **Selling globally as a small team ⇒ default to a merchant of record.** Tax
  registration in every jurisdiction is not engineering work, and it does not stop.
  Choosing a gateway instead is a decision to build a tax function; record it as such.
- **Record the decision** with numbers (fee delta vs estimated compliance cost) in
  `docs/`, the same way `flyio/INFRASTRUCTURE-ANALYSIS.md` records topology cost (P14).
- **Design as if the vendor will be replaced.** Provider event names, statuses and DTOs
  are normalized at the boundary into one internal vocabulary (P11). Nothing downstream
  of the webhook handler knows which provider is behind it.
- **What you cannot know before sandbox credentials arrive, plan for anyway:** field
  casing may differ (`snake_case` → JSON property-name attributes, not renamed C#
  properties); the signature header name must be confirmed against real traffic or
  every production webhook fails silently; and the provider's event taxonomy will be
  larger than the docs say.

## 3. Mock-first

The entire purchase → webhook → entitlement path must be exercisable with **zero
provider credentials** — on a laptop, in CI, and in E2E tests.

```
MockMode = true   (dev/CI default)
  checkout  → returns a synthetic paymentUrl that redirects straight to the success page
  simulate  → POST /api/<provider>/simulate runs the REAL webhook code path
MockMode = false  (production)
  simulate  → 403, unconditionally — the endpoint is physically unreachable
```

- The simulate endpoint is **authenticated** and executes the same handler the real
  webhook does — same status mapping, same idempotency, same entitlement writes. A mock
  that bypasses the real path tests nothing.
- The real provider call sits behind the mock with its own fallback (a provider API
  failure degrades to a deterministically constructed checkout URL where the provider
  supports it), so flipping `MockMode = false` before credentials arrive degrades
  instead of crashing (P8).
- Unit tests set `MockMode = true` plus a known webhook secret and assert the full
  lifecycle in-process. This is the test seam; do not build a second one.

## 4. Webhooks

**Read the raw body before anything binds it.** Signatures are computed over bytes.
Enable request buffering, read the body with the stream left open, verify, then parse:

```csharp
Request.EnableBuffering();
using var reader = new StreamReader(Request.Body, leaveOpen: true);
var raw = await reader.ReadToEndAsync();
Request.Body.Position = 0;
```

**Verify with a constant-time comparison** (`CryptographicOperations.FixedTimeEquals`
over the HMAC-SHA256), guarding length mismatches and hex-parse failures as verification
failures, not exceptions.

**The asymmetric fallback rule.** When no webhook secret is configured: **accept in
mock mode, reject in production.** A missing production secret rejecting all webhooks is
deliberate security behaviour — the alternative is an unauthenticated endpoint that
grants subscriptions. Do not "fix" it by accepting unsigned requests.

**Idempotency by provider event id.** Webhooks are re-delivered by design. Record
processed event ids and make redelivery a no-op. Validate amount and currency
server-side against what you expected to charge — the client's copy of the price is not
an input.

**Anti-corruption for the event vocabulary.** Map provider event names onto one internal
enum at the boundary, absorbing spelling variants (`cancelled`/`canceled`) and unknown
names into an explicit default. Two traps inside that mapping:

- **Payment events are not subscription events.** `subscription_cancelled`, `_ended`,
  `_suspended`, `_renewal_failed` arriving at a handler written for payment
  confirmations fall into the default branch and silently do nothing. Log every event
  that maps to the default — a silent default branch is where churn handling goes to
  die.
- **Webhooks race your own writes.** The provider's webhook can arrive before your
  checkout handler has committed the order row. Resolve the order as a chain — cache →
  database → synthesize from the webhook payload — and let the upsert backfill the user
  linkage when the missing half arrives. Never drop a webhook because "the order doesn't
  exist yet".

## 5. Subscription lifecycle

- **Extension never shortens.** New expiry = one period added to
  `max(current expiry, payment date)`, with a defensive single-period grant when the
  provider's end timestamp is missing or stale. Renewing early must not eat the days
  already paid for.
- **The metering period resets from the payment date**, not from the extended expiry
  base — otherwise usage recorded on renewal day falls outside the new billing period's
  filter and either double-counts or vanishes.
- **Cancel is cancel-at-period-end**, a flag, not a revocation; **resume** clears the
  flag. The user keeps what they paid for; nothing is deleted at cancel time.
- **Expiry downgrades; it never destroys.** On downgrade, apply the free-tier limits,
  keep the N oldest resources the free tier allows, and **lock** the excess —
  `IsLocked`, `LockedAt`, `LockedReason` — rather than deleting it. Renewal unlocks.
  The user's data outlives their subscription; the reason it is locked is shown, not
  guessed.
- Expiry processing runs as a background service against the database, so it does not
  depend on the provider sending an "ended" event (see the default-branch trap above).

## 6. Quota and metering

**Enforcement transport: synchronous HTTP against the quota authority, not a message
bus** — at estate scale the 2–5 ms in-process / 20–100 ms cross-service check with a
hard limit beats an eventually-consistent bus with soft limits and a broker to operate.
Record the decision matrix (complexity, latency, consistency, operability, failure
behaviour) so it can be revisited when scale changes the answer, instead of re-argued.

**Fail open, deliberately.** If the quota authority is unreachable or slow, **allow the
operation and log**. Brief unavailability of the metering service must not take the
product down; slight overage is a cost you accept and can measure. Concretely, in the
thin client every service uses:

- HTTP 429 from the authority → block with the authority's message.
- Timeout, 5xx, network failure → allow, log a warning.
- Client timeout is short (≈5 s) and configured where the client is registered.

The thin client carries **no domain logic** — one call, one status check. It belongs in
the shared kernel as plumbing (P2); the quota *rules* stay in the authority.

**The consume-then-do gap is a decision, not an accident.** Consuming quota before the
operation and not refunding on failure overcharges; consuming after allows overrun.
Pick one, write it down next to the client, and if overcharging matters, add a
compensating refund call on failure.

**Model rules:**

- Counter + limit pair per metered action; **`-1` means unlimited** (a sentinel beats a
  nullable that reads as "no limit configured").
- Tier profiles are pure functions (`ApplyFreeTier`, `ApplyPaidTier`, …) applied to the
  quota row — never scattered constants.
- **Rolling periods reset lazily** on first read after expiry. A scheduled reset job is
  a second system to operate for no additional correctness.
- **Event-counted vs state-counted quotas are different animals.** Consumption counters
  (generations this month) are event-driven, append-only. Counters that mirror *current
  state* (owned workspaces, memberships) are **re-synced from the database at read
  time** — incrementing them on events guarantees permanent drift after the first missed
  event.
- Get-or-create of the quota row must survive races: catch the duplicate-key
  `DbUpdateException`, detach, re-read.
- Keep a parallel **append-only usage event log** for the UI and for support disputes;
  the counters answer "may I", the log answers "what happened".
- **Quotas live with their owner.** Per-user quotas belong to the identity/quota
  authority; per-workspace caps (storage counts) are enforced by the owning service with
  a `COUNT` before insert. Do not force one service to know both.
- Proration is the billing provider's job. Do not rebuild it in the quota system.

## 7. Entitlement enforcement is layered

| Layer | Mechanism | Is it security? |
|---|---|---|
| Token | Tier claim stamped at issuance, so services read it without a callback | yes |
| API | Authorization policy/requirement (`RequiresPaidTier`), not ad-hoc `if`s in handlers | **yes — the boundary** |
| Quota authority | Consume endpoint, 429 on exhaustion | yes |
| Client | Gate component + usage meter, optimistically permissive while loading | no — UX only |

The client mirror exists so users see limits before hitting them; it must never be the
only check. Frame it that way in the frontend code, or the next refactor will treat the
UI gate as the enforcement point.

## 8. Tenant mode

One environment variable — `TenantMode = SaaS | Enterprise` — converts the metered
multi-tenant build into an unlimited self-hosted build for a single customer
([`PRIVATE-CLOUD-DELIVERY.md`](PRIVATE-CLOUD-DELIVERY.md)).

**Implement it only where tokens are issued.** In enterprise mode the token service
stamps the top-tier claim for every user and the quota authority answers "unlimited"
(while still logging usage). Every downstream service needs **zero changes** — they
already read the claim. The rejected alternative (organization-level subscription
inheritance threaded through every service) is more granular and more migration work;
do the simple thing and revisit if a business need appears.

The frontend counterpart is a build-time/runtime flag that hides pricing and upgrade
UI. Suppressing the upsell is presentation; the entitlement itself came from the token.

## 9. Introducing paid tiers to an existing user base

Default everyone to the free tier, announce before enforcing, offer existing users an
early-adopter discount, and **run a grace period where limits are visible but not
enforced**. Turning on hard limits the same day they are announced converts your most
active users into your angriest ones. Ship the deployment as three lanes — backend
(schema + policies), frontend (gates + meters), security (webhook secrets, simulate
endpoint locked to mock) — each with its own checklist.

## 10. Failure modes

| Symptom | Cause |
|---|---|
| Every production webhook rejected | Signature header name assumed, not confirmed; or webhook secret unset (correct behaviour — set the secret) |
| Webhooks accepted in production without signatures | The mock-mode fallback was made symmetric; restore reject-in-production |
| Subscription grants applied twice | No idempotency on provider event id; redelivery is normal, not exceptional |
| Cancellations never take effect | Lifecycle events landing in the mapper's default branch; only payment events were handled |
| Paying user loses days after early renewal | Extension computed from payment date instead of `max(expiry, payment date)` |
| Renewal-day usage missing from the new period | Quota period reset from the extended expiry base, not the payment date |
| Webhook dropped: "order not found" | Provider webhook beat your checkout write; synthesize from payload and backfill |
| Users blocked when the quota service restarts | Thin client fails closed; only 429 may block |
| Workspace counter wrong forever | State-counted quota incremented on events instead of re-synced from the database |
| Free users briefly see paid features | Client gate is optimistic while loading — by design; the API policy is the boundary |

## 11. Checklist

Per payment integration:

- [ ] Mock mode: synthetic checkout + authenticated simulate endpoint running the real webhook path; simulate returns 403 outside mock mode
- [ ] Raw-body signature verification, constant-time compare; unsigned → accept in mock, reject in production
- [ ] Idempotency keyed on provider event id; amount and currency validated server-side
- [ ] Provider events mapped to an internal vocabulary; default branch logged; lifecycle events explicitly handled
- [ ] Webhook-before-order tolerated (cache → DB → synthesize; upsert backfills)
- [ ] Extension math never shortens; metering period resets from payment date
- [ ] Cancel-at-period-end + resume; downgrade locks excess resources with a reason, never deletes
- [ ] Provider vocabulary and DTOs confined to the boundary (P11)

Per metering setup:

- [ ] Central quota authority; thin fail-open client in the shared kernel (429 blocks, everything else allows, ~5 s timeout)
- [ ] Consume-before vs consume-after decided and written down
- [ ] `-1` = unlimited sentinel; tier profiles as pure functions; lazy period reset
- [ ] State-counted quotas re-synced at read; event-counted quotas append-only; race-safe row creation
- [ ] Usage event log kept alongside counters
- [ ] `TenantMode` implemented at token issuance only; frontend hides pricing via a flag
- [ ] Paid-tier rollout has an announce + grace period plan

---

Worked example: `<saas>.AuthService` — `Controllers/PayProController.cs`,
`Services/PayProMORService.cs`, `Services/QuotaService.cs`,
`Services/SubscriptionExpirationService.cs`,
`<saas>.ServiceDefaults/Services/QuotaConsumptionService.cs` (the thin
client — noting that per P2 its namespace/home should be the kernel proper), and
`<saas>/docs/quota-plan.md` for the recorded transport decision.
